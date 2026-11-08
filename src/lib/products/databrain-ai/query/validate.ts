import { ENTITIES } from "@/lib/products/databrain-ai/catalog/registry";
import type { CatalogView, FieldDef, FieldType, RelationDef, ViewEntity } from "@/lib/products/databrain-ai/catalog/types";
import { AGG_OPS, LIMITS, PlanError, parsePlan, type AggOp, type Bucket, type FilterOp, type QueryPlan, type Scalar } from "@/lib/products/databrain-ai/query/plan";
import { isRealDay } from "@/lib/products/databrain-ai/dates";

/**
 * Validates a query plan against the user's CATALOG VIEW and resolves it into
 * a `ResolvedPlan` the translator can turn into a fixed-shape aggregation.
 * Everything is looked up in the view: an entity, field or relation that is
 * not there (unknown, sensitive, or not granted to this user) is rejected with
 * a clear message — it never reaches the database. Values are typed per field
 * and are only ever plain scalars: no value is interpreted as a Mongo
 * operator, expression or regex.
 */

export type ColumnType = FieldType | "period";

export interface ResultColumn {
  key: string;
  label: string;
  type: ColumnType;
  unit?: "rupees";
}

export interface FieldRef {
  /** As the model wrote it ("status" or "project.name"). */
  ref: string;
  /** "own" or the relation key it is reached through. */
  scope: string;
  def: FieldDef;
}

export interface ResolvedPlan {
  plan: QueryPlan;
  entity: ViewEntity;
  mode: "list" | "group";
  /** Joined relations, in order (each with the target entity as the user sees it). */
  joins: { rel: RelationDef; target: ViewEntity }[];
  dims: { ref: FieldRef; bucket?: Bucket; key: string }[];
  aggs: { op: AggOp; ref?: FieldRef; key: string }[];
  filters: { ref: FieldRef; op: FilterOp; value: Scalar | Scalar[] }[];
  sort: { key: string; dir: 1 | -1 }[];
  limit: number;
  columns: ResultColumn[];
}

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");

const OPS_BY_TYPE: Record<FieldType, readonly FilterOp[]> = {
  string: ["eq", "neq", "in", "contains", "is_null"],
  enum: ["eq", "neq", "in", "is_null"],
  id: ["eq", "neq", "in", "is_null"],
  number: ["eq", "neq", "in", "gt", "gte", "lt", "lte", "between", "is_null"],
  money: ["eq", "neq", "in", "gt", "gte", "lt", "lte", "between", "is_null"],
  date: ["eq", "gt", "gte", "lt", "lte", "between", "is_null"],
  boolean: ["eq", "neq", "is_null"],
};

function availableList(fields: ReadonlyMap<string, FieldDef>): string {
  return [...fields.keys()].join(", ");
}

export function resolveEntity(view: CatalogView, key: string): ViewEntity {
  const e = view.entities.get(key);
  if (e) return e;
  if (ENTITIES.some((d) => d.key === key)) {
    throw new PlanError(`Entity "${key}" is not available to this user (their access permissions or this workspace's plan do not include it). Do not retry it; tell the user it is not available because of their access.`, "denied");
  }
  throw new PlanError(`Unknown entity "${key}". Available: ${[...view.entities.keys()].join(", ")}.`, "unknown_entity");
}

class Resolver {
  readonly joined = new Map<string, { rel: RelationDef; target: ViewEntity }>();
  constructor(
    private readonly view: CatalogView,
    private readonly entity: ViewEntity,
  ) {}

  field(ref: string): FieldRef {
    const dot = ref.indexOf(".");
    if (dot < 0) {
      const def = this.entity.fields.get(ref);
      if (!def) throw new PlanError(`Field "${ref}" is not available on "${this.entity.def.key}". Available fields: ${availableList(this.entity.fields)}.`, "unknown_field");
      return { ref, scope: "own", def };
    }
    const relKey = ref.slice(0, dot);
    const fieldKey = ref.slice(dot + 1);
    const rel = this.entity.relations.get(relKey);
    if (!rel) {
      const declared = this.entity.def.relations.some((r) => r.key === relKey);
      throw new PlanError(
        declared
          ? `Relation "${relKey}" is not available to this user. Do not retry it; tell the user it is not available because of their access.`
          : `"${this.entity.def.key}" has no relation "${relKey}". Relations: ${[...this.entity.relations.keys()].join(", ") || "none"}.`,
        declared ? "denied" : "unknown_field",
      );
    }
    const target = this.view.entities.get(rel.to);
    if (!target) throw new PlanError(`Relation "${relKey}" is not available to this user.`, "denied");
    const def = target.fields.get(fieldKey);
    if (!def) throw new PlanError(`Field "${fieldKey}" is not available on "${rel.to}" (via ${relKey}). Available fields: ${availableList(target.fields)}.`, "unknown_field");
    if (!this.joined.has(relKey)) {
      if (this.joined.size >= LIMITS.maxJoins) throw new PlanError(`At most ${LIMITS.maxJoins} joins are allowed.`);
      this.joined.set(relKey, { rel, target });
    }
    return { ref, scope: relKey, def };
  }
}

function typedValue(field: FieldDef, op: FilterOp, raw: unknown, where: string): Scalar | Scalar[] {
  const one = (v: unknown): Scalar => {
    if (v !== null && typeof v === "object") throw new PlanError(`${where}: values must be plain strings, numbers or booleans.`);
    switch (field.type) {
      case "number":
      case "money":
        if (typeof v !== "number" || !Number.isFinite(v)) throw new PlanError(`${where}: "${field.key}" needs a number.`);
        return v;
      case "boolean":
        if (typeof v !== "boolean") throw new PlanError(`${where}: "${field.key}" needs true or false.`);
        return v;
      case "date":
        if (typeof v !== "string" || !isRealDay(v)) throw new PlanError(`${where}: "${field.key}" needs a date as yyyy-mm-dd.`);
        return v;
      case "enum": {
        if (typeof v !== "string") throw new PlanError(`${where}: "${field.key}" needs a text value.`);
        const hit = field.enumValues?.find((e) => e.value === v || norm(e.value) === norm(v) || norm(e.label) === norm(v));
        if (!hit) throw new PlanError(`${where}: "${v.slice(0, 40)}" is not a valid value of "${field.key}". Valid: ${field.enumValues?.map((e) => e.value).join(", ")}.`);
        return hit.value;
      }
      default:
        if (typeof v !== "string") throw new PlanError(`${where}: "${field.key}" needs a text value.`);
        if (v.length > LIMITS.maxStringValue) throw new PlanError(`${where}: value is too long.`);
        return v;
    }
  };
  switch (op) {
    case "is_null":
      if (typeof raw !== "boolean") throw new PlanError(`${where}: is_null needs true (is empty) or false (has a value).`);
      return raw;
    case "in": {
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > LIMITS.maxInValues) throw new PlanError(`${where}: "in" needs a non-empty array (max ${LIMITS.maxInValues}).`);
      return raw.map(one);
    }
    case "between": {
      if (!Array.isArray(raw) || raw.length !== 2) throw new PlanError(`${where}: "between" needs [from, to].`);
      const [a, b] = raw.map(one);
      if ((a as string | number) > (b as string | number)) throw new PlanError(`${where}: "between" needs from <= to.`);
      return [a, b];
    }
    case "contains": {
      const v = one(raw);
      if (typeof v !== "string" || v.length === 0 || v.length > 100) throw new PlanError(`${where}: "contains" needs a short text value.`);
      return v;
    }
    default:
      if (raw === undefined || raw === null || Array.isArray(raw)) throw new PlanError(`${where}: "${op}" needs a single value.`);
      return one(raw);
  }
}

function aggColumnType(op: AggOp, field?: FieldDef): { type: ColumnType; unit?: "rupees" } {
  if (op === "count" || op === "count_distinct") return { type: "number" };
  const t = field!.type;
  if (op === "avg" || op === "sum") return t === "money" ? { type: "money", unit: "rupees" } : { type: "number" };
  return t === "money" ? { type: "money", unit: "rupees" } : { type: t === "date" ? "date" : "number" };
}

export function validatePlan(view: CatalogView, rawPlan: unknown): ResolvedPlan {
  const plan = parsePlan(rawPlan);
  const entity = resolveEntity(view, plan.entity);
  const r = new Resolver(view, entity);

  // Explicit joins first (so an explicit unknown relation is reported clearly).
  for (const j of plan.joins) {
    const rel = entity.relations.get(j);
    if (!rel) {
      const declared = entity.def.relations.some((x) => x.key === j);
      throw new PlanError(declared ? `Relation "${j}" is not available to this user. Do not retry it; tell the user it is not available because of their access.` : `"${entity.def.key}" has no relation "${j}". Relations: ${[...entity.relations.keys()].join(", ") || "none"}.`, declared ? "denied" : "unknown_field");
    }
    const target = view.entities.get(rel.to);
    if (!target) throw new PlanError(`Relation "${j}" is not available to this user.`, "denied");
    if (!r.joined.has(j)) r.joined.set(j, { rel, target });
  }

  const mode: ResolvedPlan["mode"] = plan.aggregates.length > 0 ? "group" : "list";
  if (mode === "list" && plan.select.length === 0) throw new PlanError("Choose at least one field to select, or add an aggregate.");
  const used = new Set<string>();
  const claim = (key: string, where: string) => {
    if (!KEY_RE.test(key)) throw new PlanError(`${where}: output name "${key}" must be letters, digits or underscore, starting with a letter.`);
    if (used.has(key)) throw new PlanError(`${where}: output name "${key}" is used twice.`);
    used.add(key);
    return key;
  };

  const dims: ResolvedPlan["dims"] = [];
  const columns: ResultColumn[] = [];
  for (const [i, s] of plan.select.entries()) {
    const where = `select[${i}]`;
    const ref = r.field(s.field);
    if (mode === "group" && !ref.def.groupable) throw new PlanError(`${where}: "${s.field}" cannot be grouped by.`);
    if (s.bucket && ref.def.type !== "date") throw new PlanError(`${where}: bucket only applies to date fields.`);
    if (s.bucket && mode === "list") throw new PlanError(`${where}: bucket needs at least one aggregate (it groups rows).`);
    const key = claim(s.as ?? `${s.field.replace(/\./g, "_")}${s.bucket ? `_${s.bucket}` : ""}`, where);
    dims.push({ ref, ...(s.bucket ? { bucket: s.bucket } : {}), key });
    columns.push({ key, label: ref.def.label + (s.bucket ? ` (${s.bucket})` : ""), type: s.bucket ? "period" : ref.def.type, ...(ref.def.type === "money" ? { unit: "rupees" as const } : {}) });
  }

  const aggs: ResolvedPlan["aggs"] = [];
  for (const [i, a] of plan.aggregates.entries()) {
    const where = `aggregates[${i}]`;
    if (!(AGG_OPS as readonly string[]).includes(a.op)) throw new PlanError(`${where}: unknown op.`);
    let ref: FieldRef | undefined;
    if (a.op !== "count") {
      if (!a.field) throw new PlanError(`${where}: "${a.op}" needs a field.`);
      ref = r.field(a.field);
      const d = ref.def;
      if (a.op === "count_distinct") {
        if (!d.groupable && d.type !== "date") throw new PlanError(`${where}: cannot count distinct values of "${a.field}".`);
      } else if (!d.aggregatable) throw new PlanError(`${where}: "${a.field}" cannot be used with ${a.op}.`);
      else if ((a.op === "sum" || a.op === "avg") && d.type !== "number" && d.type !== "money") throw new PlanError(`${where}: ${a.op} needs a number or money field.`);
    }
    const key = claim(a.as ?? (a.op === "count" ? "count" : `${a.op}_${(a.field ?? "").replace(/\./g, "_")}`), where);
    aggs.push({ op: a.op, ...(ref ? { ref } : {}), key });
    const t = aggColumnType(a.op, ref?.def);
    columns.push({ key, label: a.op === "count" ? "Count" : `${ref!.def.label} (${a.op.replace("_", " ")})`, ...t });
  }

  const filters: ResolvedPlan["filters"] = [];
  for (const [i, f] of plan.filters.entries()) {
    const where = `filters[${i}]`;
    const ref = r.field(f.field);
    if (!ref.def.filterable) throw new PlanError(`${where}: "${f.field}" cannot be filtered.`);
    if (!OPS_BY_TYPE[ref.def.type].includes(f.op)) throw new PlanError(`${where}: "${f.op}" does not apply to ${ref.def.type} field "${f.field}". Allowed: ${OPS_BY_TYPE[ref.def.type].join(", ")}.`);
    filters.push({ ref, op: f.op, value: typedValue(ref.def, f.op, f.value, where) });
  }

  const sort: ResolvedPlan["sort"] = [];
  for (const [i, s] of plan.sort.entries()) {
    if (!columns.some((c) => c.key === s.by)) throw new PlanError(`sort[${i}]: "${s.by}" is not an output column. Columns: ${columns.map((c) => c.key).join(", ")}.`);
    sort.push({ key: s.by, dir: s.dir === "desc" ? -1 : 1 });
  }
  if (sort.length === 0 && mode === "group") {
    const timeDim = dims.find((d) => d.bucket);
    if (timeDim) sort.push({ key: timeDim.key, dir: 1 });
    else if (aggs.length > 0) sort.push({ key: aggs[0].key, dir: -1 });
  }

  const limit = Math.min(plan.limit ?? (mode === "group" ? LIMITS.defaultAggregateLimit : LIMITS.defaultListLimit), LIMITS.maxRows);
  return { plan, entity, mode, joins: [...r.joined.values()], dims, aggs, filters, sort, limit, columns };
}
