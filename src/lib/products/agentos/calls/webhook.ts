import "server-only";
import { logText } from "@/lib/products/agentos/calls/phone";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, last4, type EncryptedValue } from "@/lib/platform/crypto";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId, runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/agentos/db";
import { recordAudit } from "@/lib/products/agentos/audit";
import { applyConversationUpdate, type EngineDeps } from "@/lib/products/agentos/calls/engine";
import { linkConferenceConversation } from "@/lib/products/agentos/calls/conference-transcript";
import { createInboundCall } from "@/lib/products/agentos/calls/public-inbound";
import { isDuplicateKey } from "@/lib/products/agentos/calls/store";
import { CALL_COLLECTIONS } from "@/lib/products/agentos/calls/types";
import { AibotsInputError, ForbiddenError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { ElevenLabsAgentError, mapConversation, type AgentClient } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { NOT_CONFIGURED_MESSAGE, workspaceAgentClient } from "@/lib/products/agentos/voice/connection";

/**
 * ElevenLabs post-call webhook.
 *  - Tenant: the URL carries an opaque per-company token (`?t=`), looked up in the platform database. The body is never trusted for
 *    the tenant, and the token alone proves nothing: the HMAC signature must match THAT company's secret.
 *  - Signature (ElevenLabs SDK `constructEvent`): header `ElevenLabs-Signature: t=<unix secs>,v0=<hex>`, where v0 is
 *    HMAC-SHA256(secret, `${t}.${rawBody}`). Timestamps older than 30 minutes are rejected (so are far-future ones).
 *  - Secret: encrypted at rest like every other connection secret; only its last four characters are ever shown.
 */

export const SIGNATURE_HEADER = "elevenlabs-signature";
export const SIGNATURE_TOLERANCE_SECS = 30 * 60;

export function computeSignature(secret: string, timestamp: number | string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Pure check. `nowSecs` is injected for tests. */
export function verifySignature(rawBody: string, header: string | null, secret: string, nowSecs = Math.floor(Date.now() / 1000)): { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" } {
  if (!header) return { ok: false, reason: "missing" };
  let t = "";
  let v0 = "";
  for (const part of header.split(",")) {
    const p = part.trim();
    if (p.startsWith("t=")) t = p.slice(2);
    else if (p.startsWith("v0=")) v0 = p.slice(3);
  }
  if (!/^\d{9,12}$/.test(t) || !/^[0-9a-f]{64}$/i.test(v0)) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSecs - Number(t)) > SIGNATURE_TOLERANCE_SECS) return { ok: false, reason: "stale" };
  const want = Buffer.from(computeSignature(secret, t, rawBody), "hex");
  const got = Buffer.from(v0, "hex");
  return want.length === got.length && timingSafeEqual(want, got) ? { ok: true } : { ok: false, reason: "mismatch" };
}

// ---------------------------------------------------------------------------
// Per-company setup
// ---------------------------------------------------------------------------

interface WebhookConfig {
  _id: string;
  kind: "main";
  tokenHash: string;
  secret: { enc: EncryptedValue; last4: string } | null;
  elevenWebhookId: string | null;
  registeredAt: Date | null;
  updatedAt: Date;
}
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const secretContext = (companyId: string) => `agentos-webhook:${companyId}`;

let platformIndexed = false;
async function webhookCol() {
  const db = await getDb();
  const col = db.collection<WebhookConfig>(CALL_COLLECTIONS.webhooks);
  if (!platformIndexed) {
    platformIndexed = true;
    await Promise.all([col.createIndex({ kind: 1 }, { unique: true }).catch(() => {}), (await getPlatformDb()).collection(CALL_COLLECTIONS.webhooks).createIndex({ tokenHash: 1 }).catch(() => {})]);
  }
  return col;
}

export function resetWebhookIndexes(): void {
  platformIndexed = false;
}

/** The company's token, created on first use. Returned once so the URL can be shown; only its hash is stored. */
async function ensureToken(): Promise<{ token: string | null }> {
  const col = await webhookCol();
  const existing = await col.findOne({ kind: "main" });
  if (existing) return { token: null };
  const token = randomBytes(24).toString("base64url");
  try {
    await col.insertOne({ _id: newId(), kind: "main", tokenHash: sha(token), secret: null, elevenWebhookId: null, registeredAt: null, updatedAt: new Date() });
    return { token };
  } catch (e) {
    if (isDuplicateKey(e)) return { token: null };
    throw e;
  }
}

/** Rotating the token invalidates the old URL; the new URL must be pasted into ElevenLabs. Manager only. */
async function rotateToken(): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await (await webhookCol()).updateOne({ kind: "main" }, { $set: { tokenHash: sha(token), updatedAt: new Date() } });
  return token;
}

export interface WebhookSetupView {
  url: string;
  hasSecret: boolean;
  secretLast4: string | null;
  registered: boolean;
  /** Why automatic registration isn't available, or what to do by hand. */
  manualSteps: string[];
}

const MANUAL_STEPS = (url: string) => [
  "In ElevenLabs open Agents → Settings → Post-call webhooks and create a webhook with HMAC authentication.",
  `Use this URL: ${url}`,
  "Copy the webhook secret ElevenLabs shows and paste it here. Turn on the transcript and call-initiation-failure events.",
];

/**
 * What the Phone numbers settings page shows. The URL contains the secret token, so this is manager-only, and the URL is rebuilt with a
 * fresh token only when none has been shown yet (the token itself is never stored in the clear, so a URL can't be re-displayed:
 * use `resetWebhookUrl` to get a new one).
 */
export async function getWebhookSetup(viewer: AibotsViewer, fresh: { url?: string } = {}): Promise<WebhookSetupView & { urlAvailable: boolean }> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  const created = await ensureToken();
  const cfg = (await (await webhookCol()).findOne({ kind: "main" }))!;
  const token = created.token;
  const url = token ? await urlFor(token) : (fresh.url ?? "");
  return { url, urlAvailable: Boolean(url), hasSecret: Boolean(cfg.secret), secretLast4: cfg.secret?.last4 ?? null, registered: Boolean(cfg.registeredAt), manualSteps: url ? MANUAL_STEPS(url) : ["The webhook address is hidden once shown. Use \"Create a new webhook address\" if you need it again."] };
}

async function urlFor(token: string): Promise<string> {
  return `${await appUrlForCompany(await currentCompanyId())}/api/agentos/voice/webhook?t=${encodeURIComponent(token)}`;
}

/** Issues a new webhook address (the old one stops working) and returns it once. */
export async function resetWebhookUrl(viewer: AibotsViewer): Promise<string> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  await ensureToken();
  const url = await urlFor(await rotateToken());
  await (await webhookCol()).updateOne({ kind: "main" }, { $set: { registeredAt: null, elevenWebhookId: null } });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "settings", entity: "settings", entityId: "call-webhook", summary: "Created a new call webhook address" });
  return url;
}

/** Manual path: the secret ElevenLabs showed, pasted by a manager. */
export async function saveWebhookSecret(viewer: AibotsViewer, secret: string): Promise<void> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  const s = typeof secret === "string" ? secret.trim() : "";
  if (s.length < 8 || s.length > 300) throw new AibotsInputError("Paste the webhook secret from ElevenLabs.");
  if (!isPlatformEncryptionConfigured()) throw new AibotsInputError("Secure storage isn't set up on this server yet. Ask your platform administrator.");
  await ensureToken();
  await (await webhookCol()).updateOne({ kind: "main" }, { $set: { secret: { enc: encryptPlatformSecret(s, secretContext(await currentCompanyId())), last4: last4(s) }, registeredAt: new Date(), updatedAt: new Date() } });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "settings", entity: "settings", entityId: "call-webhook", summary: "Saved the call webhook secret" });
}

export type RegisterResult = { ok: true } | { ok: false; reason: string; manualSteps: string[] };

/**
 * Registers the webhook in ElevenLabs through its API (create webhook, then make it the workspace's post-call webhook). Only for a
 * company on its OWN ElevenLabs account: ElevenLabs has one post-call webhook per account, so on SelfRun's shared account results
 * arrive through the reconcile poll instead.
 */
export async function registerWebhookWithElevenLabs(viewer: AibotsViewer, deps: { client?: () => Promise<AgentClient | null>; ownAccount?: () => Promise<boolean> } = {}): Promise<RegisterResult> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  const url = await resetWebhookUrl(viewer);
  const manual = MANUAL_STEPS(url);
  const own = await (deps.ownAccount ?? (async () => (await resolveConnection("elevenlabs"))?.source === "workspace"))();
  if (!own) return { ok: false, reason: "Automatic setup needs your own ElevenLabs key (Settings → Integrations). Until then call results are fetched from ElevenLabs on a schedule.", manualSteps: [] };
  if (!isPlatformEncryptionConfigured()) return { ok: false, reason: "Secure storage isn't set up on this server yet. Ask your platform administrator.", manualSteps: [] };
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) return { ok: false, reason: NOT_CONFIGURED_MESSAGE, manualSteps: [] };
  let created: { webhookId: string; secret: string | null };
  try {
    created = await client.createWorkspaceWebhook({ name: "AgentOS call results", url });
  } catch (e) {
    return { ok: false, reason: e instanceof ElevenLabsAgentError ? e.message : "ElevenLabs didn't accept the webhook.", manualSteps: manual };
  }
  if (!created.secret) return { ok: false, reason: "ElevenLabs created the webhook but didn't return its secret. Copy the secret from ElevenLabs and paste it here.", manualSteps: manual };
  const companyId = await currentCompanyId();
  await (await webhookCol()).updateOne({ kind: "main" }, { $set: { secret: { enc: encryptPlatformSecret(created.secret, secretContext(companyId)), last4: last4(created.secret) }, elevenWebhookId: created.webhookId, updatedAt: new Date() } });
  try {
    await client.setPostCallWebhook(created.webhookId);
  } catch (e) {
    return { ok: false, reason: `The webhook exists in ElevenLabs but couldn't be switched on: ${e instanceof ElevenLabsAgentError ? e.message : "try again"}. Select it under Agents → Settings → Post-call webhooks.`, manualSteps: [] };
  }
  await (await webhookCol()).updateOne({ kind: "main" }, { $set: { registeredAt: new Date() } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Receiving
// ---------------------------------------------------------------------------

export interface WebhookRequest {
  rawBody: string;
  signature: string | null;
  token: string | null;
  nowSecs?: number;
}
export interface WebhookResponse {
  status: 200 | 400 | 401 | 500;
  body: { ok: boolean; note?: string };
}

const UNAUTHORIZED: WebhookResponse = { status: 401, body: { ok: false } };

async function companyForToken(token: string): Promise<{ companyId: string; secret: string } | null> {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const db = await getPlatformDb();
  const cfg = await db.collection<WebhookConfig & { companyId: string }>(CALL_COLLECTIONS.webhooks).findOne({ tokenHash: sha(token) });
  if (!cfg?.companyId || !cfg.secret) return null;
  const secret = decryptPlatformSecret(cfg.secret.enc, secretContext(cfg.companyId));
  return secret ? { companyId: cfg.companyId, secret } : null;
}

interface PostCallData {
  agent_id?: string;
  conversation_id?: string;
  status?: string;
  failure_reason?: string;
  conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> };
}

/** Everything the route does, minus Next. Same answer for an unknown company and a bad signature, so the endpoint reveals nothing. */
export async function handleVoiceWebhook(req: WebhookRequest, deps: EngineDeps = {}): Promise<WebhookResponse> {
  if (!req.token || !req.signature || req.rawBody.length > 5_000_000) return UNAUTHORIZED;
  const company = await companyForToken(req.token);
  if (!company) return UNAUTHORIZED;
  if (!verifySignature(req.rawBody, req.signature, company.secret, req.nowSecs).ok) return UNAUTHORIZED;
  let event: { type?: string; data?: PostCallData };
  try {
    event = JSON.parse(req.rawBody);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  const data = event.data;
  if (!event.type || !data || typeof data !== "object" || typeof data.conversation_id !== "string") return { status: 400, body: { ok: false } };
  try {
    return await runAsCompany(company.companyId, async (): Promise<WebhookResponse> => {
      if (event.type === "post_call_transcription") {
        const detail = mapConversation(data as Parameters<typeof mapConversation>[0]);
        await linkConferenceConversation(data); // conference calls: attach this conversation to its call first (no-op for any other call)
        let r = await applyConversationUpdate({ conversationId: data.conversation_id!, agentId: data.agent_id ?? null, detail }, deps);
        if (!r.matched) {
          const made = await recordInboundCall(data, deps);
          if (made) r = await applyConversationUpdate({ conversationId: data.conversation_id!, agentId: data.agent_id ?? null, detail }, deps);
        }
        return { status: 200, body: { ok: true, note: r.matched ? "applied" : "ignored" } };
      }
      if (event.type === "call_initiation_failure") {
        const reason = data.failure_reason === "busy" ? "busy" : data.failure_reason === "no-answer" ? "no-answer" : "unknown";
        const r = await applyConversationUpdate({ conversationId: data.conversation_id!, agentId: data.agent_id ?? null, failureReason: reason }, deps);
        return { status: 200, body: { ok: true, note: r.matched ? "applied" : "ignored" } };
      }
      return { status: 200, body: { ok: true, note: "ignored" } }; // post_call_audio and anything newer: acknowledged, not stored
    });
  } catch (e) {
    console.error("[agentos voice webhook] failed", logText(e));
    return { status: 500, body: { ok: false } }; // ElevenLabs retries; applying an update twice is harmless
  }
}

/** A call that came in on a company number has no record yet: make one, but only for telephony conversations of our own agents. */
async function recordInboundCall(data: PostCallData, deps: EngineDeps): Promise<boolean> {
  const vars = data.conversation_initiation_client_data?.dynamic_variables ?? {};
  if (!data.agent_id || !data.conversation_id) return false;
  return createInboundCall({ conversationId: data.conversation_id, elevenAgentId: data.agent_id, caller: vars.system__caller_id, called: vars.system__called_number }, deps);
}
