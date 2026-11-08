import "server-only";
import { randomBytes } from "node:crypto";
import type { Filter } from "mongodb";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { openingOverride } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { BRIEFING_VARIABLE, usesBriefing } from "@/lib/products/agentos/calls/purposes";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { recordAudit, recordAuditThrottled } from "@/lib/products/agentos/audit";
import { cleanContextValue } from "@/lib/products/agentos/calls/context";
import {
  acceptRegisteredTwiml, announcementTwiml, buildAccessToken, createTwilioRest, hangupTwiml, holdSilenceTwiml, humanConferenceTwiml, leadConferenceTwiml, refuseTwiml,
  signatureUrlCandidates, TwilioError, verifyTwilioSignature, type TwilioRest,
} from "@/lib/products/agentos/calls/conference-twilio";
import {
  appOrigin, companyForTwilioToken, conferenceCreds, JOIN_TOKEN_TTL_SECS, signJoinToken, signLeg, STATUS_PATH, TRANSCRIPTION_PATH, twilioAccountCreds,
  twilioToken, verifyJoinToken, verifyLeg, VOICE_PATH, humanIdentity, type ConferenceCreds,
} from "@/lib/products/agentos/calls/conference-setup";
import { conferenceCollection, firstTime, getConference, LIVE_CALL_STATUSES, type ConferenceDoc } from "@/lib/products/agentos/calls/conference-state";
import { parseTranscriptionCallback, recordTwilioLine, twilioOnlyTranscript } from "@/lib/products/agentos/calls/conference-transcript";
import { settleCall, type EngineDeps } from "@/lib/products/agentos/calls/engine";
import { recordCallEvent, sendCommand, type LiveDeps } from "@/lib/products/agentos/calls/live";
import { resolveCallMode } from "@/lib/products/agentos/calls/conference-setup";
import { callsCollection } from "@/lib/products/agentos/calls/store";
import type { CallDoc, CallFailure } from "@/lib/products/agentos/calls/types";
import { ForbiddenError, NotFoundError, can, viewerForUserId, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { getCallSettings } from "@/lib/products/agentos/calls/settings";
import { announcementText, noticeLanguage, RECORDING_NOTICE, type AnnouncementKind } from "@/lib/products/agentos/calls/notices";
import { maskPhonesInText } from "@/lib/products/agentos/calls/phone";

/**
 * Conference calls: the lead, the AI and (when someone joins) a team member are separate Twilio call legs in one conference named per call.
 *
 *   dial          Twilio dials the lead; when they pick up they are placed in the conference (TwiML from our voice route).
 *   AI joins      on the lead's "participant-join" we add a TwiML-App participant (`To=app:AP…`); our voice route answers that leg by asking
 *                 ElevenLabs' register-call for the TwiML that streams the call to the agent (per-call dynamic variables go in that request).
 *   listen        the browser (Twilio Voice SDK) joins muted. The AI keeps talking to the lead.
 *   take over     the AI leg is put on hold (it hears silence and nobody hears it) and the browser leg is unmuted.
 *   hand back     the browser leg is muted again and the AI leg is released from hold. Repeatable, either direction.
 *
 * Who is in control lives on the call row (`control`), changed with atomic claims; the phone legs are then brought in line with it. Whenever a
 * leg joins, the desired state is applied again, so a late or replayed callback cannot leave the legs wrong.
 *
 * Limits that are not engineering choices:
 *   - the AI hears nothing while held, so after a hand-back it does not know what the team member said; it carries on with the lead's next words.
 *   - a note typed to the AI needs ElevenLabs' (Enterprise) monitor socket AND a conversation id; register-call returns none while the call is
 *     live, so notes are normally refused with a plain reason.
 *   - if the agent is set to end the call after silence, a long take-over can make the AI leave; we notice, and hand-back is then refused.
 */

export interface ConferenceDeps {
  /** Full softphone credentials (default: the saved Twilio connection). */
  creds?: () => Promise<ConferenceCreds | null>;
  account?: () => Promise<{ accountSid: string; authToken: string } | null>;
  fetch?: typeof fetch;
  elevenKey?: () => Promise<string | null>;
  elevenBase?: string;
  origin?: () => Promise<string>;
  ready?: () => Promise<boolean>;
  now?: () => Date;
  live?: LiveDeps;
  /** The current rights of a user id (default: read from the account). A callback uses this to re-check what the person may do now. */
  viewerFor?: (userId: string) => Promise<AibotsViewer | null>;
  /** Settings for the notices (default: the company's call settings). */
  recordingNotice?: () => Promise<boolean>;
}
const nowOf = (d?: ConferenceDeps) => (d?.now ?? (() => new Date()))();

export type Failed = { ok: false; failure: CallFailure };
const fail = (code: CallFailure["code"], message: string): Failed => ({ ok: false, failure: { code, message } });

export async function shouldUseConference(deps?: ConferenceDeps): Promise<boolean> {
  return deps?.ready ? deps.ready() : (await resolveCallMode()) === "conference";
}

const accountOf = (d?: ConferenceDeps) => (d?.account ?? twilioAccountCreds)();
const restFor = (acct: { accountSid: string; authToken: string }, d?: ConferenceDeps): TwilioRest => createTwilioRest(acct, d?.fetch);
const originOf = (d?: ConferenceDeps) => (d?.origin ?? appOrigin)();

/** BCP-47 code for Twilio's transcription from the agent's language and the number called. */
export function transcriptionLanguageFor(agentLanguage: string, toNumber: string | null): string {
  const l = (agentLanguage || "").toLowerCase().split("-")[0];
  if (l === "hi") return "hi-IN";
  if (l === "en") return toNumber?.startsWith("+91") ? "en-IN" : "en-US";
  return "multi";
}

async function urls(callId: string, deps?: ConferenceDeps) {
  const [origin, t] = await Promise.all([originOf(deps), twilioToken()]);
  const q = (path: string, extra: Record<string, string>) => `${origin}${path}?${new URLSearchParams({ t, ...extra }).toString()}`;
  return {
    voice: async (leg: "lead" | "ai" | "hold" | "say_joined" | "say_took_over") => q(VOICE_PATH, await signLeg(leg, callId)),
    voiceParams: (leg: "ai") => signLeg(leg, callId),
    status: q(STATUS_PATH, { c: callId }),
    transcription: q(TRANSCRIPTION_PATH, { c: callId }),
  };
}

// ---------------------------------------------------------------------------
// Dialing
// ---------------------------------------------------------------------------

export interface DialContext {
  fromNumber: string;
  toNumber: string;
  elevenAgentId: string;
  language: string;
  /** What the AI says first (disclosure + greeting) when the agent allows overriding it; null = the agent's own greeting. */
  opening?: string | null;
  /** The call briefing text for the AI leg's dynamic variable (see briefing.ts). Held on the conference row only until the AI leg registers. */
  briefing?: string;
}

/** Called by the engine for a call it already claimed and guard-checked. Creates the conference record and dials the lead. */
export async function dialConference(call: CallDoc, ctx: DialContext, deps?: ConferenceDeps): Promise<CallFailure | null> {
  const acct = await accountOf(deps);
  if (!acct) return { code: "not_connected", message: "Your own Twilio account isn't connected. Add it in Settings → Integrations → Twilio." };
  const now = nowOf(deps);
  const col = await conferenceCollection();
  const conf: ConferenceDoc = {
    _id: call._id, name: `sr-${randomBytes(18).toString("base64url")}`, conferenceSid: null, leadSid: null, aiSid: null, humanSid: null, humanUserId: null,
    leadState: "dialing", aiState: "none", humanState: "none", aiRegisteredAt: null, elevenAgentId: ctx.elevenAgentId, fromNumber: ctx.fromNumber,
    transcriptionLanguage: transcriptionLanguageFor(ctx.language, ctx.toNumber), opening: ctx.opening ?? null, ...(ctx.briefing ? { briefing: ctx.briefing } : {}), answeredAt: null, aiJoinedAt: null, leadEndedAt: null, endedAt: null,
    twilioDurationSecs: null, unattendedSince: null, seen: [], createdAt: now, updatedAt: now,
  };
  await col.updateOne({ _id: call._id }, { $setOnInsert: conf }, { upsert: true });
  try {
    const u = await urls(call._id, deps);
    const r = await restFor(acct, deps).createCall({ to: ctx.toNumber, from: ctx.fromNumber, url: await u.voice("lead"), statusCallback: u.status, timeoutSecs: 45 });
    await col.updateOne({ _id: call._id }, { $set: { leadSid: r.sid, updatedAt: now } });
    await (await callsCollection()).updateOne({ _id: call._id }, { $set: { callSid: r.sid } });
    return null;
  } catch (e) {
    if (!(e instanceof TwilioError) || e.outcomeUnknown) {
      // Twilio may have started the call although no answer came back: keep the conference record (the lead's leg will claim it when it
      // answers), mark the call unknown and let the sweep ask Twilio. Never redial.
      await (await callsCollection()).updateOne({ _id: call._id, status: "dialing", conversationId: null }, { $set: { dialUnknown: { at: now, checkedAt: null, resolved: null }, updatedAt: now } });
      await recordAudit({ actorId: call.initiatedBy?.userId ?? "system", actorEmail: call.initiatedBy?.email ?? null, action: "update", entity: "call", entityId: call._id, botId: call.agentId, summary: "Call outcome unknown: Twilio did not answer in time. It will be checked, not redialed." });
      return { code: "dial_unconfirmed", message: "Twilio didn't answer in time, so it isn't known whether the phone is ringing. The call was not redialed; its status will be updated once it has been checked." };
    }
    await col.deleteOne({ _id: call._id, leadSid: null });
    return { code: "provider_error", message: e.message };
  }
}

/**
 * Looks for the Twilio call an unknown dial may have created (same numbers, started since the attempt). "linked": found and attached;
 * "none": Twilio was asked and has none; "unknown": couldn't ask. Never places a call.
 */
export async function resolveUnknownConferenceDial(call: CallDoc, deps?: ConferenceDeps): Promise<"linked" | "none" | "unknown"> {
  const conf = await getConference(call._id);
  const acct = await accountOf(deps);
  if (!conf || !acct || !call.phone) return "unknown";
  try {
    const since = new Date((call.dialUnknown?.at ?? call.createdAt).getTime() - 5 * 60_000);
    const found = (await restFor(acct, deps).findCalls({ to: call.phone, from: conf.fromNumber, since })).filter((c) => !c.startedAt || c.startedAt.getTime() >= since.getTime());
    if (!found.length) return "none";
    const sid = found[0].sid;
    await (await conferenceCollection()).updateOne({ _id: call._id, leadSid: null }, { $set: { leadSid: sid, updatedAt: nowOf(deps) } });
    await (await callsCollection()).updateOne({ _id: call._id }, { $set: { callSid: sid } });
    return "linked";
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Requests from Twilio
// ---------------------------------------------------------------------------

export interface TwilioRequest {
  rawBody: string;
  pathAndQuery: string;
  token: string | null;
  signature: string | null;
  forwardedProto: string | null;
  forwardedHost: string | null;
  host: string | null;
}
export interface TwilioResponse {
  status: 200 | 400 | 403 | 413 | 500;
  body: string;
  contentType: "text/xml" | "application/json";
}
export const MAX_TWILIO_BODY = 64 * 1024;
const FORBIDDEN: TwilioResponse = { status: 403, body: "Forbidden", contentType: "application/json" };
const xml = (body: string): TwilioResponse => ({ status: 200, body, contentType: "text/xml" });
const ok = (): TwilioResponse => ({ status: 200, body: "{}", contentType: "application/json" });

interface Authed {
  companyId: string;
  acct: { accountSid: string; authToken: string };
  params: URLSearchParams;
  query: URLSearchParams;
}

/** Token -> company, then the company's own auth token must have signed the request. Same answer whatever went wrong. */
async function withAuthedRequest(req: TwilioRequest, deps: ConferenceDeps | undefined, fn: (a: Authed) => Promise<TwilioResponse>): Promise<TwilioResponse> {
  if (req.rawBody.length > MAX_TWILIO_BODY) return { status: 413, body: "Too large", contentType: "application/json" };
  const companyId = await companyForTwilioToken(req.token);
  if (!companyId || !req.signature) return FORBIDDEN;
  try {
    return await runAsCompany(companyId, async () => {
      const acct = await accountOf(deps);
      if (!acct) return FORBIDDEN;
      const params = new URLSearchParams(req.rawBody);
      const candidates = signatureUrlCandidates({ pathAndQuery: req.pathAndQuery, forwardedProto: req.forwardedProto, forwardedHost: req.forwardedHost, host: req.host, appOrigin: await originOf(deps).catch(() => null) });
      if (!verifyTwilioSignature(acct.authToken, req.signature, candidates, params)) return FORBIDDEN;
      return fn({ companyId, acct, params, query: new URL(`http://x${req.pathAndQuery}`).searchParams });
    });
  } catch (e) {
    console.error("[agentos twilio] request failed", maskPhonesInText(e instanceof Error ? e.message : String(e)));
    return { status: 500, body: "Error", contentType: "application/json" };
  }
}

/** A browser leg that was handed out but never joined the conference blocks other team members for this long, then the leg is free again. */
export const PENDING_LEG_MS = 60 * 1000;
const CALL_SID = /^CA[0-9a-f]{32}$/i;
const callLive = (c: CallDoc | null, conf: ConferenceDoc | null): c is CallDoc => Boolean(c && conf && (LIVE_CALL_STATUSES as readonly string[]).includes(c.status) && !conf.endedAt && !conf.leadEndedAt);

/** The voice URL: the lead's leg, the AI's leg, a hold, and the team member's browser leg all arrive here and are told apart by signed parameters. */
export async function handleTwilioVoice(req: TwilioRequest, deps?: ConferenceDeps): Promise<TwilioResponse> {
  return withAuthedRequest(req, deps, async ({ params, query }) => {
    const get = (k: string) => params.get(k) ?? query.get(k);
    const callSid = params.get("CallSid") ?? "";
    const cols = { calls: await callsCollection(), conf: await conferenceCollection() };
    const legInfo = await verifyLeg({ leg: get("leg"), c: get("c"), e: get("e"), s: get("s") });
    const now = nowOf(deps);

    if (legInfo) {
      const conf = await cols.conf.findOne({ _id: legInfo.callId });
      const call = await cols.calls.findOne({ _id: legInfo.callId });
      if (legInfo.leg === "hold") return xml(holdSilenceTwiml());
      if ((legInfo.leg === "say_joined" || legInfo.leg === "say_took_over") && conf) {
        const kind: AnnouncementKind = legInfo.leg === "say_joined" ? "joined" : "took_over";
        return xml(announcementTwiml(announcementText(kind, noticeLanguage(conf.transcriptionLanguage)), conf.transcriptionLanguage));
      }
      if (!conf || !callLive(call, conf) || !CALL_SID.test(callSid)) return xml(hangupTwiml());
      const u = await urls(call._id, deps);
      if (legInfo.leg === "lead") {
        const claim = await cols.conf.updateOne({ _id: conf._id, $or: [{ leadSid: null }, { leadSid: callSid }] }, { $set: { leadSid: callSid, updatedAt: now } });
        if (claim.matchedCount !== 1) return xml(hangupTwiml());
        // The recording notice is spoken to the lead before they are joined to the AI (when the company's setting is on).
        const notice = (await (deps?.recordingNotice ?? (async () => (await getCallSettings()).recordingNotice))()) ? { text: RECORDING_NOTICE[noticeLanguage(conf.transcriptionLanguage)], languageCode: conf.transcriptionLanguage } : null;
        return xml(leadConferenceTwiml({ name: conf.name, statusUrl: u.status, transcription: { callbackUrl: u.transcription, languageCode: conf.transcriptionLanguage }, notice }));
      }
      // The AI's leg: ask ElevenLabs for the TwiML that connects it to the agent. Once per leg.
      // The briefing text is dropped from the row in the same step that hands it to the AI leg (and again when the conference ends).
      const claim = await cols.conf.updateOne({ _id: conf._id, aiRegisteredAt: null, $or: [{ aiSid: null }, { aiSid: callSid }] }, { $set: { aiRegisteredAt: now, aiSid: callSid, updatedAt: now }, $unset: { briefing: "" } });
      if (claim.matchedCount !== 1) return xml(hangupTwiml());
      const twiml = await registerAiLeg(call, conf, deps);
      if (!twiml) {
        await cols.conf.updateOne({ _id: conf._id }, { $set: { aiState: "failed", updatedAt: now, ...(conf.humanState === "joined" ? {} : { unattendedSince: now }) } });
        await recordCallEvent(call._id, { type: "status", text: "The AI couldn't join the call (ElevenLabs didn't accept it). A team member can still take the call." });
        return xml(hangupTwiml());
      }
      return xml(twiml);
    }

    // A team member's browser (Voice SDK): proves itself with the short-lived join token the server issued to them. The token names the person AND
    // the call, so it cannot be used for another call or by another person; what the person may do is checked again NOW, not when the token was issued.
    const jt = await verifyJoinToken(get("joinToken"));
    if (!jt || !CALL_SID.test(callSid) || params.get("From") !== `client:${jt.identity}` || jt.identity !== humanIdentity(jt.userId, jt.callId)) return xml(refuseTwiml("This call is not available."));
    const askedFor = get("callId");
    if (askedFor && askedFor !== jt.callId) return xml(refuseTwiml("This call is not available."));
    const conf = await cols.conf.findOne({ _id: jt.callId });
    const call = await cols.calls.findOne({ _id: jt.callId });
    if (!conf || !callLive(call, conf)) return xml(refuseTwiml("This call has ended."));
    const person = await (deps?.viewerFor ?? viewerForUserId)(jt.userId);
    if (!person || person.userId !== jt.userId || !(call.initiatedBy?.userId === person.userId || can(person, "VOICE_CALL_TAKEOVER"))) return xml(refuseTwiml("You are not allowed to join this call."));
    // Someone else is in control of the call: nobody else may take the leg.
    if (call.control.mode === "human" && call.control.handler && call.control.handler !== jt.userId) return xml(refuseTwiml("Another team member is already on this call."));
    const previous = conf.humanSid && conf.humanSid !== callSid && conf.humanUserId === jt.userId ? conf.humanSid : null;
    // One atomic claim: the leg is free, is this person's own (a reload), or its holder already left or never joined within a minute. Anything else is refused and nothing is overwritten.
    const claim = await cols.conf.updateOne(
      { _id: conf._id, $or: [{ humanUserId: null }, { humanUserId: jt.userId }, { humanState: "left" }, { humanState: "none", updatedAt: { $lte: new Date(now.getTime() - PENDING_LEG_MS) } }] },
      { $set: { humanSid: callSid, humanUserId: jt.userId, unattendedSince: null, updatedAt: now } }
    );
    if (claim.matchedCount !== 1) return xml(refuseTwiml("Another team member is already on this call."));
    if (previous && conf.conferenceSid) {
      const acct = await accountOf(deps);
      if (acct) await restFor(acct, deps).removeParticipant(conf.conferenceSid, previous).catch(() => {}); // a reload replaces the old leg
    }
    return xml(humanConferenceTwiml({ name: conf.name, statusUrl: (await urls(call._id, deps)).status }));
  });
}

/** ElevenLabs register-call: TwiML that streams this Twilio leg to the agent. Dynamic variables are the call's sanitised context. */
async function registerAiLeg(call: CallDoc, conf: ConferenceDoc, deps?: ConferenceDeps): Promise<string | null> {
  const key = await (deps?.elevenKey ?? (async () => (await connectionValues("elevenlabs"))?.apiKey ?? null))();
  if (!key || !call.phone) return null;
  try {
    const res = await (deps?.fetch ?? fetch)(`${deps?.elevenBase ?? "https://api.elevenlabs.io/v1"}/convai/twilio/register-call`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ agent_id: conf.elevenAgentId, from_number: conf.fromNumber, to_number: call.phone, direction: "outbound", conversation_initiation_client_data: openingOverride(conf.briefing ? { ...call.context, [BRIEFING_VARIABLE]: conf.briefing } : usesBriefing([call.purpose]) ? { ...call.context, [BRIEFING_VARIABLE]: "" } : call.context, conf.opening) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    let raw: unknown = text;
    try { raw = JSON.parse(text); } catch { /* plain TwiML */ }
    return acceptRegisteredTwiml(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Status callbacks (conference events and call status)
// ---------------------------------------------------------------------------

const roleOf = (c: ConferenceDoc, sid: string): "lead" | "ai" | "human" | null => (sid === c.leadSid ? "lead" : sid === c.aiSid ? "ai" : sid === c.humanSid ? "human" : null);

export async function handleTwilioStatus(req: TwilioRequest, deps?: ConferenceDeps): Promise<TwilioResponse> {
  return withAuthedRequest(req, deps, async ({ params, query, acct }) => {
    const callId = query.get("c") ?? "";
    if (!callId || callId.length > 64) return ok();
    const conf = await getConference(callId);
    const sid = params.get("CallSid") ?? "";
    if (!conf || (sid && !CALL_SID.test(sid))) return ok();
    const rest = restFor(acct, deps);
    const event = params.get("StatusCallbackEvent");
    if (event) {
      if (params.get("FriendlyName") !== conf.name) return ok(); // someone else's conference
      const key = `c:${event}:${sid}:${params.get("SequenceNumber") ?? params.get("Timestamp") ?? ""}`;
      if (!(await firstTime(callId, key))) return ok();
      await onConferenceEvent(conf, event, sid, params.get("ConferenceSid"), rest, deps);
    } else if (params.get("CallStatus")) {
      const status = params.get("CallStatus")!;
      if (!(await firstTime(callId, `s:${sid}:${status}`))) return ok();
      await onCallStatus(conf, sid, status, params.get("CallDuration"), deps);
    }
    return ok();
  });
}

const OPEN: Filter<ConferenceDoc> = {};
void OPEN;

async function onConferenceEvent(conf: ConferenceDoc, event: string, sid: string, confSid: string | null, rest: TwilioRest, deps?: ConferenceDeps): Promise<void> {
  const col = await conferenceCollection();
  const calls = await callsCollection();
  const now = nowOf(deps);
  if (confSid && /^CF[0-9a-f]{32}$/i.test(confSid) && !conf.conferenceSid) {
    await col.updateOne({ _id: conf._id, conferenceSid: null }, { $set: { conferenceSid: confSid } });
    conf.conferenceSid = confSid;
  }
  if (event === "conference-end") {
    await col.updateOne({ _id: conf._id }, { $set: { endedAt: now, leadEndedAt: conf.leadEndedAt ?? now, updatedAt: now }, $unset: { briefing: "" } });
    return;
  }
  const role = roleOf(conf, sid);
  if (!role) return;
  if (event === "participant-join") {
    if (role === "lead") {
      await col.updateOne({ _id: conf._id }, { $set: { leadState: "joined", answeredAt: conf.answeredAt ?? now, updatedAt: now } });
      await calls.updateOne({ _id: conf._id, status: "dialing" }, { $set: { status: "in_progress", updatedAt: now } });
      await recordCallEvent(conf._id, { type: "status", text: "The lead picked up." });
      await addAiLeg(conf, rest, deps);
    } else if (role === "ai") {
      await col.updateOne({ _id: conf._id }, { $set: { aiState: "joined", aiJoinedAt: conf.aiJoinedAt ?? now, updatedAt: now } });
      await recordCallEvent(conf._id, { type: "status", text: "The AI joined the call." });
      await enforceDesired(conf._id, rest, deps).catch(() => {});
    } else {
      await col.updateOne({ _id: conf._id }, { $set: { humanState: "joined", unattendedSince: null, updatedAt: now } });
      await recordCallEvent(conf._id, { type: "status", text: "A team member is listening.", by: conf.humanUserId });
      await enforceDesired(conf._id, rest, deps).catch(() => {});
      await announceToLead(conf, "joined", `joined:${conf.humanUserId ?? sid}`, rest, deps);
    }
    return;
  }
  if (event === "participant-leave") {
    if (role === "lead") {
      await col.updateOne({ _id: conf._id }, { $set: { leadState: "left", leadEndedAt: conf.leadEndedAt ?? now, updatedAt: now } });
      await recordCallEvent(conf._id, { type: "status", text: "The lead hung up." });
    } else if (role === "ai") {
      await col.updateOne({ _id: conf._id }, { $set: { aiState: "left", updatedAt: now, ...(conf.humanState === "joined" ? {} : { unattendedSince: now }) } });
      await calls.updateOne({ _id: conf._id, "control.mode": "human" }, { $set: { "control.canHandBack": false } });
      await recordCallEvent(conf._id, { type: "status", text: "The AI left the call." });
    } else {
      await col.updateOne({ _id: conf._id }, { $set: { humanState: "left", updatedAt: now, ...(conf.aiState === "joined" || conf.aiState === "adding" ? {} : { unattendedSince: now }) } });
      await recordCallEvent(conf._id, { type: "status", text: "The team member left the call.", by: conf.humanUserId });
      const call = await calls.findOne({ _id: conf._id });
      // A person who drops out must not leave the AI on hold for ever: control goes back to the AI by itself.
      if (call && call.control.mode === "human" && call.control.handler === conf.humanUserId && sid === conf.humanSid) await releaseControl(call, "system", rest, deps);
    }
  }
}

async function onCallStatus(conf: ConferenceDoc, sid: string, status: string, duration: string | null, deps?: ConferenceDeps): Promise<void> {
  const col = await conferenceCollection();
  const calls = await callsCollection();
  const now = nowOf(deps);
  const role = roleOf(conf, sid);
  const down = ["busy", "no-answer", "failed", "canceled"].includes(status);
  if (role === "lead") {
    if (status === "in-progress") {
      await col.updateOne({ _id: conf._id }, { $set: { answeredAt: conf.answeredAt ?? now, updatedAt: now } });
      await calls.updateOne({ _id: conf._id, status: "dialing" }, { $set: { status: "in_progress", updatedAt: now } });
    } else if (down && !conf.answeredAt) {
      await col.updateOne({ _id: conf._id }, { $set: { leadState: "failed", leadEndedAt: now, endedAt: now, updatedAt: now }, $unset: { briefing: "" } });
      const map = { busy: ["busy", "The line was busy."], "no-answer": ["no_answer", "Nobody answered."], failed: ["failed", "The call couldn't be connected."], canceled: ["failed", "The call was cancelled before anyone answered."] } as const;
      const [st, message] = map[status as keyof typeof map];
      await settleCall(conf._id, { status: st, failure: { code: "provider_error", message } }, deps);
    } else if (status === "completed" || down) {
      const secs = duration && /^\d{1,7}$/.test(duration) ? Number(duration) : null;
      await col.updateOne({ _id: conf._id }, { $set: { leadState: "left", leadEndedAt: conf.leadEndedAt ?? now, twilioDurationSecs: secs, updatedAt: now } });
    }
  } else if (role === "ai" && (down || status === "completed") && conf.aiState !== "left" && conf.aiState !== "failed") {
    await col.updateOne({ _id: conf._id }, { $set: { aiState: down ? "failed" : "left", updatedAt: now, ...(conf.humanState === "joined" ? {} : { unattendedSince: now }) } });
    await calls.updateOne({ _id: conf._id, "control.mode": "human" }, { $set: { "control.canHandBack": false } });
    if (down) await recordCallEvent(conf._id, { type: "status", text: "The AI couldn't join the call." });
  }
}

/**
 * Tells the lead (only the lead) that a team member has joined or taken over, so nobody is listening without the lead knowing. Played through
 * the lead participant's announce URL, once per `key` (a reload or a replayed callback does not repeat it). Never throws.
 */
async function announceToLead(conf: ConferenceDoc, kind: AnnouncementKind, key: string, rest: TwilioRest, deps?: ConferenceDeps): Promise<void> {
  try {
    const fresh = (await getConference(conf._id)) ?? conf;
    if (!fresh.conferenceSid || !fresh.leadSid || fresh.leadState !== "joined" || fresh.leadEndedAt || fresh.endedAt) return;
    if (!(await firstTime(conf._id, `announce:${key}`))) return;
    const announceUrl = await (await urls(conf._id, deps)).voice(kind === "joined" ? "say_joined" : "say_took_over");
    await rest.updateParticipant(fresh.conferenceSid, fresh.leadSid, { announceUrl });
    await recordCallEvent(conf._id, { type: "status", text: kind === "joined" ? "The lead was told that a team member joined the call." : "The lead was told that a team member took over the call." });
  } catch (e) {
    console.error("[agentos twilio] couldn't announce to the lead", maskPhonesInText(e instanceof Error ? e.message : String(e)));
  }
}

/**
 * Asks Twilio about ONE conference call's lead leg right now and applies what it says if the call is over (the same step the sweep does
 * for quiet calls, on demand: when someone opens the call dialog, a duplicate is found or an Active-calls list is shown).
 * Returns true when Twilio said the call is over and it was applied. Never throws.
 */
export async function reconcileConferenceNow(callId: string, deps?: ConferenceDeps): Promise<boolean> {
  try {
    const conf = await getConference(callId);
    const acct = await accountOf(deps);
    if (!conf?.leadSid || !acct || conf.endedAt) return false;
    const t = await restFor(acct, deps).getCall(conf.leadSid);
    if (!["completed", "busy", "no-answer", "failed", "canceled"].includes(t.status)) return false;
    await onCallStatus(conf, conf.leadSid, t.status, t.duration === null ? null : String(t.duration), deps);
    // The lead's leg is over: settle now rather than waiting for the quiet-call sweep (ElevenLabs' later result only adds detail).
    const [call, fresh] = await Promise.all([(await callsCollection()).findOne({ _id: callId }), getConference(callId)]);
    if (call && fresh && (LIVE_CALL_STATUSES as readonly string[]).includes(call.status) && fresh.leadEndedAt) {
      await settleCall(callId, { status: fresh.answeredAt ? "completed" : "no_answer", durationSecs: fresh.twilioDurationSecs, transcript: await twilioOnlyTranscript(call) }, deps);
    }
    return true;
  } catch {
    return false;
  }
}

/** Adds the AI leg once the lead is in the conference. The claim makes a replayed "join" harmless. */
async function addAiLeg(conf: ConferenceDoc, rest: TwilioRest, deps?: ConferenceDeps): Promise<void> {
  const col = await conferenceCollection();
  if (!conf.conferenceSid) return;
  const claim = await col.updateOne({ _id: conf._id, aiState: "none" }, { $set: { aiState: "adding", updatedAt: nowOf(deps) } });
  if (claim.modifiedCount !== 1) return;
  const creds = await (deps?.creds ?? conferenceCreds)();
  try {
    if (!creds) throw new TwilioError("The TwiML App isn't set up.");
    const u = await urls(conf._id, deps);
    const r = await rest.addAppParticipant({ conferenceSid: conf.conferenceSid, appSid: creds.twimlAppSid, params: await u.voiceParams("ai"), from: conf.fromNumber, statusCallback: u.status, label: "ai" });
    await col.updateOne({ _id: conf._id, aiSid: null }, { $set: { aiSid: r.callSid, updatedAt: nowOf(deps) } });
  } catch (e) {
    const now = nowOf(deps);
    await col.updateOne({ _id: conf._id }, { $set: { aiState: "failed", updatedAt: now, ...(conf.humanState === "joined" ? {} : { unattendedSince: now }) } });
    await recordCallEvent(conf._id, { type: "status", text: `The AI couldn't join the call${e instanceof TwilioError ? `: ${e.message}` : "."}` });
  }
}

export async function handleTwilioTranscription(req: TwilioRequest, deps?: ConferenceDeps): Promise<TwilioResponse> {
  return withAuthedRequest(req, deps, async ({ params, query }) => {
    const callId = query.get("c") ?? "";
    const line = parseTranscriptionCallback(params);
    if (!line || !callId || callId.length > 64) return ok();
    const [conf, call] = await Promise.all([getConference(callId), (await callsCollection()).findOne({ _id: callId })]);
    if (!conf || !call || line.callSid !== conf.leadSid) return ok(); // only the lead's leg is transcribed
    await recordTwilioLine(call, line);
    return ok();
  });
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

/** Brings the phone legs in line with `control.mode`: the team member unmuted and the AI held while a person is in control, the reverse otherwise. */
async function enforceDesired(callId: string, rest: TwilioRest, deps?: ConferenceDeps, order: "ai-first" | "human-first" = "ai-first"): Promise<void> {
  const [call, conf] = await Promise.all([(await callsCollection()).findOne({ _id: callId }), getConference(callId)]);
  if (!call || !conf?.conferenceSid) return;
  const human = call.control.mode === "human";
  const holdUrl = await (await urls(callId, deps)).voice("hold");
  const steps: (() => Promise<void>)[] = [];
  const ai = conf.aiState === "joined" && conf.aiSid ? () => rest.updateParticipant(conf.conferenceSid!, conf.aiSid!, { hold: human, holdUrl }) : null;
  const person = conf.humanState === "joined" && conf.humanSid ? () => rest.updateParticipant(conf.conferenceSid!, conf.humanSid!, { muted: !human }) : null;
  const ordered = order === "ai-first" ? [ai, person] : [person, ai];
  for (const s of ordered) if (s) steps.push(s);
  for (const s of steps) await s();
}

async function loadFor(viewer: AibotsViewer, callId: string): Promise<{ call: CallDoc; mine: boolean }> {
  if (typeof callId !== "string" || callId.length > 64) throw new NotFoundError();
  const call = await (await callsCollection()).findOne({ _id: callId });
  if (!call) throw new NotFoundError();
  const mine = call.initiatedBy?.userId === viewer.userId;
  if (!mine && !can(viewer, "VOICE_CALL_MANAGE") && !can(viewer, "VOICE_CALL_TAKEOVER")) throw new NotFoundError();
  return { call, mine };
}
const mayHandle = (viewer: AibotsViewer, mine: boolean) => mine || can(viewer, "VOICE_CALL_TAKEOVER");

const lockFree = (now: Date) => ({ "control.lockUntil": { $not: { $gt: now } } });
const LOCK_MS = 20_000;
const history = (from: "ai" | "human", to: "ai" | "human", by: string, at: Date) => ({ at, from, to, by });

export interface JoinCredentials {
  callId: string;
  accessToken: string;
  joinToken: string;
  identity: string;
  /** Epoch milliseconds. Ask again before then (the console does). */
  expiresAt: number;
}

/** LISTEN: what the browser needs to join the conference muted. Only the person who placed the call or someone with VOICE_CALL_TAKEOVER. */
export async function listenToCall(viewer: AibotsViewer, callId: string, deps?: ConferenceDeps): Promise<({ ok: true } & JoinCredentials) | Failed> {
  const { call, mine } = await loadFor(viewer, callId);
  if (!mayHandle(viewer, mine)) throw new ForbiddenError("VOICE_CALL_TAKEOVER");
  const conf = await getConference(call._id);
  if (!conf) return fail("conference_unavailable", "This call was placed directly by ElevenLabs, so it can't be listened to. Only its transcript is available.");
  if (!callLive(call, conf)) return fail("not_live", "This call isn't live any more.");
  if (conf.humanState === "joined" && conf.humanUserId && conf.humanUserId !== viewer.userId) return fail("control_busy", "Another team member is already on this call.");
  const creds = await (deps?.creds ?? conferenceCreds)();
  if (!creds) return fail("conference_unavailable", "Live listening isn't set up yet: add the Twilio API key and TwiML App, then follow the live-call setup checklist.");
  const joined = await signJoinToken({ callId: call._id, userId: viewer.userId });
  const accessToken = buildAccessToken({ accountSid: creds.accountSid, apiKeySid: creds.apiKeySid, apiKeySecret: creds.apiKeySecret, appSid: creds.twimlAppSid, identity: joined.identity, ttlSecs: JOIN_TOKEN_TTL_SECS });
  await recordAuditThrottled({ actorId: viewer.userId, actorEmail: viewer.email, action: "view", entity: "call", entityId: call._id, botId: call.agentId, summary: "Joined a live call to listen" }, 10 * 60 * 1000);
  return { ok: true, callId: call._id, accessToken, joinToken: joined.token, identity: joined.identity, expiresAt: joined.expiresAt * 1000 };
}

/** TAKE OVER: the AI is put on hold and the listening team member is unmuted. One person at a time; pressing it twice changes nothing. */
export async function takeOverConference(viewer: AibotsViewer, callId: string, deps?: ConferenceDeps): Promise<{ ok: true; unchanged?: boolean } | Failed> {
  const { call, mine } = await loadFor(viewer, callId);
  if (!mayHandle(viewer, mine)) throw new ForbiddenError("VOICE_CALL_TAKEOVER");
  const conf = await getConference(call._id);
  if (!conf) return fail("takeover_unsupported", "This call was placed directly by ElevenLabs. It can't be taken over from here.");
  if (call.control.mode === "human") {
    return call.control.handler === viewer.userId ? { ok: true, unchanged: true } : fail("control_busy", "Someone else has already taken over this call.");
  }
  if (!callLive(call, conf) || conf.leadState !== "joined") return fail("not_live", "This call isn't live any more.");
  if (!(conf.humanState === "joined" && conf.humanUserId === viewer.userId)) return fail("not_joined", "Listen to the call first, then take over.");
  const acct = await accountOf(deps);
  if (!acct) return fail("not_connected", "Your own Twilio account isn't connected.");
  const now = nowOf(deps);
  const calls = await callsCollection();
  const claimed = await calls.findOneAndUpdate(
    { _id: call._id, status: { $in: [...LIVE_CALL_STATUSES] }, "control.mode": "ai", ...lockFree(now) },
    { $set: { "control.mode": "human", "control.handler": viewer.userId, "control.canHandBack": conf.aiState === "joined" || conf.aiState === "adding" || conf.aiState === "none", "control.lockUntil": new Date(now.getTime() + LOCK_MS), updatedAt: now }, $push: { "control.history": history("ai", "human", viewer.userId, now) } },
    { returnDocument: "after" }
  );
  if (!claimed) return fail("control_busy", "A change is already in progress, or someone else has the call. Try again in a moment.");
  const rest = restFor(acct, deps);
  try {
    await enforceDesired(call._id, rest, deps, "ai-first");
  } catch (e) {
    await calls.updateOne({ _id: call._id, "control.handler": viewer.userId, "control.mode": "human" }, { $set: { "control.mode": "ai", "control.handler": null, "control.canHandBack": true, "control.lockUntil": null }, $push: { "control.history": history("human", "ai", "system", nowOf(deps)) } });
    await enforceDesired(call._id, rest, deps, "human-first").catch(() => {});
    return fail("provider_error", e instanceof TwilioError ? e.message : "The take-over didn't go through. You are not in control; try again.");
  }
  await calls.updateOne({ _id: call._id }, { $set: { "control.lockUntil": null } });
  await recordCallEvent(call._id, { type: "control", text: "A team member took over; the AI is on hold.", by: viewer.userId });
  await announceToLead(conf, "took_over", `took_over:${call.control.history.length}`, rest, deps);
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: call._id, botId: call.agentId, summary: "Took over a live call" });
  return { ok: true };
}

/** Gives control back (also used when the team member drops out). The caller has already checked who may. */
async function releaseControl(call: CallDoc, by: string, rest: TwilioRest, deps?: ConferenceDeps): Promise<boolean> {
  const calls = await callsCollection();
  const now = nowOf(deps);
  const claimed = await calls.findOneAndUpdate(
    { _id: call._id, status: { $in: [...LIVE_CALL_STATUSES] }, "control.mode": "human", ...lockFree(now) },
    { $set: { "control.mode": "ai", "control.handler": null, "control.lockUntil": new Date(now.getTime() + LOCK_MS), updatedAt: now }, $push: { "control.history": history("human", "ai", by, now) } },
    { returnDocument: "after" }
  );
  if (!claimed) return false;
  try {
    await enforceDesired(call._id, rest, deps, "human-first");
  } catch (e) {
    // Put the claim back: the legs were not changed, so the truth is still "a person is in control".
    await calls.updateOne({ _id: call._id, "control.mode": "ai" }, { $set: { "control.mode": "human", "control.handler": call.control.handler, "control.lockUntil": null }, $push: { "control.history": history("ai", "human", "system", nowOf(deps)) } });
    throw e;
  }
  await calls.updateOne({ _id: call._id }, { $set: { "control.lockUntil": null } });
  await recordCallEvent(call._id, { type: "control", text: by === "system" ? "The team member dropped out, so the AI has the call again." : "Control went back to the AI.", by: by === "system" ? null : by });
  return true;
}

/** HAND BACK: the AI is released from hold and the team member is muted (and may leave). */
export async function handBackConference(viewer: AibotsViewer, callId: string, deps?: ConferenceDeps): Promise<{ ok: true; unchanged?: boolean } | Failed> {
  const { call, mine } = await loadFor(viewer, callId);
  const conf = await getConference(call._id);
  if (!conf) return fail("handback_unsupported", "This call was placed directly by ElevenLabs.");
  if (call.control.mode !== "human") return { ok: true, unchanged: true };
  if (call.control.handler !== viewer.userId && !can(viewer, "VOICE_CALL_MANAGE") && !can(viewer, "VOICE_CALL_TAKEOVER")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  void mine;
  if (!callLive(call, conf)) return fail("not_live", "This call isn't live any more.");
  if (!call.control.canHandBack || conf.aiState === "left" || conf.aiState === "failed") return fail("handback_unsupported", "The AI is no longer on this call (it left while you were in control), so it can't take over again.");
  const acct = await accountOf(deps);
  if (!acct) return fail("not_connected", "Your own Twilio account isn't connected.");
  try {
    const done = await releaseControl(call, viewer.userId, restFor(acct, deps), deps);
    if (!done) return fail("control_busy", "A change is already in progress. Try again in a moment.");
  } catch (e) {
    return fail("provider_error", e instanceof TwilioError ? e.message : "The hand-back didn't go through. You are still in control; try again.");
  }
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: call._id, botId: call.agentId, summary: "Handed a live call back to the AI" });
  return { ok: true };
}

/** END: closes the conference (everybody drops) and hangs up the lead. Safe to press twice. */
export async function endConferenceCall(viewer: AibotsViewer, callId: string, deps?: ConferenceDeps): Promise<{ ok: true; unchanged?: boolean } | Failed> {
  const { call, mine } = await loadFor(viewer, callId);
  if (!mine && !can(viewer, "VOICE_CALL_TAKEOVER") && !can(viewer, "VOICE_CALL_MANAGE")) throw new NotFoundError();
  const conf = await getConference(call._id);
  if (!conf) return fail("conference_unavailable", "This call was placed directly by ElevenLabs.");
  if (!callLive(call, conf)) return { ok: true, unchanged: true };
  const acct = await accountOf(deps);
  if (!acct) return fail("not_connected", "Your own Twilio account isn't connected.");
  const rest = restFor(acct, deps);
  let done = false;
  if (conf.conferenceSid) done = await rest.endConference(conf.conferenceSid).then(() => true, () => false);
  if (conf.leadSid) done = (await rest.hangUp(conf.leadSid).then(() => true, () => false)) || done;
  if (!done) return fail("provider_error", "The call couldn't be ended from here. Hang up from the phone, or try again.");
  await recordCallEvent(call._id, { type: "control", text: "The call was ended by a team member.", by: viewer.userId, key: "ended-by-user" });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: call._id, botId: call.agentId, summary: "Ended a live call" });
  return { ok: true };
}

const NOTE_MAX = 500;
/**
 * A private note to the AI. ElevenLabs only accepts it through the live monitor (an Enterprise feature) and needs the conversation id, which
 * a conference call only learns when it ends; so this is refused unless both are available. Nothing is pretended: no note is recorded when it
 * could not be delivered.
 */
export async function addConferenceNote(viewer: AibotsViewer, callId: string, text: string, deps?: ConferenceDeps): Promise<{ ok: true } | Failed> {
  const { call, mine } = await loadFor(viewer, callId);
  if (!mayHandle(viewer, mine)) throw new ForbiddenError("VOICE_CALL_TAKEOVER");
  const clean = cleanContextValue(text, NOTE_MAX);
  if (!clean) return fail("monitor_unavailable", "Write the note first.");
  if (call.control.mode !== "ai") return fail("not_live", "A person is in control; the AI is on hold and can't receive notes.");
  if (!call.conversationId) return fail("monitor_unavailable", "A note can't reach the AI during a live conference call: ElevenLabs only takes notes through its live monitor, and it doesn't give this call an id until it ends. Take over instead and speak to the lead yourself.");
  try {
    await sendCommand(call, { command_type: "contextual_update", parameters: { contextual_update: clean } }, deps?.live ?? {});
  } catch (e) {
    return fail("monitor_unavailable", e instanceof Error ? e.message : "The note couldn't be sent.");
  }
  await recordCallEvent(call._id, { type: "note", text: clean, by: viewer.userId });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: call._id, botId: call.agentId, summary: "Sent a note to the AI during a live call" });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sweep (scheduled): lost callbacks, unattended calls, results that never arrived
// ---------------------------------------------------------------------------

export const FINALISE_AFTER_MS = 10 * 60 * 1000;
export const UNATTENDED_GRACE_MS = 90 * 1000;
export const SILENT_CHECK_MS = 5 * 60 * 1000;

export async function sweepConferenceCalls(deps?: ConferenceDeps): Promise<{ finalised: number; ended: number }> {
  const out = { finalised: 0, ended: 0 };
  const col = await conferenceCollection();
  const calls = await callsCollection();
  const now = nowOf(deps);
  const acct = await accountOf(deps);
  const rest = acct ? restFor(acct, deps) : null;

  // 1. Lost callbacks: a call that has been quiet for a while is checked with Twilio.
  if (rest) {
    const quiet = await col.find({ leadSid: { $type: "string" }, leadEndedAt: null, endedAt: null, updatedAt: { $lte: new Date(now.getTime() - SILENT_CHECK_MS) } }).limit(10).toArray();
    for (const c of quiet) {
      const t = await rest.getCall(c.leadSid!).catch(() => null);
      if (t && ["completed", "busy", "no-answer", "failed", "canceled"].includes(t.status)) await onCallStatus(c, c.leadSid!, t.status, t.duration === null ? null : String(t.duration), deps);
    }
  }
  // 2. Nobody is handling the call.
  const lost = await col.find({ unattendedSince: { $lte: new Date(now.getTime() - UNATTENDED_GRACE_MS) }, endedAt: null, leadEndedAt: null }).limit(10).toArray();
  for (const c of lost) {
    if (rest) {
      if (c.conferenceSid) await rest.endConference(c.conferenceSid).catch(() => {});
      if (c.leadSid) await rest.hangUp(c.leadSid).catch(() => {});
    }
    await col.updateOne({ _id: c._id }, { $set: { unattendedSince: null, updatedAt: now } });
    await recordCallEvent(c._id, { type: "status", text: "The call was ended because nobody was handling it (the AI had left and no team member was on).", key: "unattended-ended" });
    out.ended++;
  }
  // 3. Calls that ended but whose ElevenLabs result never came: settle from Twilio's own record.
  const ended = await col.find({ leadEndedAt: { $lte: new Date(now.getTime() - FINALISE_AFTER_MS) } }).limit(25).toArray();
  for (const c of ended) {
    const call = await calls.findOne({ _id: c._id });
    if (!call || !(LIVE_CALL_STATUSES as readonly string[]).includes(call.status)) continue;
    const transcript = await twilioOnlyTranscript(call);
    const settled = await settleCall(call._id, { status: c.answeredAt ? "completed" : "no_answer", durationSecs: c.twilioDurationSecs, transcript }, deps);
    if (settled) out.finalised++;
  }
  return out;
}

export type { EngineDeps };
