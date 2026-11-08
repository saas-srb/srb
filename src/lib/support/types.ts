/** Client-safe types for the SelfRun AI AI Help & Support Center. */

export type FieldType = "text" | "textarea" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** For `select`. */
  options?: string[];
}

export interface RequestTypeDef {
  key: string;
  label: string;
  description?: string;
  /** Bug-like types capture the full technical context (browser, device, error) and ask for severity. */
  kind: "bug" | "general";
  active: boolean;
  /** Extra form fields shown for this type, on top of title + description. */
  fields: FieldDef[];
}

export interface OptionDef {
  key: string;
  label: string;
  active: boolean;
}

/** `state` is what the workflow engine reasons about; keys and labels are free text. */
export type StatusState = "open" | "waiting" | "resolved" | "closed";

export interface StatusDef {
  key: string;
  label: string;
  state: StatusState;
  /** The status a new request starts in (the first flagged, else the first `open`). */
  initial?: boolean;
}

export interface SupportConfig {
  types: RequestTypeDef[];
  categories: OptionDef[];
  priorities: OptionDef[];
  severities: OptionDef[];
  /** Internal teams a request can be routed to. */
  teams: OptionDef[];
  statuses: StatusDef[];
}

/** What the platform knows about where the user was — captured in the browser, enriched on the server. */
export interface RequestContext {
  panel: string | null;
  page: string | null;
  route: string | null;
  feature: string | null;
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  device: string | null;
  userAgent: string | null;
  viewport: string | null;
  timestamp: string;
  errorInfo: string | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AiAnalysis {
  at: string;
  summary: string;
  category: string | null;
  priority: string | null;
  team: string | null;
  duplicateOf: { id: string; number: number; title: string }[];
  similarCount: number;
  suggestedReply: string;
  articles: { slug: string; title: string }[];
  note: string | null;
}

export interface HelpSource {
  slug: string;
  title: string;
}

export interface Attachment {
  /** Blob storage key: `support/<companyId>/<userId>/<uuid>.<ext>`. Served only through the authenticated attachments route. */
  key: string;
  name: string;
  size: number;
  type: string;
}
