import "server-only";
import type { Filter } from "mongodb";
import { getBot } from "@/lib/products/agentos/bots";
import { newId } from "@/lib/products/agentos/db";
import { recordAudit, recordAuditThrottled } from "@/lib/products/agentos/audit";
import { checkCallAllowed, type GuardDeps } from "@/lib/products/agentos/calls/guards";
import { composeOpening } from "@/lib/products/agentos/calls/notices";
import { authorizeTarget, ensureIntegrations } from "@/lib/products/agentos/calls/integrations";
import { sanitizeContext, cleanContextValue } from "@/lib/products/agentos/calls/context";
import { mergeConferenceTranscript } from "@/lib/products/agentos/calls/conference-transcript";
import { maskPhone, last4Of, normalizeE164, maskPhonesInText } from "@/lib/products/agentos/calls/phone";
import { callsCollection, isDuplicateKey, phoneFingerprint } from "@/lib/products/agentos/calls/store";
import { isTerminal, type CallDoc, type CallFailure, type CallStatus, type CallTarget, type CollectedValue } from "@/lib/products/agentos/calls/types";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { AibotsInputError, ForbiddenError, NotFoundError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { ElevenLabsAgentError, type AgentClient, type ConversationDetail } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { workspaceAgentClient } from "@/lib/products/agentos/voice/connection";
import { defaultMeter } from "@/lib/products/agentos/voice/calls";
import { briefingForDial, cleanSelection, type BriefingDeps } from "@/lib/products/agentos/calls/briefing";
import { BRIEFING_VARIABLE, usesBriefing } from "@/lib/products/agentos/calls/purposes";

/**
 * The calling engine: request / schedule / cancel / retry a call, dial it exactly once, and fold ElevenLabs' results back into the
 * call record. Nothing here places a call unless a signed-in person asked for it (or scheduled it), and every dial passes
 * `checkCallAllowed` first.
 */

export interface EngineDeps extends GuardDeps {
  client?: () => Promise<AgentClient | null>;
  meter?: (seconds: number, botName: string) => Promise<void>;
  now?: () => Date;
  /** Test hooks for conference calls (fake Twilio / ElevenLabs). */
  conference?: import("@/lib/products/agentos/calls/conference").ConferenceDeps;
  /** Test hooks for the call briefing (who the caller is at dial time, the condenser). */
  briefing?: BriefingDeps;
}
/** An error as one log line with any phone number masked. */
const errText = (e: unknown) => maskPhonesInText(e instanceof Error ? e.message : String(e));
const nowOf = (d?: EngineDeps) => (d?.now ?? (() => new Date()))();

const METER_LEASE_MS = 2 * 60 * 1000;
/** A scheduled call that wasn't picked up within this long of its time is not dialed late (the person expected it then). */
export const MAX_LATE_MS = 30 * 60 * 1000;
/** A call stuck in "dialing" without a conversation is given up after this long. */
export const STUCK_DIAL_MS = 10 * 60 * 1000;
/** A browser (web) call row may legitimately sit in "dialing" for a whole call: the longest call an agent allows (1 h) plus 15 minutes. */
export const WEB_ABANDON_MS = (3600 + 15 * 60) * 1000;
/** An unknown dial outcome is checked with the provider no sooner than this after the attempt, and given up on after UNKNOWN_GIVE_UP_MS. */
export const UNKNOWN_CHECK_AFTER_MS = 2 * 60 * 1000;
export const UNKNOWN_GIVE_UP_MS = 24 * 60 * 60 * 1000;
export const DUE_BATCH = 25;
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;
const KEY = /^[\w:.-]{8,120}$/;

export type RequestResult = { ok: true; call: CallView; deduplicated: boolean } | { ok: false; failure: CallFailure };

export interface RequestCallInput {
  agentId: string;
  purpose: string;
  target: CallTarget | null;
  phone: string;
  context?: Record<string, unknown>;
  scheduleAt?: Date | string | null;
  /** Calls manager only: the reason for calling outside the calling hours. */
  overrideReason?: string;
  /** Same key = same call: a double click or a retried request returns the first call. */
  idempotencyKey: string;
  fromNumberId?: string | null;
  /** The briefing sections the person ticked in the dialog (keys). Omitted / null = the defaults. Used again when the call is dialed, even from a schedule. */
  briefingSelection?: string[] | null;
}

export interface CallView {
  id: string;
  direction: CallDoc["direction"];
  agentId: string;
  purpose: string;
  target: CallTarget | null;
  /** Full number for the person who placed the call and for managers; masked for other viewers. */
  phone: string | null;
  phoneLast4: string | null;
  status: CallStatus;
  scheduledFor: string | null;
  createdAt: string;
  dialedAt: string | null;
  endedAt: string | null;
  durationSecs: number | null;
  initiatedBy: string | null;
  failure: CallFailure | null;
  collected: CollectedValue[];
  outcome: CallDoc["outcome"];
  summary: string | null;
  summaryTitle: string | null;
  hasAudio: boolean | null;
  terminationReason: string | null;
  control: { mode: "ai" | "human"; handler: string | null; canHandBack: boolean };
  transcript: CallDoc["transcript"];
  mine: boolean;
  /** Placed to the company's test number instead of the person's real one (both shown masked). */
  testMode: boolean;
  requestedPhoneMasked: string | null;
  dialedPhoneMasked: string | null;
}

const manages = (v: AibotsViewer) => can(v, "VOICE_CALL_MANAGE");
const oversees = (v: AibotsViewer) => manages(v) || can(v, "VIEW_CHATS");

export function toView(c: CallDoc, viewer: AibotsViewer, withTranscript = false): CallView {
  const mine = c.initiatedBy?.userId === viewer.userId;
  const full = mine || manages(viewer);
  return {
    id: c._id, direction: c.direction, agentId: c.agentId, purpose: c.purpose, target: c.target,
    phone: c.phone ? (full ? c.phone : maskPhone(c.phone)) : null, phoneLast4: c.phoneLast4,
    status: c.status, scheduledFor: c.scheduledFor?.toISOString() ?? null, createdAt: c.createdAt.toISOString(),
    dialedAt: c.dialedAt?.toISOString() ?? null, endedAt: c.endedAt?.toISOString() ?? null, durationSecs: c.durationSecs,
    initiatedBy: c.initiatedBy?.email ?? null, failure: c.failure, collected: c.collected, outcome: c.outcome,
    summary: c.summary, summaryTitle: c.summaryTitle, hasAudio: c.hasAudio, terminationReason: c.terminationReason,
    control: { mode: c.control?.mode ?? "ai", handler: c.control?.handler ?? null, canHandBack: c.control?.canHandBack ?? true },
    transcript: withTranscript ? c.transcript : null, mine,
    testMode: c.testMode === true, requestedPhoneMasked: c.requestedPhoneMasked ?? null, dialedPhoneMasked: c.dialedPhoneMasked ?? null,
  };
}

const cleanTarget = (t: CallTarget | null | undefined): CallTarget | null => {
  if (!t) return null;
  const product = cleanContextValue(t.product, 40);
  const entityType = cleanContextValue(t.entityType, 40);
  const entityId = cleanContextValue(t.entityId, 80);
  if (!product || !entityType || !entityId) throw new AibotsInputError("The call needs to say which record it is about.");
  return { product, entityType, entityId, label: cleanContextValue(t.label, 120) };
};

export { registerTargetAuthorizer } from "@/lib/products/agentos/calls/integrations";

// ---------------------------------------------------------------------------
// Result handlers: products register to be told once when a call settles (write-back to a lead / applicant timeline).
// ---------------------------------------------------------------------------
export type CallSettledHandler = (call: CallDoc) => Promise<void>;
const gh = globalThis as unknown as { __agentosCallHandlers?: Map<string, CallSettledHandler> };
const settledHandlers = (gh.__agentosCallHandlers ??= new Map());
export function registerCallSettledHandler(product: string, fn: CallSettledHandler): void {
  settledHandlers.set(product, fn);
}
async function notifySettled(call: CallDoc): Promise<void> {
  if (!call.target) return;
  // A process that never rendered the product's pages has no handler yet: load the products' hooks before looking one up.
  try {
    await ensureIntegrations();
  } catch {
    console.error("[agentos calls] settled handlers could not be loaded; the product was not told about call", call._id);
    return;
  }
  const fn = settledHandlers.get(call.target.product);
  if (!fn) return;
  try {
    await fn(call);
  } catch (e) {
    console.error("[agentos calls] settled handler failed", errText(e));
  }
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

async function companyName(): Promise<string> {
  return (await getCompany(await currentCompanyId()))?.name ?? "";
}

export async function requestCall(viewer: AibotsViewer, input: RequestCallInput, deps: EngineDeps = {}): Promise<RequestResult> {
  if (!can(viewer, "VOICE_CALL")) throw new ForbiddenError("VOICE_CALL");
  if (typeof input.idempotencyKey !== "string" || !KEY.test(input.idempotencyKey)) throw new AibotsInputError("The request couldn't be identified. Reload and try again.");
  const calls = await callsCollection();
  const prior = await calls.findOne({ idempotencyKey: input.idempotencyKey });
  if (prior) {
    if (prior.initiatedBy?.userId !== viewer.userId) throw new NotFoundError();
    return { ok: true, call: toView(prior, viewer), deduplicated: true };
  }
  const now = nowOf(deps);
  const target = cleanTarget(input.target);
  // The person must be allowed to act on the record the call is about (default deny: a product with no authorizer cannot be targeted).
  if (target && !(await authorizeTarget(viewer, target))) {
    await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: "refused", summary: `Call refused: no access to ${target.product} ${target.entityType}` });
    return { ok: false, failure: { code: "target_forbidden", message: "You don't have access to the record this call is about." } };
  }
  let at = now;
  if (input.scheduleAt) {
    at = new Date(input.scheduleAt);
    if (Number.isNaN(at.getTime())) throw new AibotsInputError("That date and time isn't valid.");
    if (at.getTime() < now.getTime() - 60_000) return { ok: false, failure: { code: "schedule_in_past", message: "Pick a time in the future." } };
    if (at.getTime() - now.getTime() > MAX_SCHEDULE_AHEAD_MS) throw new AibotsInputError("Calls can be scheduled up to 90 days ahead.");
  }
  const reason = typeof input.overrideReason === "string" ? input.overrideReason.trim().slice(0, 300) : "";
  if (input.overrideReason !== undefined && input.overrideReason !== "" && reason.length < 10) throw new AibotsInputError("Explain why this call must happen outside the calling hours (at least 10 characters).");
  const isManager = manages(viewer);
  const runCheck = () => checkCallAllowed({
    viewer, agentId: String(input.agentId ?? "").slice(0, 64), purpose: String(input.purpose ?? ""), rawPhone: input.phone, target, at, now,
    initiatorId: viewer.userId, windowOverride: isManager && reason.length >= 10, overrideRefused: Boolean(reason) && !isManager,
    fromNumberId: input.fromNumberId ?? null, deps,
  });
  let check = await runCheck();
  // A call that is "already there" may have ended without us hearing (no callback reached us): ask the provider once, then look again.
  if (!check.ok && check.failure.code === "duplicate" && check.failure.existing && (check.failure.existing.status === "dialing" || check.failure.existing.status === "in_progress")) {
    const { reconcileCallNow } = await import("@/lib/products/agentos/calls/stale");
    if (await reconcileCallNow(check.failure.existing.id, deps)) check = await runCheck();
  }
  if (!check.ok) return { ok: false, failure: check.failure };

  const later = at.getTime() - now.getTime() > 60_000;
  const context = sanitizeContext(input.purpose, input.context, { company_name: await companyName() });
  check.compliance.callingWindow.overrideReason = isManager && reason ? reason : null;
  const doc: CallDoc = {
    _id: newId(), idempotencyKey: input.idempotencyKey, direction: "outbound", agentId: check.bot._id, elevenAgentId: check.bot.voice!.elevenAgentId,
    purpose: input.purpose, target, phone: check.phone, phoneHash: await phoneFingerprint(check.phone), phoneLast4: last4Of(check.phone),
    fromNumberId: check.number._id, initiatedBy: { userId: viewer.userId, email: viewer.email },
    scheduledFor: later ? at : null, anchorAt: later ? at : now, dialedAt: later ? null : now, endedAt: null,
    status: later ? "scheduled" : "dialing", attempts: later ? 0 : 1, conversationId: null, callSid: null, context, compliance: check.compliance,
    failure: null, collected: [], outcome: null, summary: null, summaryTitle: null, transcript: null, durationSecs: null, hasAudio: null,
    terminationReason: null, meteredAt: null, meterLeaseUntil: null, chatId: null, cancelledBy: null,
    control: { mode: "ai", handler: null, canHandBack: true, history: [] }, eventSeq: 0, createdAt: now, updatedAt: now,
    briefing: usesBriefing([input.purpose]) ? { selection: cleanSelection(input.briefingSelection), builtAt: null, sections: [], chars: 0, hash: null, warnings: 0 } : null,
    ...(check.testMode ? { testMode: true, requestedPhoneMasked: check.requestedPhone ? maskPhone(check.requestedPhone) : null, dialedPhoneMasked: maskPhone(check.phone) } : {}),
  };
  try {
    await calls.insertOne(doc); // the unique idempotency key makes this the claim: a double click inserts once
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    const again = await calls.findOne({ idempotencyKey: input.idempotencyKey });
    if (again && again.initiatedBy?.userId === viewer.userId) return { ok: true, call: toView(again, viewer), deduplicated: true };
    throw new NotFoundError();
  }
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "create", entity: "call", entityId: doc._id, entityLabel: target?.label ?? `…${doc.phoneLast4}`, botId: doc.agentId, summary: later ? "Scheduled a call" : "Started a call", metadata: { purpose: doc.purpose, windowOverride: Boolean(doc.compliance?.callingWindow.overridden), ...(check.testMode ? { testMode: true, requested: doc.requestedPhoneMasked, dialed: doc.dialedPhoneMasked } : {}) } });
  if (!later) {
    const failure = await dialClaimed(doc, deps, { capsOnly: true });
    if (failure) return { ok: false, failure };
  }
  return { ok: true, call: toView((await calls.findOne({ _id: doc._id }))!, viewer), deduplicated: false };
}

// ---------------------------------------------------------------------------
// Dial (only ever called for a call this worker has just claimed)
// ---------------------------------------------------------------------------

async function failCall(id: string, failure: CallFailure, now: Date): Promise<void> {
  await (await callsCollection()).updateOne(
    { _id: id, status: { $in: ["scheduled", "dialing"] }, conversationId: null },
    { $set: { status: "failed", failure, endedAt: now, dialedAt: null, updatedAt: now } }
  );
}

/**
 * Dials a call whose status is already "dialing" (claimed). `capsOnly` skips the full guard run because the caller just ran it; the
 * hourly caps are always re-counted after the claim so two simultaneous requests can't both slip under the limit.
 */
async function dialClaimed(call: CallDoc, deps: EngineDeps, opts: { capsOnly: boolean }): Promise<CallFailure | null> {
  const now = nowOf(deps);
  const calls = await callsCollection();
  const refuse = async (failure: CallFailure) => {
    await failCall(call._id, failure, now);
    await recordAudit({ actorId: call.initiatedBy?.userId ?? "system", actorEmail: call.initiatedBy?.email ?? null, action: "update", entity: "call", entityId: call._id, botId: call.agentId, summary: `Call not placed: ${failure.code}` });
    return failure;
  };
  const check = await checkCallAllowed({
    agentId: call.agentId, purpose: call.purpose, rawPhone: call.phone, target: call.target, at: now, now, excludeCallId: call._id,
    initiatorId: call.initiatedBy?.userId ?? "", windowOverride: Boolean(call.compliance?.callingWindow.overrideReason) || opts.capsOnly,
    fromNumberId: call.fromNumberId, deps,
  });
  // capsOnly: the request just ran the window check (and a manager's override); everything else, caps included, is counted again now.
  if (!check.ok) return refuse(check.failure);
  // The test number can be switched on after a call was created or scheduled: from now on the call is a test call and goes to the test number.
  if (check.testMode && !call.testMode) {
    await calls.updateOne({ _id: call._id, status: "dialing" }, { $set: { testMode: true, requestedPhoneMasked: call.phone ? maskPhone(call.phone) : null, dialedPhoneMasked: maskPhone(check.phone), phone: check.phone, phoneHash: await phoneFingerprint(check.phone), phoneLast4: last4Of(check.phone) } });
    await recordAudit({ actorId: call.initiatedBy?.userId ?? "system", actorEmail: call.initiatedBy?.email ?? null, action: "update", entity: "call", entityId: call._id, botId: call.agentId, summary: "Call redirected to the test number", metadata: { requested: call.phone ? maskPhone(call.phone) : null, dialed: maskPhone(check.phone) } });
  }

  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) return refuse({ code: "not_connected", message: "ElevenLabs isn't connected for this workspace. Add your ElevenLabs key in Settings → Integrations." });
  // Conference mode (live listening and take-over): the lead and the AI are separate Twilio legs in one conference; see conference.ts.
  const conf = await import("@/lib/products/agentos/calls/conference");
  // What the AI says first: the AI disclosure (and, on a direct call, the recording notice) is SPOKEN, not only hinted in the prompt. It needs the
  // first-message override, which stays OFF for public agents (anyone with their link could use it), so a public agent keeps its own greeting.
  const voice = check.bot.voice!;
  const spoken = (recordingNotice: boolean) => (voice.isPublic ? null : composeOpening({ language: voice.language, recordingNotice, disclosureLine: voice.disclosureLine, requireDisclosure: check.settings.requireDisclosure, firstMessage: voice.firstMessage }));
  // The briefing is built NOW, for every dial (immediate or from the schedule): fresh data, the caller's permissions as they are today, never a copy from when it was scheduled.
  const briefing = usesBriefing([call.purpose]) ? await briefingForDial(call, deps.briefing) : "";
  const useConference = await conf.shouldUseConference(deps.conference);
  const opening = spoken(!useConference && check.settings.recordingNotice); // on a conference call Twilio speaks the recording notice before the AI joins
  await calls.updateOne({ _id: call._id, status: "dialing" }, { $set: { "compliance.openingSpoken": Boolean(opening), "compliance.recordingNoticeSpoken": check.settings.recordingNotice && (useConference || Boolean(opening)) } });
  if (useConference) {
    const failure = await conf.dialConference(call, { fromNumber: check.number.number, toNumber: check.phone, elevenAgentId: voice.elevenAgentId!, language: voice.language, opening, briefing }, deps.conference);
    if (failure && failure.code === "dial_unconfirmed") return failure; // may be ringing: not failed, not redialed (see markDialUnknown)
    if (failure) return refuse(failure);
    await calls.updateOne({ _id: call._id, status: "dialing" }, { $set: { elevenAgentId: voice.elevenAgentId, updatedAt: nowOf(deps) } });
    return null;
  }
  try {
    const r = await client.outboundCall({ agentId: voice.elevenAgentId!, phoneNumberId: check.number.elevenPhoneNumberId, toNumber: check.phone, dynamicVariables: usesBriefing([call.purpose]) ? { ...call.context, [BRIEFING_VARIABLE]: briefing } : call.context, firstMessage: opening });
    await calls.updateOne({ _id: call._id, status: "dialing" }, { $set: { conversationId: r.conversationId, callSid: r.callSid, elevenAgentId: check.bot.voice!.elevenAgentId, updatedAt: nowOf(deps) } });
    // Accepted but no conversation id came back: the call is out there, we just can't follow it yet. Resolve by looking, never by redialing.
    if (!r.conversationId) await markDialUnknown(call, nowOf(deps));
    return null;
  } catch (e) {
    if (isUnknownDialOutcome(e)) return markDialUnknown(call, now);
    return refuse({ code: "provider_error", message: e instanceof ElevenLabsAgentError ? e.message : "The call couldn't be placed. Try again." });
  }
}

/** True when the provider may have placed the call although we got no answer: a timeout, a lost connection or a server error. A clear refusal (4xx) is not. */
export function isUnknownDialOutcome(e: unknown): boolean {
  if (!(e instanceof ElevenLabsAgentError)) return true; // something unexpected after the request was sent: assume it may have gone out
  return e.code === "network" || e.code === "unavailable" || e.status === 408;
}

/**
 * The dial request ended without a clear answer. The call is NOT failed (a person could Retry and the lead's phone could ring twice):
 * it stays "dialing" with `dialUnknown` set, nothing redials it, and the reconcile asks ElevenLabs whether a conversation exists.
 */
async function markDialUnknown(call: CallDoc, now: Date): Promise<CallFailure> {
  await (await callsCollection()).updateOne({ _id: call._id, status: "dialing", conversationId: null }, { $set: { dialUnknown: { at: now, checkedAt: null, resolved: null }, updatedAt: now } });
  await recordAudit({ actorId: call.initiatedBy?.userId ?? "system", actorEmail: call.initiatedBy?.email ?? null, action: "update", entity: "call", entityId: call._id, botId: call.agentId, summary: "Call outcome unknown: the provider did not answer in time. It will be checked, not redialed." });
  return { code: "dial_unconfirmed", message: "The provider didn't answer in time, so it isn't known whether the phone is ringing. The call was not redialed; its status will be updated once the provider has been checked." };
}

/** Dials the scheduled calls that are due. Claim-first, every guard re-run, no automatic retries. Safe to run on several servers at once. */
export async function dialDueCalls(deps: EngineDeps = {}): Promise<{ dialed: number; failed: number; skipped: number }> {
  const calls = await callsCollection();
  const out = { dialed: 0, failed: 0, skipped: 0 };
  for (let i = 0; i < DUE_BATCH; i++) {
    const now = nowOf(deps);
    const claimed = await calls.findOneAndUpdate(
      { status: "scheduled", scheduledFor: { $lte: now } },
      { $set: { status: "dialing", dialedAt: now, anchorAt: now, updatedAt: now }, $inc: { attempts: 1 } },
      { sort: { scheduledFor: 1 }, returnDocument: "after" }
    );
    if (!claimed) break;
    if (claimed.scheduledFor && now.getTime() - claimed.scheduledFor.getTime() > MAX_LATE_MS) {
      await failCall(claimed._id, { code: "schedule_in_past", message: "This call wasn't placed because its time passed while nothing was running. Schedule it again." }, now);
      out.skipped++;
      continue;
    }
    const failure = await dialClaimed(claimed, deps, { capsOnly: false });
    if (failure) out.failed++;
    else out.dialed++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cancel / retry / read
// ---------------------------------------------------------------------------

async function loadFor(viewer: AibotsViewer, callId: string, oversight = false): Promise<CallDoc> {
  if (typeof callId !== "string" || callId.length > 64) throw new NotFoundError();
  const c = await (await callsCollection()).findOne({ _id: callId });
  if (!c) throw new NotFoundError();
  if (c.initiatedBy?.userId !== viewer.userId && !(oversight ? oversees(viewer) : manages(viewer))) throw new NotFoundError();
  return c;
}

/** Cancels a call that hasn't been dialed. Its own caller or a calls manager. A call already ringing is ended with endCall instead. */
export async function cancelCall(viewer: AibotsViewer, callId: string): Promise<{ ok: true } | { ok: false; failure: CallFailure }> {
  if (!can(viewer, "VOICE_CALL")) throw new ForbiddenError("VOICE_CALL");
  const c = await loadFor(viewer, callId);
  const now = new Date();
  const r = await (await callsCollection()).updateOne({ _id: c._id, status: "scheduled" }, { $set: { status: "cancelled", cancelledBy: viewer.userId, endedAt: now, updatedAt: now, failure: { code: "cancelled", message: "Cancelled before it was dialed." } } });
  if (r.modifiedCount !== 1) return { ok: false, failure: { code: "not_live", message: "This call has already been dialed or finished, so it can't be cancelled." } };
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "delete", entity: "call", entityId: c._id, botId: c.agentId, summary: "Cancelled a scheduled call" });
  return { ok: true };
}

/** A person decides to try a failed / unanswered call again. Never automatic. Runs every guard like a new call. */
export async function retryCall(viewer: AibotsViewer, callId: string, idempotencyKey: string, deps: EngineDeps = {}): Promise<RequestResult> {
  if (!can(viewer, "VOICE_CALL")) throw new ForbiddenError("VOICE_CALL");
  const c = await loadFor(viewer, callId);
  if (c.dialUnknown && (c.dialUnknown.resolved === null || c.dialUnknown.resolved === "unconfirmed")) {
    return { ok: false, failure: { code: "dial_unconfirmed", message: "The earlier attempt may have reached the phone and hasn't been checked with the provider yet, so it can't be tried again." } };
  }
  if (c.direction !== "outbound" || !c.phone || !["failed", "no_answer", "busy"].includes(c.status)) {
    return { ok: false, failure: { code: "not_live", message: "Only a call that failed, wasn't answered or was busy can be tried again." } };
  }
  return requestCall(viewer, { agentId: c.agentId, purpose: c.purpose, target: c.target, phone: c.phone, context: c.context, idempotencyKey, fromNumberId: c.fromNumberId, briefingSelection: c.briefing?.selection ?? null }, deps);
}

export interface CallFilters {
  scope?: "mine" | "all";
  status?: CallStatus;
  agentId?: string;
  target?: { product: string; entityType: string; entityId: string };
  page?: number;
}
const PAGE = 30;

export async function listCalls(viewer: AibotsViewer, f: CallFilters = {}): Promise<{ items: CallView[]; total: number; page: number }> {
  const all = f.scope === "all" && oversees(viewer);
  const q: Filter<CallDoc> = {};
  if (!all) q["initiatedBy.userId"] = viewer.userId;
  if (f.status) q.status = f.status;
  if (f.agentId) q.agentId = String(f.agentId).slice(0, 64);
  if (f.target) Object.assign(q, { "target.product": String(f.target.product), "target.entityType": String(f.target.entityType), "target.entityId": String(f.target.entityId) });
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const col = await callsCollection();
  const [rows, total] = await Promise.all([col.find(q, { projection: { transcript: 0 } }).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).toArray(), col.countDocuments(q)]);
  return { items: rows.map((r) => toView(r, viewer)), total, page };
}

export async function getCall(viewer: AibotsViewer, callId: string): Promise<CallView> {
  const c = await loadFor(viewer, callId, true);
  if (c.initiatedBy?.userId !== viewer.userId) {
    await recordAuditThrottled({ actorId: viewer.userId, actorEmail: viewer.email, action: "view", entity: "call", entityId: c._id, botId: c.agentId, summary: "Viewed someone else's call" }, 30 * 60 * 1000);
  }
  return toView(c, viewer, true);
}

/** For the live console and other modules: the call row if this person may see it. */
export const loadCallForViewer = loadFor;

// ---------------------------------------------------------------------------
// Results: one place that folds ElevenLabs' answer into the call, used by the webhook and the reconcile poll
// ---------------------------------------------------------------------------

const RANK: Record<CallStatus, number> = { scheduled: 0, dialing: 1, in_progress: 2, completed: 3, failed: 3, no_answer: 3, busy: 3, cancelled: 3 };

export interface ConversationUpdate {
  conversationId: string;
  /** The ElevenLabs agent id the event names; it must match the call's. Missing = refused (fail closed). */
  agentId: string | null;
  detail?: ConversationDetail | null;
  /** From a call_initiation_failure event. */
  failureReason?: "busy" | "no-answer" | "unknown" | null;
}

/** Decides the status a conversation detail stands for. Pure. */
export function statusFromDetail(d: ConversationDetail): CallStatus {
  if (d.status === "failed") return "failed";
  if (d.status === "done") return d.transcript?.some((t) => t.role === "user") ? "completed" : d.durationSecs && d.durationSecs > 0 && d.transcript === null ? "completed" : "no_answer";
  if (d.status === "in-progress" || d.status === "processing") return "in_progress";
  return "dialing";
}

export async function applyConversationUpdate(u: ConversationUpdate, deps: EngineDeps = {}): Promise<{ matched: boolean; status: CallStatus | null }> {
  const calls = await callsCollection();
  const call = await calls.findOne({ conversationId: u.conversationId });
  if (!call) return { matched: false, status: null };
  // Fail closed: the update must name the agent this call was placed with. A missing agent id is a refusal, not a pass.
  if (!call.elevenAgentId || typeof u.agentId !== "string" || !u.agentId || u.agentId !== call.elevenAgentId) return { matched: false, status: null };
  const now = nowOf(deps);
  let status: CallStatus;
  const $set: Record<string, unknown> = { updatedAt: now };
  if (u.failureReason) {
    status = u.failureReason === "busy" ? "busy" : u.failureReason === "no-answer" ? "no_answer" : "failed";
    $set.failure = { code: "provider_error", message: status === "busy" ? "The line was busy." : status === "no_answer" ? "Nobody answered." : "The call couldn't be connected." };
  } else if (u.detail) {
    const d = u.detail;
    status = statusFromDetail(d);
    if (d.durationSecs !== null) $set.durationSecs = d.durationSecs;
    if (d.transcript) $set.transcript = (await mergeConferenceTranscript(call, d.transcript)) ?? d.transcript; // conference calls: add what the team member said
    if (d.hasAudio !== null) $set.hasAudio = d.hasAudio;
    if (d.terminationReason) $set.terminationReason = d.terminationReason;
    if (d.analysis) {
      $set.summary = d.analysis.summary;
      $set.summaryTitle = d.analysis.title;
      $set.outcome = d.analysis.callSuccess;
      const labels = new Map((await getBot(call.agentId))?.voice?.dataFields?.map((f) => [f.key, f.label]) ?? []);
      $set.collected = d.analysis.data.map((x) => ({ key: x.key, label: labels.get(x.key) ?? x.key, value: x.value }));
    }
  } else return { matched: true, status: call.status };

  $set.status = status;
  if (RANK[status] >= 3) $set.endedAt = now;
  const filter: Filter<CallDoc> = { _id: call._id, status: { $in: (Object.keys(RANK) as CallStatus[]).filter((s) => RANK[s] < RANK[status]) } };
  if (call.status === status) {
    // Same status again (webhook after poll, or a retried delivery): refresh the details only, never re-announce.
    delete $set.endedAt;
    await calls.updateOne({ _id: call._id, status: call.status }, { $set });
  } else {
    const moved = await calls.findOneAndUpdate(filter, { $set }, { returnDocument: "after" });
    if (moved && RANK[status] >= 3) await notifySettled(moved);
  }
  const fresh = (await calls.findOne({ _id: call._id }))!;
  if (isTerminal(fresh.status) && fresh.durationSecs && fresh.durationSecs > 0 && u.detail?.settled) await meterCall(fresh, deps);
  return { matched: true, status: fresh.status };
}

/**
 * Settles a call that ElevenLabs never reported on (a call that wasn't answered, or a conference call whose result never arrived).
 * Moves it forward only (never out of a finished state), tells the product that asked for it, and counts the seconds when given.
 */
export async function settleCall(callId: string, patch: { status: CallStatus; failure?: CallFailure | null; durationSecs?: number | null; transcript?: CallDoc["transcript"] }, deps: EngineDeps = {}): Promise<boolean> {
  const calls = await callsCollection();
  const now = nowOf(deps);
  const $set: Record<string, unknown> = { status: patch.status, endedAt: now, updatedAt: now };
  if (patch.failure !== undefined) $set.failure = patch.failure;
  if (patch.durationSecs !== undefined && patch.durationSecs !== null) $set.durationSecs = patch.durationSecs;
  if (patch.transcript) $set.transcript = patch.transcript;
  const moved = await calls.findOneAndUpdate({ _id: callId, status: { $in: (Object.keys(RANK) as CallStatus[]).filter((s) => RANK[s] < RANK[patch.status]) } }, { $set }, { returnDocument: "after" });
  if (!moved) return false;
  await notifySettled(moved);
  if (moved.durationSecs && moved.durationSecs > 0) await meterCall(moved, deps);
  return true;
}

/** Counts the seconds against the plan once: lease first, `meteredAt` only after the meter succeeded. */
async function meterCall(call: CallDoc, deps: EngineDeps): Promise<void> {
  const calls = await callsCollection();
  const now = nowOf(deps);
  const lease = await calls.updateOne({ _id: call._id, meteredAt: null, $or: [{ meterLeaseUntil: null }, { meterLeaseUntil: { $lte: now } }] }, { $set: { meterLeaseUntil: new Date(now.getTime() + METER_LEASE_MS) } });
  if (lease.modifiedCount !== 1) return;
  try {
    await (deps.meter ?? defaultMeter)(call.durationSecs!, (await getBot(call.agentId))?.name ?? "Voice agent");
  } catch (e) {
    console.error("[agentos calls] metering failed, will retry", errText(e));
    await calls.updateOne({ _id: call._id, meteredAt: null }, { $set: { meterLeaseUntil: null } });
    return;
  }
  await calls.updateOne({ _id: call._id }, { $set: { meteredAt: new Date(), meterLeaseUntil: null } });
}

/**
 * The safety net behind the webhook: asks ElevenLabs about calls that are still open (or finished but unmetered) and gives up on
 * calls that never got a conversation. Called by the scheduled job for each company.
 */
export async function reconcileOpenCalls(deps: EngineDeps = {}): Promise<{ checked: number; settled: number; abandoned: number }> {
  const calls = await callsCollection();
  const now = nowOf(deps);
  const out = { checked: 0, settled: 0, abandoned: 0 };
  // A call stuck in "dialing" without a conversation is given up on. Not a browser (web) call, which may legitimately run for as long as an
  // agent allows (it is given up on after the longest call plus 15 minutes), and not a call whose dial outcome is unknown (checked below).
  const stuck = { status: "dialing" as const, conversationId: null, dialUnknown: null };
  const abandon = await calls.updateMany(
    { ...stuck, $or: [{ direction: { $ne: "web" }, dialedAt: { $lte: new Date(now.getTime() - STUCK_DIAL_MS) } }, { direction: "web", dialedAt: { $lte: new Date(now.getTime() - WEB_ABANDON_MS) } }] },
    { $set: { status: "failed", endedAt: now, updatedAt: now, failure: { code: "provider_error", message: "The call never connected to ElevenLabs." } } }
  );
  out.abandoned = abandon.modifiedCount;
  out.abandoned += await resolveUnknownDials(deps, now, out);
  const open = await calls
    .find({ conversationId: { $type: "string" }, $or: [{ status: { $in: ["dialing", "in_progress"] }, updatedAt: { $lte: new Date(now.getTime() - 60_000) } }, { status: { $in: ["completed", "no_answer", "failed", "busy"] }, durationSecs: { $gt: 0 }, meteredAt: null }] })
    .sort({ updatedAt: 1 })
    .limit(25)
    .toArray();
  if (!open.length) return out;
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) return out;
  for (const c of open) {
    out.checked++;
    try {
      const detail = await client.getConversation(c.conversationId!);
      const r = await applyConversationUpdate({ conversationId: c.conversationId!, agentId: detail.agentId || null, detail }, deps);
      if (r.status && isTerminal(r.status)) out.settled++;
    } catch (e) {
      if (e instanceof ElevenLabsAgentError && e.code === "not_found" && now.getTime() - c.createdAt.getTime() > STUCK_DIAL_MS) {
        await calls.updateOne({ _id: c._id, status: { $in: ["dialing", "in_progress"] } }, { $set: { status: "failed", endedAt: now, updatedAt: now, failure: { code: "provider_error", message: "ElevenLabs has no record of this call." } } });
        out.abandoned++;
      }
    }
  }
  return out;
}

/**
 * Resolves calls whose dial outcome was unknown. A conversation that matches the number and the time is linked (and then settles and is
 * metered like any call); when the provider has been asked and has nothing, the call fails and only then may be retried. Never dials.
 * Returns how many were given up on.
 */
async function resolveUnknownDials(deps: EngineDeps, now: Date, out: { checked: number; settled: number }): Promise<number> {
  const calls = await callsCollection();
  const pending = await calls.find({ status: "dialing", conversationId: null, dialUnknown: { $type: "object" }, "dialUnknown.resolved": null, "dialUnknown.at": { $lte: new Date(now.getTime() - UNKNOWN_CHECK_AFTER_MS) } }).limit(10).toArray();
  let gaveUp = 0;
  const settleTo = async (c: CallDoc, resolved: "none" | "unconfirmed", message: string) => {
    const r = await calls.updateOne({ _id: c._id, status: "dialing", conversationId: null }, { $set: { status: "failed", endedAt: now, updatedAt: now, "dialUnknown.resolved": resolved, "dialUnknown.checkedAt": now, failure: { code: resolved === "none" ? "provider_error" : "dial_unconfirmed", message } } });
    if (r.modifiedCount === 1) gaveUp++;
  };
  let client: AgentClient | null | undefined;
  for (const c of pending) {
    out.checked++;
    const age = now.getTime() - c.dialUnknown!.at.getTime();
    const conf = await import("@/lib/products/agentos/calls/conference");
    let verdict: "linked" | "none" | "unknown" = "unknown";
    if (await (await import("@/lib/products/agentos/calls/conference-state")).getConference(c._id)) {
      verdict = await conf.resolveUnknownConferenceDial(c, deps.conference);
    } else {
      client ??= await (deps.client ?? workspaceAgentClient)();
      verdict = client ? await findDirectConversation(client, c, deps, now) : "unknown";
    }
    await calls.updateOne({ _id: c._id, "dialUnknown.resolved": null }, { $set: { "dialUnknown.checkedAt": now } });
    if (verdict === "linked") {
      await calls.updateOne({ _id: c._id, "dialUnknown.resolved": null }, { $set: { "dialUnknown.resolved": "linked", updatedAt: now } });
    } else if (verdict === "none" && age >= STUCK_DIAL_MS) {
      await settleTo(c, "none", "The call was not placed: the provider was checked and has no record of it. You can try again.");
    } else if (age >= UNKNOWN_GIVE_UP_MS) {
      await settleTo(c, "unconfirmed", "It could not be confirmed whether this call reached the phone. Check with the person before calling again.");
    }
  }
  return gaveUp;
}

/** Looks for the conversation an unknown ElevenLabs dial created. "linked" only for an exact number-and-time match; "none" only when every candidate was ruled out. */
async function findDirectConversation(client: AgentClient, c: CallDoc, deps: EngineDeps, now: Date): Promise<"linked" | "none" | "unknown"> {
  if (!c.elevenAgentId || !c.phone || !c.dialedAt) return "unknown";
  try {
    const calls = await callsCollection();
    const from = c.dialedAt.getTime() - 60_000;
    const to = c.dialedAt.getTime() + STUCK_DIAL_MS + 60_000;
    const recent = (await client.listConversations(c.elevenAgentId, { pageSize: 50 })).items;
    const claimed = new Set((await calls.find({ conversationId: { $in: recent.map((r) => r.conversationId) } }, { projection: { conversationId: 1 } }).toArray()).map((x) => x.conversationId));
    const inWindow = recent.filter((r) => r.conversationId && !claimed.has(r.conversationId) && (!r.startedAt || (new Date(r.startedAt).getTime() >= from && new Date(r.startedAt).getTime() <= to)));
    let unverifiable = false;
    for (const r of inWindow.slice(0, 8)) {
      const d = await client.getConversation(r.conversationId);
      if (!d.phoneCall?.externalNumber) { unverifiable = true; continue; }
      if (normalizeE164(d.phoneCall.externalNumber) !== c.phone || (d.phoneCall.direction && d.phoneCall.direction !== "outbound")) continue;
      if (d.agentId !== c.elevenAgentId) continue;
      const linked = await calls.updateOne({ _id: c._id, status: "dialing", conversationId: null }, { $set: { conversationId: d.conversationId, updatedAt: now } }).catch(() => null);
      if (linked?.modifiedCount !== 1) return "unknown";
      await applyConversationUpdate({ conversationId: d.conversationId, agentId: d.agentId, detail: d }, deps);
      return "linked";
    }
    return unverifiable || inWindow.length > 8 ? "unknown" : "none";
  } catch {
    return "unknown";
  }
}

/** The scheduled job's body for one company. */
export async function runCallsSweep(deps: EngineDeps = {}) {
  const due = await dialDueCalls(deps);
  const rec = await reconcileOpenCalls(deps);
  const conf = await (await import("@/lib/products/agentos/calls/conference")).sweepConferenceCalls(deps.conference).catch((e) => {
    console.error("[agentos calls] conference sweep failed", errText(e));
    return { finalised: 0, ended: 0 };
  });
  const pub = await import("@/lib/products/agentos/calls/public").then((m) => m.reconcilePublicSessions()).catch((e) => {
    console.error("[agentos calls] public session reconcile failed", errText(e));
    return { settled: 0, linked: 0, abandoned: 0 };
  });
  const inbound = await import("@/lib/products/agentos/calls/public-inbound").then((m) => m.reconcileInboundCalls(deps)).catch((e) => {
    console.error("[agentos calls] inbound reconcile failed", errText(e));
    return { checked: 0, recorded: 0 };
  });
  return { ...due, ...rec, conferenceFinalised: conf.finalised, conferenceEnded: conf.ended, publicSettled: pub.settled, inboundRecorded: inbound.recorded };
}
