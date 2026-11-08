/**
 * SOP constants + shared (client-safe) types. No server-only imports here —
 * the editor, badges and filter bars all import from this file.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * Formats a `YYYY-MM-DD` calendar date without going through `Date`, so the
 * result never shifts a day with the viewer's timezone (and server/client
 * renders always agree).
 */
export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : iso;
}

/** URL of the authenticated file route for a stored SOP file. */
export const fileUrl = (id: string) => `/api/playbook-ai/files/${id}`;

// ---------------------------------------------------------------------------
// Lifecycle: Draft → Published → Active → (new version → Active) → Archived.
// `expired` is derived from the expiry date. There is NO review/approval state.
// ---------------------------------------------------------------------------

export const SOP_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50", chartColor: "#94a3b8" },
  { value: "published", label: "Published", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500", chartColor: "#3b82f6" },
  { value: "active", label: "Active", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", chartColor: "#22c55e" },
  { value: "expired", label: "Expired", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500", chartColor: "#f59e0b" },
  { value: "archived", label: "Archived", badgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-400", dotClass: "bg-slate-500", chartColor: "#64748b" },
] as const;
export type SopStatus = (typeof SOP_STATUSES)[number]["value"];

export function isSopStatus(v: unknown): v is SopStatus {
  return SOP_STATUSES.some((s) => s.value === v);
}
export function getSopStatusMeta(status: string | undefined) {
  return SOP_STATUSES.find((s) => s.value === status) ?? SOP_STATUSES[0];
}
/** Statuses a reader may open (a draft/archived SOP needs edit scope). */
export const LIVE_STATUSES: readonly SopStatus[] = ["published", "active", "expired"];

export const SOP_PRIORITIES = [
  { value: "low", label: "Low", badgeClass: "bg-muted text-muted-foreground" },
  { value: "medium", label: "Medium", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { value: "high", label: "High", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { value: "critical", label: "Critical", badgeClass: "bg-destructive/15 text-destructive" },
] as const;
export type SopPriority = (typeof SOP_PRIORITIES)[number]["value"];
export function isSopPriority(v: unknown): v is SopPriority {
  return SOP_PRIORITIES.some((p) => p.value === v);
}
export function getPriorityMeta(p: string | undefined) {
  return SOP_PRIORITIES.find((x) => x.value === p) ?? SOP_PRIORITIES[1];
}

/** Ordered least → most sensitive. See `access.ts` for who can read each level. */
export const CONFIDENTIALITY_LEVELS = [
  { value: "internal", label: "Internal", description: "Every signed-in employee.", badgeClass: "bg-muted text-muted-foreground" },
  { value: "department_only", label: "Department Only", description: "Members and managers of the owning department.", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { value: "management_only", label: "Management Only", description: "Managers and admins.", badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { value: "confidential", label: "Confidential", description: "Managers of the owning department, plus explicit grants.", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { value: "highly_confidential", label: "Highly Confidential", description: "The department head, owner/author, plus explicit grants.", badgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  { value: "restricted", label: "Restricted", description: "Only owner/author and explicitly granted people.", badgeClass: "bg-destructive/15 text-destructive" },
] as const;
export type Confidentiality = (typeof CONFIDENTIALITY_LEVELS)[number]["value"];
export function isConfidentiality(v: unknown): v is Confidentiality {
  return CONFIDENTIALITY_LEVELS.some((c) => c.value === v);
}
export function getConfidentialityMeta(c: string | undefined) {
  return CONFIDENTIALITY_LEVELS.find((x) => x.value === c) ?? CONFIDENTIALITY_LEVELS[0];
}
/** Levels where a download is off by default when an SOP is created. */
export const NO_DOWNLOAD_BY_DEFAULT: readonly Confidentiality[] = ["highly_confidential", "restricted"];

// ---------------------------------------------------------------------------
// Integrations — each SOP can be tagged for the product(s) it serves.
// ---------------------------------------------------------------------------

export const SOP_MODULES = [
  { value: "hrms", label: "TalentOS", href: "/talentos" },
  { value: "pms", label: "SprintOS (Projects)", href: "/sprintos" },
  { value: "prms", label: "SpendIQ (Procurement)", href: "/spendiq" },
  { value: "fms", label: "CashFlow (Finance)", href: "/cashflow-ai" },
  { value: "tms", label: "Cohort AI (Training)", href: "/cohort-ai" },
  { value: "lms", label: "DealFlow (Sales & CRM)", href: "/dealflow-ai" },
  { value: "messenger", label: "Team Chat", href: "/huddle-ai" },
] as const;
export type SopModule = (typeof SOP_MODULES)[number]["value"];
export function isSopModule(v: unknown): v is SopModule {
  return SOP_MODULES.some((m) => m.value === v);
}

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

export interface TextItem { id: string; text: string }

export type SopBlock =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; text: string; level: 2 | 3 }
  | { id: string; type: "steps"; items: string[] }
  | { id: string; type: "bullets"; items: string[] }
  | { id: string; type: "table"; header: string[]; rows: string[][] }
  | { id: string; type: "checklist"; title: string; items: TextItem[] }
  | { id: string; type: "image"; fileId: string; alt: string; caption: string }
  | { id: string; type: "video"; fileId: string | null; url: string | null; caption: string }
  | { id: string; type: "attachment"; fileId: string; label: string }
  | { id: string; type: "link"; url: string; label: string; description: string }
  | { id: string; type: "note" | "warning" | "example" | "reference"; text: string };

export type SopBlockType = SopBlock["type"];

export const BLOCK_TYPES: { value: SopBlockType; label: string; hint: string }[] = [
  { value: "paragraph", label: "Text", hint: "Markdown paragraph" },
  { value: "heading", label: "Heading", hint: "Sub-heading inside a section" },
  { value: "steps", label: "Numbered steps", hint: "Ordered procedure steps" },
  { value: "bullets", label: "Bullet list", hint: "Unordered list" },
  { value: "table", label: "Table", hint: "Rows and columns" },
  { value: "checklist", label: "Checklist", hint: "Trackable items employees tick off" },
  { value: "image", label: "Image", hint: "Uploaded image" },
  { value: "video", label: "Video", hint: "Uploaded video or a link" },
  { value: "attachment", label: "Attachment", hint: "Downloadable file" },
  { value: "link", label: "Link", hint: "External or internal link" },
  { value: "note", label: "Note", hint: "Helpful callout" },
  { value: "warning", label: "Warning", hint: "Risk / caution callout" },
  { value: "example", label: "Example", hint: "Worked example" },
  { value: "reference", label: "Reference", hint: "Reference material" },
];

export interface SopSection {
  id: string;
  /** Stable key for template-defined sections (e.g. "procedure"); custom sections use their id. */
  key: string;
  title: string;
  blocks: SopBlock[];
}

export interface RelatedPolicy { title: string; url: string }
export interface ModuleLink { module: SopModule; label: string; url: string }

/** The versioned document body — what a published version freezes. */
export interface SopContent {
  title: string;
  description: string;
  purpose: string;
  scope: string;
  sections: SopSection[];
  relatedSopIds: string[];
  relatedPolicies: RelatedPolicy[];
  moduleLinks: ModuleLink[];
}

/** Default section set. Purpose + Scope are core SOP fields, so they are rendered from those fields rather than as sections. */
export const DEFAULT_SECTIONS: { key: string; title: string; guidance: string }[] = [
  { key: "responsibilities", title: "Responsibilities", guidance: "Who does what: roles and their duties in this procedure." },
  { key: "prerequisites", title: "Prerequisites", guidance: "Access, approvals-in-hand, inputs or conditions needed before starting." },
  { key: "required_tools", title: "Required Tools", guidance: "Systems, software, forms and equipment used." },
  { key: "procedure", title: "Procedure", guidance: "The high-level flow of the process, start to finish." },
  { key: "step_by_step", title: "Step-by-Step Instructions", guidance: "Detailed numbered steps, with screenshots where helpful." },
  { key: "validation", title: "Validation", guidance: "How to confirm the work was done correctly." },
  { key: "exceptions", title: "Exceptions", guidance: "Cases that deviate from the standard flow, and how to handle them." },
  { key: "escalation", title: "Escalation", guidance: "Who to contact and when when something goes wrong." },
  { key: "security", title: "Security", guidance: "Data handling, access control and confidentiality requirements." },
  { key: "compliance", title: "Compliance", guidance: "Regulations, policies and audit requirements this SOP supports." },
  { key: "expected_output", title: "Expected Output", guidance: "What a correctly completed procedure produces." },
  { key: "related_documents", title: "Related Documents", guidance: "Linked policies, forms, templates and other SOPs." },
  { key: "faq", title: "FAQ", guidance: "Common questions and their answers." },
];

// ---------------------------------------------------------------------------
// Limits (enforced server-side in content validation + upload routes)
// ---------------------------------------------------------------------------

export const LIMITS = {
  title: 200,
  description: 1000,
  richText: 20_000,
  sections: 40,
  blocksPerSection: 200,
  itemsPerList: 200,
  tableCols: 12,
  tableRows: 200,
  cell: 500,
  tags: 20,
  tag: 40,
  relatedSops: 30,
  relatedPolicies: 30,
  moduleLinks: 20,
  fileBytes: 25 * 1024 * 1024,
} as const;

// ---------------------------------------------------------------------------
// Seed taxonomy — every department in the SOP spec. All of it is data in
// `sop_departments` afterwards, so admins can add / rename / retire freely and
// any new HRMS department is picked up automatically (see `taxonomy.ts`).
// ---------------------------------------------------------------------------

export const DEFAULT_DEPARTMENTS: { name: string; code: string }[] = [
  { name: "Management", code: "MGT" },
  { name: "HR", code: "HR" },
  { name: "Recruitment", code: "REC" },
  { name: "Finance", code: "FIN" },
  { name: "Accounts", code: "ACC" },
  { name: "Sales", code: "SAL" },
  { name: "Business Development", code: "BD" },
  { name: "Marketing", code: "MKT" },
  { name: "Customer Support", code: "CS" },
  { name: "Project Management", code: "PM" },
  { name: "Product", code: "PRD" },
  { name: "Engineering", code: "ENG" },
  { name: "Frontend", code: "FE" },
  { name: "Backend", code: "BE" },
  { name: "Mobile", code: "MOB" },
  { name: "QA", code: "QA" },
  { name: "DevOps", code: "DEV" },
  { name: "Cloud", code: "CLD" },
  { name: "AI/ML", code: "AI" },
  { name: "IT", code: "IT" },
  { name: "Security", code: "SEC" },
  { name: "Procurement", code: "PRC" },
  { name: "Operations", code: "OPS" },
  { name: "Administration", code: "ADM" },
  { name: "Training", code: "TRN" },
  { name: "Cohort AI", code: "Cohort AI" },
  { name: "LMS", code: "LMS" },
  { name: "Legal", code: "LEG" },
  { name: "Compliance", code: "CMP" },
  { name: "Facilities", code: "FAC" },
  { name: "Internal Audit", code: "IA" },
  { name: "Risk Management", code: "RSK" },
];

export const DEFAULT_CATEGORIES: { name: string; color: string; description: string }[] = [
  { name: "Operational", color: "#3b82f6", description: "Day-to-day operating procedures." },
  { name: "Technical", color: "#8b5cf6", description: "Engineering, IT and infrastructure procedures." },
  { name: "Compliance & Regulatory", color: "#f59e0b", description: "Procedures that satisfy regulatory or audit requirements." },
  { name: "Safety & Security", color: "#ef4444", description: "Safety, security and incident response." },
  { name: "Finance & Payments", color: "#10b981", description: "Payments, billing, expense and accounting procedures." },
  { name: "People & HR", color: "#ec4899", description: "Hiring, onboarding, leave and employee lifecycle." },
  { name: "Customer Facing", color: "#06b6d4", description: "Sales, support and client delivery procedures." },
  { name: "Onboarding & Training", color: "#6366f1", description: "Training material and onboarding checklists." },
];

export const ACTIONS_LABEL: Record<string, string> = {
  create: "Created",
  edit: "Edited",
  publish: "Published",
  update: "New version",
  assign: "Assigned",
  view: "Viewed",
  download: "Downloaded",
  acknowledge: "Acknowledged",
  archive: "Archived",
  restore: "Restored",
  delete: "Deleted",
  revert: "Restored version to draft",
  feedback: "Feedback",
  checklist: "Checklist",
  reminder: "Reminder",
  export: "Exported",
  settings: "Settings",
  config: "Configuration",
  status_auto: "Status changed",
};
