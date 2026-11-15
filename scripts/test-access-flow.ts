import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { runAccessMigration } from "../src/lib/access/migrate";
import { loadAccessSubject, setAccess } from "../src/lib/access/server";
import { can } from "../src/lib/access/can";
import { CATALOGUE, featuresOf } from "../src/lib/access/catalogue";
import { legacyAnswers } from "../src/lib/access/legacy";

// Runs only against a throwaway database (MONGODB_URI=.../zz_throwaway_*).
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_acc", async () => {
    const col = (await getDb()).collection("admin_users");
    const ids = { director: new ObjectId(), hr: new ObjectId(), multi: new ObjectId(), none: new ObjectId(), done: new ObjectId() };
    await col.insertMany([
      { _id: ids.director, email: "d@x", roles: ["super_admin"] },
      { _id: ids.hr, email: "hr@x", roles: ["hr", "employee"], permissionOverrides: { "hrms.canRunPayroll": false } },
      { _id: ids.multi, email: "m@x", roles: ["lpms_manager", "sop_manager", "fms_admin"], permissionOverrides: { "pms.canManageProjects": true } },
      { _id: ids.none, email: "n@x" },
      { _id: ids.done, email: "k@x", roles: ["employee"], access: { talentos: {} } },
    ] as never);
    const snapshot = async () => JSON.stringify(await col.find({}, { projection: { access: 0, accessMigration: 0, accessUpdatedAt: 0, accessUpdatedBy: 0 } }).sort({ _id: 1 }).toArray());
    const before = await snapshot();

    await T("dry-run writes nothing and reports each person", async () => {
      const r = await runAccessMigration("dry-run", "acc_mig_1");
      assert.equal(r.people.length, 5);
      assert.equal(r.migrated, 4);
      assert.equal(r.skipped, 1);
      assert.equal(r.inexact, 0);
      assert.equal(await col.countDocuments({ accessMigration: { $exists: true } }), 0);
      assert.equal(await snapshot(), before);
    });
    await T("apply stores an access map per person; the Director needs none; people with an access map are skipped", async () => {
      const r = await runAccessMigration("apply", "acc_mig_1");
      assert.equal(r.migrated, 4);
      const hr = await col.findOne({ _id: ids.hr });
      assert.ok(hr?.access && Object.keys(hr.access).length > 0);
      assert.equal(hr?.accessMigration?.id, "acc_mig_1");
      assert.deepEqual((await col.findOne({ _id: ids.director }))?.access, {});
      assert.deepEqual((await col.findOne({ _id: ids.done }))?.access, { talentos: {} });
      assert.equal(await snapshot(), before, "legacy fields are untouched");
      assert.equal((await runAccessMigration("apply", "acc_mig_1")).skipped, 5, "idempotent");
    });
    await T("the stored map answers exactly like the legacy roles for every capability", async () => {
      for (const [id, roles, ov] of [[ids.hr, ["hr", "employee"], { "hrms.canRunPayroll": false }], [ids.multi, ["lpms_manager", "sop_manager", "fms_admin"], { "pms.canManageProjects": true }]] as const) {
        const s = (await loadAccessSubject(String(id)))!;
        const legacy = legacyAnswers({ roles, permissionOverrides: ov });
        for (const e of CATALOGUE) assert.equal(can(s, e.product, e.key, e.level), legacy[e.key], `${e.key} for ${roles.join("+")}`);
      }
      assert.equal((await loadAccessSubject(String(ids.director)))?.isDirector, true);
    });
    await T("a person who was never migrated still gets exactly what their legacy roles give", async () => {
      await col.updateOne({ _id: ids.hr }, { $unset: { access: "" } });
      const s = (await loadAccessSubject(String(ids.hr)))!;
      assert.equal(can(s, "talentos", "hrms.canRunPayroll", "write"), false);
      assert.ok(Object.keys(s.access ?? {}).length > 0);
    });
    await T("setAccess stores a clean map, refuses the Director, unknown people, and maps that would widen legacy access", async () => {
      const f = featuresOf("sprintos").find((e) => e.kind !== "tier" && e.level === "read")!;
      const r = await setAccess(String(ids.none), { sprintos: { [f.key]: "read", bogus: "write" } }, "actor1");
      assert.equal(r.ok, true);
      const row = await col.findOne({ _id: ids.none });
      assert.equal(row?.access?.sprintos?.[f.key], "read");
      assert.equal(row?.access?.sprintos?.bogus, undefined);
      assert.equal((await setAccess(String(ids.director), {}, "actor1")).ok, false);
      assert.equal((await setAccess("not-an-id", {}, "actor1")).ok, false);
      assert.equal((await setAccess(String(new ObjectId()), {}, "actor1")).ok, false);
      const agent = featuresOf("agentos").filter((e) => e.kind !== "tier" && e.level === "read");
      const wide = await setAccess(String(ids.none), { agentos: Object.fromEntries(agent.map((e) => [e.key, "read"])) }, "actor1");
      assert.equal(wide.ok, false, "AgentOS read-only would widen the manager tier (documented)");
    });
    await T("revert removes only what that migration wrote, legacy data is intact", async () => {
      const r = await runAccessMigration("revert", "acc_mig_1");
      assert.ok((r.reverted ?? 0) >= 3);
      assert.equal(await col.countDocuments({ "accessMigration.id": "acc_mig_1" }), 0);
      assert.deepEqual((await col.findOne({ _id: ids.done }))?.access, { talentos: {} }, "a map that was not migrated is kept");
      assert.equal(await snapshot(), before);
    });
    await T("a bad migration id is refused", async () => { await assert.rejects(() => runAccessMigration("apply", "x")); });
  });
  await (await getPlatformDb()).dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
