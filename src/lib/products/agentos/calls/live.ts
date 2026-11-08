import "server-only";
import type { Filter } from "mongodb";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/agentos/db";
import { recordAudit, recordAuditThrottled } from "@/lib/products/agentos/audit";
import { cleanContextValue } from "@/lib/products/agentos/calls/context";
import { type EngineDeps } from "@/lib/products/agentos/calls/engine";
import { checkCallAllowed } from "@/lib/products/agentos/calls/guards";
import { ownTwilio } from "@/lib/products/agentos/calls/numbers";
import { last4Of, normalizeE164 } from "@/lib/products/agentos/calls/phone";
import { callsCollection, phoneFingerprint } from "@/lib/products/agentos/calls/store";
import { CALL_COLLECTIONS, type CallDoc, type CallEventDoc, type CallFailure } from "@/lib/products/agentos/calls/types";
import { ForbiddenError, NotFoundError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { createHash } from "node:crypto";
import { getConference, toConferenceView, type ConferenceView } from "@/lib/products/agentos/calls/conference-state";

/**
 * Live call console: server-side primitives only (the browser never sees an ElevenLabs or Twilio key).
 *
 * WHAT IS REALLY POSSIBLE (ElevenLabs "Real-time monitoring", an enterprise-only feature; Twilio REST):
 *   - live TRANSCRIPT of a phone or web call: yes, through the monitor WebSocket (text events only; roughly the last 100 replayed on connect).
 *   - live AUDIO for someone other than the caller: not through ElevenLabs (the monitor socket carries no audio). Hearing a phone call
 *     live would need Twilio Media Streams forked to a WebSocket server of our own, which a serverless deploy can't hold open.
 *     The person who is on a web call hears it in their own browser as usual.
 *   - a NOTE to the AI mid-call (contextual_update), END the call (end_call; phone calls also fall back to a Twilio hang-up): yes.
 *   - HUMAN TAKEOVER: ElevenLabs' enable/disable_human_takeover commands apply to chat conversations only, not voice calls. For a phone
 *     call the supported hand-over is `transfer_to_number` (the agent needs the transfer-to-number tool): the call moves to a human's
 *     phone and the AI leaves the call for good, so handing back to the same AI call is NOT possible; place a new AI call instead.
 *   - web calls: no takeover (the visitor's browser is connected to the AI directly).
 */

/** Enough for a long conference call: final utterances from both directions plus control events. */
export const LIVE_EVENT_LIMIT = 1500;
const EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NOTE_MAX = 500;
const LIVE_STATUSES = ["dialing", "in_progress"] as const;

export interface WsLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "message" | "close" | "error", cb: (ev: { data?: unknown }) => void): void;
}
export type WsFactory = (url: string, headers: Record<string, string>) => WsLike;

export interface LiveDeps extends EngineDeps {
  ws?: WsFactory;
  apiKey?: () => Promise<string | null>;
  fetch?: typeof fetch;
  twilio?: () => Promise<{ accountSid: string; authToken: string } | null>;
  monitorBase?: string;
}

const defaultWs: WsFactory = (url, headers) => new (WebSocket as unknown as new (u: string, o: { headers: Record<string, string> }) => WsLike)(url, { headers });
async function defaultApiKey(): Promise<string | null> {
  return (await connectionValues("elevenlabs"))?.apiKey ?? null;
}
const BASE = "wss://api.elevenlabs.io/v1/convai/conversations";

export interface LiveCapabilities {
  /** Live transcript through ElevenLabs' monitor (enterprise feature; may be unavailable on the account). */
  transcript: boolean;
  /** Hearing the call live in the browser as an observer. Not available. */
  observerAudio: false;
  note: boolean;
  endCall: boolean;
  /** Move the call to a human's phone number. Phone calls only; the AI leaves the call. */
  transferToHuman: boolean;
  /** Give control back to the AI. Only possible if the AI was never removed from the call. */
  handBack: boolean;
}

export function liveCapabilities(c: Pick<CallDoc, "direction" | "status" | "conversationId" | "control" | "callSid">): LiveCapabilities {
  const live = (LIVE_STATUSES as readonly string[]).includes(c.status) && Boolean(c.conversationId);
  const phone = c.direction !== "web" && c.direction !== "web_public";
  return { transcript: live, observerAudio: false, note: live && c.control.mode === "ai", endCall: live, transferToHuman: live && phone && c.control.mode === "ai", handBack: live && c.control.mode === "human" && c.control.canHandBack };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

let eventIndexed = false;
export async function eventsCollection() {
  const col = (await getDb()).collection<CallEventDoc>(CALL_COLLECTIONS.events);
  if (!eventIndexed) {
    eventIndexed = true;
    await Promise.all([
      col.createIndex({ callId: 1, seq: 1 }, { unique: true }).catch(() => {}),
      col.createIndex({ callId: 1, key: 1 }, { unique: true, partialFilterExpression: { key: { $type: "string" } } }).catch(() => {}),
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {}),
    ]);
  }
  return col;
}
export function resetLiveIndexes(): void {
  eventIndexed = false;
}

/** Appends one event (bounded per call, deduplicated by `key`). Returns false when it was dropped. */
export async function recordCallEvent(callId: string, e: { type: CallEventDoc["type"]; text: string; by?: string | null; key?: string | null; at?: Date }): Promise<boolean> {
  const col = await eventsCollection();
  const key = e.key ?? null;
  if (key && (await col.findOne({ callId, key }, { projection: { _id: 1 } }))) return false;
  const call = await (await callsCollection()).findOneAndUpdate({ _id: callId, eventSeq: { $lt: LIVE_EVENT_LIMIT } }, { $inc: { eventSeq: 1 } }, { returnDocument: "after", projection: { eventSeq: 1 } });
  if (!call) return false;
  try {
    await col.insertOne({ _id: newId(), callId, seq: call.eventSeq, at: e.at ?? new Date(), type: e.type, text: e.text.slice(0, 1000), key, by: e.by ?? null, expiresAt: new Date(Date.now() + EVENT_TTL_MS) });
    return true;
  } catch {
    return false;
  }
}

/** ElevenLabs monitor message -> our event (null for anything we don't show). Pure. */
export function mapMonitorEvent(raw: unknown): { type: CallEventDoc["type"]; text: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, { user_transcript?: unknown; agent_response?: unknown; corrected_agent_response?: unknown } | undefined> & { type?: unknown };
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (m.type === "user_transcript") return text(m.user_transcription_event?.user_transcript) ? { type: "user", text: text(m.user_transcription_event?.user_transcript) } : null;
  if (m.type === "agent_response") return text(m.agent_response_event?.agent_response) ? { type: "agent", text: text(m.agent_response_event?.agent_response) } : null;
  if (m.type === "agent_response_correction") return text(m.agent_response_correction_event?.corrected_agent_response) ? { type: "agent_correction", text: text(m.agent_response_correction_event?.corrected_agent_response) } : null;
  return null;
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** Who may watch: the person who placed the call, calls managers and live-call handlers. */
export async function loadWatchable(viewer: AibotsViewer, callId: string): Promise<CallDoc> {
  if (typeof callId !== "string" || callId.length > 64) throw new NotFoundError();
  const c = await (await callsCollection()).findOne({ _id: callId });
  if (!c) throw new NotFoundError();
  const mine = c.initiatedBy?.userId === viewer.userId;
  if (!mine && !can(viewer, "VOICE_CALL_MANAGE") && !can(viewer, "VOICE_CALL_TAKEOVER")) throw new NotFoundError();
  return c;
}
const fail = (code: CallFailure["code"], message: string): { ok: false; failure: CallFailure } => ({ ok: false, failure: { code, message } });

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

/**
 * Connects (server side) to ElevenLabs' monitor socket for one live call and stores its transcript events, until the call ends,
 * `maxMs` passes or the socket closes. A route handler streams `getLiveView` to the browser meanwhile. Resolves with how many
 * events were stored. Throws a plain error when the account has no monitoring.
 */
export async function pumpMonitor(viewer: AibotsViewer, callId: string, opts: { maxMs?: number } = {}, deps: LiveDeps = {}): Promise<{ stored: number }> {
  const call = await loadWatchable(viewer, callId);
  if (!liveCapabilities(call).transcript) return { stored: 0 };
  const key = await (deps.apiKey ?? defaultApiKey)();
  if (!key) throw new Error("ElevenLabs isn't connected for this workspace.");
  if (call.initiatedBy?.userId !== viewer.userId) await recordAuditThrottled({ actorId: viewer.userId, actorEmail: viewer.email, action: "view", entity: "call", entityId: call._id, botId: call.agentId, summary: "Watched a live call" }, 10 * 60 * 1000);
  const ws = (deps.ws ?? defaultWs)(`${deps.monitorBase ?? BASE}/${encodeURIComponent(call.conversationId!)}/monitor`, { "xi-api-key": key });
  const occurrences = new Map<string, number>();
  let stored = 0;
  let chain = Promise.resolve();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); resolve(); }, opts.maxMs ?? 55_000);
    const done = (err?: Error) => { clearTimeout(timer); if (err) reject(err); else resolve(); };
    ws.addEventListener("message", (ev) => {
      let parsed: unknown;
      try { parsed = JSON.parse(String(ev.data)); } catch { return; }
      const mapped = mapMonitorEvent(parsed);
      if (!mapped) return;
      // The monitor replays recent history on connect and has no event ids: the Nth identical line gets the same key every time.
      const base = createHash("sha1").update(`${mapped.type}|${mapped.text}`).digest("hex");
      const n = occurrences.get(base) ?? 0;
      occurrences.set(base, n + 1);
      chain = chain.then(async () => { if (await recordCallEvent(call._id, { ...mapped, key: `${base}:${n}` })) stored++; }).catch(() => {});
    });
    ws.addEventListener("close", () => done());
    ws.addEventListener("error", () => done(new Error("Live monitoring isn't available for this ElevenLabs account (it is an enterprise feature).")));
  });
  await chain;
  return { stored };
}

export type LiveSpeaker = "lead" | "ai" | "human";
const SPEAKER_OF: Partial<Record<CallEventDoc["type"], LiveSpeaker>> = { user: "lead", agent: "ai", agent_correction: "ai", human: "human" };
/** How long after a spoken line the console still shows that person as "speaking now". */
export const SPEAKING_WINDOW_MS = 4000;

export interface LiveView {
  status: CallDoc["status"];
  /** A test call (placed to the company's test number). */
  testMode: boolean;
  /** "conference": a team member can listen and take over. "direct": ElevenLabs places the call; transcript and notes only. */
  mode: "conference" | "direct" | "web";
  control: { mode: "ai" | "human"; handler: string | null; canHandBack: boolean; mine: boolean };
  capabilities: LiveCapabilities;
  conference: ConferenceView | null;
  events: { seq: number; at: string; type: CallEventDoc["type"]; speaker: LiveSpeaker | null; text: string; by: string | null }[];
  lastSeq: number;
  /** Who spoke last, if it was within the last few seconds. */
  speaking: LiveSpeaker | null;
  /** Server time, so the console's timer and "speaking" state don't depend on the browser clock. */
  now: string;
  startedAt: string | null;
  viewerId: string;
}

/** Polled by the console: everything after `afterSeq`. */
export async function getLiveView(viewer: AibotsViewer, callId: string, afterSeq = 0): Promise<LiveView> {
  const call = await loadWatchable(viewer, callId);
  const after = Math.max(0, Math.floor(afterSeq) || 0);
  const q: Filter<CallEventDoc> = { callId: call._id, seq: { $gt: after } };
  const [rows, conf] = await Promise.all([(await eventsCollection()).find(q).sort({ seq: 1 }).limit(200).toArray(), getConference(call._id)]);
  const now = new Date();
  const lastSpoken = await (await eventsCollection()).find({ callId: call._id, type: { $in: ["user", "agent", "human"] } }).sort({ seq: -1 }).limit(1).next();
  const speaking = lastSpoken && now.getTime() - lastSpoken.at.getTime() <= SPEAKING_WINDOW_MS && !call.endedAt && !conf?.endedAt && !conf?.leadEndedAt ? (SPEAKER_OF[lastSpoken.type] ?? null) : null;
  return {
    status: call.status, testMode: call.testMode === true, mode: call.direction === "web" || call.direction === "web_public" ? "web" : conf ? "conference" : "direct",
    control: { mode: call.control.mode, handler: call.control.handler, canHandBack: call.control.canHandBack, mine: call.control.handler === viewer.userId },
    capabilities: liveCapabilities(call), conference: conf ? toConferenceView(conf, viewer.userId) : null,
    events: rows.map((r) => ({ seq: r.seq, at: r.at.toISOString(), type: r.type, speaker: SPEAKER_OF[r.type] ?? null, text: r.text, by: r.by })), lastSeq: rows.at(-1)?.seq ?? after,
    speaking, now: now.toISOString(), startedAt: (conf?.answeredAt ?? call.dialedAt)?.toISOString() ?? null, viewerId: viewer.userId,
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Sends one command over a short-lived monitor connection (stateless: works from any server instance). */
export async function sendCommand(call: CallDoc, command: Record<string, unknown>, deps: LiveDeps): Promise<void> {
  const key = await (deps.apiKey ?? defaultApiKey)();
  if (!key) throw new Error("ElevenLabs isn't connected for this workspace.");
  const ws = (deps.ws ?? defaultWs)(`${deps.monitorBase ?? BASE}/${encodeURIComponent(call.conversationId!)}/monitor`, { "xi-api-key": key });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error("ElevenLabs didn't respond in time.")); }, 8000);
    ws.addEventListener("open", () => {
      try {
        ws.send(JSON.stringify(command));
        clearTimeout(timer);
        setTimeout(() => ws.close(), 250);
        resolve();
      } catch (e) {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error("Couldn't send the command."));
      }
    });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Live control isn't available for this ElevenLabs account (it is an enterprise feature).")); });
  });
}

async function liveCall(viewer: AibotsViewer, callId: string, perm: "VOICE_CALL_TAKEOVER" | "any"): Promise<CallDoc> {
  if (perm === "VOICE_CALL_TAKEOVER" && !can(viewer, "VOICE_CALL_TAKEOVER")) throw new ForbiddenError("VOICE_CALL_TAKEOVER");
  const c = await loadWatchable(viewer, callId);
  const mine = c.initiatedBy?.userId === viewer.userId;
  if (perm === "any" && !mine && !can(viewer, "VOICE_CALL_TAKEOVER") && !can(viewer, "VOICE_CALL_MANAGE")) throw new NotFoundError();
  return c;
}

const history = (from: "ai" | "human", to: "ai" | "human", by: string) => ({ at: new Date(), from, to, by });

/**
 * Moves a live PHONE call to a human's phone (ElevenLabs `transfer_to_number`). Atomic: only one person can take control; a second
 * attempt gets `control_busy`. The AI leaves the call, so `canHandBack` becomes false. Web calls can't be taken over.
 */
export async function takeOver(viewer: AibotsViewer, callId: string, input: { transferTo: string; overrideReason?: string }, deps: LiveDeps = {}): Promise<{ ok: true } | { ok: false; failure: CallFailure }> {
  const c = await liveCall(viewer, callId, "VOICE_CALL_TAKEOVER");
  const caps = liveCapabilities(c);
  if (c.control.mode === "human") return fail("control_busy", "Someone has already taken over this call.");
  if (c.direction === "web" || c.direction === "web_public") return fail("takeover_unsupported", "Web calls can't be taken over: the visitor is connected to the AI directly. You can watch the transcript, add a note for the AI or end the call.");
  if (!caps.transferToHuman) return fail("not_live", "This call isn't live any more.");
  const asked = normalizeE164(input.transferTo);
  if (!asked) return fail("takeover_unsupported", "Enter the phone number to move the call to, with its country code.");
  // Moving the call to a phone is a new outbound call to that number: it passes the same guards as placing one (allowed country, the
  // do-not-call list and the record's flag, the calling hours with a manager's reason, the hourly caps and the duplicate window).
  const now = (deps.now ?? (() => new Date()))();
  const reason = typeof input.overrideReason === "string" ? input.overrideReason.trim().slice(0, 300) : "";
  const isManager = can(viewer, "VOICE_CALL_MANAGE");
  const check = await checkCallAllowed({
    agentId: c.agentId, purpose: c.purpose, rawPhone: asked, target: c.target, at: now, now, excludeCallId: c._id, initiatorId: viewer.userId,
    windowOverride: isManager && reason.length >= 10, overrideRefused: Boolean(reason) && !isManager, fromNumberId: c.fromNumberId, deps,
  });
  if (!check.ok) {
    await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: c._id, botId: c.agentId, summary: `Transfer refused: ${check.failure.code}`, metadata: { to: `…${last4Of(asked)}` } });
    return { ok: false, failure: check.failure };
  }
  const to = check.phone; // in test mode the call is moved to the test number, never to the number that was asked for
  const calls = await callsCollection();
  const claimed = await calls.findOneAndUpdate(
    { _id: c._id, status: { $in: [...LIVE_STATUSES] }, "control.mode": "ai" },
    { $set: { "control.mode": "human", "control.handler": viewer.userId, "control.canHandBack": false, updatedAt: new Date(), transfer: { phoneHash: await phoneFingerprint(to), last4: last4Of(to), at: now, by: viewer.userId, overrideReason: isManager && reason.length >= 10 ? reason : null } }, $push: { "control.history": history("ai", "human", viewer.userId) } },
    { returnDocument: "after" }
  );
  if (!claimed) return fail("control_busy", "Someone else is controlling this call, or it has just ended.");
  try {
    await sendCommand(claimed, { command_type: "transfer_to_number", parameters: { phone_number: to } }, deps);
  } catch (e) {
    await calls.updateOne({ _id: c._id, "control.handler": viewer.userId, "control.mode": "human" }, { $set: { "control.mode": "ai", "control.handler": null, "control.canHandBack": true, updatedAt: new Date(), transfer: null }, $push: { "control.history": history("human", "ai", "system") } });
    return fail("monitor_unavailable", e instanceof Error ? e.message : "The call couldn't be moved.");
  }
  await recordCallEvent(c._id, { type: "control", text: "A team member took over; the call was moved to their phone and the AI left the call.", by: viewer.userId });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: c._id, botId: c.agentId, summary: "Took over a live call (moved to a human's phone)", metadata: { to: `…${last4Of(to)}`, ...(check.testMode ? { testMode: true, requested: `…${last4Of(asked)}` } : {}), windowOverride: Boolean(check.compliance.callingWindow.overridden) } });
  return { ok: true };
}

/** Gives control back to the AI, when the AI is still on the call. After a phone transfer it never is: the answer says so plainly. */
export async function handBack(viewer: AibotsViewer, callId: string, deps: LiveDeps = {}): Promise<{ ok: true } | { ok: false; failure: CallFailure }> {
  const c = await liveCall(viewer, callId, "any");
  if (c.control.mode !== "human") return fail("not_live", "The AI already has this call.");
  if (c.control.handler !== viewer.userId && !can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  if (!c.control.canHandBack) return fail("handback_unsupported", "The AI left this call when it was moved to a person and can't rejoin. Place a new AI call if you need one.");
  const calls = await callsCollection();
  const claimed = await calls.findOneAndUpdate(
    { _id: c._id, status: { $in: [...LIVE_STATUSES] }, "control.mode": "human", "control.canHandBack": true },
    { $set: { "control.mode": "ai", "control.handler": null, updatedAt: new Date() }, $push: { "control.history": history("human", "ai", viewer.userId) } },
    { returnDocument: "after" }
  );
  if (!claimed) return fail("control_busy", "Control has already changed, or the call has ended.");
  try {
    await sendCommand(claimed, { command_type: "disable_human_takeover" }, deps);
  } catch (e) {
    await calls.updateOne({ _id: c._id, "control.mode": "ai" }, { $set: { "control.mode": "human", "control.handler": c.control.handler }, $push: { "control.history": history("ai", "human", "system") } });
    return fail("monitor_unavailable", e instanceof Error ? e.message : "Couldn't hand the call back.");
  }
  await recordCallEvent(c._id, { type: "control", text: "Control went back to the AI.", by: viewer.userId });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: c._id, botId: c.agentId, summary: "Handed a live call back to the AI" });
  return { ok: true };
}

/** A short instruction the AI sees mid-call (ElevenLabs `contextual_update`). Plain text only; the caller never hears it. */
export async function addNote(viewer: AibotsViewer, callId: string, text: string, deps: LiveDeps = {}): Promise<{ ok: true } | { ok: false; failure: CallFailure }> {
  const c = await liveCall(viewer, callId, "any");
  if (!liveCapabilities(c).note) return fail("not_live", "This call isn't live, or a person is in control of it.");
  const clean = cleanContextValue(text, NOTE_MAX);
  if (!clean) return fail("monitor_unavailable", "Write the note first.");
  try {
    await sendCommand(c, { command_type: "contextual_update", parameters: { contextual_update: clean } }, deps);
  } catch (e) {
    return fail("monitor_unavailable", e instanceof Error ? e.message : "The note couldn't be sent.");
  }
  await recordCallEvent(c._id, { type: "note", text: clean, by: viewer.userId });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: c._id, botId: c.agentId, summary: "Sent a note to the AI during a live call" });
  return { ok: true };
}

/** Ends a live call: through ElevenLabs when possible, else (phone calls) by hanging up in the company's own Twilio account. */
export async function endCall(viewer: AibotsViewer, callId: string, deps: LiveDeps = {}): Promise<{ ok: true; via: "elevenlabs" | "twilio" } | { ok: false; failure: CallFailure }> {
  const c = await liveCall(viewer, callId, "any");
  if (!liveCapabilities(c).endCall) return fail("not_live", "This call isn't live any more.");
  let via: "elevenlabs" | "twilio" | null = null;
  try {
    await sendCommand(c, { command_type: "end_call" }, deps);
    via = "elevenlabs";
  } catch {
    const twilio = c.callSid ? await (deps.twilio ?? ownTwilio)() : null;
    if (twilio && c.callSid) {
      const f = deps.fetch ?? fetch;
      const res = await f(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Calls/${encodeURIComponent(c.callSid)}.json`, {
        method: "POST",
        headers: { authorization: `Basic ${Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Status: "completed" }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (res?.ok) via = "twilio";
    }
  }
  if (!via) return fail("monitor_unavailable", "The call couldn't be ended from here. Hang up from the phone, or try again.");
  await recordCallEvent(c._id, { type: "control", text: "The call was ended by a team member.", by: viewer.userId });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: c._id, botId: c.agentId, summary: "Ended a live call", metadata: { via } });
  return { ok: true, via };
}

