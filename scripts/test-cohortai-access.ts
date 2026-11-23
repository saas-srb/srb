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
import { tmsCan, tmsScope, tmsMayOpen } from "../src/lib/tms-access";
import { buildAccessUi } from "../src/lib/access/ui-model";

// CohortAI: Director vs partial vs old roles vs Read only vs own-only (student) vs staff, with the owner-or-staff record rule. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "cohort-ai";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_tms", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const mk = (roles: string[], studentId: string | null) => ({ _id: new ObjectId(), email: `${roles.join("_")}@x`, roles, studentId });
    const rows = { student: mk(["training_student"], "S1"), mentor: mk(["mentor"], null), manager: mk(["tms_manager"], null), admin: mk(["tms_admin"], null), director: mk(["super_admin"], null), partial: mk(["employee"], "S2"), readOnly: mk(["employee"], "S3") };
    await people.insertMany(Object.values(rows) as never);
    const holder = async (row: { _id: ObjectId; studentId: string | null }) => { const r = (await people.findOne({ _id: row._id })) as never as { roles: string[] }; return { roles: r.roles, studentId: row.studentId, subject: subjectFromRow(r as never) }; };
    const set = async (row: { _id: ObjectId }, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(row._id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };

    await T("parity: old CohortAI roles give exactly the micro features their legacy capabilities give; round trip with nothing widened or withheld in CohortAI", async () => {
      for (const [roles, ov] of [[["training_student"], null], [["mentor"], null], [["tms_manager"], null], [["tms_admin"], null], [["tms_manager"], { "tms.canIssueCertificates": true }]] as const) {
        const legacy = legacyAnswers({ roles: [...roles], permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles: [...roles], permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles}`);
        const d = accessToLegacy(completeAccess(access));
        assert.deepEqual(d.widened.filter((x) => x.startsWith("tms.")), [], `widened ${roles}`);
        assert.deepEqual(d.withheld.filter((x) => x.startsWith("tms.")), [], `withheld ${roles}`);
      }
    });
    await T("Director: every micro feature and everyone's scope", async () => {
      const d = await holder(rows.director);
      for (const m of microOf(P)) assert.ok(tmsCan(d, m.key.slice(P.length + 1)), m.key);
      assert.equal(tmsScope(d, "certificates"), "all");
    });
    await T("own-only student: sees their own program, batch, assignments, certificates and payments; opens another student's certificate or invoice never; no staff pages", async () => {
      const s = await holder(rows.student);
      for (const m of ["programs", "batches", "classes", "assignments", "projects", "certificates", "payments", "students"] as const) assert.equal(tmsScope(s, m), "own", m);
      assert.ok(tmsMayOpen(s, "certificates", "S1", s.studentId) && !tmsMayOpen(s, "certificates", "S9", s.studentId));
      assert.ok(tmsMayOpen(s, "payments", "S1", s.studentId) && !tmsMayOpen(s, "payments", "S9", s.studentId));
      assert.ok(tmsCan(s, "assignments.submit") && tmsCan(s, "students.edit") && tmsCan(s, "projects.update"));
      for (const f of ["certificates.manage", "payments.manage", "students.manage", "assignments.manage", "placements.view", "reports.export", "settings.manage"]) assert.equal(tmsCan(s, f), false, f);
    });
    await T("staff: mentor and manager open any student's record; only the right-holders change it (manager: training; admin: certificates, payments, settings, audit)", async () => {
      const mentor = await holder(rows.mentor), manager = await holder(rows.manager), admin = await holder(rows.admin);
      for (const x of [mentor, manager, admin]) { assert.equal(tmsScope(x, "certificates"), "all"); assert.ok(tmsMayOpen(x, "payments", "S9", x.studentId)); }
      assert.equal(tmsCan(mentor, "assignments.manage"), false);
      assert.ok(tmsCan(manager, "assignments.manage") && tmsCan(manager, "students.manage") && tmsCan(manager, "reports.export"));
      assert.equal(tmsCan(manager, "certificates.manage"), false); assert.equal(tmsCan(manager, "payments.manage"), false); assert.equal(tmsCan(manager, "settings.manage"), false);
      for (const f of ["certificates.manage", "payments.manage", "settings.manage", "audit.view"]) assert.ok(tmsCan(admin, f), f);
    });
    await T("Read only is truly read only: no write feature in the preset, and a person with exactly it can look but submit, edit or manage nothing", async () => {
      const pre = buildAccessUi().presets[P];
      assert.ok(pre.readLabel.startsWith("Read only"));
      await set(rows.readOnly, Object.fromEntries(pre.read.map((x) => [x, "read" as const])));
      const h = await holder(rows.readOnly);
      for (const m of microOf(P)) if (m.level === "write") assert.equal(accessCan(h.subject, P, m.key, "write"), false, `${m.key} must not come with Read only`);
      for (const f of ["assignments.submit", "students.edit", "projects.update", "payments.manage"]) assert.equal(tmsCan(h, f), false, f);
    });
    await T("partial person gets only what was picked and loses it on the next request", async () => {
      await set(rows.partial, { [k("certificates.view")]: "read", [k("assignments.view")]: "read", [k("assignments.submit")]: "write" });
      let h = await holder(rows.partial);
      assert.ok(tmsCan(h, "assignments.submit") && tmsCan(h, "certificates.view"));
      for (const f of ["payments.view", "certificates.all", "assignments.manage", "students.edit"]) assert.equal(tmsCan(h, f), false, f);
      await set(rows.partial, { [k("certificates.view")]: "read" });
      h = await holder(rows.partial);
      assert.equal(tmsCan(h, "assignments.submit"), false);
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
