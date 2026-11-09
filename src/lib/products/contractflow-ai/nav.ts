/**
 * ContractFlow navigation, as data (same shape as Playbook's and ViralPulse's `nav.ts`). Pure, so the sidebars and the tests share it.
 * Only pages that exist are listed. The old authoring pages (templates, makers, workflows, signature requests, approvals) stay off the sidebar by design.
 */

export interface CfNavFlags { settings: boolean }
export type CfNavIcon = "dashboard" | "documents" | "sop" | "kpi" | "archive" | "settings";
export type CfNavGroupKey = "overview" | "track" | "governance";

export interface CfNavItem { key: string; href: string; label: string; icon: CfNavIcon; group: CfNavGroupKey; exact?: boolean; anyOf?: readonly (keyof CfNavFlags)[] }

export const CF_NAV_GROUPS: readonly { key: CfNavGroupKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "track", label: "Sign & Track" },
  { key: "governance", label: "Governance" },
];

export const CF_NAV_ITEMS: readonly CfNavItem[] = [
  { key: "dashboard", href: "/contractflow-ai/dashboard", label: "Dashboard", icon: "dashboard", group: "overview" },
  { key: "documents", href: "/contractflow-ai/documents", label: "Documents", icon: "documents", group: "track" },
  { key: "sops", href: "/contractflow-ai/sops", label: "SOPs", icon: "sop", group: "track" },
  { key: "kpis", href: "/contractflow-ai/kpis", label: "KPIs", icon: "kpi", group: "track" },
  { key: "archive", href: "/contractflow-ai/archive", label: "Archive", icon: "archive", group: "governance" },
  { key: "settings", href: "/contractflow-ai/settings", label: "Settings", icon: "settings", group: "governance", anyOf: ["settings"] },
];

/** A form page that used to be a popup: while it is open the sidebar shows it as the highlighted "Current task". */
export const CF_TASKS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /^\/contractflow-ai\/clones\/[^/]+\/send\/?$/, label: "Send for signature" },
  { pattern: /^\/contractflow-ai\/clones\/[^/]+\/void\/?$/, label: "Void document" },
];

export function visibleCfNav(flags: CfNavFlags): CfNavItem[] { return CF_NAV_ITEMS.filter((i) => !i.anyOf || i.anyOf.some((f) => Boolean(flags[f]))); }
export function groupedCfNav(flags: CfNavFlags): { key: CfNavGroupKey; label: string; items: CfNavItem[] }[] {
  const items = visibleCfNav(flags);
  return CF_NAV_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.key) })).filter((g) => g.items.length > 0);
}
const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
export const cfCurrentTask = (pathname: string): { label: string } | null => { const p = trim(pathname.split("?")[0]); const t = CF_TASKS.find((x) => x.pattern.test(p)); return t ? { label: t.label } : null; };
export function activeCfItem(items: readonly CfNavItem[], pathname: string): CfNavItem | null {
  const p = trim(pathname.split("?")[0]);
  if (cfCurrentTask(p)) return null;
  let best: CfNavItem | null = null;
  for (const i of items) {
    const hit = i.exact ? p === i.href : p === i.href || p.startsWith(`${i.href}/`);
    if (hit && (!best || i.href.length > best.href.length)) best = i;
  }
  return best;
}
