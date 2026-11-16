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
import { can, PERMISSION_FEATURE, type AibotsViewer } from "../src/lib/products/agentos/viewer";
import { buildNavGroups } from "../src/lib/products/agentos/sidebar-model";
import { splitPicked, checkAccess } from "../src/lib/products/commandos/people";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { AIBOTS_PERMISSIONS, aibotsCan } from "../src/lib/aibots-roles";

// Director vs partial vs old user vs Read only in AgentOS. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "agentos";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_ao", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const ids = { director: new ObjectId(), user: new ObjectId(), mgr: new ObjectId(), partial: new ObjectId(), readOnly: new ObjectId() };
    await people.insertMany([{ _id: ids.director, email: "d@x", roles: ["super_admin"] }, { _id: ids.user, email: "u@x", roles: ["aibots_user"] }, { _id: ids.mgr, email: "m@x", roles: ["aibots_manager"] }, { _id: ids.partial, email: "p@x", roles: ["employee"] }, { _id: ids.readOnly, email: "r@x", roles: ["employee"] }] as never);
    const set = async (id: ObjectId, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };
    const preset = buildAccessUi().presets[P];
    await set(ids.readOnly, Object.fromEntries(preset.read.map((x) => [x, "read" as const])));
    await set(ids.partial, { [k("agents.view")]: "read", [k("agents.use")]: "write", [k("chats.all")]: "read" });
    const viewerOf = async (id: ObjectId): Promise<AibotsViewer> => {
      const row = (await people.findOne({ _id: id }))!; const subject = subjectFromRow(row as never); const roles = (row.roles as string[]) ?? [];
      return { userId: String(id), email: String(row.email), roles, ctx: { roles, permissionOverrides: null }, subject, seesAll: can({ subject }, "chats.all") || can({ subject }, "agents.edit") };
    };

    await T("parity: old roles give exactly the micro features their legacy capabilities give; round trip has 0 differences", async () => {
      for (const [roles, ov] of [[["aibots_user"], null], [["aibots_manager"], null], [["aibots_admin"], null], [["aibots_user"], { "aibots.canViewAllChats": true }], [["aibots_manager"], { "aibots.canViewAudit": false }]] as const) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access)); assert.deepEqual(d.widened, []); assert.deepEqual(d.withheld, []);
        if (!ov) { const back = legacyAnswers({ roles: d.roles, permissionOverrides: d.permissionOverrides }); for (const e of CATALOGUE.filter((x) => x.product === P && x.kind !== "tier")) assert.equal(back[e.key], legacy[e.key], `${e.key} ${roles}`); }
      }
    });
    await T("parity: every old permission name answers like aibotsCan for each old role", async () => {
      for (const id of [ids.user, ids.mgr]) { const v = await viewerOf(id); for (const perm of AIBOTS_PERMISSIONS) assert.equal(can(v, perm), aibotsCan(v.ctx, perm), `${perm} for ${v.roles}`); }
      assert.deepEqual(Object.keys(PERMISSION_FEATURE).sort(), [...AIBOTS_PERMISSIONS].sort());
    });
    await T("Director: every micro feature", async () => { const v = await viewerOf(ids.director); for (const m of microOf(P)) assert.ok(can(v, m.key.slice(P.length + 1)), m.key); assert.equal(v.seesAll, true); });
    await T("old user (own scope): chats and calls with agents, sees only own numbers, cannot create, read everyone's chats or change settings", async () => {
      const v = await viewerOf(ids.user);
      assert.ok(can(v, "agents.use") && can(v, "calls.place") && can(v, "agents.view") && can(v, "dashboard.view"));
      for (const f of ["agents.create", "agents.edit", "chats.all", "settings.manage", "activity.view", "calls.manage"]) assert.equal(can(v, f), false, f);
      assert.equal(v.seesAll, false);
    });
    await T("Read only is truly read only: the preset has no write feature, and a person with exactly it can see agents but not chat, create, call or change anything", async () => {
      assert.equal(preset.readLabel, "Read only");
      const v = await viewerOf(ids.readOnly);
      for (const m of microOf(P)) { const short = m.key.slice(P.length + 1); if (m.level === "write") assert.equal(can(v, short), false, `${short} must not be granted by Read only`); }
      assert.ok(can(v, "agents.view") && can(v, "dashboard.view"));
      assert.equal(can(v, "agents.use"), false); assert.equal(can(v, "calls.place"), false);
      assert.equal(can(v, "chats.all"), false, "everyone's chats is a scope feature, never part of the quick Read only");
    });
    await T("partial person: only the granted features", async () => {
      const v = await viewerOf(ids.partial);
      assert.ok(can(v, "agents.use") && can(v, "chats.all") && can(v, "agents.view"));
      for (const f of ["agents.edit", "calls.place", "knowledge.upload", "activity.view"]) assert.equal(can(v, f), false, f);
      assert.equal(can(v, "USE_BOT"), true, "an old permission name is translated"); assert.equal(can(v, "EDIT_BOT"), false); assert.equal(can(v, "nonexistent.x"), false);
    });
    await T("the menu hides what the person cannot use and drops empty sections", async () => {
      const none = buildNavGroups({ dashboard: true, hub: true, use: false, calls: false, createBot: false, manageBots: false, allChats: false, audit: false, settings: false });
      assert.deepEqual(none.manage.items, []); assert.deepEqual(none.agents.items.map((i) => i.key), ["hub"]);
      const all = buildNavGroups({ dashboard: true, hub: true, use: true, calls: true, createBot: true, manageBots: true, allChats: true, audit: true, settings: true });
      assert.deepEqual(all.manage.items.map((i) => i.key), ["bots", "chats", "calls"]);
    });
    await T("removing a feature takes effect on the next request; old-role people open prefilled in micro features", async () => {
      await set(ids.partial, { [k("agents.view")]: "read" });
      const v = await viewerOf(ids.partial); assert.equal(can(v, "agents.use"), false); assert.equal(can(v, "agents.view"), true);
      const { access } = legacyToAccess({ roles: ["aibots_manager"], permissionOverrides: null });
      const picked = splitPicked(access); assert.ok(Object.keys(picked[P] ?? {}).every((x) => x.split(".").length === 3));
      const c = checkAccess(picked); assert.deepEqual(c.widened, []); assert.deepEqual(c.withheld, []);
      for (const m of microOf(P)) assert.equal(Boolean(c.access[P]?.[m.key]), Boolean(access[P]?.[m.key]), m.key);
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
