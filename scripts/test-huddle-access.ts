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
import * as NEW from "../src/lib/messenger-access";
import * as OLD from "../src/lib/messenger-roles";
import { canAccessChannel, canPostInChannel } from "../src/lib/products/huddle-ai/channels";
import { resolveScope } from "../src/lib/products/huddle-ai/route-helpers";
import { splitPicked, checkAccess } from "../src/lib/products/commandos/people";
import { buildAccessUi } from "../src/lib/access/ui-model";

// Director vs partial vs old role vs Read only in Huddle. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "huddle-ai";
const k = (s: string) => `${P}.${s}`;
const ROLES = ["chat_admin", "chat_pm", "chat_hr", "chat_employee"] as const;
// [new answer, old answer]
const PAIRS: [string, (h: { subject: never }) => boolean, (u: never) => boolean][] = [
  ["canCreateTeamChannel", NEW.canCreateTeamChannel as never, OLD.canCreateTeamChannel],
  ["canPostAnnouncements", NEW.canPostAnnouncements as never, OLD.canPostAnnouncements],
  ["canViewWorkspaceAnalytics", NEW.canViewWorkspaceAnalytics as never, OLD.canViewWorkspaceAnalytics],
  ["canViewAuditLog", NEW.canViewAuditLog as never, OLD.canViewAuditLog],
  ["isChatAdmin / moderation.all", NEW.canModerateAll as never, OLD.isChatAdmin],
];

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_hd", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const mk = (roles: string[], ov: Record<string, boolean> | null = null) => ({ _id: new ObjectId(), email: roles.join("_") + (ov ? "_ov" : "") + "@x", roles, ...(ov ? { permissionOverrides: ov } : {}) });
    const rows = Object.fromEntries(ROLES.map((r) => [r, mk([r])]));
    const extra = { director: mk(["super_admin"]), partial: mk(["employee"]), readOnly: mk(["employee"]), ovEmployee: mk(["chat_employee"], { "messenger.canPostAnnouncements": true }) };
    await people.insertMany([...Object.values(rows), ...Object.values(extra)] as never);
    const subjectOf = (row: { roles: string[]; permissionOverrides?: Record<string, boolean> }) => subjectFromRow(row as never);
    const ctxOf = (row: { roles: string[]; permissionOverrides?: Record<string, boolean> }) => ({ roles: row.roles, permissionOverrides: row.permissionOverrides ?? null }) as never;
    const set = async (row: { _id: ObjectId }, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(row._id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };
    const fresh = async (row: { _id: ObjectId }) => ({ subject: subjectOf((await people.findOne({ _id: row._id })) as never) });

    await T("parity: old Huddle roles give exactly the micro features their legacy capabilities give; the matrix round-trips with 0 widened and 0 withheld", async () => {
      const cases: [string[], Record<string, boolean> | null][] = [...ROLES.map((r) => [[r], null] as [string[], null]), [["chat_employee"], { "messenger.canPostAnnouncements": true }], [["chat_hr"], { "messenger.canCreateTeamChannel": false }], [["chat_pm"], { "messenger.isChatAdmin": true }], [["chat_admin"], { "messenger.canViewAuditLog": false }]];
      for (const [roles, ov] of cases) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access)); assert.deepEqual(d.widened, [], `widened ${roles} ${JSON.stringify(ov)}`); assert.deepEqual(d.withheld, [], `withheld ${roles} ${JSON.stringify(ov)}`);
      }
    });
    await T("every old capability name answers exactly like the old role file for every old role and override", async () => {
      for (const row of [...Object.values(rows), extra.director, extra.ovEmployee]) for (const [name, nu, old] of PAIRS) assert.equal(nu({ subject: subjectOf(row) as never }), old(ctxOf(row)), `${name} for ${row.email}`);
    });
    await T("everybody given Huddle can use conversations; only chat admins moderate everything, only admin/HR post announcements, staff create channels and see analytics", async () => {
      const s = (r: keyof typeof rows) => ({ subject: subjectOf(rows[r]) });
      for (const r of ROLES) for (const f of ["dm.view", "channels.view", "messages.send", "groups.create", "meetings.manage", "calls.use", "dashboard.view"]) assert.ok(NEW.chatCan(s(r), f), `${r} ${f}`);
      assert.equal(NEW.canModerateAll(s("chat_employee")), false); assert.equal(NEW.canModerateAll(s("chat_admin")), true); assert.equal(NEW.canModerateAll(s("chat_pm")), false);
      assert.equal(NEW.canPostAnnouncements(s("chat_hr")), true); assert.equal(NEW.canPostAnnouncements(s("chat_pm")), false);
      assert.equal(NEW.canCreateTeamChannel(s("chat_pm")), true); assert.equal(NEW.canCreateTeamChannel(s("chat_employee")), false);
      assert.equal(NEW.canViewAuditLog(s("chat_hr")), false); assert.equal(NEW.canViewAuditLog(s("chat_admin")), true);
      assert.equal(NEW.chatCan(s("chat_admin"), "nonexistent.x"), false);
    });
    await T("Director: every micro feature", async () => { const s = { subject: subjectOf(extra.director) }; for (const m of microOf(P)) assert.ok(NEW.chatCan(s, m.key.slice(P.length + 1)), m.key); });
    await T("Read only is truly read only: no write feature in the preset, and a person with exactly it can look but cannot send, create, post or moderate", async () => {
      const pre = buildAccessUi().presets[P]; assert.equal(pre.readLabel, "Read only");
      await set(extra.readOnly, Object.fromEntries(pre.read.map((x) => [x, "read" as const])));
      const h = await fresh(extra.readOnly);
      for (const m of microOf(P)) if (m.level === "write") assert.equal(accessCan(h.subject, P, m.key, "write"), false, `${m.key} must not come with Read only`);
      assert.ok(NEW.chatCan(h, "dm.view") && NEW.chatCan(h, "channels.view"));
      for (const f of ["messages.send", "channels.create", "announcements.post", "moderation.all", "groups.create", "calls.use"]) assert.equal(NEW.chatCan(h, f), false, f);
    });
    await T("partial person gets only what was picked, and loses it on the next request", async () => {
      await set(extra.partial, { [k("channels.view")]: "read", [k("messages.send")]: "write" });
      let h = await fresh(extra.partial);
      assert.ok(NEW.chatCan(h, "channels.view") && NEW.chatCan(h, "messages.send"));
      for (const f of ["dm.view", "announcements.view", "files.view", "channels.create", "meetings.view"]) assert.equal(NEW.chatCan(h, f), false, f);
      await set(extra.partial, { [k("channels.view")]: "read" });
      h = await fresh(extra.partial);
      assert.equal(NEW.chatCan(h, "messages.send"), false);
    });
    await T("old-role people open prefilled in micro features and re-saving changes nothing they can do", async () => {
      for (const row of [rows.chat_admin, rows.chat_hr, rows.chat_pm, rows.chat_employee]) {
        const { access } = legacyToAccess({ roles: row.roles, permissionOverrides: null });
        const picked = splitPicked(access); assert.ok(Object.keys(picked[P] ?? {}).every((x) => x.split(".").length === 3));
        const c = checkAccess(picked); assert.deepEqual(c.widened, []); assert.deepEqual(c.withheld, []);
        for (const m of microOf(P)) assert.equal(Boolean(c.access[P]?.[m.key]), Boolean(access[P]?.[m.key]), `${m.key} for ${row.email}`);
      }
    });
    await T("conversations: membership still decides, moderation.all opens every channel, and a person without messages.send cannot post even in their own channel", async () => {
      const chId = "ch_private", pubId = "ch_public";
      const base = { slug: "x", name: "X", description: "", topic: "", avatarUrl: null, projectId: null, pinnedMessageIds: [], createdBy: "x", updatedBy: "x", createdAt: new Date(), updatedAt: new Date(), archivedAt: null, deletedAt: null, lastActivityAt: new Date(), lastMessagePreview: null };
      await db.collection("chat_channels").insertMany([{ _id: chId, kind: "team", visibility: "private", ...base, slug: "priv" }, { _id: pubId, kind: "team", visibility: "public", ...base, slug: "pub" }] as never);
      const memberId = String(extra.readOnly._id);
      await db.collection("channel_members").insertOne({ _id: new ObjectId(), channelId: chId, userId: memberId, role: "member", lastReadSeq: 0, deletedAt: null } as never);
      const mkUser = (row: { _id: ObjectId; roles: string[] }) => ({ id: String(row._id), subject: subjectOf(row as never) });
      const ch = (await db.collection("chat_channels").findOne({ _id: chId as never })) as never;
      assert.equal(await canAccessChannel(ch, mkUser(rows.chat_employee)), false, "non-member employee cannot open a private channel");
      assert.equal(await canAccessChannel(ch, mkUser(rows.chat_admin)), true, "chat admin (moderation.all) can");
      const ro = { ...mkUser(extra.readOnly), email: "r", roles: ["chat_employee"] } as never;
      const sub = (await fresh(extra.readOnly)).subject;
      const user = { id: memberId, email: "r", roles: ["chat_employee"], permissionOverrides: {}, subject: sub } as never;
      await assert.rejects(resolveScope("channel", chId, user, "send"), /access to send/);
      const got = await resolveScope("channel", chId, user, "read");
      assert.equal(got.canRead, true);
      void ro; void canPostInChannel;
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
