import "server-only";
import { logText } from "@/lib/products/agentos/calls/phone";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { botsCollection, type BotDoc } from "@/lib/products/agentos/bots";
import { readBotAvatar } from "@/lib/products/agentos/avatar";
import { avatarUrlFor } from "@/lib/products/agentos/avatar-shared";
import { newId, notDeleted } from "@/lib/products/agentos/db";
import { applyConversationUpdate, type EngineDeps } from "@/lib/products/agentos/calls/engine";
import { getCallSettings, getPublicCallSettings } from "@/lib/products/agentos/calls/settings";
import { callsCollection, isDuplicateKey } from "@/lib/products/agentos/calls/store";
import { fingerprintIp, consentText, cleanVisitor, originAllowed, signPageToken, verifyPageToken, type VisitorInput } from "@/lib/products/agentos/calls/public-security";
import { isTerminal, type CallDoc } from "@/lib/products/agentos/calls/types";
import { webDynamicVariables } from "@/lib/products/agentos/calls/web";
import { can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { ElevenLabsAgentError, type AgentClient } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { workspaceAgentClient } from "@/lib/products/agentos/voice/connection";
import { stableRootSecret } from "@/lib/platform/keyring";

/**
 * Website (public) voice calls: a visitor of the company's website picks one of the company's PUBLIC agents and talks to it in the
 * browser. The company comes from the Host only (never from a parameter). Every start passes, in this order: the kill switch, a signed
 * single-use page token (company + address + age), consent, clean visitor fields, an agent that is public + active + synced and allows the
 * embedding website, the plan gate, per-address and per-agent hourly limits, the company's daily minutes, and an agent whose
 * conversation overrides are confirmed OFF. Refusals are written to an abuse log (keyed address fingerprint only, never the address).
 */

/** A visitor-facing refusal: the message is safe to show; `code` is for the abuse log and the tests. */
export class PublicCallError extends Error {
  constructor(
    message: string,
    readonly code: "disabled" | "token" | "consent" | "input" | "unavailable" | "limit" | "cap" | "plan" | "provider" | "session",
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export interface PublicDeps {
  client?: () => Promise<AgentClient | null>;
  /** A reason string blocks the call. Default: the plan's module + voice minutes. */
  gate?: () => Promise<string | null>;
  now?: () => Date;
  /** Token / fingerprint signing secret. Default: derived from the server's encryption key; null = public calls are off. */
  secret?: () => string | null;
}

const nowOf = (d?: PublicDeps) => (d?.now ?? (() => new Date()))();
const HOUR_MS = 60 * 60 * 1000;
/** Smallest slice of the day's minutes worth starting a call with. */
const MIN_SESSION_SECS = 30;
/**
 * Seconds set aside for sessions that haven't been settled yet are bounded, so sessions that never connect cannot eat the day's minutes before
 * the sweep gives them back: at most this many per address, and per agent at most half the day's cap (or 10 full sessions, whichever is more).
 */
export const MAX_UNSETTLED_PER_IP = 3;
const MAX_UNSETTLED_AGENT_SHARE = 0.5;
export const MAX_UNSETTLED_AGENT_SESSIONS = 10;
/** An unreported session is given up on after its longest possible length plus this. */
export const PUBLIC_ABANDON_EXTRA_MS = 15 * 60 * 1000;

async function signingSecret(deps?: PublicDeps): Promise<string | null> {
  if (deps?.secret) return deps.secret();
  const key = stableRootSecret();
  return key ? `${key}:agentos-public:${await currentCompanyId()}` : null;
}

async function defaultGate(): Promise<string | null> {
  const { moduleBlockReason, voiceBlockReason } = await import("@/lib/platform/billing/enforce");
  return (await moduleBlockReason("aibots")) ?? (await voiceBlockReason());
}

// ---------------------------------------------------------------------------
// Counters, single-use tokens, abuse log (company database; company id inside every key)
// ---------------------------------------------------------------------------

const COL = { limits: "agentos_public_limits", tokens: "agentos_public_tokens", usage: "agentos_public_usage", abuse: "agentos_public_abuse" } as const;
let indexed = false;
async function cols() {
  const db = await getDb();
  const out = {
    limits: db.collection<{ _id: string; n: number; expireAt: Date }>(COL.limits),
    tokens: db.collection<{ _id: string; expireAt: Date }>(COL.tokens),
    usage: db.collection<{ _id: string; reservedSecs: number; expireAt: Date }>(COL.usage),
    abuse: db.collection<AbuseEvent & { _id: string }>(COL.abuse),
  };
  if (!indexed) {
    indexed = true;
    await Promise.all([
      out.limits.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
      out.tokens.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
      out.usage.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
      out.abuse.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
      out.abuse.createIndex({ at: -1 }),
    ]).catch((e) => console.error("[agentos public] index failed", logText(e)));
  }
  return out;
}

/** Test hook: a test drops its database between runs. */
export function resetPublicIndexes(): void {
  indexed = false;
}

/** Fixed-window counter. True while the count is within `limit`. */
async function withinLimit(key: string, limit: number, windowMs: number, now: Date): Promise<{ ok: boolean; retryAfter: number }> {
  const c = (await cols()).limits;
  const slot = Math.floor(now.getTime() / windowMs);
  const id = `${await currentCompanyId()}:${key}:${slot}`;
  const doc = await c.findOneAndUpdate({ _id: id }, { $inc: { n: 1 }, $setOnInsert: { expireAt: new Date((slot + 2) * windowMs) } }, { upsert: true, returnDocument: "after" });
  const ok = (doc?.n ?? 1) <= limit;
  return { ok, retryAfter: Math.max(1, Math.ceil(((slot + 1) * windowMs - now.getTime()) / 1000)) };
}

export type AbuseKind = "kill_switch" | "bad_token" | "expired_token" | "too_fast" | "replay" | "wrong_address" | "origin_denied" | "ip_limit" | "agent_limit" | "cap_exhausted" | "bad_input" | "no_consent" | "bad_session_key" | "foreign_conversation" | "unsettled_limit";
export interface AbuseEvent {
  at: Date;
  kind: AbuseKind;
  /** Keyed fingerprint of the visitor's address, never the address. */
  ipHash: string;
  agentId: string | null;
  origin: string | null;
  expireAt: Date;
}

async function logAbuse(kind: AbuseKind, e: { ipHash: string; agentId?: string | null; origin?: string | null }, now: Date): Promise<void> {
  try {
    await (await cols()).abuse.insertOne({ _id: newId(), at: now, kind, ipHash: e.ipHash, agentId: e.agentId ?? null, origin: e.origin?.slice(0, 200) ?? null, expireAt: new Date(now.getTime() + 30 * 24 * HOUR_MS) });
  } catch (err) {
    console.error("[agentos public] abuse log failed", logText(err));
  }
}

const dayKey = (now: Date) => now.toISOString().slice(0, 10);

/** Sets `secs` aside from today's public minutes. Atomic: two racing starts can never both pass the cap. */
async function reserveDaily(secs: number, capSecs: number, now: Date): Promise<boolean> {
  if (secs > capSecs) return false;
  const c = (await cols()).usage;
  const id = `${await currentCompanyId()}:${dayKey(now)}`;
  try {
    await c.updateOne({ _id: id, reservedSecs: { $lte: capSecs - secs } }, { $inc: { reservedSecs: secs }, $setOnInsert: { expireAt: new Date(now.getTime() + 3 * 24 * HOUR_MS) } }, { upsert: true });
    return true;
  } catch (e) {
    if (isDuplicateKey(e)) return false; // the day's row exists and has no room left
    throw e;
  }
}

async function adjustDaily(deltaSecs: number, day: string): Promise<void> {
  if (!deltaSecs) return;
  await (await cols()).usage.updateOne({ _id: `${await currentCompanyId()}:${day}` }, { $inc: { reservedSecs: deltaSecs } });
}

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

export interface PublicAgentView {
  id: string;
  name: string;
  jobTitle: string;
  description: string;
  /** Language codes (the agent speaks one). */
  languages: string[];
  photoUrl: string | null;
  /** The consent line shown before the call. */
  consent: string;
  maxSecs: number;
}

const publicFilter = { kind: "voice", status: "active", "voice.isPublic": true, "voice.elevenAgentId": { $type: "string" }, ...notDeleted } as const;

async function sessionSecsFor(bot: Pick<BotDoc, "voice">, globalMax: number): Promise<number> {
  return Math.min(bot.voice?.maxDurationSecs ?? Infinity, globalMax);
}

/** Public, active, synced agents that allow this page's website. Empty when the kill switch is on. */
export async function listPublicAgents(embedder: string | null, ownOrigin: string, deps: PublicDeps = {}): Promise<{ agents: PublicAgentView[]; killSwitch: boolean }> {
  const [ps, cs] = await Promise.all([getPublicCallSettings(), getCallSettings()]);
  if (ps.publicKillSwitch) return { agents: [], killSwitch: true };
  const rows = await (await botsCollection()).find(publicFilter).sort({ name: 1 }).limit(60).toArray();
  void deps;
  const agents: PublicAgentView[] = [];
  for (const b of rows) {
    if (!b.voice || !originAllowed(embedder, ownOrigin, b.voice.allowedOrigins)) continue;
    const name = (b.voice.displayName || b.name).slice(0, 80);
    agents.push({
      id: b._id,
      name,
      jobTitle: (b.voice.jobTitle ?? "").slice(0, 80),
      description: b.description.slice(0, 300),
      languages: b.voice.language ? [b.voice.language] : [],
      photoUrl: b.avatarKey ? publicAvatarUrl(b._id, avatarUrlFor(b._id, b.avatarKey)) : null,
      consent: consentText({ recordingNotice: cs.recordingNotice, agentName: name }),
      maxSecs: await sessionSecsFor(b, ps.publicMaxSessionSecs),
    });
  }
  return { agents, killSwitch: false };
}

/** `/api/agentos/bots/<id>/avatar?v=…` (signed-in only) -> the public route with the same version. */
function publicAvatarUrl(botId: string, privateUrl: string | null): string | null {
  const v = privateUrl ? new URL(privateUrl, "https://x.invalid").searchParams.get("v") : null;
  return `/api/agentos-public/avatar/${encodeURIComponent(botId)}${v ? `?v=${encodeURIComponent(v)}` : ""}`;
}

/** The photo of a PUBLIC agent only. Null for anything else (never confirms that a non-public agent exists). */
export async function readPublicAvatar(botId: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (typeof botId !== "string" || botId.length > 64) return null;
  const bot = await (await botsCollection()).findOne({ _id: botId, ...publicFilter });
  if (!bot) return null;
  return readBotAvatar(botId).catch(() => null);
}

/** A fresh page token for the directory page being served now. Null when public calls can't be offered (no signing key). */
export async function issuePageToken(i: { embedder: string; ip: string; now?: Date }, deps: PublicDeps = {}): Promise<string | null> {
  const secret = await signingSecret(deps);
  if (!secret) return null;
  return signPageToken(secret, { c: await currentCompanyId(), o: i.embedder, i: fingerprintIp(secret, i.ip), now: (i.now ?? nowOf(deps)).getTime() }).token;
}

// ---------------------------------------------------------------------------
// Starting and finishing a session
// ---------------------------------------------------------------------------

export interface StartPublicInput {
  token: unknown;
  agentId: unknown;
  consent: unknown;
  visitor?: VisitorInput;
  /** The visitor's address as the trusted edge reports it. */
  ip: string;
  /** This request's own origin (scheme + Host), used to recognise the company's own site. */
  ownOrigin: string;
  /** The `Origin` header of this POST, canonical, or null when the request had none (browsers always send one on a POST). */
  requestOrigin?: string | null;
}

export interface StartedPublicSession {
  sessionId: string;
  /** Secret only this browser holds; required to finish the session. */
  sessionKey: string;
  signedUrl: string;
  dynamicVariables: Record<string, string>;
  maxSecs: number;
  /** For the next call from this page (a token works once). */
  nextToken: string;
}

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const UNAVAILABLE = "This agent isn't available right now.";

export async function startPublicSession(input: StartPublicInput, deps: PublicDeps = {}): Promise<StartedPublicSession> {
  const now = nowOf(deps);
  const secret = await signingSecret(deps);
  if (!secret) throw new PublicCallError("Website calls aren't available right now.", "disabled", 503);
  const companyId = await currentCompanyId();
  const ipHash = fingerprintIp(secret, input.ip);
  const refuse = async (kind: AbuseKind, e: PublicCallError, extra: { agentId?: string | null; origin?: string | null } = {}): Promise<never> => {
    await logAbuse(kind, { ipHash, ...extra }, now);
    throw e;
  };

  const ps = await getPublicCallSettings();
  if (ps.publicKillSwitch) return refuse("kill_switch", new PublicCallError("Website calls are switched off right now.", "disabled", 503));

  const tok = verifyPageToken(secret, input.token, { company: companyId, ipFingerprint: ipHash, now: now.getTime() });
  if (!tok.ok) {
    const map = { malformed: "bad_token", signature: "bad_token", wrong_company: "bad_token", expired: "expired_token", too_fast: "too_fast", wrong_address: "wrong_address" } as const;
    const msg = tok.reason === "expired" || tok.reason === "too_fast" ? "This page has been open too long or you were too quick. Reload the page and try again." : "This page couldn't be verified. Reload the page and try again.";
    return refuse(map[tok.reason], new PublicCallError(msg, "token", 403));
  }
  const origin = tok.payload.o;

  if (input.consent !== true) return refuse("no_consent", new PublicCallError("Please agree to the notice before starting the call.", "consent", 400), { origin });
  const cleaned = cleanVisitor(input.visitor);
  if (!cleaned.ok) return refuse("bad_input", new PublicCallError(cleaned.error, "input", 400), { origin });

  const agentId = typeof input.agentId === "string" && input.agentId.length <= 64 ? input.agentId : "";
  const bot = agentId ? await (await botsCollection()).findOne({ _id: agentId, ...publicFilter }) : null;
  if (!bot?.voice?.elevenAgentId) return refuse("origin_denied", new PublicCallError(UNAVAILABLE, "unavailable", 404), { agentId, origin });
  if (!originAllowed(origin, input.ownOrigin, bot.voice.allowedOrigins)) return refuse("origin_denied", new PublicCallError(UNAVAILABLE, "unavailable", 404), { agentId, origin });
  // ORIGINS ARE A BROWSER-ENFORCED CONVENIENCE, NOT SECURITY: a script can send any header it likes, and `origin` above is only what the page
  // token recorded when the directory page was served. They keep honest browsers and other websites in line; the real limits are the signed
  // single-use token, the per-address and per-agent limits and the daily minute cap. Still, when an agent lists websites, a session POST must carry
  // an Origin header (a browser always sends one) and it must equal this site's own origin exactly (the directory page is served from here, even
  // when another website frames it). The Referer fallback is for the directory page GET only, never for starting a session.
  if (bot.voice.allowedOrigins?.length && (!input.requestOrigin || input.requestOrigin !== input.ownOrigin)) {
    return refuse("origin_denied", new PublicCallError(UNAVAILABLE, "unavailable", 404), { agentId, origin });
  }

  const blocked = await (deps.gate ?? defaultGate)();
  if (blocked) throw new PublicCallError("Calls to this company aren't available right now.", "plan", 503);

  const ipLimit = await withinLimit(`ip:${ipHash}`, ps.publicPerIpHourly, HOUR_MS, now);
  if (!ipLimit.ok) return refuse("ip_limit", new PublicCallError("You've started several calls recently. Please try again later.", "limit", 429, ipLimit.retryAfter), { agentId, origin });
  const agentLimit = await withinLimit(`agent:${bot._id}`, ps.publicPerAgentHourly, HOUR_MS, now);
  if (!agentLimit.ok) return refuse("agent_limit", new PublicCallError("This agent is very busy. Please try again in a little while.", "limit", 429, agentLimit.retryAfter), { agentId, origin });

  // The token is single-use: consumed only now that the cheap checks passed, atomically (a second use hits the unique _id).
  try {
    await (await cols()).tokens.insertOne({ _id: `${companyId}:${tok.payload.j}`, expireAt: new Date(tok.payload.e + HOUR_MS) });
  } catch (e) {
    if (isDuplicateKey(e)) return refuse("replay", new PublicCallError("This page has already been used for a call. Reload the page to start another.", "token", 403), { agentId, origin });
    throw e;
  }

  const maxSecs = await sessionSecsFor(bot, ps.publicMaxSessionSecs);
  const capSecs = ps.publicDailyMinutes * 60;
  // Reserved-but-unsettled seconds are bounded per address and per agent (see MAX_UNSETTLED_PER_IP).
  const unsettledSince = new Date(now.getTime() - 24 * HOUR_MS);
  const open = { direction: "web_public" as const, "publicMeta.capSettledAt": null, createdAt: { $gte: unsettledSince } };
  const callsCol = await callsCollection();
  const [ipOpen, agentOpen] = await Promise.all([
    callsCol.countDocuments({ ...open, "publicMeta.ipHash": ipHash }),
    callsCol.aggregate<{ s: number }>([{ $match: { ...open, agentId: bot._id } }, { $group: { _id: null, s: { $sum: "$publicMeta.reservedSecs" } } }]).toArray(),
  ]);
  if (ipOpen >= MAX_UNSETTLED_PER_IP || (agentOpen[0]?.s ?? 0) + maxSecs > Math.max(capSecs * MAX_UNSETTLED_AGENT_SHARE, maxSecs * MAX_UNSETTLED_AGENT_SESSIONS)) {
    return refuse("unsettled_limit", new PublicCallError("You've started several calls that haven't finished. Please wait a few minutes and try again.", "limit", 429, 300), { agentId, origin });
  }
  if (maxSecs < MIN_SESSION_SECS || !(await reserveDaily(maxSecs, capSecs, now))) {
    return refuse("cap_exhausted", new PublicCallError("This company's website calls are fully booked for today. Please try again tomorrow.", "cap", 429), { agentId, origin });
  }
  const release = () => adjustDaily(-maxSecs, dayKey(now)).catch(() => {});

  try {
    const client = await (deps.client ?? workspaceAgentClient)();
    if (!client) throw new PublicCallError("Website calls aren't available right now.", "disabled", 503);
    // A public agent must have every conversation override OFF before a stranger gets a signed link (otherwise the link holder could
    // replace its prompt). The sync sets this; if it wasn't recorded, lock now, and refuse to start if that fails.
    if (!bot.voice.overridesLockedAt) {
      try {
        await client.lockOverrides(bot.voice.elevenAgentId);
        await (await botsCollection()).updateOne({ _id: bot._id }, { $set: { "voice.overridesLockedAt": now } });
      } catch (e) {
        console.error("[agentos public] couldn't lock overrides", logText(e));
        throw new PublicCallError(UNAVAILABLE, "provider", 503);
      }
    }
    let signedUrl: string;
    try {
      signedUrl = await client.getSignedUrl(bot.voice.elevenAgentId);
    } catch (e) {
      throw new PublicCallError(e instanceof ElevenLabsAgentError && e.message ? "The call couldn't be started. Please try again." : UNAVAILABLE, "provider", 502);
    }

    const sessionKey = randomBytes(24).toString("base64url");
    const base = await webDynamicVariables(bot);
    const v = cleaned.visitor;
    if ("contact_name" in base && v.variables.visitor_name) base.contact_name = v.variables.visitor_name;
    const dynamicVariables = { ...base, ...v.variables };
    const doc: CallDoc = {
      _id: newId(), idempotencyKey: `web_public:${tok.payload.j}`, direction: "web_public", agentId: bot._id, elevenAgentId: bot.voice.elevenAgentId, purpose: "custom",
      target: null, phone: null, phoneHash: null, phoneLast4: null, fromNumberId: null, initiatedBy: null,
      // "in_progress" from the start: the engine only gives up on calls stuck in "dialing", and a browser session has nothing to dial.
      scheduledFor: null, anchorAt: now, dialedAt: now, endedAt: null, status: "in_progress", attempts: 1, conversationId: null, callSid: null,
      context: { ...v.stored, origin: origin === input.ownOrigin ? "own site" : origin },
      compliance: null, failure: null, collected: [], outcome: null, summary: null, summaryTitle: null, transcript: null, durationSecs: null, hasAudio: null,
      terminationReason: null, meteredAt: null, meterLeaseUntil: null, chatId: null, cancelledBy: null,
      control: { mode: "ai", handler: null, canHandBack: true, history: [] }, eventSeq: 0, createdAt: now, updatedAt: now,
      publicMeta: { origin, ipHash, reservedSecs: maxSecs, keyHash: sha(sessionKey), consentAt: now, capSettledAt: null },
    };
    await (await callsCollection()).insertOne(doc);
    const nextToken = signPageToken(secret, { c: companyId, o: origin, i: ipHash, now: now.getTime() }).token;
    return { sessionId: doc._id, sessionKey, signedUrl, dynamicVariables, maxSecs, nextToken };
  } catch (e) {
    await release();
    throw e;
  }
}

export interface FinishPublicInput {
  sessionId: unknown;
  sessionKey: unknown;
  conversationId: unknown;
  ip: string;
}

/** Links the ElevenLabs conversation to the session (only the browser that started it can), pulls the transcript and settles the minutes. */
export async function finishPublicSession(input: FinishPublicInput, deps: PublicDeps & EngineDeps = {}): Promise<{ status: string }> {
  const now = nowOf(deps);
  const secret = await signingSecret(deps);
  if (!secret) throw new PublicCallError("Website calls aren't available right now.", "disabled", 503);
  const ipHash = fingerprintIp(secret, input.ip);
  const id = typeof input.sessionId === "string" && input.sessionId.length <= 64 ? input.sessionId : "";
  const key = typeof input.sessionKey === "string" && input.sessionKey.length <= 128 ? input.sessionKey : "";
  const conv = typeof input.conversationId === "string" && /^[\w-]{4,128}$/.test(input.conversationId) ? input.conversationId : "";
  const calls = await callsCollection();
  const call = id && key && conv ? await calls.findOne({ _id: id, direction: "web_public" }) : null;
  const want = call?.publicMeta?.keyHash;
  if (!call || !want || !safeEqual(sha(key), want)) {
    await logAbuse("bad_session_key", { ipHash, agentId: call?.agentId ?? null }, now);
    throw new PublicCallError("That call couldn't be found.", "session", 404);
  }
  if (call.conversationId && call.conversationId !== conv) throw new PublicCallError("That call is already linked to another conversation.", "session", 409);
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) throw new PublicCallError("Website calls aren't available right now.", "disabled", 503);
  let detail;
  try {
    detail = await client.getConversation(conv);
  } catch {
    throw new PublicCallError("The call record isn't ready yet. Try again in a moment.", "provider", 502);
  }
  // Fail closed: the conversation must name this agent, be a browser call (no phone leg) and have started after the session was set up.
  if (!detail.agentId || detail.agentId !== call.elevenAgentId || detail.phoneCall || (detail.startedAt && new Date(detail.startedAt).getTime() < call.createdAt.getTime() - 10_000)) {
    await logAbuse("foreign_conversation", { ipHash, agentId: call.agentId }, now);
    throw new PublicCallError("That conversation doesn't belong to this call.", "session", 409);
  }
  try {
    const linked = await calls.updateOne({ _id: call._id, conversationId: { $in: [null, conv] } }, { $set: { conversationId: conv, updatedAt: now } });
    if (linked.matchedCount !== 1) throw new PublicCallError("That call is already linked to another conversation.", "session", 409);
  } catch (e) {
    if (isDuplicateKey(e)) throw new PublicCallError("That conversation belongs to another call.", "session", 409);
    throw e;
  }
  const r = await applyConversationUpdate({ conversationId: conv, agentId: detail.agentId, detail }, deps);
  await settlePublicCap(call._id);
  return { status: r.status ?? "in_progress" };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Replaces a finished session's reservation with the seconds it really lasted (once). Calls that run past their reservation are counted in
 * full, so today's total is never understated.
 */
export async function settlePublicCap(callId: string): Promise<boolean> {
  const calls = await callsCollection();
  const call = await calls.findOne({ _id: callId, direction: "web_public" });
  const meta = call?.publicMeta;
  // Only a finished session settles: its real seconds replace the reservation. A session that ended without any time (never connected, mic
  // denied, abandoned) gives the whole reservation back. The conditional claim below makes either happen exactly once.
  if (!call || !meta || meta.capSettledAt || !isTerminal(call.status)) return false;
  // A linked conversation whose length hasn't been reported yet is waited for (the real seconds are what gets counted), until the session could no longer be running.
  const hasSecs = Boolean(call.durationSecs && call.durationSecs > 0);
  if (!hasSecs && call.conversationId && Date.now() - call.createdAt.getTime() < meta.reservedSecs * 1000 + PUBLIC_ABANDON_EXTRA_MS) return false;
  const claim = await calls.updateOne({ _id: callId, "publicMeta.capSettledAt": null }, { $set: { "publicMeta.capSettledAt": new Date() } });
  if (claim.modifiedCount !== 1) return false;
  const used = call.durationSecs && call.durationSecs > 0 ? Math.ceil(call.durationSecs) : 0;
  await adjustDaily(used - meta.reservedSecs, dayKey(call.createdAt));
  return true;
}

/**
 * The visitor's browser says the call never started (the connection failed after the session was set up). Only the browser that holds the
 * session key can do it; the session is marked failed and its reservation is returned, once. A session that already has a conversation is
 * left to the normal finish path.
 */
export async function abortPublicSession(input: { sessionId: unknown; sessionKey: unknown; ip: string }, deps: PublicDeps = {}): Promise<{ status: string }> {
  const now = nowOf(deps);
  const secret = await signingSecret(deps);
  if (!secret) throw new PublicCallError("Website calls aren't available right now.", "disabled", 503);
  const id = typeof input.sessionId === "string" && input.sessionId.length <= 64 ? input.sessionId : "";
  const key = typeof input.sessionKey === "string" && input.sessionKey.length <= 128 ? input.sessionKey : "";
  const calls = await callsCollection();
  const call = id && key ? await calls.findOne({ _id: id, direction: "web_public" }) : null;
  const want = call?.publicMeta?.keyHash;
  if (!call || !want || !safeEqual(sha(key), want)) {
    await logAbuse("bad_session_key", { ipHash: fingerprintIp(secret, input.ip), agentId: call?.agentId ?? null }, now);
    throw new PublicCallError("That call couldn't be found.", "session", 404);
  }
  await calls.updateOne({ _id: call._id, conversationId: null, status: "in_progress" }, { $set: { status: "failed", endedAt: now, updatedAt: now, failure: { code: "not_connected", message: "The visitor's call never connected." } } });
  await settlePublicCap(call._id);
  return { status: "failed" };
}

/**
 * The safety net for the scheduled sweep: settles the minutes of finished sessions the visitor's browser never reported, links sessions that
 * ended without a report to the one ElevenLabs conversation that started right after them (only when unambiguous), and gives up on sessions
 * that never connected. Never throws.
 */
export async function reconcilePublicSessions(deps: PublicDeps & EngineDeps = {}): Promise<{ settled: number; linked: number; abandoned: number }> {
  const out = { settled: 0, linked: 0, abandoned: 0 };
  try {
    const now = nowOf(deps);
    const calls = await callsCollection();
    for (const c of await calls.find({ direction: "web_public", "publicMeta.capSettledAt": null, status: { $in: ["completed", "no_answer", "failed", "busy", "cancelled"] } }).limit(50).toArray()) {
      if (await settlePublicCap(c._id)) out.settled++;
    }
    const waiting = await calls.find({ direction: "web_public", conversationId: null, status: "in_progress", createdAt: { $lte: new Date(now.getTime() - 6 * 60_000) } }).sort({ createdAt: 1 }).limit(25).toArray();
    if (!waiting.length) return out;
    const client = await (deps.client ?? workspaceAgentClient)();
    for (const w of waiting) {
      const abandon = async () => {
        const r = await calls.updateOne({ _id: w._id, conversationId: null, status: "in_progress" }, { $set: { status: "failed", endedAt: now, updatedAt: now, failure: { code: "not_connected", message: "The visitor's call never connected." } } });
        if (r.modifiedCount === 1) {
          out.abandoned++;
          if (await settlePublicCap(w._id)) out.settled++; // the reservation goes back
        }
      };
      // Not before the session could still be running: its longest length plus a margin.
      const old = now.getTime() - w.createdAt.getTime() > (w.publicMeta?.reservedSecs ?? 3600) * 1000 + PUBLIC_ABANDON_EXTRA_MS;
      if (!client || !w.elevenAgentId) {
        if (old) await abandon();
        continue;
      }
      const recent = (await client.listConversations(w.elevenAgentId, { pageSize: 100 }).catch(() => null))?.items ?? [];
      const from = w.createdAt.getTime() - 10_000;
      const to = w.createdAt.getTime() + 15 * 60_000;
      const claimed = new Set((await calls.find({ conversationId: { $in: recent.map((r) => r.conversationId) } }, { projection: { conversationId: 1 } }).toArray()).map((x) => x.conversationId));
      const candidates = recent.filter((r) => r.conversationId && !claimed.has(r.conversationId) && r.startedAt && new Date(r.startedAt).getTime() >= from && new Date(r.startedAt).getTime() <= to);
      const rivals = waiting.filter((x) => x._id !== w._id && x.agentId === w.agentId && Math.abs(x.createdAt.getTime() - w.createdAt.getTime()) <= 15 * 60_000);
      if (candidates.length === 1 && rivals.length === 0) {
        const detail = await client.getConversation(candidates[0].conversationId).catch(() => null);
        if (detail && detail.agentId === w.elevenAgentId && !detail.phoneCall) {
          const linked = await calls.updateOne({ _id: w._id, conversationId: null }, { $set: { conversationId: detail.conversationId, updatedAt: now } }).catch(() => null);
          if (linked?.modifiedCount === 1) {
            await applyConversationUpdate({ conversationId: detail.conversationId, agentId: detail.agentId, detail }, deps);
            await settlePublicCap(w._id);
            out.linked++;
            continue;
          }
        }
      }
      if (old) await abandon();
    }
  } catch (e) {
    console.error("[agentos public] reconcile failed", logText(e));
  }
  return out;
}

// ---------------------------------------------------------------------------
// For the settings page
// ---------------------------------------------------------------------------

export interface PublicOverview {
  killSwitch: boolean;
  dailyCapMinutes: number;
  usedMinutesToday: number;
  sessionsToday: number;
  agents: { id: string; name: string; allowedOrigins: string[]; locked: boolean }[];
  abuseLast24h: Partial<Record<AbuseKind, number>>;
}

/** Numbers for the website-calls panel in settings. Needs VOICE_CALL_MANAGE; returns null otherwise. */
export async function getPublicOverview(viewer: AibotsViewer, deps: PublicDeps = {}): Promise<PublicOverview | null> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) return null;
  const now = nowOf(deps);
  const [ps, c, bots] = await Promise.all([getPublicCallSettings(), cols(), (await botsCollection()).find({ kind: "voice", "voice.isPublic": true, ...notDeleted }).limit(100).toArray()]);
  const usage = await c.usage.findOne({ _id: `${await currentCompanyId()}:${dayKey(now)}` });
  const startOfDay = new Date(`${dayKey(now)}T00:00:00.000Z`);
  const sessionsToday = await (await callsCollection()).countDocuments({ direction: "web_public", createdAt: { $gte: startOfDay } });
  const abuse: PublicOverview["abuseLast24h"] = {};
  for await (const e of c.abuse.find({ at: { $gte: new Date(now.getTime() - 24 * HOUR_MS) } }, { projection: { kind: 1 } })) abuse[e.kind] = (abuse[e.kind] ?? 0) + 1;
  return {
    killSwitch: ps.publicKillSwitch,
    dailyCapMinutes: ps.publicDailyMinutes,
    usedMinutesToday: Math.round(((usage?.reservedSecs ?? 0) / 60) * 10) / 10,
    sessionsToday,
    agents: bots.map((b) => ({ id: b._id, name: b.voice?.displayName || b.name, allowedOrigins: b.voice?.allowedOrigins ?? [], locked: Boolean(b.voice?.overridesLockedAt) })),
    abuseLast24h: abuse,
  };
}
