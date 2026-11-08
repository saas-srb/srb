export type Json = Record<string, unknown>;

/** The signed-in person the agent acts as. Every tool runs with their roles, never more. */
export interface AgentUser {
  id: string;
  email: string;
  roles: string[];
  name?: string;
  /** The HR employee record linked to this login, when there is one (drives "my own" views for employees). */
  employeeId?: string | null;
  /** The training student record linked to this login (students see their own training data). */
  studentId?: string | null;
  /** The Director's per-person capability overrides; every product's own `canX(user)` rules honour them. */
  permissionOverrides?: Record<string, boolean>;
  /** Platform Console only: the platform permissions of this person (e.g. "companies.read"; "*" = Platform Owner). */
  platformPermissions?: string[];
  /** Products this company can't use right now (not in the plan, switched off): the agent offers nothing from them. */
  blockedPanels?: string[];
  /** Subscription suspended / canceled: the agent can read but not change anything. */
  readOnly?: boolean;
}

export type Level = "any" | "staff" | "admin";

export type FieldType = "string" | "text" | "number" | "boolean" | "date" | "dateString" | "enum" | "email" | "ref" | "stringList" | "json";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  /** Never settable by the agent (system fields); still readable. */
  readOnly?: boolean;
  /** Can be given when creating, but not changed afterwards. */
  createOnly?: boolean;
  /** For `ref`: the entity key it points at, and how the id is stored (default: as the plain string it is given). */
  ref?: string;
  store?: "objectId";
  description?: string;
}

export interface EntityDef {
  /** `<product>.<name>`, e.g. "pms.task". */
  key: string;
  panel: string;
  label: string;
  description: string;
  collection: string;
  /** Read from several collections at once (e.g. one per lead category). When set, `collection` is only a label. */
  collections?: () => Promise<string[]>;
  /** How `_id` is stored. Default "objectId". */
  idType?: "objectId" | "string";
  /** Fields the agent may set. Absent = the entity is read-only and its fields are discovered from stored rows. */
  fields?: FieldDef[];
  /** Fields never returned (on top of the global secret filter). */
  hide?: string[];
  titleField?: string;
  search?: string[];
  /** Who may read / change it (default read "staff", write none). */
  read?: Level;
  write?: Level | false;
  canDelete?: boolean;
  /** Always ANDed into every query (e.g. a type discriminator). */
  baseFilter?: Json;
  /**
   * How writes happen. Products have business rules (sequence codes, events, soft delete, status flows), so writes go through the
   * product's own functions here. An entity with neither `ops` nor `rawWrite` is read-only.
   */
  ops?: {
    create?: (values: Json, user: AgentUser) => Promise<Json>;
    update?: (id: string, values: Json, user: AgentUser) => Promise<Json>;
    remove?: (id: string, user: AgentUser) => Promise<Json>;
  };
  /** Plain-collection writes (no business rules): the agent inserts/updates the row itself. Only for simple settings-like lists. */
  rawWrite?: boolean;
  /**
   * What a person who can open the product but is not staff may see: a filter that limits rows to their own (e.g. their timesheets), or
   * null for "nothing". Without it, such people don't get the entity at all.
   */
  self?: (user: AgentUser) => Promise<Json | null> | Json | null;
  /** The product's own capability rule for changing this (e.g. canManageEmployees). Checked on top of `write`. */
  allow?: (user: AgentUser) => boolean;
  /** The product's own rule for reading it at all (e.g. canViewAllEmployees). Checked on top of `read`. */
  allowRead?: (user: AgentUser) => boolean;
  /** Always applied, even to people with full read access (e.g. a vault person only sees the clients they were granted). Return null for "nothing". */
  scope?: (user: AgentUser) => Promise<Json | null> | Json | null;
  /** Those self-scoped people may also create/change/delete rows inside their own scope (e.g. log their own hours). */
  selfWrite?: boolean;
  /** Fields stamped on a raw create. */
  onCreate?: (data: Json, user: AgentUser) => Promise<Json> | Json;
}

/** A state change that is not plain create/update/delete: approve a leave, send an invoice, publish a document… */
export interface ActionDef {
  /** `<product>.<name>`, e.g. "hrms.decide_leave". */
  key: string;
  panel: string;
  label: string;
  description: string;
  params: FieldDef[];
  level: Level;
  destructive?: boolean;
  /** The product's own capability rule (e.g. canApproveLeave), on top of `level`. */
  allow?: (user: AgentUser) => boolean;
  run: (values: Json, user: AgentUser) => Promise<Json>;
}

/** A read-only calculation done by the product's own code (profit of a project, leave analytics, pipeline stats…): same numbers as its dashboards. */
export interface ReportDef {
  /** `<product>.<name>`, e.g. "pms.project_financials". */
  key: string;
  panel: string;
  label: string;
  description: string;
  params: FieldDef[];
  level: Level;
  allow?: (user: AgentUser) => boolean;
  run: (values: Json, user: AgentUser) => Promise<Json>;
}

export interface Attachment {
  name: string;
  mime: string;
  /** data: URL for images, PDFs and Office files (xlsx/docx); plain text for text-like files. */
  data: string;
  kind: "image" | "pdf" | "text" | "doc";
}

export interface ClientMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
}

export interface ApprovalCall {
  id: string;
  tool: string;
  title: string;
  kind: "create" | "update" | "delete" | "action";
  destructive: boolean;
  fields: { label: string; value: string; before?: string }[];
}

export interface Proposal {
  id: string;
  title: string;
  calls: ApprovalCall[];
  needsExtraConfirm: boolean;
}

export interface AgentResponse {
  reply: string;
  /** Short chips: what the agent looked at or did. */
  steps?: { label: string; ok: boolean }[];
  proposal?: Proposal;
  /** Quick answers the agent suggests for its own question. */
  choices?: string[];
  /** True when something changed, so the page should refresh. */
  changed?: boolean;
}
