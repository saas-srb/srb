import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { resolveUsageActor } from "@/lib/platform/billing/usage-actor";
import type { UsageActor } from "@/lib/platform/billing/usage-actor-store";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";

/**
 * Append-only history of every AI call (one row per call) with the company it ran for. Lives in the platform
 * database so the Platform Console can list usage company by company. Rows are never updated or deleted.
 */
export const AI_USAGE_COLLECTION = "ai_usage_events";

export interface AiUsageEvent {
  _id?: unknown;
  companyId: string;
  /** What the call was for, e.g. "Website generation", "CMS assistant". */
  feature: string;
  /** The API endpoint used, e.g. "chat.completions", "images.generate". */
  endpoint: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  at: Date;
  /** Who made the request (absent on rows from before per-person history). */
  actorKey?: string;
  actorKind?: string;
  actorLabel?: string;
}

type UsageLike = { total_tokens?: number; input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null | undefined;

const featureStore = new AsyncLocalStorage<string>();

/** Labels every AI call made inside `fn` with `feature` in the usage history. */
export function withAiFeature<T>(feature: string, fn: () => Promise<T>): Promise<T> {
  return featureStore.run(feature, fn);
}

/** Labels every AI call made from here on in the current request/async context. */
export function setAiFeature(feature: string): void {
  featureStore.enterWith(feature);
}

async function actorFields(given?: UsageActor): Promise<{ actorKey: string; actorKind: string; actorLabel: string }> {
  const a = given ?? (await resolveUsageActor());
  return { actorKey: a.key, actorKind: a.kind, actorLabel: a.label };
}

let indexed = false;
async function col() {
  const c = (await getPlatformDb()).collection<AiUsageEvent>(AI_USAGE_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ at: -1 }), c.createIndex({ companyId: 1, at: -1 })]).catch(() => {});
  }
  return c;
}

/** Records one AI call. Never throws — history must not break a reply. */
export async function recordAiUsage(e: { usage: UsageLike; model?: string; endpoint?: string; feature?: string; companyId?: string | null; actor?: UsageActor }): Promise<void> {
  try {
    const u = e.usage;
    if (!u) return;
    const input = u.input_tokens ?? u.prompt_tokens ?? 0;
    const output = u.output_tokens ?? u.completion_tokens ?? 0;
    const total = typeof u.total_tokens === "number" ? u.total_tokens : input + output;
    if (!(total > 0)) return;
    let companyId = e.companyId;
    if (companyId === undefined) companyId = await currentCompanyIdOrNull();
    if (!companyId) return;
    await (await col()).insertOne({
      companyId,
      feature: e.feature ?? featureStore.getStore() ?? "AI",
      endpoint: e.endpoint ?? "",
      model: e.model ?? "",
      inputTokens: input,
      outputTokens: output,
      totalTokens: total,
      at: new Date(),
      ...(await actorFields(e.actor)),
    });
  } catch (err) {
    console.error("[ai-usage] could not record", err);
  }
}

export interface CompanyAiUsage {
  companyId: string;
  name: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastAt: Date | null;
}

export async function aiUsageByCompany(): Promise<CompanyAiUsage[]> {
  const c = await col();
  const rows = await c
    .aggregate<{ _id: string; calls: number; i: number; o: number; t: number; last: Date }>([
      { $group: { _id: "$companyId", calls: { $sum: 1 }, i: { $sum: "$inputTokens" }, o: { $sum: "$outputTokens" }, t: { $sum: "$totalTokens" }, last: { $max: "$at" } } },
      { $sort: { t: -1 } },
    ])
    .toArray();
  const names = await companyNames(rows.map((r) => r._id));
  return rows.map((r) => ({ companyId: r._id, name: names.get(r._id) ?? r._id, calls: r.calls, inputTokens: r.i, outputTokens: r.o, totalTokens: r.t, lastAt: r.last }));
}

async function companyNames(ids: string[]): Promise<Map<string, string>> {
  const docs = await (await getPlatformDb()).collection<{ _id: string; name?: string }>("companies").find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray();
  return new Map(docs.map((d) => [String(d._id), d.name ?? String(d._id)]));
}

export async function aiUsageHistory(companyId: string, limit = 500): Promise<{ name: string; events: Omit<AiUsageEvent, "_id">[] }> {
  const events = await (await col()).find({ companyId }, { projection: { _id: 0 } }).sort({ at: -1 }).limit(limit).toArray();
  const name = (await companyNames([companyId])).get(companyId) ?? companyId;
  return { name, events };
}

export async function aiUsageTotals(): Promise<{ calls: number; totalTokens: number; monthTokens: number }> {
  const c = await col();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [all] = await c.aggregate<{ calls: number; t: number }>([{ $group: { _id: null, calls: { $sum: 1 }, t: { $sum: "$totalTokens" } } }]).toArray();
  const [month] = await c.aggregate<{ t: number }>([{ $match: { at: { $gte: start } } }, { $group: { _id: null, t: { $sum: "$totalTokens" } } }]).toArray();
  return { calls: all?.calls ?? 0, totalTokens: all?.t ?? 0, monthTokens: month?.t ?? 0 };
}
