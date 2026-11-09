import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { newId } from "@/lib/products/playbook-ai/db";
import type { AiSettings } from "@/lib/products/playbook-ai/pb-settings";
import type { PbActor, PbError, TemplateRef } from "@/lib/products/playbook-ai/documents-types";
import type { GuardReport } from "@/lib/products/playbook-ai/ai/generate";
import type { RawBlock } from "@/lib/products/playbook-ai/ai/schema";

/**
 * `pb_ai_runs`: one row per request to the model for a section (company-scoped like every Playbook collection): who asked, for which
 * document and section, the template version, the model, tokens, the fact guard's result, and what the author did with the proposal.
 * The proposal itself is kept here so accepting it applies exactly what was shown, never what a browser sends back.
 * The same rows are what the per-user and per-company limits count.
 */

export type RunResolution = "accepted" | "rejected" | null;

export interface AiRunRecord {
  _id: string;
  documentId: string;
  sectionKey: string;
  action: string;
  promptKey: string | null;
  typeId: string | null;
  templateRef: TemplateRef | null;
  userId: string;
  userName: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  status: "running" | "proposed" | "failed";
  error: string | null;
  guard: GuardReport | null;
  factKeys: string[];
  missing: { key: string; label: string }[];
  placeholderCount: number;
  /** Hash of the section content the proposal was made against; a changed section makes the proposal stale. */
  baseSha: string | null;
  proposal: { blocks: RawBlock[]; textBefore: string; textAfter: string } | null;
  resolution: RunResolution;
  resolutionReason: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  durationMs: number | null;
  createdAt: Date;
}

let indexesEnsured = false;
async function col() {
  const c = (await getDb()).collection<AiRunRecord>(PB_COLLECTIONS.aiRuns);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      c.createIndex({ createdAt: -1 }).catch(() => {}),
      c.createIndex({ userId: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ documentId: 1, createdAt: -1 }).catch(() => {}),
    ]);
  }
  return c;
}
export function resetAiRunIndexes(): void { indexesEnsured = false; }

/** The limits in the company's settings. Returns the error to show, or null when the request may go ahead. */
export async function checkAiLimits(actor: Pick<PbActor, "id">, ai: AiSettings, now: Date = new Date()): Promise<PbError | null> {
  if (!ai.enabled) return { code: "ai_disabled", message: "AI drafting is switched off for this workspace. An administrator can turn it on in the document settings." };
  const c = await col();
  const minuteAgo = new Date(now.getTime() - 60_000);
  const dayStart = new Date(now.getTime() - 24 * 3_600_000);
  const [perMinute, perDay, perCompany] = await Promise.all([
    c.countDocuments({ userId: actor.id, createdAt: { $gt: minuteAgo } }),
    c.countDocuments({ userId: actor.id, createdAt: { $gt: dayStart } }),
    c.countDocuments({ createdAt: { $gt: dayStart } }),
  ]);
  if (perMinute >= ai.perUserPerMinute) return { code: "rate_limited", message: `You are asking too quickly (${ai.perUserPerMinute} a minute). Wait a moment and try again.`, retryAfterSeconds: 30 };
  if (perDay >= ai.perUserPerDay) return { code: "rate_limited", message: `You have reached today's limit of ${ai.perUserPerDay} AI requests. It resets within 24 hours.`, retryAfterSeconds: 3600 };
  if (perCompany >= ai.perCompanyPerDay) return { code: "rate_limited", message: `Your workspace has reached today's limit of ${ai.perCompanyPerDay} AI requests. An administrator can raise it in the document settings.`, retryAfterSeconds: 3600 };
  return null;
}

export async function startRun(r: Pick<AiRunRecord, "documentId" | "sectionKey" | "action" | "typeId" | "templateRef" | "userId" | "userName" | "baseSha">): Promise<string> {
  const row: AiRunRecord = {
    _id: newId(), ...r, promptKey: null, model: null, inputTokens: 0, outputTokens: 0, status: "running", error: null, guard: null, factKeys: [], missing: [],
    placeholderCount: 0, proposal: null, resolution: null, resolutionReason: null, resolvedBy: null, resolvedAt: null, durationMs: null, createdAt: new Date(),
  };
  await (await col()).insertOne(row);
  return row._id;
}

export async function finishRun(id: string, patch: Partial<Omit<AiRunRecord, "_id">>): Promise<void> {
  await (await col()).updateOne({ _id: id }, { $set: patch });
}

export async function getRun(id: string): Promise<AiRunRecord | null> {
  return (await col()).findOne({ _id: id });
}

/** Marks a proposal accepted or rejected, once. Returns false when it was already resolved (or is not a proposal). */
export async function resolveRun(id: string, by: string, resolution: "accepted" | "rejected", reason: string | null): Promise<boolean> {
  const r = await (await col()).updateOne({ _id: id, status: "proposed", resolution: null }, { $set: { resolution, resolutionReason: reason, resolvedBy: by, resolvedAt: new Date() } });
  return r.modifiedCount === 1;
}

export async function listRuns(documentId: string, limit = 50): Promise<Omit<AiRunRecord, "proposal">[]> {
  return (await col()).find({ documentId }, { projection: { proposal: 0 } }).sort({ createdAt: -1 }).limit(Math.min(limit, 200)).toArray() as Promise<Omit<AiRunRecord, "proposal">[]>;
}
