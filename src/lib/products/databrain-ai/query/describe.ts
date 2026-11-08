import type { FieldRef, ResolvedPlan } from "@/lib/products/databrain-ai/query/validate";

/**
 * A human-readable account of what a validated plan does — the "How this was
 * calculated" product. Built from the resolved plan (never from the model's own
 * description), so it shows what was actually run.
 */

export interface PlanDescription {
  entity: string;
  entityLabel: string;
  /** e.g. "Sum of Total amount". */
  measures: string[];
  /** e.g. "Invoice date (by month)". */
  groupedBy: string[];
  /** e.g. "Status is one of sent, paid". */
  filters: string[];
  joins: string[];
  limit: number;
}

const name = (r: FieldRef, rp: ResolvedPlan) => {
  if (r.scope === "own") return r.def.label;
  const rel = rp.joins.find((j) => j.rel.key === r.scope)?.rel;
  return `${rel?.label ?? r.scope} › ${r.def.label}`;
};

const fmtVal = (v: unknown): string => (Array.isArray(v) ? v.join(" and ") : String(v));
const OP_TEXT: Record<string, string> = { eq: "is", neq: "is not", in: "is one of", gt: "is after/above", gte: "is at least", lt: "is before/below", lte: "is at most", between: "is between", contains: "contains" };

export function describePlan(rp: ResolvedPlan): PlanDescription {
  return {
    entity: rp.entity.def.key,
    entityLabel: rp.entity.def.label,
    measures:
      rp.mode === "group"
        ? rp.aggs.map((a) => (a.op === "count" ? "Number of records" : `${{ sum: "Sum", avg: "Average", min: "Lowest", max: "Highest", count_distinct: "Distinct count" }[a.op]} of ${name(a.ref!, rp)}`))
        : [`Listed: ${rp.dims.map((d) => name(d.ref, rp)).join(", ")}`],
    groupedBy: rp.mode === "group" ? rp.dims.map((d) => `${name(d.ref, rp)}${d.bucket ? ` (by ${d.bucket})` : ""}`) : [],
    filters: rp.filters.map((f) => (f.op === "is_null" ? `${name(f.ref, rp)} ${f.value ? "is empty" : "has a value"}` : `${name(f.ref, rp)} ${OP_TEXT[f.op]} ${fmtVal(f.value)}`)),
    joins: rp.joins.map((j) => j.rel.label),
    limit: rp.limit,
  };
}
