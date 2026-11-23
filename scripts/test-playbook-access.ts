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
import { pbCan, pbDoc, pbSop, pbSeesAllSops, pbManagesDepartment } from "../src/lib/playbook-access";
import { canReadSop, canEditSop, canPublishSop, canCreateInDepartment, creatableDepartmentIds, canAcknowledgeSop } from "../src/lib/products/playbook-ai/access";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { playbookCan } from "../src/lib/playbook-roles";
import { sopCan } from "../src/lib/sop-roles";
import type { SopViewer } from "../src/lib/products/playbook-ai/types";

// Playbook: Director vs partial vs old roles vs Read only vs own-only vs manager, with the document and SOP object scope. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "playbook-ai";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_pb", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const mk = (roles: string[]) => ({ _id: new ObjectId(), email: `${roles.join("_")}@x`, roles });
    const rows = { employee: mk(["sop_employee"]), author: mk(["sop_author"]), manager: mk(["sop_manager"]), admin: mk(["sop_admin"]), director: mk(["super_admin"]), partial: mk(["employee"]), readOnly: mk(["employee"]) };
    await people.insertMany(Object.values(rows) as never);
    const subjectOf = async (row: { _id: ObjectId }) => subjectFromRow((await people.findOne({ _id: row._id })) as never);
    const set = async (row: { _id: ObjectId }, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(row._id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };
    const viewerOf = async (row: { _id: ObjectId }, roles: string[], over: Partial<SopViewer> = {}): Promise<SopViewer> => ({
      subject: await subjectOf(row), userId: String(row._id), email: "x", name: "X", roles, overrides: {}, employeeId: null, hrmsDepartmentId: null, teamId: null, designationId: null,
      memberDepartmentIds: [], headedDepartmentIds: [], manageDepartmentIds: [], isAdmin: false, isManagerTier: false, ...over,
    });

    await T("parity: old Playbook roles give exactly the micro features their legacy capabilities give; round trip with nothing widened or withheld in Playbook", async () => {
      for (const [roles, ov] of [[["sop_employee"], null], [["sop_author"], null], [["sop_manager"], null], [["sop_admin"], null], [["employee"], null], [["manager"], null], [["sop_author"], { "playbookdoc.canApprove": true }]] as const) {
        const legacy = legacyAnswers({ roles: [...roles], permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles: [...roles], permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles}`);
        const d = accessToLegacy(completeAccess(access));
        assert.deepEqual(d.widened.filter((x) => x.startsWith("sop.") || x.startsWith("playbook.")), [], `widened ${roles}`);
        assert.deepEqual(d.withheld.filter((x) => x.startsWith("sop.") || x.startsWith("playbook.")), [], `withheld ${roles}`);
      }
    });
    await T("every old permission name answers like the old role files for every old role (pbDoc and pbSop follow playbookCan and sopCan)", async () => {
      const DOC = ["VIEW", "CREATE", "EDIT", "COMMENT", "SUBMIT", "APPROVE", "ISSUE", "EXPORT", "SHARE", "SEND_FOR_SIGNATURE", "USE_AI", "MANAGE_TEMPLATES", "REVIEW_TEMPLATES", "MANAGE_BRAND", "MANAGE_VARIABLES", "MANAGE_RETENTION", "VIEW_AUDIT", "SETTINGS"] as const;
      const SOP = ["VIEW", "CREATE", "EDIT", "PUBLISH", "ASSIGN", "ACKNOWLEDGE", "ARCHIVE", "DOWNLOAD", "EXPORT", "MANAGE_TEMPLATES", "MANAGE_PERMISSIONS", "VIEW_AUDIT"] as const;
      for (const row of [rows.employee, rows.author, rows.manager, rows.admin]) {
        const r = (await people.findOne({ _id: row._id })) as unknown as { roles: string[] };
        const holder = { subject: await subjectOf(row), roles: r.roles };
        const ctx = { roles: r.roles, permissionOverrides: {} } as never;
        for (const p of DOC) assert.equal(pbDoc(holder, p), playbookCan(ctx, p), `${p} for ${r.roles}`);
        for (const p of SOP) assert.equal(pbSop(holder, p), sopCan(ctx, p), `${p} for ${r.roles}`);
      }
    });
    await T("Director: every micro feature and every department", async () => {
      const d = { subject: await subjectOf(rows.director) };
      for (const m of microOf(P)) assert.ok(pbCan(d, m.key.slice(P.length + 1)), m.key);
      assert.ok(pbSeesAllSops(d));
    });
    await T("reader (employee): reads, comments, acknowledges and sends feedback; cannot create, edit, publish, approve, export or send for signature", async () => {
      const e = { subject: await subjectOf(rows.employee) };
      for (const f of ["documents.view", "documents.comment", "sops.view", "sops.acknowledge", "sops.feedback"]) assert.ok(pbCan(e, f), f);
      for (const f of ["documents.create", "documents.edit", "documents.approve", "documents.issue", "documents.export", "documents.sendsignature", "sops.create", "sops.edit", "sops.publish", "brand.manage", "templates.manage"]) assert.equal(pbCan(e, f), false, f);
    });
    await T("author / manager / admin: each tier adds exactly what the old tier added (approve, issue, send for signature for managers; brand, templates, settings, retention for admins)", async () => {
      const au = { subject: await subjectOf(rows.author) }, mg = { subject: await subjectOf(rows.manager) }, ad = { subject: await subjectOf(rows.admin) };
      assert.ok(pbCan(au, "documents.create") && pbCan(au, "documents.submit") && pbCan(au, "documents.useai") && !pbCan(au, "documents.approve") && !pbCan(au, "documents.sendsignature"));
      assert.ok(pbCan(mg, "documents.approve") && pbCan(mg, "documents.issue") && pbCan(mg, "documents.sendsignature") && pbCan(mg, "documents.share") && !pbCan(mg, "brand.manage") && !pbCan(mg, "templates.manage"));
      for (const f of ["brand.manage", "templates.manage", "templates.review", "variables.manage", "retention.manage", "documentsettings.manage", "documentaudit.view", "sopaccess.manage", "sops.all"]) assert.ok(pbCan(ad, f), f);
      assert.ok(pbManagesDepartment(mg) && !pbSeesAllSops(mg) && pbSeesAllSops(ad));
    });
    await T("SOP object scope: an employee reads only live internal or assigned SOPs, a manager writes only their own departments, an admin everything", async () => {
      const today = { status: "published" as const, ownerId: "o", authorId: "o", createdBy: "o", accessUserIds: [] as string[], allowDownload: true };
      const own = { _id: "s1", departmentId: "D1", confidentiality: "internal" as const, ...today };
      const other = { _id: "s2", departmentId: "D2", confidentiality: "department_only" as const, ...today };
      const emp = await viewerOf(rows.employee, ["sop_employee"], { memberDepartmentIds: ["D1"] });
      assert.ok(canReadSop(emp, own as never, false)); assert.equal(canReadSop(emp, other as never, false), false, "another department's SOP is closed"); assert.ok(canReadSop(emp, other as never, true), "unless assigned");
      assert.equal(canEditSop(emp, own as never), false); assert.equal(canCreateInDepartment(emp, "D1"), false);
      const mgr = await viewerOf(rows.manager, ["sop_manager"], { memberDepartmentIds: ["D1"], manageDepartmentIds: ["D1"], isManagerTier: true });
      assert.ok(canEditSop(mgr, own as never) && canPublishSop(mgr, own as never));
      assert.equal(canEditSop(mgr, other as never), false, "a manager does not write another department's SOP");
      assert.deepEqual(creatableDepartmentIds(mgr), ["D1"]);
      const adm = await viewerOf(rows.admin, ["sop_admin"], { isAdmin: true, isManagerTier: true });
      assert.ok(canEditSop(adm, other as never) && canPublishSop(adm, other as never)); assert.equal(creatableDepartmentIds(adm), null);
      assert.ok(canAcknowledgeSop(emp, own as never, false));
    });
    await T("Read only is truly read only: no write feature in the preset, and a person with exactly it can look and download but write, comment, approve or send nothing", async () => {
      const pre = buildAccessUi().presets[P];
      assert.ok(pre.readLabel.startsWith("Read only"));
      await set(rows.readOnly, Object.fromEntries(pre.read.map((x) => [x, "read" as const])));
      const subject = await subjectOf(rows.readOnly);
      for (const m of microOf(P)) if (m.level === "write") assert.equal(accessCan(subject, P, m.key, "write"), false, `${m.key} must not come with Read only`);
      for (const f of ["documents.create", "documents.comment", "documents.approve", "documents.sendsignature", "sops.create", "sops.acknowledge", "sops.feedback", "brand.manage"]) assert.equal(pbCan({ subject }, f), false, f);
    });
    await T("partial person gets only what was picked and loses it on the next request", async () => {
      await set(rows.partial, { [k("documents.view")]: "read", [k("documents.create")]: "write", [k("documents.export")]: "read" });
      let s = { subject: await subjectOf(rows.partial) };
      assert.ok(pbCan(s, "documents.create") && pbCan(s, "documents.export"));
      for (const f of ["documents.approve", "sops.create", "brand.manage", "documents.sendsignature"]) assert.equal(pbCan(s, f), false, f);
      await set(rows.partial, { [k("documents.view")]: "read" });
      s = { subject: await subjectOf(rows.partial) };
      assert.equal(pbCan(s, "documents.create"), false);
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
