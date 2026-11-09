import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { activePbItem, groupedPbNav, pbCurrentTask, PB_NAV_GROUPS, PB_NAV_ITEMS, visiblePbNav } from "../src/lib/products/playbook-ai/nav";
import { activeCfItem, cfCurrentTask, CF_NAV_GROUPS, CF_NAV_ITEMS, groupedCfNav, visibleCfNav } from "../src/lib/products/contractflow-ai/nav";

// Pure: the Playbook and ContractFlow sidebar definitions. Run with: npx tsx scripts/test-pb-cf-nav.ts
let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = <T,>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); n++; };

/** The app route folder for a URL: /product/a/b -> src/app/(products)/<product>/(protected)/a/b/page.tsx (a folder under (protected), or the product root). */
function routeExists(href: string): boolean {
  const [, product, ...rest] = href.split("/");
  const base = `src/app/(products)/${product}/(protected)`;
  return rest.length === 0 ? existsSync(`${base}/page.tsx`) : existsSync(`${base}/${rest.join("/")}/page.tsx`);
}

for (const [name, items, groups] of [["Playbook", PB_NAV_ITEMS, PB_NAV_GROUPS], ["ContractFlow", CF_NAV_ITEMS, CF_NAV_GROUPS]] as const) {
  ok(items.every((i) => routeExists(i.href)), `${name}: every sidebar item points at a page that exists`);
  ok(new Set(items.map((i) => i.key)).size === items.length && new Set(items.map((i) => i.href)).size === items.length, `${name}: item keys and URLs are unique`);
  ok(items.every((i) => groups.some((g) => g.key === i.group)), `${name}: every item sits in a known group`);
}
eq(PB_NAV_GROUPS.map((g) => g.label), ["Overview", "SOPs", "Documents", "Employee KPIs", "Brand"], "Playbook group order");
eq(CF_NAV_GROUPS.map((g) => g.label), ["Overview", "Sign & Track", "Governance"], "ContractFlow group order");

// Permission gating and no empty groups.
eq(groupedPbNav({ create: true, brand: true }).map((g) => g.key), ["overview", "sops", "documents", "kpis", "brand"], "Playbook, full access: every group");
eq(groupedPbNav({ create: false, brand: false }).map((g) => g.key), ["overview", "sops", "documents", "kpis"], "no brand right: the Brand group is dropped, not left empty");
ok(!visiblePbNav({ create: false, brand: true }).some((i) => i.icon === "create"), "no create right: no Create items");
ok(groupedPbNav({ create: false, brand: false }).every((g) => g.items.length > 0), "no empty groups");
eq(groupedCfNav({ settings: false }).map((g) => g.key), ["overview", "track", "governance"], "ContractFlow without settings still has Governance (Archive)");
ok(!visibleCfNav({ settings: false }).some((i) => i.key === "settings") && visibleCfNav({ settings: true }).some((i) => i.key === "settings"), "Settings only with the right");
eq(groupedCfNav({ settings: true })[0].items.map((i) => i.label), ["Dashboard"], "the Dashboard is first");

// Active-state matching, including nested routes and task pages.
const pb = visiblePbNav({ create: true, brand: true });
eq(activePbItem(pb, "/playbook-ai/dashboard")?.key, "dashboard", "dashboard");
eq(activePbItem(pb, "/playbook-ai/documents")?.key, "my-documents", "My Documents on its own URL");
eq(activePbItem(pb, "/playbook-ai/documents/library")?.key, "doc-library", "the longer match wins: the library, not My Documents");
eq(activePbItem(pb, "/playbook-ai/documents/library/")?.key, "doc-library", "a trailing slash is ignored");
eq(activePbItem(pb, "/playbook-ai/sops/new")?.key, "new-sop", "Create SOP");
eq(activePbItem(pb, "/playbook-ai/brand/")?.key, "brand", "brand");
eq(activePbItem(pb, "/playbook-ai/documents/abc123")?.key ?? null, null, "an editor page lights nothing (My Documents is exact)");
eq(activePbItem(pb, "/playbook-ai/documents/abc123/send"), null, "a task page: no item is active");
eq(pbCurrentTask("/playbook-ai/documents/abc123/send")?.label, "Send to ContractFlow", "task: send");
eq(pbCurrentTask("/playbook-ai/documents/abc123/version")?.label, "Save as version", "task: version");
eq(pbCurrentTask("/playbook-ai/documents/abc123"), null, "the editor is not a task page");
const cf = visibleCfNav({ settings: true });
eq(activeCfItem(cf, "/contractflow-ai/dashboard")?.key, "dashboard", "ContractFlow dashboard");
eq(activeCfItem(cf, "/contractflow-ai/documents")?.key, "documents", "documents");
eq(activeCfItem(cf, "/contractflow-ai/sops")?.key, "sops", "SOPs");
eq(activeCfItem(cf, "/contractflow-ai/settings")?.key, "settings", "settings");
eq(activeCfItem(cf, "/contractflow-ai/clones/x1/send"), null, "task page: no item active");
eq(cfCurrentTask("/contractflow-ai/clones/x1/void")?.label, "Void document", "task: void");
eq(cfCurrentTask("/contractflow-ai/clones/x1/send")?.label, "Send for signature", "task: send");

// The sidebar components use these definitions; the dashboard tiles link only to real lists.
ok(/groupedPbNav/.test(readFileSync("src/components/products/playbook-ai/SopSidebar.tsx", "utf8")), "the Playbook sidebar renders from nav.ts");
ok(/groupedCfNav/.test(readFileSync("src/components/products/contractflow-ai/LpmsSidebar.tsx", "utf8")), "the ContractFlow sidebar renders from nav.ts");
ok(!/contractflow-ai\/signed/.test(readFileSync("src/lib/products/contractflow-ai/dashboard/compute.ts", "utf8")), "no dashboard tile links to a page that does not exist");
console.log(`nav: ${n} checks passed`);
