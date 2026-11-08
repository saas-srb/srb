import "server-only";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { getBot } from "@/lib/products/agentos/bots";
import { newId } from "@/lib/products/agentos/db";
import { recordAudit } from "@/lib/products/agentos/audit";
import { agentProblem } from "@/lib/products/agentos/calls/guards";
import { maskPhone, normalizeE164 } from "@/lib/products/agentos/calls/phone";
import { isDuplicateKey, numbersCollection } from "@/lib/products/agentos/calls/store";
import type { PhoneNumberDoc } from "@/lib/products/agentos/calls/types";
import { AibotsInputError, ForbiddenError, NotFoundError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { ElevenLabsAgentError, type AgentClient } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { NOT_CONFIGURED_MESSAGE, workspaceAgentClient } from "@/lib/products/agentos/voice/connection";

/**
 * The company's phone numbers: the company's OWN Twilio account (Settings → Integrations) imported into its ElevenLabs account.
 * SelfRun's shared Twilio account is never used for this: a number belongs to the company that owns the Twilio account.
 * Secrets (account SID, auth token) are read from the connection store, sent to ElevenLabs once and never logged or stored here.
 */

export interface NumberDeps {
  client?: () => Promise<AgentClient | null>;
  /** The company's own Twilio credentials, or null. Default: the saved Twilio connection (workspace-owned only). */
  twilio?: () => Promise<{ accountSid: string; authToken: string } | null>;
}

export async function ownTwilio(): Promise<{ accountSid: string; authToken: string } | null> {
  const c = await resolveConnection("twilio");
  if (!c || c.source !== "workspace" || !c.values.accountSid || !c.values.authToken) return null;
  return { accountSid: c.values.accountSid, authToken: c.values.authToken };
}

export interface PhoneNumberView {
  id: string;
  /** Full number for staff who manage numbers; masked elsewhere. */
  number: string;
  masked: string;
  label: string;
  provider: "twilio";
  supportsOutbound: boolean;
  supportsInbound: boolean;
  assignedAgentId: string | null;
  createdAt: string;
}

const toView = (d: PhoneNumberDoc): PhoneNumberView => ({ id: d._id, number: d.number, masked: maskPhone(d.number), label: d.label, provider: d.provider, supportsOutbound: d.supportsOutbound, supportsInbound: d.supportsInbound, assignedAgentId: d.assignedAgentId, createdAt: d.createdAt.toISOString() });

const need = (viewer: AibotsViewer) => {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
};
const elevenError = (e: unknown, fallback: string) => new AibotsInputError(e instanceof ElevenLabsAgentError ? e.message : fallback);

/** Imports a number from the company's Twilio account into ElevenLabs and stores it. */
export async function importTwilioNumber(viewer: AibotsViewer, input: { number: string; label: string }, deps: NumberDeps = {}): Promise<PhoneNumberView> {
  need(viewer);
  const number = normalizeE164(input.number);
  if (!number) throw new AibotsInputError("Enter the Twilio number with its country code, for example +91 80 1234 5678.");
  const label = typeof input.label === "string" ? input.label.trim().slice(0, 80) : "";
  if (!label) throw new AibotsInputError("Give this number a name your team will recognise.");
  const twilio = await (deps.twilio ?? ownTwilio)();
  if (!twilio) throw new AibotsInputError("Connect your own Twilio account first (Settings → Integrations → Twilio). Phone numbers are imported from your account.");
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) throw new AibotsInputError(NOT_CONFIGURED_MESSAGE);
  const col = await numbersCollection();
  if (await col.findOne({ number }, { projection: { _id: 1 } })) throw new AibotsInputError("This number is already added.");
  let phoneNumberId: string;
  try {
    ({ phoneNumberId } = await client.importTwilioNumber({ phoneNumber: number, label, sid: twilio.accountSid, token: twilio.authToken }));
  } catch (e) {
    throw elevenError(e, "Couldn't import the number into ElevenLabs. Try again.");
  }
  const now = new Date();
  const doc: PhoneNumberDoc = { _id: newId(), number, label, provider: "twilio", elevenPhoneNumberId: phoneNumberId, supportsOutbound: true, supportsInbound: true, assignedAgentId: null, status: "active", createdAt: now, updatedAt: now, createdBy: viewer.userId };
  try {
    await col.insertOne(doc);
  } catch (e) {
    await client.deletePhoneNumber(phoneNumberId).catch(() => {}); // a racing import won: don't leave an orphan on ElevenLabs
    if (isDuplicateKey(e)) throw new AibotsInputError("This number is already added.");
    throw e;
  }
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "create", entity: "number", entityId: doc._id, entityLabel: label, summary: `Added phone number …${number.slice(-4)}` });
  return toView(doc);
}

/** Numbers for the people who manage them. */
export async function listPhoneNumbers(viewer: AibotsViewer): Promise<PhoneNumberView[]> {
  need(viewer);
  return (await (await numbersCollection()).find({}).sort({ createdAt: 1 }).limit(100).toArray()).map(toView);
}

/** Whether calls can go out at all: lets a "Call" button explain itself without exposing numbers. */
export async function hasOutboundNumber(): Promise<boolean> {
  return Boolean(await (await numbersCollection()).findOne({ supportsOutbound: true, status: "active" }, { projection: { _id: 1 } }));
}

/** Points the number at a voice agent (inbound calls), or at nobody. One number answers with one agent. */
export async function assignInboundAgent(viewer: AibotsViewer, numberId: string, agentId: string | null, deps: NumberDeps = {}): Promise<PhoneNumberView> {
  need(viewer);
  const col = await numbersCollection();
  const doc = await col.findOne({ _id: String(numberId).slice(0, 64) });
  if (!doc) throw new NotFoundError();
  let elevenAgentId: string | null = null;
  if (agentId) {
    const bot = await getBot(String(agentId).slice(0, 64));
    const problem = agentProblem(bot);
    if (problem) throw new AibotsInputError(problem);
    elevenAgentId = bot!.voice!.elevenAgentId;
  }
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) throw new AibotsInputError(NOT_CONFIGURED_MESSAGE);
  try {
    await client.assignPhoneNumber(doc.elevenPhoneNumberId, elevenAgentId);
  } catch (e) {
    throw elevenError(e, "Couldn't update the number on ElevenLabs. Try again.");
  }
  const next = await col.findOneAndUpdate({ _id: doc._id }, { $set: { assignedAgentId: agentId ? String(agentId) : null, updatedAt: new Date() } }, { returnDocument: "after" });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "number", entityId: doc._id, entityLabel: doc.label, botId: agentId, summary: agentId ? "Assigned the number to an agent for inbound calls" : "Unassigned the number" });
  return toView(next!);
}

/** Removes the number from ElevenLabs and from the workspace. The Twilio number itself stays in the company's Twilio account. */
export async function removePhoneNumber(viewer: AibotsViewer, numberId: string, deps: NumberDeps = {}): Promise<void> {
  need(viewer);
  const col = await numbersCollection();
  const doc = await col.findOne({ _id: String(numberId).slice(0, 64) });
  if (!doc) throw new NotFoundError();
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) throw new AibotsInputError(NOT_CONFIGURED_MESSAGE);
  try {
    await client.deletePhoneNumber(doc.elevenPhoneNumberId);
  } catch (e) {
    if (!(e instanceof ElevenLabsAgentError && e.code === "not_found")) throw elevenError(e, "Couldn't remove the number from ElevenLabs. Try again.");
  }
  await col.deleteOne({ _id: doc._id });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "delete", entity: "number", entityId: doc._id, entityLabel: doc.label, summary: `Removed phone number …${doc.number.slice(-4)}` });
}
