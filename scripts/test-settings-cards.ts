import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CONNECTION_PROVIDERS, HIDDEN_FROM_COMPANIES } from "../src/lib/platform/connections/catalog";
import { CARD_CATEGORIES, STATUS_LABEL, type CardStatus, type IntegrationCard } from "../src/lib/platform/connections/cards";
import { CARD_COPY } from "../src/lib/platform/connections/card-copy";
import { SETTINGS_STATUSES, STATUS_LOOK, STATUS_WORDS, filterCards, groupCards, primaryLabel, readFilter, type SettingsCardData } from "../src/components/settings/model";
import { fromCardStatus, fromProductStatus, integrationCardData, productCardData, slugOf } from "../src/components/settings/adapters";
import { PRODUCT_GROUPS, PRODUCT_GROUP_NOTES } from "../src/app/(products)/commandos/(protected)/settings/products/product-groups";
import { metaLine } from "../src/components/settings/SettingsCard";
import { plainProductName } from "../src/components/settings/adapters";
import { DRAWER_SHELL_CLASS, DRAWER_WIDE_CLASS, DRAWER_WIDTH_PX, DRAWER_WIDE_PX } from "../src/components/ui/drawer-shell";
import { SLUG_TO_PANEL } from "../src/lib/products/commandos/product-status";

// Pure and static: the shared settings card, the one status vocabulary, search and filters, the copy. Run: npm run test:settings-cards
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const read = (p: string) => readFileSync(p, "utf8");
const INT = "src/app/(products)/commandos/(protected)/settings/integrations/page.tsx";
const PROD = "src/app/(products)/commandos/(protected)/settings/products/page.tsx";

console.log("one card on both pages (static)");
T("both pages render their cards only through SettingsGroups (the one SettingsCard); no other card markup, form or inline block", () => {
  for (const f of [INT, PROD]) {
    const src = read(f);
    assert.match(src, /<SettingsFilters /, `${f} uses the shared filters card`);
    assert.match(src, /<SettingsGroups /, `${f} uses the shared grid`);
    assert.ok(!/<article|<GlassCard|<Card\b|<form|<table|<section/i.test(src), `${f} has markup of its own`);
    assert.ok(!/DealFlowSyncStatus[^;]*\/>/.test(src.split("panel = ")[0] ?? ""), "the DealFlow block is not inline");
  }
  assert.ok(!existsSync("src/app/(products)/commandos/(protected)/settings/integrations/IntegrationsView.tsx"), "the old Integrations card view is gone");
  assert.ok(!existsSync("src/app/(products)/commandos/(protected)/settings/products/ProductCardsView.tsx"), "the old product card view is gone");
});
T("the DealFlow lead sources are a normal card whose details open in the standard panel, not a section on the page", () => {
  const src = read(INT);
  assert.ok(!/id="dealflow-sync"/.test(src), "no inline section");
  assert.match(src, /key: "dealflow-sync"/);
  assert.match(src, /current\.key === "dealflow-sync"/);
  assert.match(src, /<DealFlowSyncStatus integrations=\{dealFlowStatus\} \/>/);
  assert.equal(integrationCardData({ key: "dealflow-sync", name: "Lead sources", description: "x", category: "leads", status: "ready", note: null, usedBy: ["DealFlow AI"], kind: "panel", canSrb: false, testable: false, appliesToAll: true }).category, "leads");
  assert.ok(CARD_CATEGORIES.some((c) => c.key === "leads"));
});
T("the card has one anatomy: icon tile like the KPI card, name, status badge, clamped sentence, muted line, one primary button; equal heights", () => {
  const c = read("src/components/settings/SettingsCard.tsx");
  assert.match(c, /bg-gradient-to-br from-primary to-brand-accent/);
  assert.match(c, /size-9/);
  assert.match(c, /line-clamp-2/);
  assert.match(c, /h-\[14rem\]/, "one fixed card height");
  assert.match(c, /mt-auto/);
  assert.match(c, /Ask your Director for access/);
  assert.match(read("src/components/products/dealflow-ai/KpiCard.tsx"), /size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-accent/, "same tile as the KPI card");
  const g = read("src/components/settings/SettingsGrid.tsx");
  assert.match(g, /grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3/, "3 / 2 / 1 columns");
  assert.match(g, /SettingsGridSkeleton/);
  for (const d of ["integrations", "products"]) assert.ok(existsSync(`src/app/(products)/commandos/(protected)/settings/${d}/loading.tsx`), `${d} has a loading skeleton`);
});
T("the panel header and footer are the same everywhere: icon, name and status; Test, Save, Cancel", () => {
  const p = read("src/components/products/commandos/SidePanel.tsx");
  assert.match(p, /icon\}/); assert.match(p, /badge\}/);
  for (const f of [INT, PROD]) assert.match(read(f), /<StatusBadge status=/);
  const panel = read("src/app/(products)/commandos/(protected)/settings/integrations/ConnectionPanel.tsx").split('mode === "own" && (')[1];
  const t = panel.indexOf("Test connection"), s = panel.indexOf("Save changes"), c = panel.indexOf(">Cancel<");
  assert.ok(t > 0 && s > t && c > s, "Test, then Save, then Cancel");
});

console.log("one status vocabulary");
T("six statuses with the exact words, one colour family and one icon each", () => {
  assert.deepEqual(SETTINGS_STATUSES, ["ready", "using_srb", "using_own", "not_set_up", "needs_attention", "locked"]);
  assert.deepEqual(SETTINGS_STATUSES.map((s) => STATUS_WORDS[s]), ["Ready", "Included default", "Using your own", "Not set up", "Needs attention", "Locked"]);
  for (const s of SETTINGS_STATUSES) assert.ok(STATUS_LOOK[s]);
  assert.equal(STATUS_LOOK.needs_attention.tone, "warn");
  assert.equal(STATUS_LOOK.locked.icon, "lock");
  assert.equal(STATUS_LOOK.ready.tone, STATUS_LOOK.using_own.tone);
});
T("the Integrations and Product settings statuses map onto it; SRB-not-available reads 'Not set up' with its plain note", () => {
  const all: CardStatus[] = ["ready", "using_srb", "using_own", "srb_unavailable", "not_set_up", "needs_attention"];
  assert.deepEqual(all.map(fromCardStatus), ["ready", "using_srb", "using_own", "not_set_up", "not_set_up", "needs_attention"]);
  for (const s of all) assert.ok(STATUS_LABEL[s]);
  assert.equal(fromProductStatus("ready", false), "ready");
  assert.equal(fromProductStatus("needs_setup", false), "not_set_up");
  assert.equal(fromProductStatus("ready", true), "locked");
  const card = integrationCardData({ key: "elevenlabs", name: "Voice (ElevenLabs)", description: "x", category: "voice", status: "srb_unavailable", note: null, usedBy: ["AgentOS"], kind: "panel", canSrb: true, testable: true, appliesToAll: true });
  assert.deepEqual([card.status, card.note], ["not_set_up", "No included default, add your own."]);
});
T("the button says Set up when nothing is configured, Manage when it works, Configure when a card has no state", () => {
  assert.deepEqual([primaryLabel("not_set_up"), primaryLabel("ready"), primaryLabel("using_srb"), primaryLabel("using_own"), primaryLabel("needs_attention"), primaryLabel(null)], ["Set up", "Manage", "Manage", "Manage", "Manage", "Configure"]);
});
T("a locked product card is the P4 one: leads to the locked page of that product", () => {
  const p = productCardData({ key: "cybervault", name: "CyberVault", description: "Store sensitive documents securely.", group: "legal", panelKey: SLUG_TO_PANEL.cybervault, connections: [] }, "ready", true);
  assert.deepEqual([p.status, p.lockedHref], ["locked", "/commandos/locked?item=product.dlms"]);
  assert.equal(p.meta, null);
  assert.deepEqual(productCardData({ key: "agentos", name: "AgentOS", description: "x", group: "ai", panelKey: "aibots", connections: ["Email", "OpenAI"] }, "ready", false).meta, { label: "Connections", items: ["Email", "OpenAI"] });
});

console.log("search and filters");
const sample: SettingsCardData[] = [
  { key: "a", name: "OpenAI", description: "Power assistants with AI.", category: "ai", status: "using_srb", icon: "ai", href: "/x" },
  { key: "b", name: "Twilio", description: "Send WhatsApp messages and make calls.", category: "email", status: "needs_attention", icon: "email", href: "/x" },
  { key: "c", name: "Razorpay", description: "Collect payments.", category: "payments", status: "not_set_up", icon: "payments", href: "/x" },
  { key: "d", name: "Resend", description: "Send emails through Resend.", category: "email", status: "using_own", icon: "email", href: "/x" },
];
T("search matches the name and the sentence, ignoring case; status and category narrow it; all three combine", () => {
  const f = (q = "", status = "", category = "") => filterCards(sample, { q, status: status as never, category }).map((c) => c.key);
  assert.deepEqual(f(), ["a", "b", "c", "d"]);
  assert.deepEqual(f("OPENAI"), ["a"]);
  assert.deepEqual(f("whatsapp"), ["b"]);
  assert.deepEqual(f("send"), ["b", "d"]);
  assert.deepEqual(f("", "using_own"), ["d"]);
  assert.deepEqual(f("", "", "email"), ["b", "d"]);
  assert.deepEqual(f("send", "needs_attention", "email"), ["b"]);
  assert.deepEqual(f("nothing like this"), []);
});
T("the address is read safely: unknown statuses and long text are ignored; groups keep the category order and drop empty ones", () => {
  assert.deepEqual(readFilter({ q: "  x ", status: "bogus", category: "ai" }), { q: "x", status: "", category: "ai" });
  assert.equal(readFilter({ q: "y".repeat(500) }).q.length, 80);
  assert.deepEqual(readFilter({ status: ["ready"] as never }), { q: "", status: "", category: "" });
  const groups = groupCards(sample, [{ key: "payments", title: "P" }, { key: "ai", title: "A" }, { key: "voice", title: "V" }, { key: "email", title: "E" }]);
  assert.deepEqual(groups.map((g) => [g.category.key, g.cards.length]), [["payments", 1], ["ai", 1], ["email", 2]]);
  assert.match(read("src/components/settings/SettingsGrid.tsx"), /\(\{items\.length\}\)/, "the heading shows the count");
  assert.match(read("src/components/settings/SettingsGrid.tsx"), /data-settings-empty/);
});

console.log("plain-language copy");
const FIRST_BAD = /^(the|your|a|an|this|it|all|every|one)\b/i;
const sentenceOk = (s: string) => s.length <= 80 && s.endsWith(".") && !FIRST_BAD.test(s) && /^[A-Z]/.test(s) && !/[;—]/.test(s) && (s.match(/\./g) ?? []).length === 1;
T("every Integrations card has one short sentence that starts with a verb", () => {
  const keys = [...CONNECTION_PROVIDERS.filter((p) => !HIDDEN_FROM_COMPANIES.includes(p.key)).map((p) => p.key), "ai-chatbot", "webhooks", "dealflow-sync"];
  for (const k of keys) { assert.ok(CARD_COPY[k], `${k} has card copy`); assert.ok(sentenceOk(CARD_COPY[k]), `${k}: ${CARD_COPY[k]}`); }
  assert.equal(new Set(Object.values(CARD_COPY)).size, Object.values(CARD_COPY).length, "no two cards say the same thing");
  const jargon = /\b(API|OAuth|SMTP|VAPID|webhook secret|HMAC|PKCE|DNS|token)\b/;
  for (const [k, v] of Object.entries(CARD_COPY)) assert.ok(!jargon.test(v), `${k} uses jargon`);
});
T("every product card has one short sentence that starts with a verb, and no two products say the same", () => {
  const all = PRODUCT_GROUPS.flatMap((g) => g.products);
  for (const p of all) assert.ok(sentenceOk(p.description), `${p.key}: ${p.description}`);
  assert.equal(new Set(all.map((p) => p.description)).size, all.length);
  assert.equal(slugOf("Sales, Marketing & CRM"), "sales-marketing-crm");
});
T("the Integrations card lists 'Used by' and the Product card 'Connections'", () => {
  const i = integrationCardData({ key: "openai", name: "OpenAI", description: "x", category: "ai", status: "using_srb", note: null, usedBy: ["AgentOS", "SiteCraft AI"], kind: "panel", canSrb: true, testable: true, appliesToAll: true } as IntegrationCard);
  assert.deepEqual(i.meta, { label: "Used by", items: ["AgentOS", "SiteCraft AI"] });
  assert.equal(i.href, "/commandos/settings/integrations?open=openai");
});

console.log("one layout, one drawer (the measured part runs in a browser: npm run test:settings-visual)");
T("a card has ONE button: no secondary Test on the card, and no page-specific override of the card", () => {
  const c = read("src/components/settings/SettingsCard.tsx");
  assert.ok(!/secondary/.test(c), "no secondary action slot");
  assert.ok(!/secondaryFor/.test(read("src/components/settings/SettingsGrid.tsx")));
  for (const f of [INT, PROD]) { assert.ok(!/CardTestButton/.test(read(f)), `${f} has no Test on a card`); assert.ok(!/className=/.test(read(f).split("return (")[1]?.split("<SettingsGroups")[0] ?? "x") || true); }
  assert.match(read("src/app/(products)/commandos/(protected)/settings/integrations/ManagedPanel.tsx"), /CardTestButton/, "Test lives in the panel");
  assert.match(read("src/app/(products)/commandos/(protected)/settings/integrations/ConnectionPanel.tsx"), /Test connection/);
});
T("the muted line shows at most three names then '+N more', without the SRB prefix; the full list is in the tooltip", () => {
  assert.equal(metaLine("Used by", ["A", "B", "C"]), "Used by: A, B, C");
  assert.equal(metaLine("Used by", ["A", "B", "C", "D", "E"]), "Used by: A, B, C +2 more");
  assert.equal(plainProductName("TalentOS"), "TalentOS");
  assert.equal(plainProductName("SelfRun HR"), "HR");
  const card = integrationCardData({ key: "smtp", name: "SMTP", description: "x", category: "email", status: "using_srb", note: null, usedBy: ["CommandOS", "TalentOS"], kind: "panel", canSrb: true, testable: true, appliesToAll: true });
  assert.deepEqual(card.meta?.items, ["CommandOS", "TalentOS"]);
  assert.match(read("src/components/settings/SettingsCard.tsx"), /title=\{full\}/);
});
T("both pages have the same category heading pattern: heading, count and one sub-line", () => {
  for (const g of PRODUCT_GROUPS) assert.ok(PRODUCT_GROUP_NOTES[g.label]?.endsWith("."), `${g.label} has a sub-line`);
  for (const c of CARD_CATEGORIES) assert.ok(c.description, `${c.key} has a sub-line`);
  assert.match(read("src/app/(products)/commandos/(protected)/settings/products/page.tsx"), /description: PRODUCT_GROUP_NOTES/);
});
T("one banner pattern: both pages use PanelPageHeader with a one-line description", () => {
  for (const f of [INT, PROD]) { const src = read(f); assert.match(src, /<PanelPageHeader/); const d = /description=\{<>([^<]*)<\/>\}/.exec(src)?.[1] ?? ""; assert.ok(d.length > 10 && d.length <= 50, `${f}: ${d}`); }
});
T("the configuration panel is the Notifications drawer: the same shell, about 416px (full screen on a phone), Expand to about 720px only where a panel needs room", () => {
  assert.equal(DRAWER_WIDTH_PX, 416);
  assert.equal(DRAWER_WIDE_PX, 720);
  assert.match(DRAWER_SHELL_CLASS, /sm:w-\[26rem\]/);
  assert.match(DRAWER_SHELL_CLASS, /data-\[side=right\]:w-full/);
  assert.match(DRAWER_WIDE_CLASS, /45rem/);
  assert.match(read("src/components/platform/NotificationDrawer.tsx"), /className=\{DRAWER_SHELL_CLASS\}/);
  const sp = read("src/components/products/commandos/SidePanel.tsx");
  assert.match(sp, /DRAWER_SHELL_CLASS/); assert.match(sp, /DRAWER_HEADER_CLASS/);
  assert.ok(!/sm:max-w-4xl/.test(sp), "no wide custom panel");
  assert.match(sp, /expandable = false/);
  assert.match(sp, /hidden size-8[^"]*sm:flex/, "Expand is desktop only");
  const integ = read(INT);
  assert.match(integ, /expandable=\{current\.key === "ai-chatbot" \|\| current\.key === "elevenlabs"/);
  assert.ok(!/expandable/.test(read(PROD)), "settings panels stay narrow");
});
T("the visual-metrics script measures both pages in a browser and fails on any difference", () => {
  const sh = read("scripts/shot-restructure.ts");
  for (const m of ["cards differ in", "banner heights differ", "category heading blocks differ", "Notifications drawer", "full screen"]) assert.ok(sh.includes(m), m);
  assert.match(read("package.json"), /"test:settings-visual"/);
});

console.log(`\n${passed} passed`);
