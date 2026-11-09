/**
 * Playbook navigation, as data: the groups, their order, the items and which URLs light each one up. Pure (no React, no server imports), so the
 * desktop, collapsed and mobile sidebars use the same rules and the rules are tested without a browser. Same shape as ViralPulse's `nav.ts`.
 */

/** Which optional entries this viewer may see, computed on the server from the real permission model. */
export interface PbNavFlags { create: boolean; brand: boolean }

export type PbNavIcon = "dashboard" | "library" | "mine" | "create" | "document" | "kpi" | "brand";
export type PbNavGroupKey = "overview" | "sops" | "documents" | "kpis" | "brand";

export interface PbNavItem {
  key: string;
  href: string;
  label: string;
  icon: PbNavIcon;
  group: PbNavGroupKey;
  /** Active only on its own URL. */
  exact?: boolean;
  /** At least one of these flags must be true; absent = everyone who can open the product. */
  anyOf?: readonly (keyof PbNavFlags)[];
}

export const PB_NAV_GROUPS: readonly { key: PbNavGroupKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "sops", label: "SOPs" },
  { key: "documents", label: "Documents" },
  { key: "kpis", label: "Employee KPIs" },
  { key: "brand", label: "Brand" },
];

export const PB_NAV_ITEMS: readonly PbNavItem[] = [
  { key: "dashboard", href: "/playbook-ai/dashboard", label: "Dashboard", icon: "dashboard", group: "overview" },
  { key: "sop-library", href: "/playbook-ai/sops/library", label: "SOP Library", icon: "library", group: "sops" },
  { key: "my-sops", href: "/playbook-ai/sops", label: "My SOPs", icon: "mine", group: "sops", exact: true },
  { key: "new-sop", href: "/playbook-ai/sops/new", label: "Create SOP", icon: "create", group: "sops", anyOf: ["create"] },
  { key: "doc-library", href: "/playbook-ai/documents/library", label: "Document Library", icon: "library", group: "documents" },
  { key: "my-documents", href: "/playbook-ai/documents", label: "My Documents", icon: "document", group: "documents", exact: true },
  { key: "new-document", href: "/playbook-ai/documents/new", label: "Create document", icon: "create", group: "documents", anyOf: ["create"] },
  { key: "kpi-library", href: "/playbook-ai/kpis/library", label: "KPI Library", icon: "library", group: "kpis" },
  { key: "my-kpis", href: "/playbook-ai/kpis", label: "My KPI sheets", icon: "kpi", group: "kpis", exact: true },
  { key: "new-kpi", href: "/playbook-ai/kpis/new", label: "Create KPI sheet", icon: "create", group: "kpis", anyOf: ["create"] },
  { key: "brand", href: "/playbook-ai/brand", label: "Brand & Letterhead", icon: "brand", group: "brand", anyOf: ["brand"] },
];

/** A form page that used to be a popup: while it is open the sidebar shows it as the highlighted "Current task". */
export const PB_TASKS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /^\/playbook-ai\/documents\/[^/]+\/send\/?$/, label: "Send to ContractFlow" },
  { pattern: /^\/playbook-ai\/documents\/[^/]+\/version\/?$/, label: "Save as version" },
];

export function visiblePbNav(flags: PbNavFlags): PbNavItem[] {
  return PB_NAV_ITEMS.filter((i) => !i.anyOf || i.anyOf.some((f) => Boolean(flags[f])));
}

/** Visible items in sidebar order, grouped; a group with no visible item is dropped. */
export function groupedPbNav(flags: PbNavFlags): { key: PbNavGroupKey; label: string; items: PbNavItem[] }[] {
  const items = visiblePbNav(flags);
  return PB_NAV_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.key) })).filter((g) => g.items.length > 0);
}

const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
export const pbCurrentTask = (pathname: string): { label: string } | null => { const p = trim(pathname.split("?")[0]); const t = PB_TASKS.find((x) => x.pattern.test(p)); return t ? { label: t.label } : null; };

/** The item that is active for a URL: the longest matching one (so /documents/library lights the Library, not My Documents); none while a task page is open. */
export function activePbItem(items: readonly PbNavItem[], pathname: string): PbNavItem | null {
  const p = trim(pathname.split("?")[0]);
  if (pbCurrentTask(p)) return null;
  let best: PbNavItem | null = null;
  for (const i of items) {
    const hit = i.exact ? p === i.href : p === i.href || p.startsWith(`${i.href}/`);
    if (hit && (!best || i.href.length > best.href.length)) best = i;
  }
  return best;
}
