import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { botsCollection, createBot, getBot, kindOf, listUsableBots, updateBot, type BotInput } from "../src/lib/products/agentos/bots";
import { chatsCollection } from "../src/lib/products/agentos/chats";
import { listHubAgents, listRecentAgents, recordVoiceSession } from "../src/lib/products/agentos/hub";
import { listAgentsForViewer } from "../src/lib/products/agentos/picker";
import { DEFAULT_HUB_FILTERS, filterHubAgents, hubCategories, kindCounts } from "../src/lib/products/agentos/hub-filter";
import { getSettings } from "../src/lib/products/agentos/settings";
import { aibotsCan, AIBOTS_ROLE_PERMISSIONS } from "../src/lib/aibots-roles";
import type { AibotsViewer } from "../src/lib/products/agentos/viewer";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };

const viewer = (userId: string, roles: string[]): AibotsViewer => {
  const ctx = { roles, permissionOverrides: undefined } as AibotsViewer["ctx"];
  return { userId, email: `${userId}@x.test`, roles, ctx, seesAll: false };
};
const editor = viewer("ed", ["aibots_manager"]);
const alice = viewer("alice", ["aibots_user"]);
const bob = viewer("bob", ["aibots_user"]);

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  assert.ok(aibotsCan(editor.ctx, "EDIT_BOT") && !aibotsCan(alice.ctx, "EDIT_BOT") && AIBOTS_ROLE_PERMISSIONS.aibots_user.includes("USE_BOT"));

  await runAsCompany("co_x", async () => {
    const model = (await getSettings()).defaultModel;
    const base = (name: string, extra: Partial<BotInput> = {}): BotInput => ({
      name, icon: "bot", color: "indigo", description: `${name} desc`, category: "Sales", instructions: "Be helpful.", model,
      temperature: null, allowAttachments: true, starterPrompts: [], accessMode: "all", accessRoles: [], accessUserIds: [], status: "active", ...extra,
    });

    // A legacy row: written without kind/voice, as before this feature.
    const col = await botsCollection();
    const now = new Date();
    await col.insertOne({
      _id: "legacy", name: "Legacy", icon: "bot", color: "indigo", description: "", category: "General", instructions: "x", model, temperature: null,
      allowAttachments: false, starterPrompts: [], access: { mode: "all", roles: [], userIds: [] }, status: "active", vectorStoreId: null,
      createdAt: now, updatedAt: now, createdBy: null, updatedBy: null, deletedAt: null,
    } as never);

    await t("legacy rows without a kind read as text", async () => {
      const b = await getBot("legacy");
      assert.equal(b!.kind, "text");
      assert.equal(b!.voice, null);
      assert.equal(kindOf({}), "text");
      assert.equal((await listUsableBots(editor)).find((x) => x._id === "legacy")!.kind, "text");
    });

    // Voice agents are inserted directly: createBot/updateBot would sync with ElevenLabs (covered by the voice module's own tests).
    const voiceDoc = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
      _id: id, kind: "voice", voice: { voiceId: "v1", voiceName: "Voice A", language: "en", firstMessage: "", maxDurationSecs: null, elevenAgentId: null, syncedAt: null, syncError: null, knowledgeDocIds: [] },
      name, icon: "phone", color: "violet", description: `${name} desc`, category: "Support", instructions: "x", model, temperature: null, allowAttachments: false, starterPrompts: [],
      access: { mode: "all", roles: [], userIds: [] }, status: "active", vectorStoreId: null, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null, deletedAt: null, ...extra,
    });
    const mkVoice = async (id: string, name: string, extra: Record<string, unknown> = {}) => { await col.insertOne(voiceDoc(id, name, extra) as never); return (await getBot(id))!; };
    const textBot = await createBot(base("Text One"), "ed");
    const voiceBot = await mkVoice("v-one", "Voice One");
    const secret = await mkVoice("v-secret", "Secret Voice", { access: { mode: "restricted", roles: ["aibots_manager"], userIds: [] } });
    await createBot(base("Sleeping", { status: "inactive" }), "ed");

    await t("create stores kind text by default; voice input is ignored for text agents; voice rows round-trip", async () => {
      assert.equal(textBot.kind, "text");
      assert.equal(textBot.voice, null);
      const asked = await createBot(base("T2", { kind: "text", voice: { voiceId: "v" } }), "ed");
      assert.equal(asked.voice, null);
      assert.equal(voiceBot.kind, "voice");
      assert.equal(voiceBot.voice!.voiceName, "Voice A");
    });

    await t("a text bot never becomes voice on update", async () => {
      await updateBot(textBot._id, base("Text One", { kind: "voice" }), "ed");
      assert.equal((await getBot(textBot._id))!.kind, "text");
    });

    await t("hub: users see usable active agents only; editors see everything incl. inactive", async () => {
      const mine = await listHubAgents(alice);
      const names = mine.map((a) => a.name);
      assert.ok(names.includes("Text One") && names.includes("Voice One") && names.includes("Legacy"));
      assert.ok(!names.includes("Secret Voice") && !names.includes("Sleeping"));
      assert.ok(mine.every((a) => !a.canEdit));
      const all = await listHubAgents(editor);
      assert.ok(all.some((a) => a.name === "Secret Voice") && all.some((a) => a.name === "Sleeping"));
      assert.ok(all.every((a) => a.canEdit));
    });

    await t("hub filtering by kind, search, category and status", async () => {
      const all = await listHubAgents(editor);
      const f = (p: Partial<typeof DEFAULT_HUB_FILTERS>) => filterHubAgents(all, { ...DEFAULT_HUB_FILTERS, ...p }).map((a) => a.name);
      assert.ok(f({ kind: "voice" }).every((n) => ["Voice One", "Secret Voice"].includes(n)));
      assert.ok(f({ kind: "text" }).includes("Legacy") && !f({ kind: "text" }).includes("Voice One"));
      assert.deepEqual(f({ q: "voice one" }), ["Voice One"]);
      assert.ok(f({ category: "Support" }).sort().join() === "Secret Voice,Voice One" && !f({ category: "Support" }).includes("Text One"));
      assert.deepEqual(f({ status: "inactive" }), ["Sleeping"]);
      const c = kindCounts(all);
      assert.equal(c.all, c.text + c.voice);
      assert.ok(hubCategories(all).includes("Support"));
    });

    await t("sidebar lists only chatted agents, newest first, excluding unusable ones", async () => {
      assert.deepEqual((await listRecentAgents(alice)).agents, []);
      const chats = await chatsCollection();
      const mk = (id: string, userId: string, botId: string, at: number) =>
        chats.insertOne({ _id: id, botId, userId, userEmail: "", title: "t", titleLocked: false, conversationId: null, turns: 1, lastMessageAt: new Date(at), createdAt: new Date(at), updatedAt: new Date(at), deletedAt: null });
      await mk("c1", "alice", textBot._id, 1000);
      await mk("c2", "alice", "legacy", 3000);
      await mk("c3", "alice", textBot._id, 2000);
      await mk("c4", "alice", secret._id, 5000); // no access
      await mk("c5", "alice", "__general__", 6000);
      await mk("c6", "bob", voiceBot._id, 7000);
      let r = await listRecentAgents(alice);
      assert.deepEqual(r.agents.map((a) => a._id), ["legacy", textBot._id]);
      assert.equal(r.total, 2);
      await recordVoiceSession(alice, voiceBot._id);
      r = await listRecentAgents(alice);
      assert.equal(r.agents[0]._id, voiceBot._id);
      assert.equal(r.agents[0].kind, "voice");
      assert.equal((await listRecentAgents(alice, 1)).agents.length, 1);
      assert.equal((await listRecentAgents(alice, 1)).total, 3);
      assert.deepEqual((await listRecentAgents(bob)).agents.map((a) => a._id), [voiceBot._id]);
      await col.updateOne({ _id: "legacy" }, { $set: { status: "inactive" } });
      assert.ok(!(await listRecentAgents(alice)).agents.some((a) => a._id === "legacy"));
      await col.updateOne({ _id: "legacy" }, { $set: { deletedAt: new Date() } });
      assert.ok(!(await listRecentAgents(editor)).agents.some((a) => a._id === "legacy"));
    });

    await t("hub lastUsedAt comes from the viewer's own chats", async () => {
      const mine = await listHubAgents(alice);
      assert.ok(mine.find((a) => a._id === textBot._id)!.lastUsedAt);
      assert.equal((await listHubAgents(bob)).find((a) => a._id === textBot._id)!.lastUsedAt, null);
    });

    await t("picker respects access and kind", async () => {
      const ids = async (v: AibotsViewer, kind?: "text" | "voice") => (await listAgentsForViewer(v, { kind })).map((a) => a.name);
      const a = await ids(alice);
      assert.ok(a.includes("Text One") && a.includes("Voice One") && !a.includes("Secret Voice") && !a.includes("Sleeping"));
      assert.ok((await ids(alice, "voice")).every((n) => n !== "Text One"));
      assert.ok((await ids(alice, "text")).includes("Text One") && !(await ids(alice, "text")).includes("Voice One"));
      assert.ok((await ids(editor, "voice")).includes("Secret Voice"));
      const nobody = viewer("zed", []);
      assert.deepEqual(await listAgentsForViewer(nobody), []);
      const granted = await mkVoice("v-granted", "For Alice", { access: { mode: "restricted", roles: [], userIds: ["64b000000000000000000001"] } });
      assert.ok(!(await ids(alice)).includes(granted.name));
      await col.updateOne({ _id: granted._id }, { $set: { "access.roles": ["aibots_user"] } });
      assert.ok((await ids(alice, "voice")).includes(granted.name));
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log("agentos hub: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
