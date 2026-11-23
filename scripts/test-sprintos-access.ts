import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { setAccess, subjectFromRow } from "../src/lib/access/server";
import { can as accessCan } from "../src/lib/access/can";
import { legacyToAccess, accessToLegacy, completeAccess } from "../src/lib/access/adapter";
import { legacyAnswers } from "../src/lib/access/legacy";
import { microOf } from "../src/lib/access/micro";
import { pmsCan, pmsSeesAll, pmsScope } from "../src/lib/pms-access";
import { checkProjectAccess } from "../src/lib/products/sprintos/access";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { PROJECTS_COLLECTION } from "../src/lib/products/sprintos/projects";
import { MEMBERS_COLLECTION } from "../src/lib/products/sprintos/project-members";

// SprintOS: Director vs partial vs old roles vs Read only vs own-only vs staff. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "sprintos";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_pms", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    // projects: A is managed by the manager (E_MGR); B has the employee (E_EMP) as an active member; C belongs to nobody we test with
    await db.collection(PROJECTS_COLLECTION).insertMany([{ _id: "A", projectManagerId: "E_MGR", deletedAt: null }, { _id: "B", projectManagerId: "E_OTHER", deletedAt: null }, { _id: "C", projectManagerId: "E_OTHER", deletedAt: null }] as never);
    await db.collection(MEMBERS_COLLECTION).insertMany([{ _id: "m1", projectId: "B", employeeId: "E_EMP", active: true, deletedAt: null }] as never);
    const mk = (roles: string[], employeeId: string | null, ov: Record<string, boolean> | null = null) => ({ _id: new ObjectId(), email: `${roles.join("_")}_${employeeId}@x`, roles, employeeId, ...(ov ? { permissionOverrides: ov } : {}) });
    const rows = { employee: mk(["pms_employee"], "E_EMP"), manager: mk(["pms_manager"], "E_MGR"), admin: mk(["pms_admin"], "E_ADM"), director: mk(["super_admin"], null), partial: mk(["employee"], "E_PART"), readOnly: mk(["employee"], "E_RO") };
    await people.insertMany(Object.values(rows) as never);
    const holder = async (row: { _id: ObjectId; employeeId: string | null }) => { const r = (await people.findOne({ _id: row._id })) as never as { roles: string[]; employeeId: string | null; permissionOverrides?: Record<string, boolean> }; return { id: String(row._id), roles: r.roles as never, employeeId: row.employeeId, subject: subjectFromRow(r as never) }; };
    const set = async (row: { _id: ObjectId }, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(row._id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };

    await T("parity: old SprintOS roles give exactly the micro features their legacy capabilities give; the matrix round-trips with nothing widened or withheld in SprintOS", async () => {
      for (const [roles, ov] of [[["pms_employee"], null], [["pms_manager"], null], [["pms_admin"], null], [["pms_manager"], { "pms.canViewAllProjects": true }], [["pms_admin"], { "pms.canManageClients": false }]] as const) {
        const legacy = legacyAnswers({ roles: [...roles], permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles: [...roles], permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles}`);
        const d = accessToLegacy(completeAccess(access));
        assert.deepEqual(d.widened.filter((x) => x.startsWith("pms.")), [], `widened ${roles}`);
        assert.deepEqual(d.withheld.filter((x) => x.startsWith("pms.")), [], `withheld ${roles}`);
      }
    });
    await T("Director: every micro feature, every project", async () => {
      const d = await holder(rows.director);
      for (const m of microOf(P)) assert.ok(pmsCan(d, m.key.slice(P.length + 1)), m.key);
      assert.ok(pmsSeesAll(d)); assert.ok((await checkProjectAccess(d, "C")).allowed);
    });
    await T("own-only employee: opens only the projects they belong to, cannot manage, cannot open clients, costing or review", async () => {
      const e = await holder(rows.employee);
      assert.ok(pmsCan(e, "projects.view") && pmsCan(e, "tasks.update") && pmsCan(e, "timesheets.submit"));
      for (const f of ["projects.manage", "clients.view", "costing.view", "timesheets.review", "settings.manage", "projects.all"]) assert.equal(pmsCan(e, f), false, f);
      assert.deepEqual(await checkProjectAccess(e, "B"), { allowed: true, canManage: false });
      assert.equal((await checkProjectAccess(e, "A")).allowed, false); assert.equal((await checkProjectAccess(e, "C")).allowed, false);
    });
    await T("staff manager: manages and opens only the projects they manage or belong to; a stranger's project by typed address is closed (it used to open for every manager)", async () => {
      const m = await holder(rows.manager);
      assert.ok(pmsCan(m, "projects.manage") && pmsCan(m, "clients.view") && pmsCan(m, "timesheets.review"));
      assert.equal(pmsScope(m, "projects"), "own");
      assert.deepEqual(await checkProjectAccess(m, "A"), { allowed: true, canManage: true });
      assert.equal((await checkProjectAccess(m, "B")).allowed, false); assert.equal((await checkProjectAccess(m, "C")).allowed, false);
    });
    await T("admin (everyone's scope): opens and manages every project, settings and the activity log", async () => {
      const a = await holder(rows.admin);
      assert.ok(pmsSeesAll(a) && pmsCan(a, "settings.manage") && pmsCan(a, "activity.view") && pmsCan(a, "costing.view"));
      for (const id of ["A", "B", "C"]) assert.deepEqual(await checkProjectAccess(a, id), { allowed: true, canManage: true });
    });
    await T("Read only is truly read only: no write feature in the preset, and a person with exactly it can look but change nothing", async () => {
      const pre = buildAccessUi().presets[P];
      assert.ok(pre.readLabel.startsWith("Read only"));
      await set(rows.readOnly, Object.fromEntries(pre.read.map((x) => [x, "read" as const])));
      const h = await holder(rows.readOnly);
      for (const m of microOf(P)) if (m.level === "write") assert.equal(accessCan(h.subject, P, m.key, "write"), false, `${m.key} must not come with Read only`);
      for (const f of ["projects.manage", "tasks.update", "timesheets.submit", "clients.manage", "documents.manage"]) assert.equal(pmsCan(h, f), false, f);
    });
    await T("partial person gets only what was picked and loses it on the next request", async () => {
      await set(rows.partial, { [k("projects.view")]: "read", [k("timesheets.view")]: "read", [k("timesheets.submit")]: "write" });
      let h = await holder(rows.partial);
      assert.ok(pmsCan(h, "projects.view") && pmsCan(h, "timesheets.submit"));
      for (const f of ["clients.view", "projects.manage", "costing.view", "timesheets.review"]) assert.equal(pmsCan(h, f), false, f);
      await set(rows.partial, { [k("projects.view")]: "read" });
      h = await holder(rows.partial);
      assert.equal(pmsCan(h, "timesheets.submit"), false);
    });
    await T("a manager given the project-management right still reaches only their own projects (the actions check the project too)", async () => {
      const m = await holder(rows.manager);
      assert.ok(pmsCan(m, "projects.manage"));
      assert.equal((await checkProjectAccess(m, "C")).allowed, false, "the server actions refuse a project the manager cannot open");
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
