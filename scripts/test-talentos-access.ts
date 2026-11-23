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
import { hrCan, hrScope } from "../src/lib/talentos-access";
import { hrReach, reaches, reachFilter, requireHrAct } from "../src/lib/products/talentos/scope";
import { buildAccessUi } from "../src/lib/access/ui-model";
import * as OLD from "../src/lib/hrms-roles";
import { uploadTarget, mayReadDocument, maySeeSignedDocument } from "../src/lib/products/talentos/doc-access";
import { STAGED } from "../src/lib/access/micro/staged";

// TalentOS: Director vs partial vs old roles vs Read only vs own-only vs manager with a reporting line, per converted module. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "talentos";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_tal", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    // an org: MGR manages R1; R1 manages R2; X is somebody else's
    const emp = (id: string, mgr: string | null) => ({ _id: id, professional: { reportingManagerId: mgr }, deletedAt: null });
    await db.collection("hrms_employees").insertMany([emp("MGR", null), emp("R1", "MGR"), emp("R2", "R1"), emp("X", null), emp("EMP", "MGR"), emp("PART", null)] as never);
    const mk = (roles: string[], employeeId: string | null, ov: Record<string, boolean> | null = null) => ({ _id: new ObjectId(), email: `${roles.join("_")}_${employeeId}@x`, roles, employeeId, ...(ov ? { permissionOverrides: ov } : {}) });
    const rows = { employee: mk(["employee"], "EMP"), manager: mk(["manager"], "MGR"), hr: mk(["hr"], "X"), director: mk(["super_admin"], null), partial: mk(["employee"], "PART"), readOnly: mk(["employee"], "PART") };
    await people.insertMany(Object.values(rows) as never);
    const holder = async (row: { _id: ObjectId; employeeId: string | null }) => { const r = (await people.findOne({ _id: row._id })) as never as { roles: string[]; employeeId: string | null; permissionOverrides?: Record<string, boolean> }; return { subject: subjectFromRow(r as never), employeeId: row.employeeId, roles: r.roles }; };
    const set = async (row: { _id: ObjectId }, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(row._id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };

    // ---- shared: the old roles ------------------------------------------------------------------------------------------------
    await T("former employees, managers and HR keep exactly their access: micro features follow the legacy capabilities; nothing widened or withheld in TalentOS", async () => {
      for (const [roles, ov] of [[["employee"], null], [["manager"], null], [["hr"], null], [["hr"], { "hrms.canManagePayroll": false }], [["manager"], { "hrms.canViewAllEmployees": true }], [["employee"], { "hrms.canApproveLeave": true }]] as const) {
        const legacy = legacyAnswers({ roles: [...roles], permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles: [...roles], permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access));
        assert.deepEqual(d.widened.filter((x) => x.startsWith("hrms.")), [], `widened ${roles}`);
        assert.deepEqual(d.withheld.filter((x) => x.startsWith("hrms.")), [], `withheld ${roles}`);
      }
    });
    await T("Director: every micro feature, all scopes", async () => {
      const h = await holder(rows.director);
      for (const m of microOf(P)) assert.ok(hrCan(h, m.key.slice(P.length + 1)), m.key);
      for (const mod of ["leave", "attendance", "requests", "employees", "dashboard"] as const) assert.equal(hrScope(h, mod), "all");
    });
    await T("Read only is truly read only: no write feature in the preset, a person with exactly it can look (own scope) and change nothing", async () => {
      const pre = buildAccessUi().presets[P];
      assert.ok(pre.readLabel.startsWith("Read only"));
      await set(rows.readOnly, Object.fromEntries(pre.read.map((x) => [x, "read" as const])));
      const h = await holder(rows.readOnly);
      for (const m of microOf(P)) if (m.level === "write") assert.equal(accessCan(h.subject, P, m.key, "write"), false, `${m.key} must not come with Read only`);
      for (const f of ["leave.apply", "leave.approve", "employees.manage", "payroll.run"]) assert.equal(hrCan(h, f), false, f);
    });

    // ---- Leave ----------------------------------------------------------------------------------------------------------------
    await T("Leave: an employee with only their own features reaches only their own record, cannot decide, and cannot file for anyone", async () => {
      const h = await holder(rows.employee);
      assert.equal(hrScope(h, "leave"), "own");
      assert.ok(hrCan(h, "leave.view") && hrCan(h, "leave.apply"));
      assert.equal(hrCan(h, "leave.approve"), false);
      const r = await hrReach(h, "leave");
      assert.deepEqual(r.ids, ["EMP"]);
      assert.ok(reaches(r, "EMP") && !reaches(r, "R1") && !reaches(r, "X"));
      assert.deepEqual(reachFilter(r, "employeeId"), { employeeId: "EMP" });
      await assert.rejects(requireHrAct(h, "leave", "leave.approve", "EMP"), /Forbidden/, "no approve feature");
    });
    await T("Leave: a manager reaches their reporting line (direct and indirect reports and themself), never a stranger, and can decide inside it", async () => {
      const h = await holder(rows.manager);
      assert.equal(hrScope(h, "leave"), "team");
      assert.ok(hrCan(h, "leave.approve") && hrCan(h, "leave.team"));
      const r = await hrReach(h, "leave");
      assert.deepEqual([...(r.ids ?? [])].sort(), ["EMP", "MGR", "R1", "R2"]);
      for (const id of ["R1", "R2", "EMP", "MGR"]) assert.ok(reaches(r, id), id);
      for (const id of ["X", "PART"]) assert.equal(reaches(r, id), false, id);
      await requireHrAct(h, "leave", "leave.approve", "R2");
      await assert.rejects(requireHrAct(h, "leave", "leave.approve", "X"), /Forbidden/, "a stranger is outside the line");
      assert.deepEqual([...((reachFilter(r, "employeeId") as { employeeId: { $in: string[] } }).employeeId.$in)].sort(), ["EMP", "MGR", "R1", "R2"]);
    });
    await T("Leave: HR (everyone's scope) reaches every employee with no filter", async () => {
      const h = await holder(rows.hr);
      assert.equal(hrScope(h, "leave"), "all");
      const r = await hrReach(h, "leave");
      assert.equal(r.ids, undefined);
      assert.ok(reaches(r, "X") && reaches(r, "R2"));
      assert.deepEqual(reachFilter(r, "employeeId"), {});
    });
    await T("Leave: a partial person gets exactly what was picked and loses it on the next request; a manager-style grant without the team scope stays own-only", async () => {
      await set(rows.partial, { [k("leave.view")]: "read", [k("leave.team")]: "read", [k("leave.approve")]: "write" });
      let h = await holder(rows.partial);
      assert.equal(hrScope(h, "leave"), "team");
      assert.ok(hrCan(h, "leave.approve"));
      for (const f of ["attendance.team", "payroll.view", "employees.all", "leave.all"]) assert.equal(hrCan(h, f), false, f);
      await set(rows.partial, { [k("leave.view")]: "read", [k("leave.approve")]: "write" });
      h = await holder(rows.partial);
      assert.equal(hrScope(h, "leave"), "own", "approve without a team scope reaches only the person's own record");
      await set(rows.partial, { [k("leave.view")]: "read" });
      h = await holder(rows.partial);
      assert.equal(hrCan(h, "leave.approve"), false);
    });
    await T("Leave: the legacy answers still agree for the unconverted code (derived roles of a micro grant carry the capabilities they need)", async () => {
      await set(rows.partial, { [k("leave.view")]: "read", [k("leave.team")]: "read", [k("leave.approve")]: "write" });
      const row = (await people.findOne({ _id: rows.partial._id })) as unknown as { access: Record<string, Record<string, "read" | "write">> };
      const d = accessToLegacy(row.access);
      const r = { roles: d.roles };
      const ctx = { roles: d.roles, permissionOverrides: d.permissionOverrides } as never;
      assert.ok(OLD.canApproveLeave(ctx), "the old Approve leave capability follows leave.approve");
      assert.ok(OLD.hasStaffRole(r.roles as never), "the staff tier follows the reporting-line scope");
      assert.equal(OLD.canRunPayroll(ctx), false);
    });
    // ---- Attendance -----------------------------------------------------------------------------------------------------------
    await T("Attendance: own scope punches and sees only their own days; a manager records inside the reporting line only; HR everyone; a partial person loses it on the next request", async () => {
      const e = await holder(rows.employee);
      assert.equal(hrScope(e, "attendance"), "own");
      assert.ok(hrCan(e, "attendance.punch") && !hrCan(e, "attendance.manage"));
      assert.deepEqual((await hrReach(e, "attendance")).ids, ["EMP"]);
      const m = await holder(rows.manager);
      assert.equal(hrScope(m, "attendance"), "team");
      await requireHrAct(m, "attendance", "attendance.manage", "R2");
      await assert.rejects(requireHrAct(m, "attendance", "attendance.manage", "X"), /Forbidden/);
      const h = await holder(rows.hr);
      assert.equal(hrScope(h, "attendance"), "all");
      await requireHrAct(h, "attendance", "attendance.manage", "X");
      await set(rows.partial, { [k("attendance.view")]: "read", [k("attendance.punch")]: "write", [k("attendance.team")]: "read", [k("attendance.manage")]: "write" });
      let p = await holder(rows.partial);
      assert.equal(hrScope(p, "attendance"), "team");
      await set(rows.partial, { [k("attendance.view")]: "read" });
      p = await holder(rows.partial);
      assert.equal(hrScope(p, "attendance"), "own"); assert.equal(hrCan(p, "attendance.punch"), false); assert.equal(hrCan(p, "attendance.manage"), false);
    });
    // ---- Requests -------------------------------------------------------------------------------------------------------------
    await T("Requests: an employee submits their own and sees only their own queue; a manager decides inside the reporting line only; the Read only person submits nothing", async () => {
      const e = await holder(rows.employee);
      assert.ok(hrCan(e, "requests.submit") && !hrCan(e, "requests.decide"));
      assert.equal(hrScope(e, "requests"), "own");
      const m = await holder(rows.manager);
      assert.equal(hrScope(m, "requests"), "team");
      await requireHrAct(m, "requests", "requests.decide", "R1");
      await assert.rejects(requireHrAct(m, "requests", "requests.decide", "X"), /Forbidden/);
      const ro = await holder(rows.readOnly);
      assert.equal(hrCan(ro, "requests.submit"), false);
      assert.equal(hrCan(ro, "requests.decide"), false);
    });
    // ---- Holidays -------------------------------------------------------------------------------------------------------------
    await T("Holidays: everybody given TalentOS sees the calendar, only the holiday manager (HR) changes it", async () => {
      for (const r of [rows.employee, rows.manager, rows.hr]) assert.ok(hrCan(await holder(r), "holidays.view"));
      assert.equal(hrCan(await holder(rows.employee), "holidays.manage"), false);
      assert.equal(hrCan(await holder(rows.manager), "holidays.manage"), false);
      assert.ok(hrCan(await holder(rows.hr), "holidays.manage"));
    });
    // ---- Security patches (leaks found by the sweep) ---------------------------------------------------------------------------
    await T("document upload: an employee and a manager upload to their OWN record only; HR uploads for anyone; a manager without the document right can no longer upload onto a stranger", async () => {
      const e = await holder(rows.employee), m = await holder(rows.manager), h = await holder(rows.hr);
      const asUser = (x: typeof e) => ({ ...x, permissionOverrides: {} as Record<string, boolean> });
      assert.deepEqual(await uploadTarget(asUser(e) as never, "R1"), { employeeId: "EMP", role: "employee" }, "an employee's request for someone else lands on their own record");
      assert.deepEqual(await uploadTarget(asUser(m) as never, "X"), { employeeId: "MGR", role: "employee" }, "a manager cannot choose another employee");
      assert.deepEqual(await uploadTarget(asUser(h) as never, "X"), { employeeId: "X", role: "staff" });
      assert.deepEqual(await uploadTarget(asUser(h) as never, "R2"), { employeeId: "R2", role: "staff" });
    });
    await T("document upload with the document right: a manager given it reaches only their reporting line", async () => {
      const row = (await people.insertOne({ _id: new ObjectId(), email: "mdoc@x", roles: ["manager"], employeeId: "MGR", permissionOverrides: { "hrms.canManageEmployeeDocuments": true } } as never)).insertedId;
      const r = (await people.findOne({ _id: row })) as never as { roles: string[]; employeeId: string; permissionOverrides: Record<string, boolean> };
      const m = { roles: r.roles, employeeId: r.employeeId, permissionOverrides: r.permissionOverrides, subject: subjectFromRow(r as never) } as never;
      assert.deepEqual(await uploadTarget(m, "R2"), { employeeId: "R2", role: "staff" });
      assert.deepEqual(await uploadTarget(m, "X"), { error: "forbidden" }, "a stranger is outside the reporting line");
    });
    await T("document download: own, or staff inside their reach; a manager cannot read a stranger's document, an employee cannot read a colleague's", async () => {
      const e = await holder(rows.employee), m = await holder(rows.manager), h = await holder(rows.hr);
      const w = (x: typeof e) => ({ ...x, permissionOverrides: {} }) as never;
      assert.ok(await mayReadDocument(w(e), "EMP"));
      assert.equal(await mayReadDocument(w(e), "R1"), false, "a colleague's document");
      assert.ok(await mayReadDocument(w(m), "R2"));
      assert.equal(await mayReadDocument(w(m), "X"), false, "a stranger's document");
      assert.ok(await mayReadDocument(w(h), "X"));
    });
    await T("signed ContractFlow document: own, or HR for an employee in reach; a manager without the HR right sees only their own", async () => {
      const e = await holder(rows.employee), m = await holder(rows.manager), h = await holder(rows.hr);
      const w = (x: typeof e) => ({ ...x, permissionOverrides: {} }) as never;
      assert.ok(await maySeeSignedDocument(w(e), "EMP"));
      assert.equal(await maySeeSignedDocument(w(e), "R1"), false);
      assert.equal(await maySeeSignedDocument(w(m), "R1"), false, "a manager has no HR right");
      assert.ok(await maySeeSignedDocument(w(h), "X"));
    });
    await T("employee profile reach: the profile of an employee outside the reporting line is outside a manager's reach (the page answers not found)", async () => {
      const m = await holder(rows.manager);
      const reach = await hrReach(m, "employees");
      assert.ok(reaches(reach, "R2") && reaches(reach, "MGR") && !reaches(reach, "X"));
      assert.equal(reaches(await hrReach(await holder(rows.employee), "employees"), "R1"), false);
    });
    await T("recruitment: only HR-level (manage employees) opens candidates and offers; the micro feature follows", async () => {
      assert.equal(hrCan(await holder(rows.manager), "recruitment.view"), false);
      assert.ok(hrCan(await holder(rows.hr), "recruitment.view"));
    });
    // ---- Payroll --------------------------------------------------------------------------------------------------------------
    await T("Payroll: everybody sees their own pay and tax; only HR (payroll right) sees the runs; a manager sees neither runs nor anybody's salary; the Read only person cannot declare tax", async () => {
      const e = await holder(rows.employee), m = await holder(rows.manager), h = await holder(rows.hr);
      for (const x of [e, m, h]) assert.ok(hrCan(x, "salary.view") && hrCan(x, "tax.view") && hrCan(x, "tax.declare"));
      assert.equal(hrCan(e, "payroll.view"), false); assert.equal(hrCan(m, "payroll.view"), false); assert.equal(hrCan(m, "payroll.run"), false);
      assert.ok(hrCan(h, "payroll.view") && hrCan(h, "payroll.run") && hrCan(h, "salary.manage"));
      assert.equal(hrCan(h, "payrollrates.manage"), false, "statutory rates are a separate right (nobody has it by default)");
      const ro = await holder(rows.readOnly);
      assert.equal(hrCan(ro, "tax.declare"), false); assert.equal(hrCan(ro, "payroll.run"), false);
    });
    // ---- Dashboard, Employees, Documents ---------------------------------------------------------------------------------------
    await T("Dashboard: everybody has their own day; a manager sees their team's numbers only; only the company scope sees headcount and hiring (managers no longer see company-wide numbers)", async () => {
      const e = await holder(rows.employee), m = await holder(rows.manager), h = await holder(rows.hr);
      assert.equal(hrScope(e, "dashboard"), "own"); assert.equal(hrScope(m, "dashboard"), "team"); assert.equal(hrScope(h, "dashboard"), "all");
      assert.equal(hrCan(m, "dashboard.all"), false); assert.ok(hrCan(h, "dashboard.all"));
      assert.equal(hrCan(e, "analytics.view"), false); assert.ok(hrCan(m, "analytics.view"));
    });
    await T("Employees: an employee has a profile and a directory but no employee list; a manager lists and opens their reporting line only; HR everyone and the export; managing needs the manage right", async () => {
      const e = await holder(rows.employee), m = await holder(rows.manager), h = await holder(rows.hr);
      assert.ok(hrCan(e, "profile.view") && hrCan(e, "directory.view") && hrCan(e, "profile.edit"));
      assert.equal(hrScope(e, "employees"), "own");
      assert.equal(hrScope(m, "employees"), "team"); assert.equal(hrCan(m, "employees.manage"), false); assert.equal(hrCan(m, "employees.export"), false);
      assert.equal(hrScope(h, "employees"), "all"); assert.ok(hrCan(h, "employees.manage") && hrCan(h, "employees.export"));
      await assert.rejects(requireHrAct(m, "employees", "employees.manage", "R1"), /Forbidden/, "a manager has no manage right");
      await requireHrAct(h, "employees", "employees.manage", "R1");
    });
    await T("staged conversion: every TalentOS module is converted (nothing pending, nothing half converted)", async () => {
      assert.ok(STAGED[P].converted.includes("Leave") && STAGED[P].converted.includes("Attendance") && STAGED[P].converted.includes("Requests") && STAGED[P].converted.includes("Holidays") && STAGED[P].converted.includes("Recruitment") && STAGED[P].converted.includes("Settings") && STAGED[P].converted.includes("Payroll") && STAGED[P].converted.includes("Dashboard") && STAGED[P].converted.includes("Employees") && STAGED[P].converted.includes("Documents") && STAGED[P].pending.length === 0);
      assert.ok(!STAGED[P].pending.includes("Leave"));
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
