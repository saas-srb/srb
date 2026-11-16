import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { ObjectId } from "mongodb";
import { NAV_ITEMS, resolveNav, lockedHref, stateOf, type NavContext } from "../src/lib/products/commandos/nav";
import { accessToLegacy } from "../src/lib/access/adapter";
import { CATALOGUE, featuresOf, PRODUCTS } from "../src/lib/access/catalogue";
import { isDirector } from "../src/lib/access/director";
import { decideRequest, cleanMessage, REQUEST_LIMITS } from "../src/lib/products/commandos/access-requests-rules";
import { createAccessRequest, listAccessRequests, listDirectors, resolveAccessRequest, openRequestFor } from "../src/lib/products/commandos/access-requests";
import type { AccessMap } from "../src/lib/access/types";

// Pure checks first, then a throwaway database (MONGODB_URI=.../zz_throwaway_*). Run: npm run test:shell
let passed = 0;
const T = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };

const ctx = (roles: string[], over: Partial<NavContext> = {}, overrides: Record<string, boolean> | null = null): NavContext => ({ user: { roles, permissionOverrides: overrides }, platformAccess: false, unavailablePanels: new Set(), panels: {}, ...over });
const flat = (n: ReturnType<typeof resolveNav>) => n.sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.key })));
const keys = (n: ReturnType<typeof resolveNav>) => flat(n).map((i) => i.key);

(async () => {
  console.log("navigation: the Director's layout; what a person may not use is hidden (owner rule 2026-11-17)");
  const director = resolveNav(ctx(["super_admin"]));
  await T("the Director sees every item, none locked", () => {
    assert.ok(flat(director).length > 90);
    assert.deepEqual(flat(director).filter((i) => i.locked), []);
    assert.equal(director.lockedKeys.length, 0);
  });
  await T("a person with no products sees only what they can open: no product tile, nothing greyed, nothing locked, and empty sections disappear", () => {
    const none = resolveNav(ctx([]));
    assert.deepEqual(flat(none).filter((i) => i.locked), [], "no item is shown locked");
    const products = flat(none).filter((i) => i.section === "panels" && i.key.startsWith("product."));
    assert.deepEqual(products.map((i) => i.key), [], "no product tile at all (DealFlow follows the matrix like every other product)");
    assert.ok(keys(none).includes("dashboard"));
    assert.ok(flat(none).length < 10, `only a handful are visible (${flat(none).length})`);
    assert.ok(none.lockedKeys.length > 80, "the hidden ones are still known to the server, so a direct address can explain itself");
    for (const s of none.sections) assert.ok(s.items.length > 0, `${s.key} has no empty heading`);
    assert.ok(none.sections.length < director.sections.length, "sections with nothing to show are gone");
    for (const i of flat(none)) assert.ok(!i.href.startsWith("/commandos/locked"), i.key);
  });
  await T("partial access shows only the matching items, in the Director's order, with no lock anywhere", () => {
    const pms = resolveNav(ctx(["pms_manager"]));
    const visible = new Set(keys(pms));
    assert.ok(visible.has("product.pms"), "SprintOS tile visible");
    assert.ok(!visible.has("product.fms") && !visible.has("product.hrms"), "the others are hidden, not greyed");
    assert.ok(!visible.has("company.billing"), "company settings are the Director's");
    const full = keys(director);
    assert.deepEqual(keys(pms), full.filter((k) => visible.has(k)), "a subset of the Director's list, in the same order");
    assert.deepEqual(flat(pms).filter((i) => i.locked), []);
  });
  await T("the labels, order and icons of what a person sees are the Director's", () => {
    const some = flat(resolveNav(ctx(["pms_manager"])));
    const full = new Map(flat(director).map((i) => [i.key, i]));
    for (const i of some) { assert.equal(i.label, full.get(i.key)!.label); assert.equal(i.icon, full.get(i.key)!.icon); assert.equal(i.group, full.get(i.key)!.group); }
  });
  await T("products switched off by the plan are hidden for everyone, the Director included, and platform items need platform access", () => {
    const off = new Set(["pms", "tms"]);
    for (const roles of [["super_admin"], [], ["pms_manager"]]) {
      const k = keys(resolveNav(ctx(roles, { unavailablePanels: off })));
      assert.ok(!k.includes("product.pms") && !k.includes("product.tms"), roles.join());
    }
    assert.ok(!keys(resolveNav(ctx(["pms_manager", "tms_admin"], { unavailablePanels: off }))).some((k) => ["product.pms", "product.tms"].includes(k)), "a person who holds those products still does not see them while they are off");
    assert.ok(!keys(director).some((k) => k.startsWith("platform.")), "no platform link without platform access");
    assert.ok(keys(resolveNav(ctx(["super_admin"], { platformAccess: true }))).some((k) => k.startsWith("platform.")));
  });
  await T("a person saved from the access map sees exactly what their older roles gave (nav parity over every product preset)", () => {
    for (const product of PRODUCTS.filter((p) => p !== "commandos")) {
      const map: AccessMap = { [product]: Object.fromEntries(featuresOf(product).filter((e) => e.kind !== "tier").map((e) => [e.key, e.level])) };
      const d = accessToLegacy(map);
      const viaMap = resolveNav(ctx(d.roles, {}, d.permissionOverrides));
      assert.ok(viaMap.lockedKeys.length > 0 && viaMap.allowed.length > 0, product);
      assert.deepEqual(keys(viaMap), keys(director).filter((k) => viaMap.allowed.includes(k)), `${product}: the Director's layout, minus what is hidden`);
    }
  });
  await T("every nav item is open or locked for a person, and `stateOf` agrees with the resolved list", () => {
    const c = ctx(["pms_manager"]);
    const n = resolveNav(c);
    for (const item of NAV_ITEMS) {
      const st = stateOf(item, c);
      if (st === "open") assert.ok(keys(n).includes(item.key), item.key);
      else assert.ok(!keys(n).includes(item.key), `${item.key} (${st}) is not shown`);
    }
  });
  await T("isDirector is the one place a Director is recognised", () => {
    assert.equal(isDirector({ roles: ["super_admin"] }), true);
    assert.equal(isDirector({ roles: ["hr"] }), false);
    assert.equal(isDirector(null), false);
  });
  await T("the navigation is one cheap computation: resolving it 200 times takes well under a second", () => {
    const t0 = Date.now();
    const c = ctx(["pms_manager"]);
    for (let i = 0; i < 200; i++) resolveNav(c);
    assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`);
  });

  console.log("product sidebars and layouts (static)");
  const read = (p: string) => readFileSync(p, "utf8");
  const SIDEBARS: [string, string][] = [
    ["cashflow-ai/FmsSidebar", "cashflow-ai"], ["cohort-ai/TmsSidebar", "cohort-ai"], ["cybervault/DlmsSidebar", "cybervault"], ["evaliq/OtsSidebar", "evaliq"],
    ["spendiq/PrmsSidebar", "spendiq"], ["sprintos/PmsSidebar", "sprintos"], ["talentos/HrmsSidebar", "talentos"],
  ];
  await T("the role-filtered product sidebars HIDE what a person may not use (owner rule 2026-11-17): no lock, no greyed item, a section with nothing left disappears, and still no second menu for employees", () => {
    for (const [f] of SIDEBARS) {
      const s = read(`src/components/products/${f}.tsx`);
      assert.doesNotMatch(s, /LockedNavItem/, `${f}: nothing is shown locked`);
      assert.match(s, /NavGroup/, `${f}: sections vanish when empty`);
      assert.doesNotMatch(s, /if \(!isStaff\)/, `${f}: no separate employee-only menu`);
      assert.ok(/locked: !/.test(s) && /props\.locked \? null/.test(s), `${f}: a permission removes the item`);
    }
    const g = read("src/components/products/common/NavGroup.tsx");
    assert.match(g, /shown\.length === 0\) return null/);
  });
  await T("self-service items (Me sections) have no lock in the person-facing menus (decision D3)", () => {
    for (const [f, base] of [["talentos/HrmsSidebar", "/talentos/me"], ["sprintos/PmsSidebar", "/sprintos/me"], ["spendiq/PrmsSidebar", "/spendiq/me"], ["cohort-ai/TmsSidebar", "/cohort-ai/me"]] as const) {
      const s = read(`src/components/products/${f}.tsx`);
      for (const line of s.split("\n").filter((l) => l.includes(`href: "${base}`))) assert.ok(!line.includes("locked:"), `${f}: ${line.trim().slice(0, 70)}`);
    }
  });
  await T("no sidebar, shell, top bar or layout file branches on a role name", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
    walk("src/components"); walk("src/app");
    const target = files.filter((f) => !f.includes("dev-editor-harness") && (/(Sidebar|Shell|Topbar)[^/]*\.tsx$/.test(f) || /\/layout\.tsx$/.test(f)));
    assert.ok(target.length > 40, `${target.length} files checked`);
    const bad = target.filter((f) => /roles\.(includes|some|indexOf)\(|["'](super_admin|hr|manager|employee|training_student|pms_employee|prms_employee)["']/.test(read(f)));
    assert.deepEqual(bad, []);
  });
  await T("the staff-only product layouts render the locked page instead of bouncing the person", () => {
    for (const f of ["talentos/(protected)/(staff)", "sprintos/(protected)/(staff)", "spendiq/(protected)/(staff)", "spendiq/(protected)/procurement", "cohort-ai/(protected)/(staff)"]) {
      const s = read(`src/app/(products)/${f}/layout.tsx`);
      assert.match(s, /<ProductLocked /, f);
      assert.doesNotMatch(s, /redirect\("\/(talentos|sprintos|spendiq|cohort-ai)\/me"\)/, f);
    }
  });
  await T("Workspace pages for Director-only items use the guard that opens the locked page, not a silent redirect home", () => {
    const dir = "src/app/(products)/commandos/(protected)/settings";
    const stray: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === "page.tsx" && /redirect\("\/commandos"\)/.test(read(p)) && /roles/.test(read(p))) stray.push(p); } };
    walk(dir);
    assert.deepEqual(stray, []);
    assert.match(read("src/lib/products/commandos/access.ts"), /lockedHref\(key\)/);
  });
  await T("the locked page remains ONLY for a direct address to something not permitted; dashboard, analytics and product settings show nothing locked", () => {
    assert.ok(existsSync("src/app/(products)/commandos/(protected)/locked/page.tsx"));
    assert.match(read("src/lib/products/commandos/access.ts"), /lockedHref\(key\)/);
    assert.doesNotMatch(read("src/app/(products)/commandos/(protected)/analytics/page.tsx"), /Locked analytics/);
    assert.match(read("src/app/(products)/commandos/(protected)/page.tsx"), /HIDDEN/);
    assert.match(read("src/app/(products)/commandos/(protected)/settings/products/page.tsx"), /not shown at all/);
  });

  console.log("requests for access (pure)");
  await T("request rules: one open request per item, a few per hour, a short message", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    assert.equal(decideRequest({ openForItemAt: null, recentCount: 0, now }).ok, true);
    const dup = decideRequest({ openForItemAt: new Date("2026-11-15T09:00:00Z"), recentCount: 1, now });
    assert.equal(dup.ok, false);
    assert.equal(!dup.ok && dup.reason, "already_open");
    assert.equal(decideRequest({ openForItemAt: new Date("2026-11-13T09:00:00Z"), recentCount: 0, now }).ok, true, "a day later it can be asked again");
    const many = decideRequest({ openForItemAt: null, recentCount: REQUEST_LIMITS.perHour, now });
    assert.equal(!many.ok && many.reason, "too_many");
    assert.equal(cleanMessage("  hello   world ").length, 11);
    assert.equal(cleanMessage("x".repeat(500)).length, REQUEST_LIMITS.messageMax);
    assert.equal(cleanMessage(42), "");
  });

  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_shell", async () => {
    const db = await getDb();
    const users = db.collection("admin_users");
    const dir1 = (await users.insertOne({ email: "d1@x.test", name: "Dee Rector", roles: ["super_admin"], status: "active", createdAt: new Date(), passwordHash: "x" } as never)).insertedId;
    await users.insertOne({ email: "gone@x.test", roles: ["super_admin"], status: "deactivated", createdAt: new Date(), passwordHash: "x" } as never);
    const emp = (await users.insertOne({ email: "emp@x.test", name: "Emp Loyee", roles: ["workspace_member"], status: "active", createdAt: new Date(), passwordHash: "x" } as never)).insertedId;
    const me = { id: String(emp), email: "emp@x.test", name: "Emp Loyee" };
    const target = { itemKey: "company.billing", label: "Plan & billing", product: null, description: null };
    console.log("requests for access (database)");
    await T("the locked page lists the company's Directors who can sign in", async () => {
      const d = await listDirectors();
      assert.deepEqual(d.map((x) => x.email), ["d1@x.test"]);
    });
    let id = "";
    await T("a request is recorded, the Director is notified, and it is listed for them", async () => {
      const r = await createAccessRequest(me, target, "I need to see invoices", "http://localhost:3000");
      assert.equal(r.ok, true, r.ok ? "" : r.error);
      if (r.ok) id = r.id;
      const open = await listAccessRequests("open");
      assert.equal(open.length, 1);
      assert.equal(open[0].label, "Plan & billing");
      assert.equal(open[0].message, "I need to see invoices");
      assert.ok(await openRequestFor(me.id, "company.billing", "Plan & billing"));
      const bell = await db.collection("panel_notifications").findOne({ title: /asked for access to Plan & billing/ });
      assert.ok(bell, "bell notification for the Director");
    });
    await T("asking again for the same thing is refused politely, and nothing is recorded twice", async () => {
      const r = await createAccessRequest(me, target, "again", "http://localhost:3000");
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.reason, "already_open");
      assert.equal((await listAccessRequests("open")).length, 1);
    });
    await T("more than the hourly limit is refused", async () => {
      let refused = 0;
      for (let i = 0; i < 8; i++) {
        const r = await createAccessRequest(me, { itemKey: "", label: `Thing ${i}`, product: "sprintos", description: null }, "", "http://localhost:3000");
        if (!r.ok && r.reason === "too_many") refused++;
      }
      assert.ok(refused >= 3, `refused ${refused}`);
    });
    await T("a Director handles a request: it leaves the open list and the person is told", async () => {
      const r = await resolveAccessRequest(id, "granted", String(dir1));
      assert.equal(r.ok, true);
      assert.equal((await listAccessRequests("open")).some((x) => x._id === id), false);
      assert.ok(await db.collection("panel_notifications").findOne({ title: /You now have access to Plan & billing/ }));
      assert.equal((await resolveAccessRequest(id, "dismissed", String(dir1))).ok, false, "already handled");
    });
    await T("requests are per company", async () => {
      await runAsCompany("co_other", async () => assert.equal((await listAccessRequests("open")).length, 0));
    });
    void ObjectId;
  });

  await (await getPlatformDb()).dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
