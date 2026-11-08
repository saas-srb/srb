import "server-only";
import { getDb } from "@/lib/mongodb";
import type { CatalogView } from "@/lib/products/databrain-ai/catalog/types";
import { PlanError, type QueryPlan, type Scalar } from "@/lib/products/databrain-ai/query/plan";
import { validatePlan, type ResolvedPlan, type ResultColumn } from "@/lib/products/databrain-ai/query/validate";
import { translate, type ExecSpec } from "@/lib/products/databrain-ai/query/translate";
import { isoDay } from "@/lib/products/databrain-ai/dates";
import { describePlan, type PlanDescription } from "@/lib/products/databrain-ai/query/describe";

/**
 * Validate → translate → run (read-only aggregation through the company-scoped
 * `getDb()`) → clean the rows. This module has no write path: the only driver
 * call is `aggregate()` on a pipeline that `translate()` built and
 * `assertSafePipeline()` approved.
 */

export type Row = Record<string, Scalar>;

export interface QueryResult {
  queryId: string;
  entity: string;
  columns: ResultColumn[];
  /** At most `limit` rows (never more than 500). */
  rows: Row[];
  rowCount: number;
  /** More rows matched than the limit allowed. */
  truncated: boolean;
  /** Column sums for count/sum columns — only present when nothing was cut off. */
  totals: Record<string, number> | null;
  plan: QueryPlan;
  description: PlanDescription;
  durationMs: number;
}

export type RunOutcome = { ok: true; result: QueryResult } | { ok: false; code: "invalid" | "unknown_entity" | "denied" | "unknown_field" | "failed" | "timeout"; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

function cleanRows(raw: Record<string, unknown>[], rp: ResolvedPlan, tz: string): Row[] {
  const money = new Set(rp.columns.filter((c) => c.type === "money").map((c) => c.key));
  return raw.map((doc) => {
    const row: Row = {};
    for (const c of rp.columns) {
      let v = doc[c.key] as unknown;
      if (v === undefined) v = null;
      if (v instanceof Date) v = isoDay(v, tz);
      else if (typeof v === "number" && money.has(c.key)) v = round2(v);
      else if (typeof v === "number" && !Number.isFinite(v)) v = null;
      else if (v !== null && typeof v === "object") v = String(v);
      row[c.key] = v as Scalar;
    }
    return row;
  });
}

function emptyAggregateRow(rp: ResolvedPlan): Row {
  const row: Row = {};
  for (const a of rp.aggs) row[a.key] = a.op === "count" || a.op === "sum" || a.op === "count_distinct" ? 0 : null;
  return row;
}

function totalsOf(rp: ResolvedPlan, rows: Row[]): Record<string, number> | null {
  if (rp.mode !== "group" || rows.length === 0) return null;
  const out: Record<string, number> = {};
  for (const a of rp.aggs) {
    if (a.op !== "count" && a.op !== "sum") continue;
    out[a.key] = round2(rows.reduce((s, r) => s + (typeof r[a.key] === "number" ? (r[a.key] as number) : 0), 0));
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Test seam: how a spec is run. Production always uses the company-scoped database. */
export async function runSpec(spec: ExecSpec): Promise<Record<string, unknown>[]> {
  const col = (await getDb()).collection(spec.collection);
  return col.aggregate(spec.pipeline, spec.options).toArray();
}

export function isTimeout(err: unknown): boolean {
  const e = err as { code?: number; codeName?: string; message?: string };
  return e?.code === 50 || e?.codeName === "MaxTimeMSExpired" || /operation exceeded time limit/i.test(e?.message ?? "");
}

export async function runPlan(view: CatalogView, rawPlan: unknown, queryId: string): Promise<RunOutcome> {
  const started = Date.now();
  let rp: ResolvedPlan;
  try {
    rp = validatePlan(view, rawPlan);
  } catch (err) {
    if (err instanceof PlanError) return { ok: false, code: err.code, error: err.message };
    throw err;
  }
  try {
    const spec = translate(rp, { today: view.today, timezone: view.timezone });
    const raw = await runSpec(spec);
    const truncated = raw.length > rp.limit;
    let rows = cleanRows(truncated ? raw.slice(0, rp.limit) : raw, rp, view.timezone);
    if (rp.mode === "group" && rp.dims.length === 0 && rows.length === 0) rows = [emptyAggregateRow(rp)];
    return {
      ok: true,
      result: {
        queryId,
        entity: rp.entity.def.key,
        columns: rp.columns,
        rows,
        rowCount: rows.length,
        truncated,
        totals: truncated ? null : totalsOf(rp, rows),
        plan: rp.plan,
        description: describePlan(rp),
        durationMs: Date.now() - started,
      },
    };
  } catch (err) {
    if (isTimeout(err)) return { ok: false, code: "timeout", error: "That query took too long. Narrow it (a shorter date range or an extra filter) and try again." };
    console.error("[intelligence] query failed", err instanceof Error ? err.message : err);
    return { ok: false, code: "failed", error: "The query could not be run. Try a simpler plan." };
  }
}

/** What the model is shown about a result: at most 60 rows plus totals (never the full 500). */
export const MODEL_ROWS = 60;
export function resultForModel(r: QueryResult): Record<string, unknown> {
  return {
    queryId: r.queryId,
    entity: r.entity,
    columns: r.columns.map((c) => ({ key: c.key, label: c.label, type: c.type === "money" ? "money_rupees" : c.type })),
    rows: r.rows.slice(0, MODEL_ROWS),
    rowCount: r.rowCount,
    rowsShown: Math.min(r.rowCount, MODEL_ROWS),
    ...(r.rowCount > MODEL_ROWS ? { note: `Only the first ${MODEL_ROWS} rows are shown to you; a table or chart block will show all ${r.rowCount}.` } : {}),
    truncated: r.truncated,
    ...(r.truncated ? { warning: "More rows matched than the limit; the numbers cover only the rows returned." } : {}),
    totals: r.totals,
  };
}
