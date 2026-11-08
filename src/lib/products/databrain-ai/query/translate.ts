import type { Document } from "mongodb";
import type { FieldDef } from "@/lib/products/databrain-ai/catalog/types";
import type { FieldRef, ResolvedPlan } from "@/lib/products/databrain-ai/query/validate";
import type { Bucket, Scalar } from "@/lib/products/databrain-ai/query/plan";
import { LIMITS } from "@/lib/products/databrain-ai/query/plan";
import { addDays, zonedDayStart } from "@/lib/products/databrain-ai/dates";

/**
 * Turns a validated, resolved plan into a FIXED-SHAPE, READ-ONLY aggregation.
 * Every field path comes from the catalog (never from the model's text), every
 * value is a plain scalar placed in an equality/range/escaped-regex condition,
 * and the pipeline only ever contains the allowlisted stages below. It starts
 * with the entity's base filter (soft-deleted rows excluded) and runs through
 * the company-scoped `getDb()`, which adds the company match on top.
 */

export interface ExecSpec {
  collection: string;
  pipeline: Document[];
  options: { maxTimeMS: number; allowDiskUse: boolean };
  /** One more than the plan's limit, so the executor can tell whether rows were cut off. */
  fetchLimit: number;
}

export interface TranslateContext {
  today: string;
  timezone: string;
}

const ALLOWED_STAGES = new Set(["$match", "$addFields", "$lookup", "$unwind", "$group", "$project", "$sort", "$limit"]);
const FORBIDDEN_KEYS = new Set(["$where", "$function", "$accumulator", "$out", "$merge", "$unionWith", "$graphLookup", "$facet", "$expr", "$set", "$replaceRoot", "$replaceWith"]);

/** Defence in depth, run before every execution: only allowlisted stages, and no forbidden operator anywhere (also inside lookups). Throws on violation. */
export function assertSafePipeline(pipeline: readonly Document[]): void {
  const walkKeys = (v: unknown, path: string) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walkKeys(x, `${path}[${i}]`));
    if (v && typeof v === "object" && !(v instanceof Date)) {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(k)) throw new Error(`Forbidden operator ${k} in query pipeline`);
        walkKeys(child, `${path}.${k}`);
      }
    }
  };
  const walkStages = (stages: readonly Document[]) => {
    for (const stage of stages) {
      const keys = Object.keys(stage);
      if (keys.length !== 1 || !ALLOWED_STAGES.has(keys[0])) throw new Error(`Stage ${keys.join(",")} is not allowed in a query pipeline`);
      if (keys[0] === "$lookup" && Array.isArray(stage.$lookup?.pipeline)) walkStages(stage.$lookup.pipeline);
    }
  };
  walkStages(pipeline);
  walkKeys(pipeline, "pipeline");
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const computedName = (key: string) => `__c_${key}`;
const joinedName = (rel: string) => `__j_${rel}`;

function refPath(ref: FieldRef): string {
  if (ref.scope === "own") return ref.def.expr ? `$${computedName(ref.def.key)}` : `$${ref.def.path}`;
  return `$${joinedName(ref.scope)}.${ref.def.key}`;
}
/** Path (no `$`) for query conditions. */
const condPath = (ref: FieldRef): string => refPath(ref).slice(1);

const tzOf = (def: FieldDef, tz: string) => (def.storage === "isoDate" ? "UTC" : tz);

/** An expression yielding a Date for a date field, whichever way it is stored. */
function dateValue(ref: FieldRef): unknown {
  const p = refPath(ref);
  if (ref.def.storage !== "isoDate") return p;
  return { $cond: [{ $eq: [{ $type: p }, "string"] }, { $dateFromString: { dateString: p, format: "%Y-%m-%d", onError: null, onNull: null } }, null] };
}

function bucketLabel(ref: FieldRef, bucket: Bucket, tz: string): unknown {
  const date = dateValue(ref);
  const timezone = tzOf(ref.def, tz);
  switch (bucket) {
    case "day":
      return { $dateToString: { date, format: "%Y-%m-%d", timezone } };
    case "week":
      return { $dateToString: { date, format: "%G-W%V", timezone } };
    case "month":
      return { $dateToString: { date, format: "%Y-%m", timezone } };
    case "year":
      return { $dateToString: { date, format: "%Y", timezone } };
    case "quarter":
      return {
        $let: {
          vars: { y: { $year: { date, timezone } }, m: { $month: { date, timezone } } },
          in: { $concat: [{ $toString: "$$y" }, "-Q", { $toString: { $toInt: { $ceil: { $divide: ["$$m", 3] } } } }] },
        },
      };
  }
}

/** A column's value as it leaves the pipeline: real dates become yyyy-mm-dd in the company time zone. */
function outputValue(ref: FieldRef, tz: string): unknown {
  if (ref.def.type === "date" && ref.def.storage !== "isoDate") return { $dateToString: { date: refPath(ref), format: "%Y-%m-%d", timezone: tz } };
  return refPath(ref);
}

function condition(ref: FieldRef, op: string, value: Scalar | Scalar[], tz: string): Document {
  const field = ref.def;
  const path = condPath(ref);
  if (op === "is_null") return { [path]: value === true ? { $eq: null } : { $ne: null } };
  if (field.type === "date" && field.storage !== "isoDate") {
    const start = (d: string) => zonedDayStart(d, tz);
    const next = (d: string) => zonedDayStart(addDays(d, 1), tz);
    switch (op) {
      case "eq":
        return { [path]: { $gte: start(value as string), $lt: next(value as string) } };
      case "gt":
        return { [path]: { $gte: next(value as string) } };
      case "gte":
        return { [path]: { $gte: start(value as string) } };
      case "lt":
        return { [path]: { $lt: start(value as string) } };
      case "lte":
        return { [path]: { $lt: next(value as string) } };
      case "between": {
        const [a, b] = value as string[];
        return { [path]: { $gte: start(a), $lt: next(b) } };
      }
    }
  }
  switch (op) {
    case "eq":
      return { [path]: { $eq: value } };
    case "neq":
      return { [path]: { $ne: value } };
    case "in":
      return { [path]: { $in: value } };
    case "gt":
      return { [path]: { $gt: value } };
    case "gte":
      return { [path]: { $gte: value } };
    case "lt":
      return { [path]: { $lt: value } };
    case "lte":
      return { [path]: { $lte: value } };
    case "between": {
      const [a, b] = value as Scalar[];
      return { [path]: { $gte: a, $lte: b } };
    }
    case "contains":
      return { [path]: { $regex: escapeRegex(value as string), $options: "i" } };
  }
  throw new Error(`Unsupported operator ${op}`);
}

export function translate(rp: ResolvedPlan, ctx: TranslateContext): ExecSpec {
  const tz = ctx.timezone;
  const { entity } = rp;
  const pipeline: Document[] = [];

  // Every field reference the plan makes, in one place.
  const refs: FieldRef[] = [...rp.dims.map((d) => d.ref), ...rp.aggs.flatMap((a) => (a.ref ? [a.ref] : [])), ...rp.filters.map((f) => f.ref)];
  const ownComputed = new Map<string, FieldDef>();
  for (const r of refs) if (r.scope === "own" && r.def.expr) ownComputed.set(r.def.key, r.def);

  const ownDirect = rp.filters.filter((f) => f.ref.scope === "own" && !f.ref.def.expr).map((f) => condition(f.ref, f.op, f.value, tz));
  pipeline.push({ $match: { $and: [entity.def.baseFilter, ...ownDirect] } });

  if (ownComputed.size > 0) {
    pipeline.push({ $addFields: Object.fromEntries([...ownComputed.values()].map((d) => [computedName(d.key), d.expr!({ today: ctx.today })])) });
    const conds = rp.filters.filter((f) => f.ref.scope === "own" && f.ref.def.expr).map((f) => condition(f.ref, f.op, f.value, tz));
    if (conds.length > 0) pipeline.push({ $match: { $and: conds } });
  }

  for (const { rel, target } of rp.joins) {
    const used = new Map<string, FieldDef>();
    for (const r of refs) if (r.scope === rel.key) used.set(r.def.key, r.def);
    if (used.size === 0) continue;
    const inner: Document[] = [{ $match: target.def.baseFilter }];
    const computed = [...used.values()].filter((d) => d.expr);
    if (computed.length > 0) inner.push({ $addFields: Object.fromEntries(computed.map((d) => [computedName(d.key), d.expr!({ today: ctx.today })])) });
    inner.push({ $project: { _id: 0, ...Object.fromEntries([...used.values()].map((d) => [d.key, d.expr ? `$${computedName(d.key)}` : `$${d.path}`])) } });
    pipeline.push({ $lookup: { from: target.def.collection, localField: rel.localField, foreignField: rel.foreignField, pipeline: inner, as: joinedName(rel.key) } });
    pipeline.push({ $unwind: { path: `$${joinedName(rel.key)}`, preserveNullAndEmptyArrays: true } });
  }

  const joinedConds = rp.filters.filter((f) => f.ref.scope !== "own").map((f) => condition(f.ref, f.op, f.value, tz));
  if (joinedConds.length > 0) pipeline.push({ $match: { $and: joinedConds } });

  if (rp.mode === "group") {
    const group: Document = {
      _id: rp.dims.length === 0 ? null : Object.fromEntries(rp.dims.map((d, i) => [`d${i}`, d.bucket ? bucketLabel(d.ref, d.bucket, tz) : d.ref.def.type === "date" && d.ref.def.storage !== "isoDate" ? outputValue(d.ref, tz) : refPath(d.ref)])),
    };
    const out: Document = { _id: 0 };
    rp.dims.forEach((d, i) => (out[d.key] = `$_id.d${i}`));
    rp.aggs.forEach((a, i) => {
      const name = `a${i}`;
      const p = a.ref ? refPath(a.ref) : null;
      switch (a.op) {
        case "count":
          group[name] = { $sum: 1 };
          out[a.key] = `$${name}`;
          break;
        case "sum":
          group[name] = { $sum: p };
          out[a.key] = `$${name}`;
          break;
        case "avg":
          group[name] = { $avg: p };
          out[a.key] = `$${name}`;
          break;
        case "min":
        case "max":
          group[name] = { [a.op === "min" ? "$min" : "$max"]: p };
          out[a.key] = a.ref!.def.type === "date" && a.ref!.def.storage !== "isoDate" ? { $dateToString: { date: `$${name}`, format: "%Y-%m-%d", timezone: tz } } : `$${name}`;
          break;
        case "count_distinct":
          group[name] = { $addToSet: p };
          out[a.key] = { $size: { $filter: { input: `$${name}`, as: "v", cond: { $ne: ["$$v", null] } } } };
          break;
      }
    });
    pipeline.push({ $group: group }, { $project: out });
  } else {
    const out: Document = { _id: 0 };
    rp.dims.forEach((d) => (out[d.key] = outputValue(d.ref, tz)));
    pipeline.push({ $project: out });
  }

  if (rp.sort.length > 0) pipeline.push({ $sort: Object.fromEntries(rp.sort.map((s) => [s.key, s.dir])) });
  pipeline.push({ $limit: rp.limit + 1 });

  assertSafePipeline(pipeline);
  return { collection: entity.def.collection, pipeline, options: { maxTimeMS: LIMITS.maxTimeMS, allowDiskUse: true }, fetchLimit: rp.limit + 1 };
}
