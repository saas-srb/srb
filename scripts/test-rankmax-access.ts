import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { setAccess, subjectFromRow } from "../src/lib/access/server";
import { legacyToAccess, accessToLegacy, completeAccess } from "../src/lib/access/adapter";
import { legacyAnswers } from "../src/lib/access/legacy";
import { CATALOGUE } from "../src/lib/access/catalogue";
import { microOf } from "../src/lib/access/micro";
import { can, assertCan, ForbiddenError, type SeoViewer } from "../src/lib/products/rankmax-ai/viewer";
import { canWorkOnTask } from "../src/lib/products/rankmax-ai/tasks";
import { splitPicked, checkAccess } from "../src/lib/products/commandos/people";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { seoCan } from "../src/lib/seo-roles";

// Director vs partial vs old employee in RankMax. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "rankmax-ai";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_rm", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const ids = { director: new ObjectId(), emp: new ObjectId(), mgr: new ObjectId(), partial: new ObjectId(), baseline: new ObjectId(), tasksAll: new ObjectId() };
    await people.insertMany([
      { _id: ids.director, email: "d@x", roles: ["super_admin"] }, { _id: ids.emp, email: "e@x", roles: ["seo_employee"] }, { _id: ids.mgr, email: "m@x", roles: ["seo_manager"] },
      { _id: ids.partial, email: "p@x", roles: ["employee"] }, { _id: ids.baseline, email: "b@x", roles: ["employee"] }, { _id: ids.tasksAll, email: "t@x", roles: ["employee"] },
    ] as never);
    const set = async (id: ObjectId, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };
    await set(ids.partial, { [k("keywords.view")]: "read", [k("keywords.manage")]: "write", [k("reports.export")]: "read" });
    await set(ids.baseline, { [k("dashboard.view")]: "read" });
    await set(ids.tasksAll, { [k("tasks.view")]: "read", [k("tasks.manage")]: "write", [k("tasks.all")]: "read" });
    const viewerOf = async (id: ObjectId): Promise<SeoViewer> => {
      const row = (await people.findOne({ _id: id }))!;
      const subject = subjectFromRow(row as never);
      const roles = (row.roles as string[]) ?? [];
      return { userId: String(id), email: String(row.email), roles, overrides: {}, ctx: { roles, permissionOverrides: null }, subject, isManagerTier: can({ subject }, "tasks.all") };
    };

    await T("parity: old roles give exactly the micro features their legacy capabilities give; the matrix round-trips with 0 differences", async () => {
      for (const [roles, ov] of [[["seo_employee"], null], [["seo_specialist"], null], [["seo_manager"], null], [["seo_admin"], null], [["seo_employee"], { "seo.canExportReports": true, "seo.canDelete": true }], [["seo_manager"], { "seo.canViewAudit": false }]] as const) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles.join("+")} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access));
        assert.deepEqual(d.widened, [], `widened ${roles}`); assert.deepEqual(d.withheld, [], `withheld ${roles}`);
        if (!ov) { const back = legacyAnswers({ roles: d.roles, permissionOverrides: d.permissionOverrides }); for (const e of CATALOGUE.filter((x) => x.product === P && x.kind !== "tier")) assert.equal(back[e.key], legacy[e.key], `${e.key} after round trip ${roles}`); }
      }
    });
    await T("parity: viewer answers equal the old seoCan answers for each old role", async () => {
      const pairs: [string, Parameters<typeof seoCan>[1]][] = [["pages.view", "VIEW"], ["pages.create", "CREATE"], ["issues.edit", "EDIT"], ["pages.delete", "DELETE"], ["audit.run", "RUN_AUDIT"], ["keywords.manage", "MANAGE_KEYWORDS"], ["rankings.manage", "MANAGE_RANKINGS"], ["onpage.manage", "MANAGE_ON_PAGE_SEO"], ["technical.manage", "MANAGE_TECHNICAL_SEO"], ["backlinks.manage", "MANAGE_BACKLINKS"], ["sitemap.manage", "MANAGE_SITEMAP"], ["robots.manage", "MANAGE_ROBOTS"], ["schema.manage", "MANAGE_SCHEMA"], ["competitors.manage", "MANAGE_COMPETITORS"], ["tasks.manage", "MANAGE_TASKS"], ["reports.export", "EXPORT_REPORTS"], ["settings.manage", "MANAGE_INTEGRATIONS"], ["audit.log", "VIEW_AUDIT"]];
      for (const id of [ids.emp, ids.mgr]) { const v = await viewerOf(id); for (const [m, perm] of pairs) assert.equal(can(v, m), seoCan(v.ctx, perm), `${m} for ${v.roles}`); }
    });
    await T("Director: every micro feature", async () => { const v = await viewerOf(ids.director); for (const m of microOf(P)) assert.ok(can(v, m.key.slice(P.length + 1)), m.key); assert.equal(v.isManagerTier, true); });
    await T("old employee: works on own tasks only (no 'everyone's tasks' scope) and cannot delete, manage robots or change settings", async () => {
      const v = await viewerOf(ids.emp);
      assert.equal(v.isManagerTier, false);
      assert.ok(can(v, "keywords.manage") && can(v, "tasks.manage") && can(v, "audit.run"));
      assert.ok(!can(v, "keywords.delete") && !can(v, "robots.manage") && !can(v, "settings.manage") && !can(v, "reports.export"));
      assert.equal(canWorkOnTask(v, { assigneeId: String(ids.emp), createdBy: "x" }), true);
      assert.equal(canWorkOnTask(v, { assigneeId: "someone", createdBy: "x" }), false);
      assert.throws(() => assertCan(v, "keywords.delete"), ForbiddenError);
    });
    await T("partial person: only the granted features; the rest is hidden and refused", async () => {
      const v = await viewerOf(ids.partial);
      assert.ok(can(v, "keywords.view") && can(v, "keywords.manage") && can(v, "reports.export"));
      for (const f of ["tasks.view", "pages.view", "audit.run", "keywords.delete", "settings.manage", "rankings.view", "tasks.all"]) assert.equal(can(v, f), false, f);
      assert.throws(() => assertCan(v, "pages.delete"), ForbiddenError);
      assert.equal(can(v, "nonexistent.feature"), false, "an unknown key is never allowed");
    });
    await T("'everyone's tasks' scope is its own feature", async () => {
      const v = await viewerOf(ids.tasksAll);
      assert.equal(v.isManagerTier, true);
      assert.equal(canWorkOnTask(v, { assigneeId: "someone", createdBy: "x" }), true);
      assert.equal(can(v, "keywords.view"), false);
    });
    await T("baseline-only: opens the dashboard and nothing else", async () => {
      const v = await viewerOf(ids.baseline);
      const held = microOf(P).filter((m) => can(v, m.key.slice(P.length + 1))).map((m) => m.key);
      assert.deepEqual(held, [k("dashboard.view")]);
    });
    await T("removing a feature takes effect on the next request", async () => {
      assert.ok(can(await viewerOf(ids.partial), "keywords.manage"));
      await set(ids.partial, { [k("keywords.view")]: "read" });
      const v = await viewerOf(ids.partial);
      assert.equal(can(v, "keywords.manage"), false); assert.equal(can(v, "keywords.view"), true);
    });
    await T("an old-role person opens prefilled in micro features; saving unchanged changes nothing; the matrix lists every module", async () => {
      const { access } = legacyToAccess({ roles: ["seo_employee"], permissionOverrides: null });
      const picked = splitPicked(access);
      assert.ok(Object.keys(picked[P] ?? {}).every((x) => x.split(".").length === 3));
      const c = checkAccess(picked); assert.deepEqual(c.widened, []); assert.deepEqual(c.withheld, []);
      for (const m of microOf(P)) assert.equal(Boolean(c.access[P]?.[m.key]), Boolean(access[P]?.[m.key]), m.key);
      const ui = buildAccessUi().products.find((p) => p.key === P)!;
      assert.equal(ui.features.length, microOf(P).length);
      assert.ok(new Set(ui.features.map((f) => f.area)).size >= 15 && ui.features.some((f) => f.scope === "all"));
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
