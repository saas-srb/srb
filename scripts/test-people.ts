import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { CATALOGUE, PRODUCTS, featuresOf } from "../src/lib/access/catalogue";
import { legacyAnswers } from "../src/lib/access/legacy";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { summarizeAccess } from "../src/lib/access/summary";
import { cleanDetails, validateDetails, seatVerdict, directorLockReason, hasAnyProduct, emptyDetails } from "../src/lib/products/commandos/people-rules";
import { checkAccess, createPerson, updatePerson, validateDraft, loadPersonForEdit } from "../src/lib/products/commandos/people";
import { listPeople } from "../src/lib/products/commandos/people-list";
import { createDepartment, createDesignation, createTeam } from "../src/lib/platform/organization";
import { acceptInvitation } from "../src/lib/platform/invitations";
import type { AccessMap } from "../src/lib/access/types";

// Runs only against a throwaway database (MONGODB_URI=.../zz_throwaway_*). Pure checks first, then the database.
let passed = 0;
const T = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const actor = { id: "507f1f77bcf86cd799439011", email: "director@x.test", roles: ["super_admin"] as const };
const ui = buildAccessUi();

(async () => {
  console.log("details, seats and the Director lock (pure)");
  await T("details are cleaned and validated field by field", () => {
    const d = cleanDetails({ name: "  Asha   Rao ", email: " ASHA@X.COM ", phone: "+91 98765 43210", joiningDate: "2026-04-01", userType: "bogus" as never, designationIds: ["a", "a", " b "] });
    assert.equal(d.name, "Asha Rao");
    assert.equal(d.email, "asha@x.com");
    assert.equal(d.userType, "employee");
    assert.deepEqual(d.designationIds, ["a", "b"]);
    assert.deepEqual(validateDetails(d), {});
    const bad = validateDetails({ ...emptyDetails(), name: "A", email: "nope", phone: "12", joiningDate: "31/12/2026" });
    assert.deepEqual(Object.keys(bad).sort(), ["designationIds", "email", "joiningDate", "name", "phone"]);
    assert.equal(validateDetails({ ...emptyDetails(), name: "Raj Kumar", email: "r@x.com" }, { isDirector: true }).designationIds, undefined);
    assert.ok(validateDetails(d, { existingEmail: true }).email);
  });
  await T("seat check: fits, last seat, over the limit, unlimited, and editing someone who already holds a seat", () => {
    assert.equal(seatVerdict({ used: 3, limit: 5, takesSeat: true }).ok, true);
    assert.equal(seatVerdict({ used: 4, limit: 5, takesSeat: true }).after, 5);
    const over = seatVerdict({ used: 5, limit: 5, takesSeat: true });
    assert.equal(over.ok, false);
    assert.match(over.message, /Your plan includes 5 users/);
    assert.equal(seatVerdict({ used: 5, limit: 5, takesSeat: true, alreadyHoldsSeat: true }).ok, true);
    assert.equal(seatVerdict({ used: 5, limit: 5, takesSeat: false }).ok, true);
    assert.equal(seatVerdict({ used: 999, limit: null, takesSeat: true }).ok, true);
    assert.match(seatVerdict({ used: 1, limit: 1, takesSeat: true }).message, /1 user /);
  });
  await T("a Director's access cannot be changed; at least one product is required", () => {
    assert.ok(directorLockReason({ isDirector: true }, true));
    assert.equal(directorLockReason({ isDirector: true }, false), null);
    assert.equal(directorLockReason({ isDirector: false }, true), null);
    assert.equal(hasAnyProduct({}), false);
    assert.equal(hasAnyProduct({ commandos: { "workspace.x": "read" } }), false);
    assert.equal(hasAnyProduct({ sprintos: { "pms.x": "read" } }), true);
  });

  console.log("matrix -> derived older roles, for every product preset (pure)");
  await T("every product: the Read only preset and the Read & Write preset are saved exactly, with no widened and no withheld feature", () => {
    const withheld: string[] = [];
    for (const p of ui.products) {
      const pre = ui.presets[p.key];
      for (const [mode, keys] of [["read", pre.read], ["write", pre.write]] as const) {
        const picked: AccessMap = { [p.key]: {} };
        for (const k of keys) picked[p.key][k] = CATALOGUE.find((e) => e.key === k)!.level;
        for (const k of mode === "read" ? pre.readCarried : []) picked[p.key][k] = "read";
        const c = checkAccess(picked);
        assert.deepEqual(c.widened, [], `${p.key} ${mode}: widened ${c.widened.join(",")}`);
        if (c.withheld.length) withheld.push(`${p.key}/${mode}`);
        // the derived older roles give exactly what the completed map says
        const ans = legacyAnswers({ roles: c.roles, permissionOverrides: c.overrides });
        for (const e of CATALOGUE) {
          const held = c.access[e.product]?.[e.key];
          const want = Boolean(held) && (held === "write" || e.level === "read");
          assert.equal(ans[e.key], want, `${p.key} ${mode}: ${e.key}`);
        }
      }
    }
    assert.deepEqual(withheld, [], "nothing is withheld for a preset");
  });
  await T("AgentOS and EvalIQ 'Read only' start from the next level up, and say what that includes", () => {
    for (const k of ["agentos", "evaliq"]) {
      assert.equal(ui.presets[k].readLabel, "Read only (view and reports)");
      assert.ok(ui.presets[k].readExtras.length > 0);
    }
    assert.equal(ui.presets["sprintos"].readLabel, "Read only");
  });
  await T("refusals: a map that older roles would widen, and a map with no product", () => {
    const p = featuresOf("agentos").filter((e) => e.kind !== "tier" && e.level === "read");
    const c = checkAccess({ agentos: Object.fromEntries(p.map((e) => [e.key, "read"])) });
    assert.ok(c.widened.length > 0);
    assert.match(c.explanation[0], /bundle/);
    assert.equal(checkAccess({}).products, 0);
  });
  await T("the Preview summary lists what a person can do, can only view and cannot do", () => {
    const f = featuresOf("sprintos").filter((e) => e.kind !== "tier");
    const w = f.find((e) => e.level === "write")!, r = f.find((e) => e.level === "read")!;
    const s = summarizeAccess({ sprintos: { [w.key]: "write", [r.key]: "read" } }, ui.products).find((x) => x.key === "sprintos")!;
    assert.equal(s.level, "write");
    assert.ok(s.canDo.length >= 1 && s.canView.length >= 1 && s.cannot.length >= 1);
    assert.equal(summarizeAccess({}, ui.products).find((x) => x.key === "sprintos")!.level, "none");
    assert.equal(summarizeAccess({}, ui.products, true).find((x) => x.key === "sprintos")!.cannot.length, 0);
  });

  console.log("the screens (static)");
  await T("no role language and no old role editors remain in the People flow", async () => {
    const { readdirSync, readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dirs = ["src/app/(products)/commandos/(protected)/users", "src/components/products/commandos/people"];
    const files: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk(join(d, e.name)) : /\.(tsx?)$/.test(e.name) && files.push(join(d, e.name))); };
    dirs.forEach(walk);
    const banned = /Add product roles|custom role|CustomRolePicker|RoleEditorSheet|PanelAccessMatrix|PermissionOverridesSheet|permission override|Edit roles|role name/i;
    assert.deepEqual(files.filter((f) => banned.test(readFileSync(f, "utf8"))), []);
    for (const gone of ["CreateUserSheet", "RoleEditorSheet", "CustomRolePicker", "PanelAccessMatrix", "PermissionOverridesSheet", "UserDetailDrawer"]) assert.equal(existsSync(join("src/app/(products)/commandos/(protected)/users", gone + ".tsx")), false, gone);
    assert.ok(existsSync("src/app/(products)/commandos/(protected)/users/new/page.tsx") && existsSync("src/app/(products)/commandos/(protected)/users/[id]/edit/page.tsx"));
  });
  await T("every action of the People pages checks the manage-users feature, and the screens use it too", async () => {
    const { readFileSync } = await import("node:fs");
    const a = readFileSync("src/app/(products)/commandos/(protected)/users/actions.ts", "utf8");
    const exported = [...a.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    for (const fn of exported) assert.match(a.slice(a.indexOf(`export async function ${fn}`), a.indexOf(`export async function ${fn}`) + 400), /requireWorkspaceAction\("company\.users"\)/, fn);
    for (const p of ["page.tsx", "new/page.tsx", "[id]/edit/page.tsx"]) assert.match(readFileSync("src/app/(products)/commandos/(protected)/users/" + p, "utf8"), /requireWorkspaceAccess\("company\.users"\)/, p);
  });

  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_people", async () => {
    const db = await getDb();
    const users = db.collection("admin_users");
    const dept = await createDepartment({ name: "Operations" }, actor);
    const dept2 = await createDepartment({ name: "Finance" }, actor);
    const team = await createTeam({ name: "Field team", departmentId: dept._id }, actor);
    const des1 = await createDesignation({ title: "Operations Manager", departmentId: dept._id }, actor);
    const des2 = await createDesignation({ title: "Coordinator", departmentId: dept._id }, actor);
    const director = (await users.insertOne({ email: "director@x.test", name: "Dee Rector", roles: ["super_admin"], status: "active", createdAt: new Date(), passwordHash: "x" } as never)).insertedId;

    const sprint = featuresOf("sprintos").filter((e) => e.kind !== "tier");
    const pick = (n: number): AccessMap => ({ sprintos: Object.fromEntries(sprint.slice(0, n).map((e) => [e.key, e.level])) });
    const draft = { ...emptyDetails(), name: "Meera Iyer", email: "meera@x.test", phone: "+91 90000 11111", joiningDate: "2026-06-01", departmentIds: [dept._id], teamIds: [team._id], designationIds: [des1._id, des2._id], access: pick(4) };
    let meera = "";

    console.log("create, edit, status and audit (database)");
    await T("a draft with problems is refused with field errors and creates nothing", async () => {
      const v = await validateDraft({ ...draft, email: "bad", designationIds: [] });
      assert.equal(v.ok, false);
      assert.ok(v.errors.email && v.errors.designationIds);
      const r = await createPerson({ ...draft, email: "bad" }, actor, "http://localhost");
      assert.equal(r.ok, false);
      assert.equal(await users.countDocuments({ email: "bad" }), 0);
      const none = await createPerson({ ...draft, access: {} }, actor, "http://localhost");
      assert.equal(none.ok, false);
      assert.match(none.error ?? "", /at least one product/);
    });
    await T("creating a person with a temporary password saves details, the access map AND the derived older roles, and an HR file", async () => {
      const r = await createPerson(draft, actor, "http://localhost");
      assert.equal(r.ok, true, r.error);
      assert.ok(r.tempPassword && r.tempPassword.length >= 8);
      meera = r.id!;
      const u = await users.findOne({ _id: new ObjectId(meera) });
      assert.deepEqual(u?.designationIds, [des1._id, des2._id]);
      assert.equal(u?.designationId, des1._id);
      assert.deepEqual(u?.departmentIds, [dept._id]);
      assert.ok(u?.access?.sprintos && Object.keys(u.access.sprintos).length >= 4);
      assert.ok(u?.access?.commandos, "everybody gets the Workspace basics");
      assert.equal(u?.mustChangePassword, true);
      assert.deepEqual(u?.customRoleIds, []);
      const ans = legacyAnswers({ roles: u!.roles, permissionOverrides: u!.permissionOverrides });
      for (const e of sprint.slice(0, 4)) assert.equal(ans[e.key], true, `${e.key} works through the older checks`);
      assert.ok(u?.employeeId, "HR file made");
      const emp = await db.collection("hrms_employees").findOne({ _id: u!.employeeId as never });
      assert.equal(emp?.professional?.designationId, des1._id);
      assert.equal(emp?.professional?.departmentId, dept._id);
      assert.equal(emp?.professional?.teamId, team._id);
      const audit = await db.collection("access_audit_log").findOne({ action: "user.created", target: "meera@x.test" });
      assert.ok(audit, "audit event written");
    });
    await T("the same email cannot be added twice", async () => {
      const r = await createPerson(draft, actor, "http://localhost");
      assert.equal(r.ok, false);
      assert.ok(r.errors?.email);
    });
    await T("editing loads the same 3 steps prefilled and saving changes the access, the older roles and writes an audit event", async () => {
      const e = await loadPersonForEdit(meera);
      assert.equal(e?.fromLegacyRoles, false);
      assert.equal(e?.details.name, "Meera Iyer");
      assert.deepEqual(e?.details.teamIds, [team._id]);
      const before = await users.findOne({ _id: new ObjectId(meera) });
      const r = await updatePerson(meera, { ...e!.details, designationIds: [des2._id], departmentIds: [dept._id, dept2._id], access: pick(7) }, actor);
      assert.equal(r.ok, true, r.error);
      const after = await users.findOne({ _id: new ObjectId(meera) });
      assert.ok(Object.keys(after!.access.sprintos).length > Object.keys(before!.access.sprintos).length);
      assert.equal(after?.designationId, des2._id);
      assert.deepEqual(after?.departmentIds, [dept._id, dept2._id]);
      assert.deepEqual(after?.customRoleIds, []);
      assert.ok(await db.collection("access_audit_log").findOne({ action: "user.access_changed", target: "meera@x.test" }));
      assert.equal(after?.status, "active", "status untouched");
    });
    await T("a person who only has older roles opens prefilled from them, and saving unchanged changes nothing they can do", async () => {
      const id = (await users.insertOne({ email: "old@x.test", name: "Old Timer", roles: ["pms_manager", "fms_admin"], permissionOverrides: { "pms.canManageProjects": true }, status: "active", createdAt: new Date(), passwordHash: "x", designationId: des1._id } as never)).insertedId.toString();
      const before = await users.findOne({ _id: new ObjectId(id) });
      const answersBefore = legacyAnswers({ roles: before!.roles, permissionOverrides: before!.permissionOverrides });
      const e = await loadPersonForEdit(id);
      assert.equal(e?.fromLegacyRoles, true);
      assert.ok(Object.keys(e!.picked).includes("sprintos") && Object.keys(e!.picked).includes("cashflow-ai"));
      const r = await updatePerson(id, { ...e!.details, access: e!.picked }, actor);
      assert.equal(r.ok, true, r.error);
      const after = await users.findOne({ _id: new ObjectId(id) });
      const answersAfter = legacyAnswers({ roles: after!.roles, permissionOverrides: after!.permissionOverrides });
      const lost = CATALOGUE.filter((c) => answersBefore[c.key] && !answersAfter[c.key]).map((c) => c.key);
      assert.deepEqual(lost, [], "nothing they could do is taken away");
    });
    await T("a Director's details can be edited but their access and roles never change", async () => {
      const e = await loadPersonForEdit(director.toString());
      assert.equal(e?.isDirector, true);
      const r = await updatePerson(director.toString(), { ...e!.details, name: "Dee R. Rector", access: pick(2) }, actor);
      assert.equal(r.ok, true, r.error);
      const d = await users.findOne({ _id: director });
      assert.equal(d?.name, "Dee R. Rector");
      assert.deepEqual(d?.roles, ["super_admin"]);
      assert.equal(d?.access, undefined);
    });
    await T("a delegated manager cannot hand out individual features, and nobody edits their own access", async () => {
      const manager = { id: meera, email: "meera@x.test", roles: ["workspace_member"] as string[] };
      const r = await updatePerson(meera, { ...(await loadPersonForEdit(meera))!.details, access: pick(5) }, manager);
      assert.equal(r.ok, false);
      assert.match(r.error ?? "", /own access|Director/);
    });
    await T("the people list filters by department, team, designation and status, and counts products", async () => {
      const byDept = await listPeople({ departmentId: dept._id });
      assert.deepEqual(byDept.items.map((r) => r.email).sort(), ["meera@x.test", "old@x.test"].filter((m) => m === "meera@x.test"));
      const byTeam = await listPeople({ teamId: team._id });
      assert.equal(byTeam.items.length, 1);
      const byDes = await listPeople({ designationId: des2._id });
      assert.ok(byDes.items.some((r) => r.email === "meera@x.test"));
      const all = await listPeople({});
      const row = all.items.find((r) => r.email === "meera@x.test")!;
      assert.equal(row.productsCount, 1);
      assert.ok(row.departments.includes("Operations") && row.designations[0] === "Coordinator");
      assert.equal(all.items.find((r) => r.email === "director@x.test")!.isDirector, true);
      assert.equal((await listPeople({ search: "Meera" })).total, 1);
      assert.equal((await listPeople({ status: "blocked" })).total, 0);
    });
    await T("status changes still work and the list follows (on leave can sign in, suspended cannot)", async () => {
      const { changeAccountStatus } = await import("../src/lib/products/commandos/account-status");
      const r1 = await changeAccountStatus(meera, "on_leave", { id: director.toString(), roles: ["super_admin"] } as never, { reason: "", lastWorkingDay: null });
      assert.equal(r1.ok, true);
      assert.equal((await listPeople({ status: "working" })).items.some((r) => r.email === "meera@x.test"), true);
      const r2 = await changeAccountStatus(meera, "suspended", { id: director.toString(), roles: ["super_admin"] } as never, { reason: "enquiry", lastWorkingDay: null });
      assert.equal(r2.ok, true);
      assert.equal((await listPeople({ status: "blocked" })).items.some((r) => r.email === "meera@x.test"), true);
    });
    await T("an email invitation carries the access map and applies it when accepted", async () => {
      const token = "tok_" + "a".repeat(40);
      await db.collection("company_invitations").insertOne({
        _id: "inv1", tokenHash: createHash("sha256").update(token).digest("hex"), email: "invitee@x.test", name: "Invitee", preset: "access",
        roles: ["pms_employee"], departmentId: dept._id, designationId: des1._id, invitedBy: actor.id, status: "pending", createdAt: new Date(), expiresAt: new Date(Date.now() + 86400000), acceptedAt: null,
        person: { access: pick(2), derivedRoles: ["pms_employee"], derivedOverrides: {}, phone: "", joiningDate: "2026-07-01", userType: "contractor", departmentIds: [dept._id], teamIds: [team._id], designationIds: [des2._id, des1._id], designationTitle: "Coordinator" },
      } as never);
      const r = await acceptInvitation(token, { name: "Invitee", password: "Str0ng!Passw0rd#1" });
      assert.equal(r.ok, true, r.ok ? "" : r.error);
      const u = await users.findOne({ email: "invitee@x.test" });
      assert.deepEqual(u?.access, pick(2));
      assert.deepEqual(u?.roles, ["pms_employee"]);
      assert.deepEqual(u?.designationIds, [des2._id, des1._id]);
      assert.equal(u?.userType, "contractor");
      assert.deepEqual(u?.customRoleIds, []);
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log(`\n${passed} passed (${PRODUCTS.length} products checked)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
