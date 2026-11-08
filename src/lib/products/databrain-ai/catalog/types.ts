/**
 * The semantic layer's vocabulary. The registry (`registry.ts`) is a static,
 * platform-level description of the business entities the AI Data Analyst may
 * query — the same for every company; per-company differences (which products
 * exist, what this user may read) are resolved at request time into a
 * `CatalogView` (`view.ts`). Pure types, no I/O.
 */

export type FieldType = "string" | "number" | "money" | "date" | "boolean" | "enum" | "id";

export interface EnumValue {
  value: string;
  label: string;
}

/** The access areas a grant can name: the cross-product areas of `platform/access.ts` plus two Procurement areas. */
export type IntelArea = "leads" | "clients" | "projects" | "tasks" | "invoices" | "employees" | "leave" | "procurement" | "expenses" | "timesheets";

export interface FieldDef {
  key: string;
  /** Mongo path inside the entity's collection (dotted for nested fields). Defaults to `key`. */
  path: string;
  label: string;
  description?: string;
  type: FieldType;
  enumValues?: readonly EnumValue[];
  /** `date` fields only: "date" = BSON Date, "isoDate" = a "yyyy-mm-dd" string. */
  storage?: "date" | "isoDate";
  /** `money` fields only. All amounts in this product are stored in major units (rupees, not paise). */
  unit?: "rupees";
  filterable: boolean;
  groupable: boolean;
  aggregatable: boolean;
  /** Sensitive fields are NEVER offered to the model and never queryable (no unlock path is implemented: excluded for everyone). */
  sensitive: boolean;
  /** Small free-form string set whose distinct values are read live and shown to the model (e.g. industries). */
  liveValues?: boolean;
  /** A trusted Mongo expression computed per row (never from model input). `today` is "yyyy-mm-dd" in the company time zone. */
  expr?: (ctx: { today: string }) => Record<string, unknown>;
}

export interface RelationDef {
  key: string;
  /** Target entity key. Relations are many-to-one only (a row has at most one parent), so a join never multiplies rows. */
  to: string;
  /** Mongo path in THIS entity holding the parent's key. */
  localField: string;
  /** Mongo path in the target holding that key (almost always `_id`). */
  foreignField: string;
  label: string;
}

/** One way to be allowed to see an entity: hold the area; `fields` (when set) limits the visible fields to that subset. */
export interface AccessGrant {
  area: IntelArea;
  fields?: readonly string[];
}

export interface EntityDef {
  key: string;
  label: string;
  description: string;
  /** The real Mongo collection used by the owning product. */
  collection: string;
  /** Product/module key (`onboarding/catalog.ts` MODULES): the entity exists only for companies whose plan includes and has enabled it. */
  module: string;
  /** Always applied first: excludes soft-deleted rows. */
  baseFilter: Record<string, unknown>;
  fields: readonly FieldDef[];
  relations: readonly RelationDef[];
  access: readonly AccessGrant[];
  /** Field used for the live "records from … to …" statistic. */
  dateField?: string;
}

/** What the registry author writes — flags are derived from the type unless overridden. */
export type FieldInput = Partial<Pick<FieldDef, "path" | "description" | "enumValues" | "storage" | "unit" | "filterable" | "groupable" | "aggregatable" | "sensitive" | "liveValues" | "expr">> &
  Pick<FieldDef, "key" | "label" | "type">;

export interface EntityInput extends Omit<EntityDef, "fields" | "baseFilter"> {
  fields: readonly FieldInput[];
  baseFilter?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Per-request view
// ---------------------------------------------------------------------------

export interface LiveStats {
  count: number | null;
  /** The entity's `dateField` span, as yyyy-mm-dd, when it has rows. */
  from: string | null;
  to: string | null;
  /** Distinct values of `liveValues` fields (only when there are few). */
  values: Record<string, string[]>;
}

export interface ViewEntity {
  def: EntityDef;
  /** The fields this user may use, by key (sensitive and un-granted fields are absent). */
  fields: ReadonlyMap<string, FieldDef>;
  /** Relations whose target entity is itself in the view. */
  relations: ReadonlyMap<string, RelationDef>;
  stats: LiveStats;
}

export interface CatalogView {
  entities: ReadonlyMap<string, ViewEntity>;
  /** Registry entities of products the company has, which this user may NOT read (labels only — never data). */
  restricted: readonly { key: string; label: string }[];
  /** Company time zone and today's date there. */
  timezone: string;
  today: string;
}
