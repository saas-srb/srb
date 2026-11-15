import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import {
  createDepartment, updateDepartment, deleteDepartment, restoreDepartment, listDepartments, getDepartment, usageOf,
  createDesignation, updateDesignation, deleteDesignation, createTeam, updateTeam, deleteTeam, listTeams, listDesignations,
  seedDefaultDepartments, departmentNameMap, OrgError,
} from "../src/lib/platform/organization";
import { runDepartmentMigration } from "../src/lib/platform/organization/migrate";
import { syncFromHrms, createDepartment as sopCreate, updateDepartment as sopUpdate } from "../src/lib/products/playbook-ai/taxonomy";

// Runs only against a throwaway database (MONGODB_URI=.../zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const rejects = async (fn: () => Promise<unknown>, re: RegExp) => { await assert.rejects(fn, (e: unknown) => e instanceof OrgError && re.test(e.message)); };
const actor = { id: "u1", email: "d@x.test" };
let passed = 0;
const T = async (n: string, f: () => Promise<void>) => { await t(n, f); passed++; };

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_a", async () => {
    let hr = "", fin = "", des = "", team = "";
    await T("create department: trimmed name, generated code, audit event", async () => {
      const d = await createDepartment({ name: "  Human   Resources " }, actor);
      hr = d._id;
      assert.equal(d.name, "Human Resources");
      assert.match(d.code, /^[A-Z0-9]+$/);
      const log = await (await getDb()).collection("hrms_audit_logs").findOne({ entityId: hr });
      assert.equal(log?.entity, "department");
      assert.equal(log?.action, "create");
    });
    await T("names are unique per company (case and spacing ignored); codes too", async () => {
      await rejects(() => createDepartment({ name: "human resources" }, actor), /already exists/);
      fin = (await createDepartment({ name: "Finance", code: "fin" }, actor))._id;
      await rejects(() => createDepartment({ name: "Other", code: "FIN" }, actor), /Code FIN/);
      await rejects(() => updateDepartment(fin, { name: "HUMAN RESOURCES" }, actor), /already exists/);
      assert.equal((await updateDepartment(fin, { name: "Finance & Accounts" }, actor))?.name, "Finance & Accounts");
    });
    await T("designations and teams need a real department and are unique inside it", async () => {
      await rejects(() => createDesignation({ title: "Manager", departmentId: "nope" }, actor), /existing department/);
      des = (await createDesignation({ title: "Manager", departmentId: hr }, actor))._id;
      await rejects(() => createDesignation({ title: " manager ", departmentId: hr }, actor), /already exists/);
      await createDesignation({ title: "Manager", departmentId: fin }, actor); // same title, other department: fine
      team = (await createTeam({ name: "Payroll", departmentId: fin }, actor))._id;
      await rejects(() => createTeam({ name: "payroll", departmentId: fin }, actor), /already exists/);
      await createTeam({ name: "Payroll", departmentId: hr }, actor);
      assert.equal((await listTeams({ departmentId: fin })).length, 1);
      assert.equal((await listDesignations()).length, 2);
      await rejects(() => updateTeam(team, { departmentId: "nope" }, actor), /existing department/);
    });
    await T("usage counts drive 'in use' and block archiving", async () => {
      const db = await getDb();
      await db.collection("hrms_employees").insertOne({ _id: "e1", professional: { departmentId: hr, designationId: des, teamId: team }, deletedAt: null } as never);
      assert.equal((await usageOf("department", hr)).employees, 1);
      assert.equal((await usageOf("designation", des)).employees, 1);
      const r = await deleteDepartment(hr, actor);
      assert.equal(r.ok, false);
      assert.match(r.reason!, /in use by 1 employee\(s\)/);
      assert.equal((await deleteDesignation(des, actor)).ok, false);
      assert.equal((await deleteTeam(team, actor)).ok, false);
    });
    await T("archive hides, restore brings back, restore refuses a name clash", async () => {
      const x = await createDepartment({ name: "Temp" }, actor);
      assert.ok((await deleteDepartment(x._id, actor)).ok);
      assert.equal(await getDepartment(x._id), null);
      assert.equal((await listDepartments()).some((d) => d._id === x._id), false);
      assert.equal((await listDepartments({ includeArchived: true })).some((d) => d._id === x._id), true);
      assert.equal((await departmentNameMap([x._id])).get(x._id), "Temp"); // old records still show a name
      await createDepartment({ name: "Temp" }, actor);
      assert.equal((await restoreDepartment(x._id, actor)).ok, false);
    });
    await T("a department with a team or designation cannot be archived either", async () => {
      assert.match((await deleteDepartment(fin, actor)).reason!, /designation\(s\)|team\(s\)/);
    });
  });

  await runAsCompany("co_b", async () => {
    await T("company scoping: company B sees none of A's rows and can reuse the same names", async () => {
      assert.equal((await listDepartments()).length, 0);
      const d = await createDepartment({ name: "Human Resources" }, actor);
      assert.ok(d._id);
      assert.equal((await listDepartments()).length, 1);
    });
    await T("seedDefaultDepartments creates the 32 starters once, and not on top of existing rows", async () => {
      await (await getDb()).collection("hrms_departments").deleteMany({});
      assert.equal((await seedDefaultDepartments(null)).created, 32);
      assert.equal((await seedDefaultDepartments(null)).created, 0);
      assert.equal((await listDepartments()).length, 32);
    });
  });
  await runAsCompany("co_a", async () => {
    await T("company A is untouched by B's seed", async () => assert.ok((await listDepartments()).length < 32));
  });

  await runAsCompany("co_m", async () => {
    const db = await getDb();
    let hrId = "";
    await T("SOP mirror: syncFromHrms links by name, creates the rest, and follows a rename made in the service", async () => {
      hrId = (await createDepartment({ name: "HR", code: "HR" }, actor))._id;
      await createDepartment({ name: "Finance", code: "FIN" }, actor);
      await db.collection("sop_departments").insertOne({ _id: "s_hr", name: "hr", code: "HRS", description: "", hrmsDepartmentId: null, active: true, deletedAt: null } as never);
      await syncFromHrms(true);
      const rows = await db.collection("sop_departments").find({ deletedAt: null }).toArray();
      assert.equal(rows.find((r) => r._id === "s_hr")?.hrmsDepartmentId, hrId);
      assert.equal(rows.length, 2);
      await updateDepartment(hrId, { name: "Human Resources" }, actor);
      await syncFromHrms(true);
      assert.equal((await db.collection("sop_departments").findOne({ _id: "s_hr" }))?.name, "Human Resources");
    });
    await T("creating/renaming through Playbook goes through the service (no second copy)", async () => {
      const c = await sopCreate({ name: "Legal Affairs", code: "LGL" }, "u1");
      assert.ok(c.ok);
      assert.ok(c.ok && c.doc.hrmsDepartmentId);
      assert.equal((await listDepartments()).some((d) => d.name === "Legal Affairs"), true);
      const dupe = await sopCreate({ name: "legal affairs" }, "u1");
      assert.equal(dupe.ok, false);
      if (c.ok) {
        await sopUpdate(c.doc._id, { name: "Legal" }, "u1");
        assert.equal((await getDepartment(c.doc.hrmsDepartmentId!))?.name, "Legal");
      }
    });
  });

  await runAsCompany("co_mig", async () => {
    const db = await getDb();
    const orgHr = await createDepartment({ name: "Human Resources", code: "HR" }, actor);
    await createDepartment({ name: "Finance", code: "FIN" }, actor);
    const sop = db.collection("sop_departments");
    await sop.insertMany([
      { _id: "m1", name: "HR", code: "HR", hrmsDepartmentId: null, deletedAt: null },
      { _id: "m2", name: "Finance", code: "FIN", hrmsDepartmentId: null, deletedAt: null },
      { _id: "m3", name: "Marketing", code: "MKT", hrmsDepartmentId: null, deletedAt: null },
      { _id: "m4", name: "Human Resources", code: "HRX", hrmsDepartmentId: null, deletedAt: null },
    ] as never);
    await db.collection("fms_cash_accounts").insertMany([
      { _id: "c1", department: "Finance" }, { _id: "c2", department: "Warehouse" }, { _id: "c3", department: null },
    ] as never);
    const before = JSON.stringify(await sop.find({}).sort({ _id: 1 }).toArray());
    const beforeOrg = (await listDepartments()).length;

    await T("dry-run changes nothing and reports the plan", async () => {
      const r = await runDepartmentMigration("dry-run", "mig_test_1");
      assert.equal(r.sop.linked, 2);
      assert.equal(r.sop.created, 1);
      assert.equal(r.sop.conflicts, 1);
      assert.deepEqual(r.text[0].plan.unmatched, ["Warehouse"]);
      assert.equal(JSON.stringify(await sop.find({}).sort({ _id: 1 }).toArray()), before);
      assert.equal((await listDepartments()).length, beforeOrg);
      assert.equal((await db.collection("fms_cash_accounts").findOne({ _id: "c1" }))?.departmentId, undefined);
    });
    await T("apply links, creates and adds ids beside the text, and is idempotent", async () => {
      const r = await runDepartmentMigration("apply", "mig_test_1");
      assert.equal(r.text[0].updated, 1);
      assert.equal((await sop.findOne({ _id: "m1" }))?.hrmsDepartmentId, orgHr._id);
      assert.ok((await sop.findOne({ _id: "m3" }))?.hrmsDepartmentId);
      assert.equal((await sop.findOne({ _id: "m4" }))?.hrmsDepartmentId, null, "conflict left for a person");
      assert.equal((await listDepartments()).length, beforeOrg + 1);
      const c1 = await db.collection("fms_cash_accounts").findOne({ _id: "c1" });
      assert.equal(c1?.department, "Finance", "the text is kept");
      assert.ok(c1?.departmentId);
      assert.equal((await db.collection("fms_cash_accounts").findOne({ _id: "c2" }))?.departmentId, undefined);
      const again = await runDepartmentMigration("apply", "mig_test_1");
      assert.equal(again.sop.created, 0);
      assert.equal(again.text[0].updated, 0);
      assert.equal((await listDepartments()).length, beforeOrg + 1);
    });
    await T("revert undoes exactly that migration and nothing else", async () => {
      const r = await runDepartmentMigration("revert", "mig_test_1");
      assert.equal(r.reverted?.unlinked, 3);
      assert.equal(r.reverted?.departmentsArchived, 1);
      assert.equal(r.reverted?.textCleared, 1);
      const norm = (s: string) => JSON.stringify(JSON.parse(s).map((x: Record<string, unknown>) => { const { _orgMigration, ...rest } = x; void _orgMigration; return rest; }));
      assert.equal(norm(JSON.stringify(await sop.find({}).sort({ _id: 1 }).toArray())), norm(before));
      assert.equal((await listDepartments()).length, beforeOrg);
      assert.equal((await db.collection("fms_cash_accounts").findOne({ _id: "c1" }))?.departmentId, undefined);
    });
    await T("a bad migration id is refused", async () => {
      await assert.rejects(() => runDepartmentMigration("apply", "x"));
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
