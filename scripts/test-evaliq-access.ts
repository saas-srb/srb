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
import { can, PERMISSION_FEATURE, type OtsViewer } from "../src/lib/products/evaliq/viewer";
import { seesEveryones } from "../src/components/products/evaliq/OwnViews";
import { splitPicked, checkAccess } from "../src/lib/products/commandos/people";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { OTS_PERMISSIONS, otsCan } from "../src/lib/ots-roles";

// Director vs partial vs old user vs Read only in AgentOS. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "evaliq";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_ao", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const ids = { director: new ObjectId(), cand: new ObjectId(), mgr: new ObjectId(), hr: new ObjectId(), mentor: new ObjectId(), partial: new ObjectId(), readOnly: new ObjectId() };
    await people.insertMany([{ _id: ids.director, email: "d@x", roles: ["super_admin"] }, { _id: ids.cand, email: "c@x", roles: ["ots_candidate"] }, { _id: ids.mgr, email: "m@x", roles: ["ots_manager"] }, { _id: ids.hr, email: "h@x", roles: ["hr"] }, { _id: ids.mentor, email: "t@x", roles: ["mentor"] }, { _id: ids.partial, email: "p@x", roles: ["employee"] }, { _id: ids.readOnly, email: "r@x", roles: ["employee"] }] as never);
    const set = async (id: ObjectId, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };
    const preset = buildAccessUi().presets[P];
    await set(ids.readOnly, Object.fromEntries(preset.read.map((x) => [x, "read" as const])));
    await set(ids.partial, { [k("tests.view")]: "read", [k("assignments.all")]: "read", [k("answers.evaluate")]: "write" });
    const viewerOf = async (id: ObjectId): Promise<OtsViewer> => {
      const row = (await people.findOne({ _id: id }))!; const subject = subjectFromRow(row as never); const roles = (row.roles as string[]) ?? [];
      return { userId: String(id), email: String(row.email), name: "x", roles, ctx: { roles, permissionOverrides: null }, subject, employeeId: null, candidates: [], isStaff: false } as OtsViewer;
    };

    await T("parity: old roles (including the ones implied by HRMS and TMS roles) give exactly the micro features their legacy capabilities give; round trip has 0 differences", async () => {
      for (const [roles, ov] of [[["ots_candidate"], null], [["ots_evaluator"], null], [["ots_author"], null], [["ots_manager"], null], [["ots_admin"], null], [["employee"], null], [["hr"], null], [["mentor"], null], [["tms_admin"], null], [["training_student"], null], [["ots_candidate"], { "ots.canViewTests": true }], [["ots_manager"], { "ots.canExportReports": false }]] as const) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access)); assert.deepEqual(d.widened, [], `widened ${roles}`); assert.deepEqual(d.withheld, [], `withheld ${roles}`);
        if (!ov) { const back = legacyAnswers({ roles: d.roles, permissionOverrides: d.permissionOverrides }); for (const e of CATALOGUE.filter((x) => x.product === P && x.kind !== "tier")) assert.equal(back[e.key], legacy[e.key], `${e.key} ${roles}`); }
      }
    });
    await T("parity: every old permission name answers like otsCan for each old role, and for the HRMS roles that imply EvalIQ access", async () => {
      for (const id of [ids.cand, ids.mgr, ids.hr, ids.mentor]) { const v = await viewerOf(id); for (const perm of OTS_PERMISSIONS) assert.equal(can(v, perm), otsCan(v.ctx, perm), `${perm} for ${v.roles}`); }
      assert.deepEqual(Object.keys(PERMISSION_FEATURE).sort(), [...OTS_PERMISSIONS].sort());
    });
    await T("Director: every micro feature", async () => { const v = await viewerOf(ids.director); for (const m of microOf(P)) assert.ok(can(v, m.key.slice(P.length + 1)), m.key); assert.equal(seesEveryones(v, "assignments"), true); });
    await T("test taker (own scope): own tests, results and certificates; never everyone's, and cannot assign, evaluate, export or change anything", async () => {
      const v = await viewerOf(ids.cand);
      for (const f of ["dashboard.view", "assignments.own", "assignments.take", "results.own", "certificates.own"]) assert.ok(can(v, f), f);
      for (const f of ["assignments.all", "results.all", "tests.view", "questions.view", "reports.view", "answers.evaluate", "reports.export", "settings.manage"]) assert.equal(can(v, f), false, f);
      assert.equal(seesEveryones(v, "assignments"), false); assert.equal(seesEveryones(v, "results"), false);
    });
    await T("Read only is truly read only: the preset has no write feature, and a person with exactly it can look at tests, questions, reports, results and certificates but not take tests, evaluate, assign, export or change anything", async () => {
      assert.equal(preset.readLabel, "Read only"); assert.deepEqual(preset.readExtras, []);
      const v = await viewerOf(ids.readOnly);
      for (const m of microOf(P)) { const short = m.key.slice(P.length + 1); if (m.level === "write" && !m.baseline) assert.equal(can(v, short), false, `${short} must not come with Read only`); }
      assert.ok(can(v, "tests.view") && can(v, "questions.view") && can(v, "reports.view") && can(v, "results.own"));
      assert.equal(can(v, "answers.evaluate"), false); assert.equal(can(v, "assignments.assign"), false); assert.equal(can(v, "questions.export"), false);
      assert.equal(can(v, "assignments.all"), false, "everyone's assignments is a scope feature, never part of the quick Read only");
    });
    await T("partial person: only the granted features; everyone's assignments and marking, nothing else", async () => {
      const v = await viewerOf(ids.partial);
      assert.ok(can(v, "tests.view") && can(v, "assignments.all") && can(v, "answers.evaluate"));
      for (const f of ["tests.create", "assignments.assign", "answers.override", "reports.view", "settings.manage"]) assert.equal(can(v, f), false, f);
      assert.equal(can(v, "EVALUATE_ANSWERS"), true, "an old permission name is translated"); assert.equal(can(v, "ASSIGN_TEST"), false); assert.equal(can(v, "nonexistent.x"), false);
      assert.equal(seesEveryones(v, "results"), true, "marking answers opens the results list");
    });
    await T("removing a feature takes effect on the next request; old-role people open prefilled in micro features", async () => {
      await set(ids.partial, { [k("tests.view")]: "read" });
      const v = await viewerOf(ids.partial); assert.equal(can(v, "answers.evaluate"), false); assert.equal(can(v, "tests.view"), true);
      const { access } = legacyToAccess({ roles: ["ots_manager"], permissionOverrides: null });
      const picked = splitPicked(access); assert.ok(Object.keys(picked[P] ?? {}).every((x) => x.split(".").length === 3));
      const c = checkAccess(picked); assert.deepEqual(c.widened, []); assert.deepEqual(c.withheld, []);
      for (const m of microOf(P)) assert.equal(Boolean(c.access[P]?.[m.key]), Boolean(access[P]?.[m.key]), m.key);
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
