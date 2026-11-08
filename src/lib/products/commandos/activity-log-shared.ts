/**
 * Client-safe constants for the Activity Log — split out of `activity-log.ts`
 * because that file has `import "server-only"` (it imports the mongodb
 * driver directly); pulling any export from it into a "use client" component
 * poisons the whole client bundle and crashes the dev server. Nothing here
 * touches the database — safe to import from client components.
 */

export const ACTIVITY_LOG_MODULES = ["prms", "pms", "teamchat", "tms", "hrms", "portal", "ots", "lpms", "sop", "fms", "smms", "aibots", "cms", "dlms", "seo"] as const;
export type ActivityLogModule = (typeof ACTIVITY_LOG_MODULES)[number];

const MODULE_LABELS: Record<ActivityLogModule, string> = {
  prms: "SpendIQ",
  pms: "SprintOS",
  teamchat: "Team Chat",
  tms: "Cohort AI",
  hrms: "TalentOS",
  portal: "ClientOS",
  ots: "EvalIQ",
  lpms: "ContractFlow",
  sop: "Playbook",
  fms: "CashFlow",
  smms: "ViralPulse",
  aibots: "AgentOS",
  cms: "SiteCraft",
  dlms: "CyberVault",
  seo: "RankMax",
};

export function activityModuleLabel(module: string): string {
  return MODULE_LABELS[module as ActivityLogModule] ?? module;
}

// ── The one Audit log (Company → Audit log): two sources, one page ──────────

/** Which records the page shows. "all" merges both, newest first. */
export type AuditSource = "all" | "workspace" | "products";
export const AUDIT_SOURCES: readonly AuditSource[] = ["all", "workspace", "products"];
export const AUDIT_SOURCE_LABELS: Record<AuditSource, string> = { all: "All", workspace: "Workspace events", products: "Product activity" };

/** What a reader may see: product activity needs the Audit log permission, workspace events the company Director. */
export interface AuditSourceAccess {
  panels: boolean;
  workspace: boolean;
}

/** The sources a reader may use, in tab order ("All" only when they may read both). */
export function allowedAuditSources(access: AuditSourceAccess): AuditSource[] {
  const out: AuditSource[] = [];
  if (access.panels && access.workspace) out.push("all");
  if (access.workspace) out.push("workspace");
  if (access.panels) out.push("products");
  return out;
}

/** The requested source if the reader may use it, otherwise their default (never widens access). */
export function resolveAuditSource(requested: string | undefined, access: AuditSourceAccess): AuditSource | null {
  const allowed = allowedAuditSources(access);
  if (allowed.length === 0) return null;
  const canonical = requested === "panels" ? "products" : requested;
  return allowed.find((s) => s === canonical) ?? allowed[0];
}

/** One row of the merged ("All") view. */
export interface AuditRow {
  id: string;
  source: Exclude<AuditSource, "all">;
  at: string;
  /** What happened: an event label, or "<product> · <action>". */
  what: string;
  subject: string;
  summary: string | null;
  actor: string;
  /** Where the subject lives (workspace events only). */
  url: string | null;
}

/** Newest first; a stable tiebreak on id so pages never overlap. */
export function mergeAuditRows(a: AuditRow[], b: AuditRow[]): AuditRow[] {
  return [...a, ...b].sort((x, y) => (x.at === y.at ? (x.id < y.id ? 1 : -1) : x.at < y.at ? 1 : -1));
}

/** Deepest page of the merged view (each source contributes at most `pageSize * MAX_MERGED_PAGES` rows). */
export const MAX_MERGED_PAGES = 8;
