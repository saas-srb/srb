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
import { can } from "../src/lib/products/contractflow-ai/viewer";
import { splitPicked, checkAccess } from "../src/lib/products/commandos/people";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { lpmsCan } from "../src/lib/lpms-roles";

// Director vs partial vs old user vs Read only in AgentOS. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "contractflow-ai";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_ao", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const ids = { director: new ObjectId(), user: new ObjectId(), mgr: new ObjectId(), admin: new ObjectId(), partial: new ObjectId(), readOnly: new ObjectId() };
    await people.insertMany([{ _id: ids.director, email: "d@x", roles: ["super_admin"] }, { _id: ids.user, email: "u@x", roles: ["lpms_author"] }, { _id: ids.mgr, email: "m@x", roles: ["lpms_manager"] }, { _id: ids.admin, email: "a@x", roles: ["lpms_admin"] }, { _id: ids.partial, email: "p@x", roles: ["employee"] }, { _id: ids.readOnly, email: "r@x", roles: ["employee"] }] as never);
    const set = async (id: ObjectId, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };
    const preset = buildAccessUi().presets[P];
    await set(ids.readOnly, Object.fromEntries(preset.read.map((x) => [x, "read" as const])));
    await set(ids.partial, { [k("documents.view")]: "read", [k("documents.create")]: "write", [k("signatures.view")]: "read" });
    const viewerOf = async (id: ObjectId) => {
      const row = (await people.findOne({ _id: id }))!; const subject = subjectFromRow(row as never); const roles = (row.roles as string[]) ?? [];
      return { userId: String(id), email: String(row.email), roles, ctx: { roles, permissionOverrides: null }, subject };
    };

    await T("parity: old roles give exactly the micro features their legacy capabilities give; round trip has 0 differences", async () => {
      for (const [roles, ov] of [[["lpms_author"], null], [["lpms_manager"], null], [["lpms_admin"], null], [["lpms_author"], { "lpms.canApprove": true }], [["lpms_manager"], { "lpms.canViewAudit": false }]] as const) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access)); assert.deepEqual(d.widened, [], `widened ${roles}`); assert.deepEqual(d.withheld, [], `withheld ${roles}`);
        if (!ov) { const back = legacyAnswers({ roles: d.roles, permissionOverrides: d.permissionOverrides }); for (const e of CATALOGUE.filter((x) => x.product === P && x.kind !== "tier")) assert.equal(back[e.key], legacy[e.key], `${e.key} ${roles}`); }
      }
    });
    await T("parity: the viewer answers like the old lpmsCan for each old role", async () => {
      const pairs: [string, Parameters<typeof lpmsCan>[1]][] = [["documents.view", "VIEW"], ["documents.create", "CREATE"], ["documents.edit", "EDIT"], ["documents.delete", "DELETE"], ["documents.approve", "APPROVE"], ["documents.publish", "PUBLISH"], ["documents.download", "DOWNLOAD"], ["signatures.sign", "SIGN"], ["documents.archive", "ARCHIVE"], ["templates.manage", "MANAGE_TEMPLATES"], ["makers.manage", "MANAGE_MAKERS"], ["policies.manage", "MANAGE_POLICIES"], ["signatures.manage", "MANAGE_DOCUMENTS"], ["audit.view", "VIEW_AUDIT"]];
      for (const id of [ids.user, ids.mgr, ids.admin]) { const v = await viewerOf(id); for (const [m, perm] of pairs) assert.equal(can(v, m), lpmsCan(v.ctx, perm), `${m} for ${v.roles}`); }
    });
    await T("Director: every micro feature", async () => { const v = await viewerOf(ids.director); for (const m of microOf(P)) assert.ok(can(v, m.key.slice(P.length + 1)), m.key); });
    await T("old author: works on documents but cannot approve, publish, manage templates, makers or policies, and picks only the parties their other products allow", async () => {
      const v = await viewerOf(ids.user);
      for (const f of ["documents.view", "documents.create", "documents.edit"]) assert.ok(can(v, f), f);
      for (const f of ["documents.approve", "documents.publish", "templates.manage", "makers.manage", "policies.manage", "audit.view", "parties.all"]) assert.equal(can(v, f), false, f);
      assert.equal(can(await viewerOf(ids.admin), "parties.all"), true, "legal/admin see every kind of party");
    });
    await T("Read only is truly read only: the preset has no write feature; a person with exactly it can look but not create, edit, approve, publish, send or manage anything", async () => {
      assert.equal(preset.readLabel, "Read only");
      const v = await viewerOf(ids.readOnly);
      for (const m of microOf(P)) { const short = m.key.slice(P.length + 1); if (m.level === "write") assert.equal(can(v, short), false, `${short} must not come with Read only`); }
      assert.ok(can(v, "documents.view") && can(v, "signatures.view") && can(v, "archive.view"));
    });
    await T("partial person: only the granted features", async () => {
      const v = await viewerOf(ids.partial);
      assert.ok(can(v, "documents.view") && can(v, "documents.create") && can(v, "signatures.view"));
      for (const f of ["documents.edit", "signatures.sign", "templates.manage", "parties.all"]) assert.equal(can(v, f), false, f);
      assert.equal(can(v, "nonexistent.x"), false);
    });
    await T("removing a feature takes effect on the next request; old-role people open prefilled in micro features", async () => {
      await set(ids.partial, { [k("documents.view")]: "read" });
      const v = await viewerOf(ids.partial); assert.equal(can(v, "documents.create"), false); assert.equal(can(v, "documents.view"), true);
      const { access } = legacyToAccess({ roles: ["lpms_manager"], permissionOverrides: null });
      const picked = splitPicked(access); assert.ok(Object.keys(picked[P] ?? {}).every((x) => x.split(".").length === 3));
      const c = checkAccess(picked); assert.deepEqual(c.widened, []); assert.deepEqual(c.withheld, []);
      for (const m of microOf(P)) assert.equal(Boolean(c.access[P]?.[m.key]), Boolean(access[P]?.[m.key]), m.key);
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
