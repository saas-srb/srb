import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, type EncryptedValue } from "@/lib/platform/crypto";
import { getDb } from "@/lib/mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { recordAudit } from "@/lib/products/agentos/audit";
import { newId } from "@/lib/products/agentos/db";
import { getCallSettings } from "@/lib/products/agentos/calls/settings";
import { numbersCollection, isDuplicateKey } from "@/lib/products/agentos/calls/store";
import { CALL_COLLECTIONS } from "@/lib/products/agentos/calls/types";
import { AibotsInputError, ForbiddenError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";

/**
 * Per-company setup of live (conference) calling: the Twilio credentials the browser softphone needs, the opaque URL token, the signed
 * parameters that tie a Twilio request to one call, and the checklist the Phone settings page shows.
 */

export interface ConferenceCreds {
  accountSid: string;
  authToken: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
}

const SID = /^[A-Z]{2}[0-9a-f]{32}$/i;

/** The company's OWN Twilio account only: SelfRun's shared Twilio never carries a company's live calls. Null until every field is saved and well formed. */
export async function conferenceCreds(): Promise<ConferenceCreds | null> {
  const c = await resolveConnection("twilio");
  if (!c || c.source !== "workspace") return null;
  const v = c.values;
  if (!SID.test(v.accountSid ?? "") || !v.authToken || !/^SK[0-9a-f]{32}$/i.test(v.apiKeySid ?? "") || !v.apiKeySecret || !/^AP[0-9a-f]{32}$/i.test(v.twimlAppSid ?? "")) return null;
  return { accountSid: v.accountSid, authToken: v.authToken, apiKeySid: v.apiKeySid, apiKeySecret: v.apiKeySecret, twimlAppSid: v.twimlAppSid };
}

/** Just the account credentials (used to verify Twilio's signature and for REST); the softphone fields may be missing. */
export async function twilioAccountCreds(): Promise<{ accountSid: string; authToken: string } | null> {
  const c = await resolveConnection("twilio");
  if (!c || c.source !== "workspace" || !SID.test(c.values.accountSid ?? "") || !c.values.authToken) return null;
  return { accountSid: c.values.accountSid, authToken: c.values.authToken };
}

// ---------------------------------------------------------------------------
// Opaque company token (the tenant of every Twilio request)
// ---------------------------------------------------------------------------

interface TwilioSetupDoc {
  _id: string;
  kind: "twilio";
  tokenHash: string;
  tokenEnc: EncryptedValue;
  confirmed: { voiceUrl: boolean; agentAudio: boolean };
  updatedAt: Date;
}
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const tokenContext = (companyId: string) => `agentos-twilio-live:${companyId}`;

async function setupCol() {
  return (await getDb()).collection<TwilioSetupDoc>(CALL_COLLECTIONS.webhooks);
}

async function ensureSetupDoc(): Promise<TwilioSetupDoc> {
  const col = await setupCol();
  const existing = await col.findOne({ kind: "twilio" });
  if (existing) return existing;
  if (!isPlatformEncryptionConfigured()) throw new AibotsInputError("Secure storage isn't set up on this server yet. Ask your platform administrator.");
  const token = randomBytes(24).toString("base64url");
  const doc: TwilioSetupDoc = { _id: newId(), kind: "twilio", tokenHash: sha(token), tokenEnc: encryptPlatformSecret(token, tokenContext(await currentCompanyId())), confirmed: { voiceUrl: false, agentAudio: false }, updatedAt: new Date() };
  try {
    await col.insertOne(doc);
    await (await getPlatformDb()).collection(CALL_COLLECTIONS.webhooks).createIndex({ tokenHash: 1 }).catch(() => {});
    return doc;
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    return (await col.findOne({ kind: "twilio" }))!;
  }
}

/** The company's URL token in the clear (it is stored encrypted so the setup page can show the address again). */
export async function twilioToken(): Promise<string> {
  const doc = await ensureSetupDoc();
  const t = decryptPlatformSecret(doc.tokenEnc, tokenContext(await currentCompanyId()));
  if (!t) throw new Error("The live-call address token could not be read.");
  return t;
}

/** Tenant lookup for a Twilio request: token -> company id. Same answer (null) for malformed, unknown or another kind of token. */
export async function companyForTwilioToken(token: string | null): Promise<string | null> {
  if (!token || !/^[\w-]{20,100}$/.test(token)) return null;
  const cfg = await (await getPlatformDb()).collection<{ companyId?: string; kind?: string; tokenHash?: string }>(CALL_COLLECTIONS.webhooks).findOne({ kind: "twilio", tokenHash: sha(token) });
  return cfg?.companyId ?? null;
}

export const VOICE_PATH = "/api/agentos/twilio/voice";
export const STATUS_PATH = "/api/agentos/twilio/status";
export const TRANSCRIPTION_PATH = "/api/agentos/twilio/transcription";

export async function appOrigin(): Promise<string> {
  return (await appUrlForCompany(await currentCompanyId())).replace(/\/+$/, "");
}

export interface LegUrls {
  voice: (leg: "lead" | "hold", callId: string) => Promise<string>;
  status: (callId: string) => Promise<string>;
  transcription: (callId: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Signed parameters
// ---------------------------------------------------------------------------

function signingKey(companyId: string): string {
  if (!isPlatformEncryptionConfigured()) throw new Error("Secure storage isn't configured.");
  return `${process.env.PLATFORM_ENCRYPTION_KEY ?? ""}:agentos-live-legs:${companyId}`;
}
const hmac = (key: string, data: string) => createHmac("sha256", key).update(data).digest("base64url");
const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export type Leg = "lead" | "ai" | "hold" | "say_joined" | "say_took_over";
const LEGS: readonly string[] = ["lead", "ai", "hold", "say_joined", "say_took_over"];
export const LEG_TTL_SECS = 4 * 60 * 60;

/** `leg`, `c` (call id), `e` (expiry), `s` (signature): put on the URL/params of a leg we create so the voice route knows which call and role it is. */
export async function signLeg(leg: Leg, callId: string, nowSecs = Math.floor(Date.now() / 1000)): Promise<Record<string, string>> {
  const e = String(nowSecs + LEG_TTL_SECS);
  return { leg, c: callId, e, s: hmac(signingKey(await currentCompanyId()), `${leg}|${callId}|${e}`) };
}
export async function verifyLeg(p: { leg: string | null; c: string | null; e: string | null; s: string | null }, nowSecs = Math.floor(Date.now() / 1000)): Promise<{ leg: Leg; callId: string } | null> {
  if (!p.leg || !p.c || !p.e || !p.s || !LEGS.includes(p.leg) || p.c.length > 64 || !/^\d{9,12}$/.test(p.e) || Number(p.e) < nowSecs) return null;
  return safeEq(hmac(signingKey(await currentCompanyId()), `${p.leg}|${p.c}|${p.e}`), p.s) ? { leg: p.leg as Leg, callId: p.c } : null;
}

export const JOIN_TOKEN_TTL_SECS = 10 * 60;
/** The browser leg's identity: stable for one person on one call, so a reload replaces the old leg instead of adding a second. */
export const humanIdentity = (userId: string, callId: string) => `h${sha(`${userId}|${callId}`).slice(0, 30)}`;

export async function signJoinToken(i: { callId: string; userId: string }, nowSecs = Math.floor(Date.now() / 1000)): Promise<{ token: string; identity: string; expiresAt: number }> {
  const identity = humanIdentity(i.userId, i.callId);
  const expiresAt = nowSecs + JOIN_TOKEN_TTL_SECS;
  const body = Buffer.from(JSON.stringify({ c: i.callId, u: i.userId, i: identity, e: expiresAt })).toString("base64url");
  return { token: `${body}.${hmac(signingKey(await currentCompanyId()), `join|${body}`)}`, identity, expiresAt };
}
export async function verifyJoinToken(token: string | null, nowSecs = Math.floor(Date.now() / 1000)): Promise<{ callId: string; userId: string; identity: string } | null> {
  if (!token || token.length > 800) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEq(hmac(signingKey(await currentCompanyId()), `join|${body}`), sig)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { c?: unknown; u?: unknown; i?: unknown; e?: unknown };
    if (typeof p.c !== "string" || typeof p.u !== "string" || typeof p.i !== "string" || typeof p.e !== "number" || p.e < nowSecs) return null;
    return { callId: p.c, userId: p.u, identity: p.i };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Setup checklist + mode
// ---------------------------------------------------------------------------

export interface SetupStep {
  key: "twilio" | "number" | "apiKey" | "twimlApp" | "voiceUrl" | "elevenWebhook" | "agentAudio" | "secureStorage";
  label: string;
  done: boolean;
  /** What to do, in plain words. */
  help: string;
  /** Steps Twilio/ElevenLabs can't tell us about: the manager ticks them after doing them. */
  manual: boolean;
  /** Where in the app this is done. */
  href: string | null;
}

export interface TwilioFieldStatus {
  /** "workspace" = the company's own account; "platform" = SelfRun's shared account (never used for live calls); "none" = not connected. */
  source: "workspace" | "platform" | "none";
  fields: { key: "accountSid" | "authToken" | "apiKeySid" | "apiKeySecret" | "twimlAppSid"; label: string; ok: boolean; problem: "missing" | "malformed" | null }[];
}

const TWILIO_FIELDS: { key: TwilioFieldStatus["fields"][number]["key"]; label: string; test: (v: string) => boolean }[] = [
  { key: "accountSid", label: "Account SID (starts with AC)", test: (v) => SID.test(v) },
  { key: "authToken", label: "Auth token", test: (v) => v.length > 0 },
  { key: "apiKeySid", label: "API key SID (starts with SK)", test: (v) => /^SK[0-9a-f]{32}$/i.test(v) },
  { key: "apiKeySecret", label: "API key secret", test: (v) => v.length > 0 },
  { key: "twimlAppSid", label: "TwiML App SID (starts with AP)", test: (v) => /^AP[0-9a-f]{32}$/i.test(v) },
];

/** Pure: which Twilio fields are present and well formed, given the saved values. */
export function twilioFieldStatus(source: TwilioFieldStatus["source"], values: Record<string, string | undefined>): TwilioFieldStatus {
  return {
    source,
    fields: TWILIO_FIELDS.map((f) => {
      const v = (values[f.key] ?? "").trim();
      return { key: f.key, label: f.label, ok: v !== "" && f.test(v), problem: v === "" ? "missing" : f.test(v) ? null : "malformed" };
    }),
  };
}

export interface ConferenceSetup {
  ready: boolean;
  steps: SetupStep[];
  /** The address to paste into the TwiML App's Voice "A call comes in" field (POST). Managers only; null for others. */
  voiceUrl: string | null;
  callMode: "auto" | "conference" | "direct";
  /** What calls placed now will use. */
  effectiveMode: "conference" | "direct";
  /** Which fields of the Twilio connection are filled in (managers only; null for others). Values are never returned. */
  twilio: TwilioFieldStatus | null;
  /** Shown as a banner when the company asked for conference calls (or left it on automatic) but the setup is incomplete. */
  banner: string | null;
}

async function elevenWebhookSaved(): Promise<boolean> {
  const main = await (await getDb()).collection<{ kind: string; secret?: unknown }>(CALL_COLLECTIONS.webhooks).findOne({ kind: "main" });
  return Boolean(main?.secret);
}

export async function conferenceReady(): Promise<boolean> {
  return (await readSteps()).every((s) => s.done);
}

async function readSteps(): Promise<SetupStep[]> {
  const [account, creds, hasNumber, doc, webhook] = await Promise.all([
    twilioAccountCreds(),
    conferenceCreds(),
    numbersCollection().then((c) => c.findOne({ status: "active" }, { projection: { _id: 1 } })),
    (await setupCol()).findOne({ kind: "twilio" }),
    elevenWebhookSaved(),
  ]);
  const raw = (await resolveConnection("twilio"))?.values ?? {};
  return [
    { key: "secureStorage", label: "Secure storage on the server", done: isPlatformEncryptionConfigured(), help: "Ask your platform administrator to enable secure storage; live calls sign every request with it.", manual: false, href: null },
    { key: "twilio", label: "Your own Twilio account is connected", done: Boolean(account), help: "Settings → Integrations → Twilio: add your Account SID and Auth token. SelfRun's shared Twilio account is never used for live calls.", manual: false, href: "/commandos/settings/integrations" },
    { key: "number", label: "A phone number from that account is added", done: Boolean(hasNumber), help: "CommandOS → AgentOS settings → Phone: import a Twilio number so calls can go out.", manual: false, href: "/commandos/settings/products/agentos/phone" },
    { key: "apiKey", label: "A Twilio API key for the browser softphone", done: Boolean(raw.apiKeySid && raw.apiKeySecret && creds), help: "Twilio Console → Account → API keys → create a Standard key. Paste the key SID (SK…) and its secret into the Twilio integration; the secret is shown only once.", manual: false, href: "/commandos/settings/integrations" },
    { key: "twimlApp", label: "A TwiML App", done: Boolean(raw.twimlAppSid && creds), help: "Twilio Console → Voice → TwiML → TwiML Apps → create one, then paste its SID (AP…) into the Twilio integration.", manual: false, href: "/commandos/settings/integrations" },
    { key: "voiceUrl", label: "The TwiML App points at your live-call address", done: Boolean(doc?.confirmed.voiceUrl), help: "Open the TwiML App, set Voice → Request URL to the address below with method POST, save, then tick this step.", manual: true, href: null },
    { key: "elevenWebhook", label: "ElevenLabs post-call webhook is saved", done: webhook, help: "CommandOS → AgentOS settings → Phone: configure delivery of each call's transcript, summary, collected answers and call minutes.", manual: false, href: "/commandos/settings/products/agentos/phone" },
    { key: "agentAudio", label: "Voice agents use μ-law 8000 Hz audio", done: Boolean(doc?.confirmed.agentAudio), help: "In ElevenLabs, for each voice agent: Voice → output format and Advanced → input format both set to μ-law 8000 Hz (required for calls that ElevenLabs joins through Twilio). Tick this step when done.", manual: true, href: null },
  ];
}

/** Everything the setup checklist needs. Managers see the address; the live console only needs `ready`/`effectiveMode`/`banner`. */
export async function getConferenceSetup(viewer: AibotsViewer): Promise<ConferenceSetup> {
  const steps = await readSteps();
  const ready = steps.every((s) => s.done);
  const manager = can(viewer, "VOICE_CALL_MANAGE");
  const settings = await getCallSettings();
  const effectiveMode = settings.callMode === "direct" ? "direct" : ready ? "conference" : "direct";
  let voiceUrl: string | null = null;
  if (manager && isPlatformEncryptionConfigured()) voiceUrl = `${await appOrigin()}${VOICE_PATH}?t=${encodeURIComponent(await twilioToken())}`;
  const banner = settings.callMode !== "direct" && !ready ? "Live listening and take-over aren't set up yet, so calls are placed directly by ElevenLabs. Finish the live-call setup to listen in and take over." : null;
  let twilio: TwilioFieldStatus | null = null;
  if (manager) {
    const c = await resolveConnection("twilio");
    twilio = twilioFieldStatus(c ? c.source : "none", c?.values ?? {});
  }
  return { ready, steps: manager ? steps : steps.map((s) => ({ ...s, help: "" })), twilio, voiceUrl, callMode: settings.callMode, effectiveMode, banner };
}

/** The mode a call placed right now uses: the company's choice, with "auto" and "conference" falling back to direct until the setup is complete. */
export async function resolveCallMode(): Promise<"conference" | "direct"> {
  const settings = await getCallSettings();
  if (settings.callMode === "direct") return "direct";
  return (await conferenceReady()) ? "conference" : "direct";
}

/** A manager confirms a step that can't be checked from here. */
export async function confirmSetupStep(viewer: AibotsViewer, step: "voiceUrl" | "agentAudio", done: boolean): Promise<void> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  if (step !== "voiceUrl" && step !== "agentAudio") throw new AibotsInputError("Unknown step.");
  await ensureSetupDoc();
  await (await setupCol()).updateOne({ kind: "twilio" }, { $set: { [`confirmed.${step}`]: Boolean(done), updatedAt: new Date() } });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "settings", entity: "settings", entityId: "live-calls", summary: `${done ? "Confirmed" : "Unticked"} live-call setup step: ${step}` });
}
