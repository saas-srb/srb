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
import { can, type SmmsViewer } from "../src/lib/products/viralpulse-ai/viewer";
import { splitPicked, checkAccess } from "../src/lib/products/commandos/people";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { smmsCan } from "../src/lib/smms-roles";

// Director vs partial vs old user vs Read only in AgentOS. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "viralpulse-ai";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_ao", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const ids = { director: new ObjectId(), emp: new ObjectId(), spec: new ObjectId(), mgr: new ObjectId(), partial: new ObjectId(), readOnly: new ObjectId() };
    await people.insertMany([{ _id: ids.director, email: "d@x", roles: ["super_admin"] }, { _id: ids.emp, email: "e@x", roles: ["smms_employee"] }, { _id: ids.spec, email: "s@x", roles: ["smms_specialist"] }, { _id: ids.mgr, email: "m@x", roles: ["smms_manager"] }, { _id: ids.partial, email: "p@x", roles: ["employee"] }, { _id: ids.readOnly, email: "r@x", roles: ["employee"] }] as never);
    const set = async (id: ObjectId, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };
    const preset = buildAccessUi().presets[P];
    await set(ids.readOnly, Object.fromEntries(preset.read.map((x) => [x, "read" as const])));
    await set(ids.partial, { [k("posts.view")]: "read", [k("posts.manage")]: "write", [k("analytics.view")]: "read" });
    const viewerOf = async (id: ObjectId): Promise<SmmsViewer> => {
      const row = (await people.findOne({ _id: id }))!; const subject = subjectFromRow(row as never); const roles = (row.roles as string[]) ?? [];
      return { userId: String(id), email: String(row.email), roles, ctx: { roles, permissionOverrides: null }, subject } as SmmsViewer;
    };

    await T("parity: old roles give exactly the micro features their legacy capabilities give; round trip has 0 differences", async () => {
      for (const [roles, ov] of [[["smms_employee"], null], [["smms_specialist"], null], [["smms_manager"], null], [["smms_admin"], null], [["smms_employee"], { "smms.canPublishContent": true }], [["smms_manager"], { "smms.canViewAudit": false }]] as const) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access)); assert.deepEqual(d.widened, [], `widened ${roles}`); assert.deepEqual(d.withheld, [], `withheld ${roles}`);
        if (!ov) { const back = legacyAnswers({ roles: d.roles, permissionOverrides: d.permissionOverrides }); for (const e of CATALOGUE.filter((x) => x.product === P && x.kind !== "tier")) assert.equal(back[e.key], legacy[e.key], `${e.key} ${roles}`); }
      }
    });
    await T("parity: the viewer answers like the old smmsCan for each old role", async () => {
      const pairs: [string, Parameters<typeof smmsCan>[1]][] = [["campaigns.view", "VIEW_CAMPAIGNS"], ["campaigns.create", "CREATE_CAMPAIGNS"], ["campaigns.edit", "EDIT_CAMPAIGNS"], ["campaigns.delete", "DELETE_CAMPAIGNS"], ["ads.create", "CREATE_ADS"], ["posts.manage", "MANAGE_POSTS"], ["posts.generate", "GENERATE_AI_CONTENT"], ["media.manage", "MANAGE_MEDIA"], ["posts.schedule", "SCHEDULE_POSTS"], ["posts.publish", "PUBLISH_CONTENT"], ["analytics.view", "VIEW_ANALYTICS"], ["integrations.manage", "MANAGE_INTEGRATIONS"], ["activity.view", "VIEW_AUDIT_LOG"], ["ads.approve", "APPROVE_AD_SPEND"], ["ads.limits", "MANAGE_AD_LIMITS"], ["brochures.use", "MANAGE_POSTS"], ["ugc.use", "GENERATE_AI_CONTENT"], ["studio.use", "MANAGE_MEDIA"], ["vcards.use", "GENERATE_AI_CONTENT"]];
      for (const id of [ids.emp, ids.spec, ids.mgr]) { const v = await viewerOf(id); for (const [m, perm] of pairs) assert.equal(can(v, m), smmsCan(v.ctx, perm), `${m} for ${v.roles}`); }
    });
    await T("Director: every micro feature", async () => { const v = await viewerOf(ids.director); for (const m of microOf(P)) assert.ok(can(v, m.key.slice(P.length + 1)), m.key); });
    await T("old employee (own scope): drafts posts, media and AI content but cannot create campaigns, schedule, publish, approve spend or change settings", async () => {
      const v = await viewerOf(ids.emp);
      for (const f of ["dashboard.view", "campaigns.view", "posts.view", "posts.manage", "posts.generate", "media.manage", "ugc.use", "vcards.use", "brochures.use"]) assert.ok(can(v, f), f);
      for (const f of ["campaigns.create", "campaigns.edit", "posts.schedule", "posts.publish", "ads.create", "ads.approve", "integrations.manage", "activity.view", "analytics.view"]) assert.equal(can(v, f), false, f);
    });
    await T("Read only is truly read only: the preset has no write feature; a person with exactly it can look but not create, generate, upload, schedule, publish or change anything", async () => {
      assert.equal(preset.readLabel, "Read only");
      const v = await viewerOf(ids.readOnly);
      for (const m of microOf(P)) { const short = m.key.slice(P.length + 1); if (m.level === "write") assert.equal(can(v, short), false, `${short} must not come with Read only`); }
      assert.ok(can(v, "posts.view") && can(v, "campaigns.view") && can(v, "library.view"));
    });
    await T("partial person: only the granted features", async () => {
      const v = await viewerOf(ids.partial);
      assert.ok(can(v, "posts.view") && can(v, "posts.manage") && can(v, "analytics.view"));
      for (const f of ["posts.publish", "posts.generate", "campaigns.view", "integrations.manage", "studio.use"]) assert.equal(can(v, f), false, f);
      assert.equal(can(v, "nonexistent.x"), false);
    });
    await T("removing a feature takes effect on the next request; old-role people open prefilled in micro features", async () => {
      await set(ids.partial, { [k("posts.view")]: "read" });
      const v = await viewerOf(ids.partial); assert.equal(can(v, "posts.manage"), false); assert.equal(can(v, "posts.view"), true);
      const { access } = legacyToAccess({ roles: ["smms_manager"], permissionOverrides: null });
      const picked = splitPicked(access); assert.ok(Object.keys(picked[P] ?? {}).every((x) => x.split(".").length === 3));
      const c = checkAccess(picked); assert.deepEqual(c.widened, []); assert.deepEqual(c.withheld, []);
      for (const m of microOf(P)) assert.equal(Boolean(c.access[P]?.[m.key]), Boolean(access[P]?.[m.key]), m.key);
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
