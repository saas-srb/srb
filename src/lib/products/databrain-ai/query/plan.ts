/**
 * The query plan: the ONLY thing the model may produce to read data. It is a
 * small declarative structure — never Mongo — and every name in it is looked
 * up in the user's catalog view by the validator. Pure module (no I/O).
 */

export const BUCKETS = ["day", "week", "month", "quarter", "year"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const AGG_OPS = ["count", "sum", "avg", "min", "max", "count_distinct"] as const;
export type AggOp = (typeof AGG_OPS)[number];
export const FILTER_OPS = ["eq", "neq", "in", "gt", "gte", "lt", "lte", "between", "contains", "is_null"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export type Scalar = string | number | boolean | null;

export interface PlanSelect {
  field: string;
  bucket?: Bucket;
  as?: string;
}
export interface PlanAggregate {
  op: AggOp;
  field?: string;
  as?: string;
}
export interface PlanFilter {
  field: string;
  op: FilterOp;
  value?: Scalar | Scalar[];
}
export interface PlanSort {
  by: string;
  dir?: "asc" | "desc";
}

export interface QueryPlan {
  entity: string;
  select: PlanSelect[];
  aggregates: PlanAggregate[];
  filters: PlanFilter[];
  joins: string[];
  sort: PlanSort[];
  limit?: number;
}

export const LIMITS = {
  maxSelect: 8,
  maxAggregates: 6,
  maxFilters: 12,
  maxJoins: 2,
  maxSort: 3,
  maxInValues: 50,
  maxStringValue: 200,
  maxRows: 500,
  defaultAggregateLimit: 100,
  defaultListLimit: 50,
  maxTimeMS: 10_000,
} as const;

/** The JSON schema of the model's `run_query` tool (the server re-validates everything; this guides the model). */
export const RUN_QUERY_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["entity"],
  properties: {
    entity: { type: "string", description: "An entity key from the catalog." },
    select: {
      type: "array",
      description: "With aggregates: the GROUP-BY fields (dates may use a bucket). Without aggregates: the columns to list. Use `relation.field` for a joined field.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field"],
        properties: { field: { type: "string" }, bucket: { type: "string", enum: [...BUCKETS] }, as: { type: "string", description: "Output column name (letters, digits, underscore)." } },
      },
    },
    aggregates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op"],
        properties: {
          op: { type: "string", enum: [...AGG_OPS] },
          field: { type: "string", description: "Not needed for count. sum/avg need a number or money field; min/max a number, money or date." },
          as: { type: "string", description: "Output column name." },
        },
      },
    },
    filters: {
      type: "array",
      description: "All filters are ANDed. Dates are yyyy-mm-dd (inclusive for between/lte/gte). `in` takes an array; `between` takes [from, to]; is_null takes true/false.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "op"],
        properties: {
          field: { type: "string" },
          op: { type: "string", enum: [...FILTER_OPS] },
          value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] } }, { type: "null" }] },
        },
      },
    },
    joins: { type: "array", description: "Relation keys of this entity to join (max 2). Parents only (many-to-one); referencing `relation.field` joins automatically.", items: { type: "string" } },
    sort: { type: "array", items: { type: "object", additionalProperties: false, required: ["by"], properties: { by: { type: "string", description: "An output column name." }, dir: { type: "string", enum: ["asc", "desc"] } } } },
    limit: { type: "integer", description: "Max rows (1-500)." },
  },
} as const;

export const DESCRIBE_ENTITY_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["entity"],
  properties: { entity: { type: "string", description: "An entity key from the catalog." } },
} as const;

export class PlanError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "unknown_entity" | "denied" | "unknown_field" = "invalid",
  ) {
    super(message);
    this.name = "PlanError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function onlyKeys(o: Record<string, unknown>, allowed: readonly string[], where: string) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new PlanError(`${where}: unknown property "${k}". Allowed: ${allowed.join(", ")}.`);
}

function list(v: unknown, where: string, max: number): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new PlanError(`${where} must be an array.`);
  if (v.length > max) throw new PlanError(`${where} may have at most ${max} entries.`);
  return v;
}

const text = (v: unknown, where: string, max = 120): string => {
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw new PlanError(`${where} must be a non-empty string.`);
  return v;
};

/** Shape-checks the raw tool arguments into a QueryPlan. Anything unexpected is rejected, never ignored. */
export function parsePlan(raw: unknown): QueryPlan {
  if (!isObj(raw)) throw new PlanError("The query plan must be a JSON object.");
  onlyKeys(raw, ["entity", "select", "aggregates", "filters", "joins", "sort", "limit"], "plan");
  const plan: QueryPlan = { entity: text(raw.entity, "entity", 60), select: [], aggregates: [], filters: [], joins: [], sort: [] };

  for (const [i, s] of list(raw.select, "select", LIMITS.maxSelect).entries()) {
    if (!isObj(s)) throw new PlanError(`select[${i}] must be an object.`);
    onlyKeys(s, ["field", "bucket", "as"], `select[${i}]`);
    const item: PlanSelect = { field: text(s.field, `select[${i}].field`) };
    if (s.bucket !== undefined && s.bucket !== null) {
      if (!(BUCKETS as readonly unknown[]).includes(s.bucket)) throw new PlanError(`select[${i}].bucket must be one of ${BUCKETS.join(", ")}.`);
      item.bucket = s.bucket as Bucket;
    }
    if (s.as !== undefined && s.as !== null) item.as = text(s.as, `select[${i}].as`, 40);
    plan.select.push(item);
  }
  for (const [i, a] of list(raw.aggregates, "aggregates", LIMITS.maxAggregates).entries()) {
    if (!isObj(a)) throw new PlanError(`aggregates[${i}] must be an object.`);
    onlyKeys(a, ["op", "field", "as"], `aggregates[${i}]`);
    if (!(AGG_OPS as readonly unknown[]).includes(a.op)) throw new PlanError(`aggregates[${i}].op must be one of ${AGG_OPS.join(", ")}.`);
    const item: PlanAggregate = { op: a.op as AggOp };
    if (a.field !== undefined && a.field !== null) item.field = text(a.field, `aggregates[${i}].field`);
    if (a.as !== undefined && a.as !== null) item.as = text(a.as, `aggregates[${i}].as`, 40);
    plan.aggregates.push(item);
  }
  for (const [i, f] of list(raw.filters, "filters", LIMITS.maxFilters).entries()) {
    if (!isObj(f)) throw new PlanError(`filters[${i}] must be an object.`);
    onlyKeys(f, ["field", "op", "value"], `filters[${i}]`);
    if (!(FILTER_OPS as readonly unknown[]).includes(f.op)) throw new PlanError(`filters[${i}].op must be one of ${FILTER_OPS.join(", ")}.`);
    const item: PlanFilter = { field: text(f.field, `filters[${i}].field`), op: f.op as FilterOp };
    if (f.value !== undefined) item.value = f.value as PlanFilter["value"]; // typed per field by the validator
    plan.filters.push(item);
  }
  for (const [i, j] of list(raw.joins, "joins", LIMITS.maxJoins).entries()) plan.joins.push(text(j, `joins[${i}]`, 60));
  for (const [i, s] of list(raw.sort, "sort", LIMITS.maxSort).entries()) {
    if (!isObj(s)) throw new PlanError(`sort[${i}] must be an object.`);
    onlyKeys(s, ["by", "dir"], `sort[${i}]`);
    if (s.dir !== undefined && s.dir !== null && s.dir !== "asc" && s.dir !== "desc") throw new PlanError(`sort[${i}].dir must be asc or desc.`);
    plan.sort.push({ by: text(s.by, `sort[${i}].by`, 40), ...(s.dir ? { dir: s.dir as "asc" | "desc" } : {}) });
  }
  if (raw.limit !== undefined && raw.limit !== null) {
    if (typeof raw.limit !== "number" || !Number.isInteger(raw.limit) || raw.limit < 1) throw new PlanError("limit must be a positive integer.");
    plan.limit = Math.min(raw.limit, LIMITS.maxRows);
  }
  return plan;
}
