import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { featuresOf } from "../src/lib/access/catalogue";
import { emptyDetails } from "../src/lib/products/commandos/people-rules";
import { createPerson, loadPersonForEdit } from "../src/lib/products/commandos/people";
import { createDepartment, createDesignation } from "../src/lib/platform/organization";
import { bulkSetAccess, deleteTemplate, listTemplates, mergeAccess, saveTemplate, MAX_BULK } from "../src/lib/products/commandos/access-bundles";
import type { AccessMap } from "../src/lib/access/types";

// Bulk access, copy access and access templates. Pure first, then a throwaway database. Run: npm run test:access-bundles
let passed = 0;
const T = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const actor = { id: "507f1f77bcf86cd799439011", email: "director@x.test", roles: ["super_admin"] as const };
const feats = (p: string) => featuresOf(p).filter((e) => e.kind !== "tier");
const pick = (p: string, from: number, to: number): AccessMap => ({ [p]: Object.fromEntries(feats(p).slice(from, to).map((e) => [e.key, e.level])) });

(async () => {
  console.log("merging (pure)");
  await T("replace gives exactly the incoming access; add keeps what a person has and only raises levels", () => {
    const cur: AccessMap = { sprintos: { a: "read", b: "write" } };
    const inc: AccessMap = { sprintos: { a: "write", b: "read", c: "read" }, talentos: { z: "read" } };
    assert.deepEqual(mergeAccess(cur, inc, "replace"), inc);
    assert.deepEqual(mergeAccess(cur, inc, "add"), { sprintos: { a: "write", b: "write", c: "read" }, talentos: { z: "read" } });
    assert.notEqual(mergeAccess(cur, inc, "replace"), inc, "a copy, never the same object");
    assert.deepEqual(cur, { sprintos: { a: "read", b: "write" } }, "the input is not changed");
  });

  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  const ids: Record<string, string> = {};
  await runAsCompany("co_bundles", async () => {
    const db = await getDb();
    const users = db.collection("admin_users");
    const dept = await createDepartment({ name: "Ops" }, actor);
    const des = await createDesignation({ title: "Coordinator", departmentId: dept._id }, actor);
    const base = { ...emptyDetails(), departmentIds: [dept._id], designationIds: [des._id], joiningDate: "2026-06-01" };
    const make = async (key: string, access: AccessMap) => { const r = await createPerson({ ...base, name: key, email: `${key}@x.test`, access }, actor, "http://localhost"); assert.equal(r.ok, true, r.error); ids[key] = r.id!; };
    await make("asha", pick("sprintos", 0, 4));
    await make("ben", pick("sprintos", 0, 1));
    await make("carl", pick("talentos", 0, 2));
    await make("gone", pick("sprintos", 0, 1));
    await users.updateOne({ _id: new ObjectId(ids.gone) }, { $set: { status: "suspended" } });
    const director = (await users.insertOne({ email: "dir@x.test", name: "Dee", roles: ["super_admin"], status: "active", passwordHash: "x" } as never)).insertedId.toString();

    console.log("templates");
    await T("a template is a saved bundle: named, checked, listed, renamed and deleted; it is not a role", async () => {
      assert.equal((await saveTemplate({ name: "A", access: pick("sprintos", 0, 2) }, actor.id)).ok, false, "a name is required");
      assert.equal((await saveTemplate({ name: "Empty", access: {} }, actor.id)).ok, false);
      assert.equal((await saveTemplate({ name: "Junk", access: { sprintos: { notAFeature: "write" } } }, actor.id)).ok, false, "only real features are kept");
      const t = await saveTemplate({ name: "Project member", description: "  day to day  ", access: pick("sprintos", 0, 3) }, actor.id);
      assert.equal(t.ok, true);
      if (!t.ok) return;
      assert.deepEqual([t.template.featureCount, t.template.description], [3, "day to day"]);
      assert.equal((await saveTemplate({ name: "project MEMBER", access: pick("sprintos", 0, 1) }, actor.id)).ok, false, "names are unique, ignoring case");
      const r = await saveTemplate({ id: t.template.id, name: "Project members", access: pick("sprintos", 0, 2) }, actor.id);
      assert.equal(r.ok && r.template.featureCount, 2);
      assert.deepEqual((await listTemplates()).map((x) => x.name), ["Project members"]);
      assert.equal((await db.collection("access_audit_log").countDocuments({ action: { $in: ["template.created", "template.updated"] } })), 2);
    });
    await T("applying a template writes the features onto people ONCE: later changes or deletion change nobody", async () => {
      const t = (await listTemplates())[0];
      const res = await bulkSetAccess([ids.ben, ids.carl], { kind: "template", templateId: t.id }, "replace", actor);
      assert.deepEqual([res.changed, res.failed], [2, 0]);
      const ben = await loadPersonForEdit(ids.ben);
      const benCount = Object.keys(ben!.picked.sprintos).length; // features a template needs may bring required companions
      assert.ok(benCount >= 2);
      assert.equal((await loadPersonForEdit(ids.carl))!.picked.talentos, undefined, "replace removed the old product");
      await saveTemplate({ id: t.id, name: "Project members", access: pick("sprintos", 0, 1) }, actor.id);
      assert.equal(Object.keys((await loadPersonForEdit(ids.ben))!.picked.sprintos).length, benCount, "editing the template changed nobody");
      assert.deepEqual(await deleteTemplate(t.id, actor.id), { ok: true });
      assert.equal(Object.keys((await loadPersonForEdit(ids.ben))!.picked.sprintos).length, benCount, "deleting it changed nobody");
      assert.equal((await deleteTemplate(t.id, actor.id)).ok, false);
    });

    console.log("bulk and copy");
    await T("several people get the SAME chosen access at once; 'add' keeps what each already has", async () => {
      await bulkSetAccess([ids.asha, ids.ben], { kind: "access", access: pick("talentos", 0, 2) }, "add", actor);
      for (const k of ["asha", "ben"]) { const p = (await loadPersonForEdit(ids[k]))!.picked; assert.ok(p.talentos && p.sprintos, `${k} has both products`); assert.ok(Object.keys(p.talentos).length >= 2); }
    });
    await T("copy access from another person: the target ends up with exactly the source's features", async () => {
      const res = await bulkSetAccess([ids.carl], { kind: "person", userId: ids.asha }, "replace", actor);
      assert.equal(res.changed, 1);
      assert.deepEqual((await loadPersonForEdit(ids.carl))!.picked, (await loadPersonForEdit(ids.asha))!.picked);
    });
    await T("a person is never copied onto themselves; a Director can be neither source nor target; a suspended account is skipped with a plain reason", async () => {
      const self = await bulkSetAccess([ids.asha], { kind: "person", userId: ids.asha }, "replace", actor);
      assert.deepEqual([self.changed, self.skipped], [0, 1]);
      const fromDir = await bulkSetAccess([ids.ben], { kind: "person", userId: director }, "replace", actor);
      assert.equal(fromDir.failed, 1);
      assert.match(fromDir.rows[0].error ?? "", /Director/);
      const toDir = await bulkSetAccess([director], { kind: "access", access: pick("sprintos", 0, 1) }, "replace", actor);
      assert.deepEqual([toDir.changed, toDir.skipped], [0, 1]);
      const sus = await bulkSetAccess([ids.gone], { kind: "access", access: pick("sprintos", 0, 2) }, "replace", actor);
      assert.deepEqual([sus.changed, sus.skipped], [0, 1]);
      assert.match(sus.rows[0].error ?? "", /sign in/);
    });
    await T("one person failing does not stop the others; unknown and malformed ids are handled; the list is capped; nothing is thrown", async () => {
      const mixed = await bulkSetAccess([ids.ben, new ObjectId().toString(), "nope", ids.carl], { kind: "access", access: pick("sprintos", 0, 3) }, "replace", actor);
      assert.deepEqual([mixed.changed, mixed.failed], [2, 1], "'nope' is dropped, the unknown account fails, two are changed");
      assert.equal((await bulkSetAccess([], { kind: "access", access: pick("sprintos", 0, 1) }, "add", actor)).failed, 1);
      const many = await bulkSetAccess(Array.from({ length: MAX_BULK + 20 }, () => new ObjectId().toString()), { kind: "access", access: pick("sprintos", 0, 1) }, "add", actor);
      assert.equal(many.rows.length, MAX_BULK);
      assert.equal((await bulkSetAccess([ids.ben], { kind: "template", templateId: "missing" }, "add", actor)).failed, 1);
    });
    await T("every bulk change is audited, and each person's own edit goes through the same rules (a delegated manager cannot hand out what they do not hold)", async () => {
      assert.ok((await db.collection("access_audit_log").countDocuments({ action: "user.access_bulk" })) >= 4);
      assert.ok((await db.collection("access_audit_log").countDocuments({ action: "user.access_changed" })) >= 6, "one per person too");
      const delegate = { id: ids.asha, email: "asha@x.test", roles: ["pms_manager"] as readonly string[] };
      const r = await bulkSetAccess([ids.ben], { kind: "access", access: { talentos: Object.fromEntries(feats("talentos").map((e) => [e.key, e.level])) } }, "replace", delegate);
      assert.deepEqual([r.changed, r.failed], [0, 1]);
      assert.match(r.rows[0].error ?? "", /Only a Director/, "the delegated-manager limit of editing one person applies to each person in a bulk change");
    });
  });
  await runAsCompany("co_other_bundles", async () => {
    await T("another company sees none of these templates", async () => { assert.deepEqual(await listTemplates(), []); });
  });
  await (await getPlatformDb()).dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
