import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { NAV_ITEMS, NAV_KEYS, NAV_SECTIONS, resolveNav, type NavContext } from "../src/lib/products/commandos/nav";
import { MOVED_URLS, movedTarget } from "../src/lib/products/commandos/moved-urls";
import { CARD_CATEGORIES, cardStatus, categoryOf } from "../src/lib/platform/connections/cards";
import { CONNECTION_PROVIDERS, canUseSrb, providerByKey } from "../src/lib/platform/connections/catalog";
import { PRODUCT_STATUS_LABEL, SETTINGS_SCREENS, SLUG_TO_PANEL, productStatus } from "../src/lib/products/commandos/product-status";
import { mergeSeries } from "../src/components/products/commandos/AiVoiceInsight";
import { getSavedConnection, getConnectionView, saveConnection, setConnectionMode, listConnectionViews } from "../src/lib/platform/connections/store";
import { resolveConnection } from "../src/lib/platform/connections/resolve";

// Pure and static checks first, then a throwaway database (MONGODB_URI=.../zz_throwaway_*, PLATFORM_ENCRYPTION_KEY set). Run: npm run test:restructure
let passed = 0;
const T = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const ctx = (roles: string[], over: Partial<NavContext> = {}): NavContext => ({ user: { roles, permissionOverrides: null }, platformAccess: false, unavailablePanels: new Set(), panels: {}, ...over });
const read = (p: string) => readFileSync(p, "utf8");
const APP = "src/app/(products)/commandos";

/** The sidebar as a person sees it: headings with their labels, in order. */
function sidebarOf(c: NavContext): { heading: string; items: string[] }[] {
  const nav = resolveNav(c);
  const out: { heading: string; items: string[] }[] = [];
  for (const s of nav.sections.filter((x) => x.sidebar)) {
    const items = s.items.filter((i) => i.inSidebar);
    let last: string | null | undefined;
    for (const i of items) {
      const heading = i.group ?? s.label;
      if (heading !== last) out.push({ heading, items: [] });
      out[out.length - 1].items.push(i.label);
      last = heading;
    }
  }
  return out;
}

/** The file a Workspace address (or the ResolveIQ link in its sidebar) is served from, or null. */
function routeFile(href: string): string | null {
  if (href === "/resolveiq") {
    const f = "src/app/(products)/resolveiq/(protected)/page.tsx";
    return existsSync(f) ? f : null;
  }
  const path = href.split("?")[0].split("#")[0].replace(/^\/commandos\/?/, "");
  for (const base of [`${APP}/(protected)`, APP]) {
    const f = join(base, path, "page.tsx");
    if (existsSync(f)) return f;
  }
  return null;
}

(async () => {
  console.log("sidebar: the owner's exact target");
  const EXPECTED: { heading: string; items: string[] }[] = [
    { heading: "", items: ["Dashboard"] },
    { heading: "Organization Setup", items: ["Setup progress", "Company setup", "Integrations", "Product settings"] },
    { heading: "Users & Access", items: ["Departments", "Teams", "Designations", "People & access"] },
    { heading: "Branding & domains", items: ["Apps & downloads", "Default domain", "Website & public forms", "Custom domains"] },
    { heading: "Billing & plan", items: ["Plan & billing", "Invoices & payments", "Usage & limits"] },
    { heading: "System default", items: ["Notification center", "AI prompts", "Scheduled jobs", "Documents & PDFs"] },
    { heading: "Security & Logs", items: ["Backups & data", "Import data", "Audit log", "Security"] },
    { heading: "Engagement & Insights", items: ["Push notifications", "Dashboard", "Analytics"] },
    { heading: "Help & support", items: ["ResolveIQ"] },
  ];
  await T("the Director's sidebar is exactly the target: headings, items and order", () => {
    assert.deepEqual(sidebarOf(ctx(["super_admin"])), EXPECTED);
  });
  await T("a person with partial access sees only their own part of that sidebar (same headings, same order), and a person with none sees only the Dashboard; nothing is greyed", () => {
    const partial = sidebarOf(ctx(["pms_manager"]));
    const flatPartial = partial.flatMap((g) => g.items);
    let at = -1;
    for (const g of partial) {
      const idx = EXPECTED.findIndex((e) => e.heading === g.heading);
      assert.ok(idx > at, `heading ${g.heading || "(none)"} is in the Director's order`);
      at = idx;
      const full = EXPECTED[idx].items;
      let pos = -1;
      for (const i of g.items) { const n = full.indexOf(i, pos + 1); assert.ok(n > pos, `${i} follows the Director's order under ${g.heading}`); pos = n; }
    }
    assert.ok(!flatPartial.includes("Integrations") && !flatPartial.includes("Plan & billing"), "company settings are the Director's");
    assert.deepEqual(sidebarOf(ctx([])), [{ heading: "", items: ["Dashboard"] }, { heading: "Help & support", items: ["ResolveIQ"] }]);
  });
  await T("no duplicate heading anywhere, and no 'Connections & automation', 'Conversation AI', 'Sender email' or 'Add a person' in the sidebar", () => {
    const sb = sidebarOf(ctx(["super_admin"]));
    const heads = sb.map((s) => s.heading);
    assert.equal(new Set(heads).size, heads.length, "headings are unique");
    const text = JSON.stringify(sb);
    for (const gone of ["Connections", "Conversation AI", "Sender email", "Add a person", "Voice Dashboard", "AI Config", "Knowledge Base", "Voice Conversations", "ElevenLabs"]) assert.ok(!text.includes(gone), gone);
  });
  await T("every sidebar item opens a page that exists (no dead links), for open and locked states alike", () => {
    for (const c of [ctx(["super_admin"]), ctx([])]) {
      for (const s of resolveNav(c).sections.filter((x) => x.sidebar)) {
        for (const i of s.items.filter((x) => x.inSidebar)) {
          const href = i.href;
          assert.ok(routeFile(href) || href === "/commandos", `${i.key} -> ${href}`);
        }
      }
    }
  });
  await T("items reached from another page stay guarded but are not in the sidebar (chatbot screens, sender email, payments, automations, branding)", () => {
    const hidden = NAV_ITEMS.filter((i) => i.inSidebar === false).map((i) => i.key);
    for (const k of ["company.email", "company.payments", "company.automations", "company.branding", "manage.chatbot.conversations", "manage.chatbot.knowledge-base", "manage.chatbot.config", "manage.chatbot.voice", "manage.chatbot.voice-conversations", "manage.chatbot.voice.config"]) assert.ok(hidden.includes(k), k);
    assert.ok(!NAV_KEYS.includes("company.addperson"));
    assert.ok(NAV_KEYS.includes("manage.chatbot"));
  });
  await T("the section order, and the products, management and analytics sections stay out of the sidebar by design", () => {
    assert.deepEqual(NAV_SECTIONS.filter((s) => s.sidebar !== false).map((s) => s.key), ["dashboard", "company", "insight", "support", "platform"]);
    assert.deepEqual(NAV_SECTIONS.filter((s) => s.sidebar === false).map((s) => s.key), ["panels", "analytics", "manage", "account"]);
  });
  await T("every key a page or action checks exists in the navigation (a missing key would lock Directors out)", () => {
    const used = new Set<string>();
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) for (const m of read(p).matchAll(/require(?:Workspace)(?:Access|Action)\("([a-z0-9._-]+)"\)|authorizeWorkspaceApi\("([a-z0-9._-]+)"\)/gi)) used.add(m[1] ?? m[2]); } };
    walk("src/app"); walk("src/lib");
    assert.ok(used.size > 10);
    assert.deepEqual([...used].filter((k) => !NAV_KEYS.includes(k)), []);
  });

  console.log("moved addresses");
  await T("every old address has a page that redirects to the new place, and the new place exists", () => {
    assert.equal(MOVED_URLS.length, 7 + 12);
    for (const m of MOVED_URLS) {
      const f = routeFile(m.from);
      assert.ok(f, `${m.from}: the old page still exists`);
      assert.match(read(f!), new RegExp(`movedTarget\\("${m.from.replace(/[/]/g, "\\/")}"`), `${m.from} redirects through movedTarget`);
      assert.ok(routeFile(m.to), `${m.from} -> ${m.to}: target page exists`);
    }
  });
  await T("redirects open the right panel and keep the extra query (page, search)", () => {
    assert.equal(movedTarget("/commandos/chatbot/conversations", { page: "2", search: "refund" }), "/commandos/settings/integrations?open=ai-chatbot&tab=conversations&page=2&search=refund");
    assert.equal(movedTarget("/commandos/chatbot/voice"), "/commandos/analytics#ai-voice");
    assert.equal(movedTarget("/commandos/settings/email"), "/commandos/settings/integrations?open=sender-email");
    assert.equal(movedTarget("/commandos/settings/products/talentos", { tab: "payroll" }), "/commandos/settings/products?open=talentos&tab=payroll");
    assert.equal(movedTarget("/commandos/nothing"), null);
  });
  await T("the add-person wizard address still opens the wizard, and the People page has the prominent button", () => {
    assert.ok(routeFile("/commandos/users/new"));
    assert.match(read(`${APP}/(protected)/users/page.tsx`), /Add a person/);
    assert.match(read(`${APP}/(protected)/users/PeopleGrid.tsx`), /Add a person/);
  });
  await T("panel targets exist: every ?open= key of Integrations and Product settings is a real panel", () => {
    const integ = read(`${APP}/(protected)/settings/integrations/page.tsx`);
    for (const k of ["ai-chatbot", "elevenlabs"]) assert.ok(integ.includes(`"${k}"`), k);
    const products = read(`${APP}/(protected)/settings/products/page.tsx`);
    for (const slug of SETTINGS_SCREENS) assert.ok(products.includes(`case "${slug}"`), slug);
  });

  console.log("integrations cards");
  await T("one card per service: unique provider keys, each in a plain category, with a used-by list from product keys", () => {
    const keys = CONNECTION_PROVIDERS.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length);
    const cats = new Set(CARD_CATEGORIES.map((c) => c.key));
    for (const p of CONNECTION_PROVIDERS) assert.ok(cats.has(categoryOf(p.key)), p.key);
    assert.ok(cats.has(categoryOf("ai-chatbot")));
    // "Used by" comes from the Product Registry now (see test-connections): every connection id a built-in product declares is a real card.
    void SLUG_TO_PANEL;
  });
  await T("card status: SRB by default, own when saved, attention when the last test failed, not set up otherwise", () => {
    const base = { canSrb: true, srbReady: true, mode: "srb" as const, hasOwnKeys: false, lastTestOk: null };
    assert.equal(cardStatus(base), "using_srb");
    assert.equal(cardStatus({ ...base, srbReady: false }), "srb_unavailable", "SRB could provide it but has not set it up");
    assert.equal(cardStatus({ ...base, canSrb: false }), "not_set_up");
    assert.equal(cardStatus({ ...base, mode: "own", hasOwnKeys: true }), "using_own");
    assert.equal(cardStatus({ ...base, mode: "own", hasOwnKeys: true, lastTestOk: false }), "needs_attention");
    assert.equal(cardStatus({ ...base, mode: "own", hasOwnKeys: true, lastTestOk: true }), "using_own");
    assert.equal(cardStatus({ ...base, mode: "srb", hasOwnKeys: true }), "using_srb", "own keys kept but SRB chosen");
    assert.equal(cardStatus({ ...base, mode: "own", hasOwnKeys: false, canSrb: false }), "not_set_up");
    assert.equal(cardStatus({ ...base, managedConnected: true }), "using_own");
    assert.equal(cardStatus({ ...base, managedConnected: false }), "not_set_up");
    assert.equal(cardStatus({ ...base, managedConnected: true, managedProblem: true }), "needs_attention");
  });
  await T("which services SelfRun can run: AI, voice, calls, search data, email and push; never payments or social apps", () => {
    for (const k of ["openai", "elevenlabs", "twilio", "smtp", "resend", "vapid", "google-service-account"]) assert.equal(canUseSrb(k), true, k);
    for (const k of ["razorpay", "meta", "linkedin", "x", "whatsapp-cloud"]) assert.equal(canUseSrb(k), false, k);
  });
  await T("product card status: Ready unless a product cannot do its main job without a connection", () => {
    const none = { aiReady: false, googleReady: false, socialConnected: false };
    const all = { aiReady: true, googleReady: true, socialConnected: true };
    assert.equal(productStatus("talentos", none), "ready");
    assert.equal(productStatus("agentos", none), "needs_setup");
    assert.equal(productStatus("agentos", all), "ready");
    assert.equal(productStatus("viralpulse-ai", { ...all, socialConnected: false }), "needs_setup");
    assert.equal(productStatus("rankmax-ai", none), "needs_setup");
    assert.equal(productStatus("rankmax-ai", all), "ready");
    assert.equal(PRODUCT_STATUS_LABEL.needs_setup, "Needs setup");
  });
  await T("the combined AI & Voice series adds chat and voice conversations per day, in date order", () => {
    assert.deepEqual(mergeSeries([{ date: "2026-11-02", count: 3 }, { date: "2026-11-01", count: 1 }], [{ date: "2026-11-02", count: 2 }, { date: "2026-11-03", count: 4 }]), [
      { date: "2026-11-01", count: 1 }, { date: "2026-11-02", count: 5 }, { date: "2026-11-03", count: 4 },
    ]);
  });
  await T("no configuration screen is rendered in two panels: each is imported by exactly one host", () => {
    const hosts: Record<string, string[]> = {};
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) { const s = read(p); for (const name of ["ChatbotConfigPage", "KnowledgeBasePage", "VoiceConfigPage", "ConversationsScreen", "VoiceConversationsScreen", "TalentosSettingsScreen", "SprintosSettingsScreen", "AgentosSettingsScreen", "CashflowAiSettingsScreen", "SpendiqSettingsScreen", "RankmaxSettingsScreen", "ViralpulseSettingsScreen", "SitecraftSettingsScreen", "PlaybookSettingsScreen", "CybervaultSettingsScreen", "EvaliqSettingsScreen", "CohortAiSettingsScreen"]) if (new RegExp(`import\\s+${name}\\b`).test(s)) (hosts[name] ??= []).push(p); } } };
    walk("src/app"); walk("src/components");
    for (const [name, files] of Object.entries(hosts)) {
      const panelHosts = files.filter((f) => /settings\/(integrations|products)\/page\.tsx$/.test(f));
      assert.equal(panelHosts.length, 1, `${name} is a panel in exactly one place`);
      assert.deepEqual(files.filter((f) => !panelHosts.includes(f) && /\/page\.tsx$/.test(f)), [], `${name} is not also a page of its own`);
    }
  });
  await T("inside a provider's panel no field is asked twice: field keys and labels are unique per provider", () => {
    for (const p of CONNECTION_PROVIDERS) {
      assert.equal(new Set(p.fields.map((f) => f.key)).size, p.fields.length, `${p.key} keys`);
      assert.equal(new Set(p.fields.map((f) => f.label)).size, p.fields.length, `${p.key} labels`);
    }
  });

  console.log("sender email inside Integrations (static)");
  await T("Integrations has the Sender email card (Director only) with the three steps; Custom domains no longer does; the old page only redirects", () => {
    const d = read(`${APP}/(protected)/settings/integrations/page.tsx`);
    assert.match(d, /isDirector\(user\) \? getCompanySender\(\)/);
    assert.match(d, /<SenderEmailPanel/);
    assert.match(read(`${APP}/(protected)/settings/integrations/SenderEmailPanel.tsx`), /EmailSenderManager/);
    assert.ok(!read(`${APP}/(protected)/settings/domains/page.tsx`).includes("EmailSender"));
    const m = read(`${APP}/(protected)/settings/email/EmailSenderManager.tsx`);
    for (const s of ["Step 1.", "Step 2.", "Step 3.", "Waiting for DNS", "Verified", "Problem"]) assert.ok(m.includes(s), s);
    assert.ok(!read(`${APP}/(protected)/settings/email/page.tsx`).includes("EmailSenderManager"));
  });
  await T("the right-hand panel is a keyboard-accessible sheet driven by the address", () => {
    const s = read("src/components/products/commandos/SidePanel.tsx");
    assert.match(s, /<Sheet open/);
    assert.match(s, /router\.push\(closeHref/);
    assert.match(s, /DRAWER_SHELL_CLASS/);
    assert.match(s, /aria-label=\{title\}/);
  });

  console.log("SRB or own, per connection (database)");
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_conn", async () => {
    await T("with nothing saved a connection is SRB by default", async () => {
      const v = await getConnectionView("openai");
      assert.equal(v.mode, "srb");
      assert.equal(v.saved, false);
      assert.equal(await getSavedConnection("openai"), null);
    });
    await T("saving own keys switches that connection to 'own' and the keys are used (secrets never shown back)", async () => {
      const r = await saveConnection("openai", { apiKey: "sk-test-1234567890" }, "u1");
      assert.equal(r.ok, true, r.ok ? "" : r.error);
      const v = await getConnectionView("openai");
      assert.equal(v.mode, "own");
      assert.equal(v.secrets.apiKey.last4, "7890");
      assert.equal(JSON.stringify(v).includes("sk-test"), false, "the secret is not in the view");
      assert.equal((await getSavedConnection("openai"))?.apiKey, "sk-test-1234567890");
      assert.equal((await resolveConnection("openai"))?.source, "workspace");
    });
    await T("choosing SRB keeps the saved keys but stops using them; choosing own uses them again", async () => {
      assert.deepEqual(await setConnectionMode("openai", "srb", "u1"), { ok: true });
      const v = await getConnectionView("openai");
      assert.equal(v.mode, "srb");
      assert.equal(v.saved, true, "keys are kept");
      assert.equal(v.secrets.apiKey.last4, "7890");
      assert.equal(await getSavedConnection("openai"), null, "not used while SRB is chosen");
      assert.notEqual((await resolveConnection("openai"))?.source, "workspace");
      assert.deepEqual(await setConnectionMode("openai", "own", "u1"), { ok: true });
      assert.equal((await getSavedConnection("openai"))?.apiKey, "sk-test-1234567890");
    });
    await T("the choice is per connection: another provider is unaffected", async () => {
      await saveConnection("twilio", { accountSid: "AC123", authToken: "tok-abcdef", whatsappFrom: "+14155550100", smsFrom: "+14155550101" }, "u1");
      await setConnectionMode("openai", "srb", "u1");
      assert.equal((await getConnectionView("twilio")).mode, "own");
      assert.equal((await getSavedConnection("twilio"))?.authToken, "tok-abcdef");
      const all = await listConnectionViews();
      assert.equal(all.openai.mode, "srb");
      assert.equal(all.twilio.mode, "own");
    });
    await T("choosing 'own' with nothing saved is refused (the keys must be saved first); SRB with nothing saved is a no-op", async () => {
      assert.deepEqual(await setConnectionMode("elevenlabs", "own", "u1"), { ok: false });
      assert.deepEqual(await setConnectionMode("elevenlabs", "srb", "u1"), { ok: true });
    });
    await T("a connection saved before this choice existed (no mode field) counts as 'own'", async () => {
      const { getDb } = await import("../src/lib/mongodb");
      await (await getDb()).collection("workspace_connections").updateOne({ _id: "twilio" as never }, { $unset: { mode: "" } });
      assert.equal((await getConnectionView("twilio")).mode, "own");
      assert.equal((await getSavedConnection("twilio"))?.accountSid, "AC123");
    });
    await T("another company never sees these keys or this choice", async () => {
      await runAsCompany("co_other", async () => {
        assert.equal((await getConnectionView("openai")).saved, false);
        assert.equal(await getSavedConnection("twilio"), null);
      });
    });
  });
  void providerByKey;

  await (await getPlatformDb()).dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
