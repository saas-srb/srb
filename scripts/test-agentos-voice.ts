import assert from "node:assert/strict";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { botsCollection, getBot, type BotDoc } from "../src/lib/products/agentos/bots";
import { textChatBlockReason, chatsCollection } from "../src/lib/products/agentos/chats";
import { listRecentAgents } from "../src/lib/products/agentos/hub";
import { AibotsInputError, NotFoundError, type AibotsViewer } from "../src/lib/products/agentos/viewer";
import { AGENT_TTS_MODEL, buildAgentPayload, createAgentClient, ElevenLabsAgentError, mapConversation, mapElevenLabsError, mapTranscript } from "../src/lib/products/agentos/voice/elevenlabs-agent";
import { emptyVoiceConfig, normalizeVoiceInput, VoiceConfigError, withServerFields } from "../src/lib/products/agentos/voice/config";
import { CLEANUP_COLLECTION, drainRemoteCleanup, removeRemoteVoiceAgent, syncVoiceAgent } from "../src/lib/products/agentos/voice/sync";
import { getVoiceCall, reconcileVoiceCalls, finishVoiceCall, listVoiceCalls, startVoiceCall, refreshVoiceCall } from "../src/lib/products/agentos/voice/calls";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*). ElevenLabs is never called: every client gets a mock fetch.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const viewer = (userId: string, roles: string[]): AibotsViewer => ({ userId, email: `${userId}@x.test`, roles, ctx: { roles, permissionOverrides: undefined } as AibotsViewer["ctx"], seesAll: false });
const alice = viewer("alice", ["aibots_user"]);
const bob = viewer("bob", ["aibots_user"]);

type Req = { method: string; path: string; query: URLSearchParams; headers: Record<string, string>; json: unknown; form: FormData | null };
interface Mock { fetch: typeof fetch; reqs: Req[]; fail: (match: (r: Req) => boolean, status: number, body?: unknown) => void; clearFail: () => void; conversations: Map<string, unknown> }

function mockEleven(): Mock {
  const reqs: Req[] = [];
  let nDoc = 0;
  let nAgent = 0;
  let failing: { match: (r: Req) => boolean; status: number; body: unknown } | null = null;
  const conversations = new Map<string, unknown>();
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const body = init.body;
    const r: Req = { method: init.method ?? "GET", path: u.pathname.replace(/^\/v1/, ""), query: u.searchParams, headers: init.headers as Record<string, string>, json: typeof body === "string" ? JSON.parse(body) : null, form: body instanceof FormData ? body : null };
    reqs.push(r);
    const send = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (failing?.match(r)) return send(failing.status, failing.body);
    if (r.method === "POST" && r.path === "/convai/agents/create") return send(200, { agent_id: `agent_${++nAgent}` });
    if (r.method === "PATCH" && r.path.startsWith("/convai/agents/")) return send(200, {});
    if (r.method === "DELETE" && r.path.startsWith("/convai/agents/")) return send(200, {});
    if (r.method === "POST" && r.path === "/convai/knowledge-base/text") return send(200, { id: `doc_${++nDoc}`, name: (r.json as { name: string }).name });
    if (r.method === "DELETE" && r.path.startsWith("/convai/knowledge-base/")) return send(200, {});
    if (r.path === "/convai/conversation/get-signed-url") return send(200, { signed_url: `wss://example.test/${r.query.get("agent_id")}?sig=abc` });
    if (r.path === "/convai/conversations") return send(200, { conversations: [...conversations.values()], has_more: false });
    if (r.path.startsWith("/convai/conversations/")) {
      const c = conversations.get(r.path.split("/").pop()!);
      return c ? send(200, c) : send(404, { detail: { status: "not_found", message: "no" } });
    }
    return send(404, {});
  }) as unknown as typeof fetch;
  return { fetch: f, reqs, conversations, fail: (match, status, body = { detail: { message: "boom" } }) => (failing = { match, status, body }), clearFail: () => (failing = null) };
}

const rawConv = (id: string, agentId: string, status = "done", extra: Record<string, unknown> = {}) => ({
  conversation_id: id, agent_id: agentId, status,
  transcript: [{ role: "agent", message: "Hello!", time_in_call_secs: 0 }, { role: "user", message: "Hi there", time_in_call_secs: 3 }, { role: "agent", message: null, time_in_call_secs: 5 }],
  metadata: { start_time_unix_secs: 1_800_000_000, call_duration_secs: 42 }, ...extra,
});

(async () => {
  // ── Pure ────────────────────────────────────────────────────────────────
  await t("payload builder maps prompt, greeting, language, voice, max duration and knowledge", async () => {
    const p = buildAgentPayload({ name: "Asha", instructions: "Be kind.", firstMessage: "Namaste", language: "hi", voiceId: "v1", maxDurationSecs: 300, knowledge: [{ id: "d1", name: "FAQ" }] });
    assert.equal(p.name, "Asha");
    assert.ok(p.conversation_config.agent.prompt.prompt.startsWith("Be kind."));
    assert.equal(p.conversation_config.agent.first_message, "Namaste");
    assert.equal(p.conversation_config.agent.language, "hi");
    assert.equal(p.conversation_config.tts.voice_id, "v1");
    assert.equal(p.conversation_config.tts.model_id, p.conversation_config.agent.language === "en" ? "eleven_flash_v2" : AGENT_TTS_MODEL);
    assert.equal(p.conversation_config.conversation.max_duration_seconds, 300);
    assert.deepEqual(p.conversation_config.agent.prompt.knowledge_base, [{ type: "text", name: "FAQ", id: "d1", usage_mode: "auto" }]);
    const none = buildAgentPayload({ name: "A", instructions: "x", firstMessage: "", language: "en", voiceId: "v", maxDurationSecs: null, knowledge: [] });
    assert.deepEqual(none.conversation_config.conversation, {});
    assert.deepEqual(none.conversation_config.agent.prompt.knowledge_base, []);
  });

  await t("voice input is validated and server-owned fields cannot be forged from the form", async () => {
    assert.throws(() => normalizeVoiceInput({ language: "en" }), VoiceConfigError);
    assert.throws(() => normalizeVoiceInput({ voiceId: "v", language: "" }), VoiceConfigError);
    assert.throws(() => normalizeVoiceInput({ voiceId: "v", language: "en", maxDurationSecs: 5 }), VoiceConfigError);
    const forged = normalizeVoiceInput({ voiceId: "v", voiceName: "Rachel", language: "en", firstMessage: " Hi ", maxDurationSecs: "120", elevenAgentId: "attacker", knowledgeDocIds: ["x"], syncedAt: new Date() });
    assert.equal(forged.elevenAgentId, null);
    assert.deepEqual(forged.knowledgeDocIds, []);
    assert.equal(forged.firstMessage, "Hi");
    assert.equal(forged.maxDurationSecs, 120);
    const stored = { ...emptyVoiceConfig(), elevenAgentId: "agent_9", knowledgeDocIds: ["d"], syncedAt: new Date(5), syncError: "old" };
    const merged = withServerFields(forged, stored);
    assert.equal(merged.elevenAgentId, "agent_9");
    assert.deepEqual(merged.knowledgeDocIds, ["d"]);
    assert.equal(merged.voiceId, "v");
  });

  await t("transcript mapping drops empty turns and keeps roles and times; conversation mapping reads metadata", async () => {
    const tr = mapTranscript(rawConv("c", "a").transcript);
    assert.deepEqual(tr, [{ role: "agent", text: "Hello!", atSecs: 0 }, { role: "user", text: "Hi there", atSecs: 3 }]);
    assert.deepEqual(mapTranscript(undefined), []);
    const c = mapConversation(rawConv("c1", "agent_1") as never);
    assert.equal(c.durationSecs, 42);
    assert.equal(c.startedAt, new Date(1_800_000_000_000).toISOString());
    assert.equal(c.settled, true);
    assert.equal(mapConversation(rawConv("c", "a", "processing") as never).settled, false);
  });

  await t("errors map to plain messages and never echo a key", async () => {
    assert.equal(mapElevenLabsError(401, { detail: { status: "invalid_api_key", message: "bad" } }).code, "auth");
    assert.match(mapElevenLabsError(401, { detail: { status: "missing_permissions", message: "convai_write" } }).message, /permission/);
    assert.match(mapElevenLabsError(422, { detail: [{ loc: ["body", "conversation_config", "agent", "language"], msg: "unsupported" }] }).message, /language: unsupported/);
    assert.equal(mapElevenLabsError(429, null).code, "rate_limit");
    assert.equal(mapElevenLabsError(503, null).code, "unavailable");
    assert.ok(!mapElevenLabsError(400, { detail: "key sk_abcdef123 failed" }).message.includes("sk_abcdef123"));
    const net = createAgentClient({ apiKey: "k", fetch: (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch });
    await assert.rejects(net.getSignedUrl("a"), (e: Error) => e instanceof ElevenLabsAgentError && (e as ElevenLabsAgentError).code === "network");
  });

  await t("client sends the key header and the documented endpoints", async () => {
    const m = mockEleven();
    const c = createAgentClient({ apiKey: "secret-key", fetch: m.fetch });
    const { agentId } = await c.createAgent(buildAgentPayload({ name: "n", instructions: "i", firstMessage: "", language: "en", voiceId: "v", maxDurationSecs: null, knowledge: [] }));
    await c.updateAgent(agentId, { } as never);
    const doc = await c.createKnowledgeText("FAQ", "text");
    await c.deleteKnowledgeDoc(doc.id);
    assert.equal(await c.getSignedUrl(agentId), "wss://example.test/agent_1?sig=abc");
    await c.deleteAgent(agentId);
    assert.deepEqual(m.reqs.map((r) => `${r.method} ${r.path}`), [
      "POST /convai/agents/create", "PATCH /convai/agents/agent_1", "POST /convai/knowledge-base/text", "DELETE /convai/knowledge-base/doc_1", "GET /convai/conversation/get-signed-url", "DELETE /convai/agents/agent_1",
    ]);
    assert.ok(m.reqs.every((r) => r.headers["xi-api-key"] === "secret-key"));
    assert.equal(m.reqs[3].query.get("force"), "true");
    assert.equal(m.reqs[4].query.get("agent_id"), "agent_1");
  });

  // ── Database-backed ───────────────────────────────────────────────────────
  await runAsCompany("co_x", async () => {
    assert.ok((await getDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
    await (await getPlatformDb()).dropDatabase();

    const col = await botsCollection();
    const now = new Date();
    const mkBot = async (id: string, extra: Partial<BotDoc> = {}) => {
      const bot = {
        _id: id, name: id, icon: "bot", color: "indigo", description: "", category: "General", instructions: "Answer calls politely.", model: "m", temperature: null, allowAttachments: false, starterPrompts: [],
        access: { mode: "all", roles: [], userIds: [] }, status: "active", vectorStoreId: null, kind: "voice",
        voice: { ...emptyVoiceConfig(), voiceId: "v1", voiceName: "Rachel", language: "en", firstMessage: "Hello", maxDurationSecs: 300 },
        createdAt: now, updatedAt: now, createdBy: null, updatedBy: null, deletedAt: null, ...extra,
      } as unknown as BotDoc;
      await col.insertOne(bot as never);
      return bot;
    };
    const knowledge = (docs: { name: string; text: string }[], skipped: string[] = []) => async () => ({ docs, skipped });

    await mkBot("ava");
    const m = mockEleven();
    const deps = (docs = [{ name: "FAQ", text: "Open 9-5" }]) => ({ client: async () => createAgentClient({ apiKey: "k", fetch: m.fetch }), knowledge: knowledge(docs) });

    await t("first sync creates the agent with its knowledge and records ids", async () => {
      const r = await syncVoiceAgent("ava", deps());
      assert.ok(r.ok);
      const v = (await getBot("ava"))!.voice!;
      assert.equal(v.elevenAgentId, "agent_1");
      assert.deepEqual(v.knowledgeDocIds, ["doc_1"]);
      assert.equal(v.syncError, null);
      assert.ok(v.syncedAt instanceof Date);
      const create = m.reqs.find((x) => x.path === "/convai/agents/create")!;
      assert.equal((create.json as ReturnType<typeof buildAgentPayload>).conversation_config.agent.prompt.knowledge_base[0].id, "doc_1");
    });

    await t("a second sync updates the same agent and replaces knowledge documents (old ones deleted after)", async () => {
      m.reqs.length = 0;
      const r = await syncVoiceAgent("ava", deps([{ name: "FAQ v2", text: "Open 10-6" }]));
      assert.ok(r.ok);
      assert.deepEqual(m.reqs.map((x) => `${x.method} ${x.path}`), ["POST /convai/knowledge-base/text", "PATCH /convai/agents/agent_1", "DELETE /convai/knowledge-base/doc_1"]);
      assert.deepEqual((await getBot("ava"))!.voice!.knowledgeDocIds, ["doc_2"]);
    });

    await t("a failed sync keeps the saved config, records syncError, cleans new docs; retry then succeeds", async () => {
      await col.updateOne({ _id: "ava" }, { $set: { instructions: "New instructions", "voice.firstMessage": "Hi again" } });
      m.reqs.length = 0;
      m.fail((r) => r.method === "PATCH", 422, { detail: [{ loc: ["body", "x"], msg: "bad language" }] });
      const r = await syncVoiceAgent("ava", deps());
      assert.equal(r.ok, false);
      const bot = (await getBot("ava"))!;
      assert.equal(bot.instructions, "New instructions");
      assert.equal(bot.voice!.firstMessage, "Hi again");
      assert.match(bot.voice!.syncError!, /bad language/);
      assert.equal(bot.voice!.elevenAgentId, "agent_1");
      assert.deepEqual(bot.voice!.knowledgeDocIds, ["doc_2"]); // old docs untouched
      assert.ok(m.reqs.some((x) => x.method === "DELETE" && x.path === "/convai/knowledge-base/doc_3")); // the new doc was discarded
      m.clearFail();
      const again = await syncVoiceAgent("ava", deps());
      assert.ok(again.ok);
      const after = (await getBot("ava"))!.voice!;
      assert.equal(after.syncError, null);
      const patch = [...m.reqs].reverse().find((x) => x.method === "PATCH")!;
      assert.equal((patch.json as ReturnType<typeof buildAgentPayload>).conversation_config.agent.first_message, "Hi again");
    });

    await t("no ElevenLabs key: config kept, a clear syncError, nothing sent", async () => {
      await mkBot("nokey");
      const r = await syncVoiceAgent("nokey", { client: async () => null, knowledge: knowledge([]) });
      assert.equal(r.ok, false);
      const v = (await getBot("nokey"))!.voice!;
      assert.match(v.syncError!, /Settings → Integrations/);
      assert.equal(v.voiceId, "v1");
    });

    await t("an agent deleted on ElevenLabs is recreated; skipped knowledge files are reported", async () => {
      m.fail((r) => r.method === "PATCH", 404, { detail: { status: "not_found", message: "gone" } });
      const r = await syncVoiceAgent("ava", { client: deps().client, knowledge: knowledge([], ["Pricing.pdf"]) });
      m.clearFail();
      assert.ok(r.ok);
      const v = (await getBot("ava"))!.voice!;
      assert.notEqual(v.elevenAgentId, "agent_1");
      assert.match(v.syncError!, /Pricing\.pdf/);
    });

    await t("archiving / deleting removes the remote agent and its documents best-effort; a failure never throws and keeps the ids", async () => {
      await col.updateOne({ _id: "ava" }, { $set: { "voice.knowledgeDocIds": ["doc_x"] } });
      const idBefore = (await getBot("ava"))!.voice!.elevenAgentId!;
      m.reqs.length = 0;
      m.fail((r) => r.method === "DELETE" && r.path.startsWith("/convai/agents/"), 500);
      await removeRemoteVoiceAgent("ava", deps());
      assert.equal((await getBot("ava"))!.voice!.elevenAgentId, idBefore);
      m.clearFail();
      await removeRemoteVoiceAgent("ava", deps());
      const v = (await getBot("ava"))!.voice!;
      assert.equal(v.elevenAgentId, null);
      assert.deepEqual(v.knowledgeDocIds, []);
      assert.ok(m.reqs.some((x) => x.method === "DELETE" && x.path === "/convai/knowledge-base/doc_x"));
    });

    await t("text agents are never synced", async () => {
      await mkBot("texty", { kind: "text", voice: null });
      const r = await syncVoiceAgent("texty", deps());
      assert.equal(r.ok, false);
    });

    // ── Calls ───────────────────────────────────────────────────────────────
    await syncVoiceAgent("ava", deps()); // live agent again
    const agentId = (await getBot("ava"))!.voice!.elevenAgentId!;
    await mkBot("secret", { access: { mode: "restricted", roles: ["aibots_manager"], userIds: [] }, voice: { ...emptyVoiceConfig(), voiceId: "v", language: "en", elevenAgentId: "agent_secret" } });
    await mkBot("unsynced");
    const calls = { client: async () => createAgentClient({ apiKey: "k", fetch: m.fetch }), gate: async () => null as string | null };

    await t("signed URL: a user without access is refused and no URL is minted", async () => {
      m.reqs.length = 0;
      await assert.rejects(startVoiceCall(alice, "secret", calls), NotFoundError);
      await assert.rejects(startVoiceCall(alice, "texty", calls), NotFoundError);
      await assert.rejects(startVoiceCall(alice, "missing", calls), NotFoundError);
      assert.equal(m.reqs.filter((r) => r.path.includes("signed-url")).length, 0);
      assert.equal((await chatsCollection().then((c) => c.countDocuments({ botId: "secret" }))), 0);
    });

    await t("signed URL: refused when the agent isn't synced, when the plan gate blocks, and when ElevenLabs is missing", async () => {
      await assert.rejects(startVoiceCall(alice, "unsynced", calls), (e: Error) => e instanceof AibotsInputError && /hasn't been set up/.test(e.message));
      await assert.rejects(startVoiceCall(alice, "ava", { ...calls, gate: async () => "Voice minutes used up" }), /used up/);
      await assert.rejects(startVoiceCall(alice, "ava", { ...calls, client: async () => null }), /Settings → Integrations/);
    });

    let chatId = "";
    await t("an allowed user gets a signed URL and a call row that puts the agent in 'agents I talked to'", async () => {
      const s = await startVoiceCall(alice, "ava", calls);
      chatId = s.chatId;
      assert.equal(s.signedUrl, `wss://example.test/${agentId}?sig=abc`);
      const row = await (await chatsCollection()).findOne({ _id: chatId });
      assert.equal(row!.userId, "alice");
      assert.equal(row!.botId, "ava");
      assert.equal(row!.voiceCall!.status, "started");
      assert.deepEqual((await listRecentAgents(alice)).agents.map((a) => a._id), ["ava"]);
      assert.equal((await listRecentAgents(bob)).agents.length, 0);
    });

    const meter: number[] = [];
    const finishDeps = { ...calls, meter: async (s: number) => void meter.push(s) };

    await t("finish pulls the transcript from ElevenLabs, stores it and meters the seconds exactly once", async () => {
      m.conversations.set("conv_1", rawConv("conv_1", agentId));
      const v = await finishVoiceCall(alice, chatId, "conv_1", finishDeps);
      assert.equal(v.status, "done");
      assert.equal(v.durationSecs, 42);
      assert.deepEqual(v.transcript!.map((l) => l.text), ["Hello!", "Hi there"]);
      await finishVoiceCall(alice, chatId, "conv_1", finishDeps);
      await refreshVoiceCall(alice, chatId, finishDeps);
      assert.deepEqual(meter, [42]);
      const list = await listVoiceCalls(alice, "ava");
      assert.equal(list.length, 1);
      assert.equal(list[0].transcript, null); // lazily loaded
      assert.equal(list[0].hasTranscript, true);
    });

    await t("a call ElevenLabs is still processing is stored without metering, then settles on refresh", async () => {
      const s = await startVoiceCall(alice, "ava", calls);
      m.conversations.set("conv_2", rawConv("conv_2", agentId, "processing"));
      const first = await finishVoiceCall(alice, s.chatId, "conv_2", finishDeps);
      assert.equal(first.status, "processing");
      assert.deepEqual(meter, [42]);
      m.conversations.set("conv_2", rawConv("conv_2", agentId, "done", { metadata: { start_time_unix_secs: 1, call_duration_secs: 7 } }));
      const second = await refreshVoiceCall(alice, s.chatId, finishDeps);
      assert.equal(second.status, "done");
      assert.deepEqual(meter, [42, 7]);
    });

    await t("finish refuses another user's call, a foreign agent's conversation, and a conversation already claimed", async () => {
      await assert.rejects(finishVoiceCall(bob, chatId, "conv_1", finishDeps), NotFoundError);
      const s = await startVoiceCall(alice, "ava", calls);
      m.conversations.set("conv_other", rawConv("conv_other", "agent_not_ours"));
      await assert.rejects(finishVoiceCall(alice, s.chatId, "conv_other", finishDeps), /different agent/);
      await assert.rejects(finishVoiceCall(alice, s.chatId, "conv_1", finishDeps), /another call/);
      await assert.rejects(finishVoiceCall(alice, s.chatId, "../etc", finishDeps), AibotsInputError);
      await assert.rejects(finishVoiceCall(alice, s.chatId, "conv_missing", finishDeps), /couldn't find/);
      assert.deepEqual(meter, [42, 7]);
    });

    await t("a conversation that does not name the agent is refused (fail closed)", async () => {
      const s = await startVoiceCall(alice, "ava", calls);
      const raw = rawConv("conv_noagent", agentId) as Record<string, unknown>;
      delete raw.agent_id;
      m.conversations.set("conv_noagent", raw);
      await assert.rejects(finishVoiceCall(alice, s.chatId, "conv_noagent", finishDeps), /different agent/);
      assert.equal((await (await chatsCollection()).findOne({ _id: s.chatId }))!.voiceCall!.conversationId, null);
    });

    await t("linking is atomic: of two users racing for one conversation exactly one wins, and the loser is not linked or metered", async () => {
      const a = await startVoiceCall(alice, "ava", calls);
      const b = await startVoiceCall(bob, "ava", calls);
      m.conversations.set("conv_race", rawConv("conv_race", agentId));
      const before = meter.length;
      const results = await Promise.allSettled([finishVoiceCall(alice, a.chatId, "conv_race", finishDeps), finishVoiceCall(bob, b.chatId, "conv_race", finishDeps)]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(meter.length - before, 1);
      const rows = await (await chatsCollection()).find({ "voiceCall.conversationId": "conv_race" }).toArray();
      assert.equal(rows.length, 1);
    });

    await t("a conversation that started before the call was set up cannot be claimed by it", async () => {
      const s = await startVoiceCall(alice, "ava", calls);
      m.conversations.set("conv_old", rawConv("conv_old", agentId, "done", { metadata: { start_time_unix_secs: 1000, call_duration_secs: 5 } }));
      await assert.rejects(finishVoiceCall(alice, s.chatId, "conv_old", finishDeps), /started before/);
    });

    await t("a failed meter leaves the call unmetered and the next finish retries it; success is counted once", async () => {
      const s = await startVoiceCall(alice, "ava", calls);
      m.conversations.set("conv_m", rawConv("conv_m", agentId, "done", { metadata: { start_time_unix_secs: 1_800_000_000, call_duration_secs: 11 } }));
      let attempts = 0;
      const counted: number[] = [];
      const flaky = { ...calls, meter: async (secs: number) => { if (++attempts === 1) throw new Error("usage store down"); counted.push(secs); } };
      await finishVoiceCall(alice, s.chatId, "conv_m", flaky);
      let row = (await (await chatsCollection()).findOne({ _id: s.chatId }))!;
      assert.equal(row.voiceCall!.meteredAt, null);
      assert.deepEqual(counted, []);
      await finishVoiceCall(alice, s.chatId, "conv_m", flaky);
      await finishVoiceCall(alice, s.chatId, "conv_m", flaky);
      row = (await (await chatsCollection()).findOne({ _id: s.chatId }))!;
      assert.ok(row.voiceCall!.meteredAt);
      assert.deepEqual(counted, [11]);
    });

    await t("reconciliation finalises a call the browser never finished: transcript stored, metered once; ambiguous matches are left alone", async () => {
      const chats = await chatsCollection();
      const s = await startVoiceCall(alice, "ava", calls);
      const created = new Date(Date.now() - 60 * 60 * 1000);
      await chats.updateOne({ _id: s.chatId }, { $set: { createdAt: created } });
      const startSecs = Math.floor(created.getTime() / 1000) + 20;
      m.conversations.set("conv_lost", rawConv("conv_lost", agentId, "done", { metadata: { start_time_unix_secs: startSecs, call_duration_secs: 33 } }));
      const counted: number[] = [];
      const rd = { ...calls, meter: async (secs: number) => void counted.push(secs) };
      assert.equal(await reconcileVoiceCalls(alice, "ava", rd), 1);
      const row = (await chats.findOne({ _id: s.chatId }))!;
      assert.equal(row.voiceCall!.conversationId, "conv_lost");
      assert.equal(row.voiceCall!.status, "done");
      assert.equal(row.voiceCall!.transcript!.length, 2);
      assert.deepEqual(counted, [33]);
      await reconcileVoiceCalls(alice, "ava", rd);
      assert.deepEqual(counted, [33]);
      // two waiting calls in the same window: nothing is guessed
      const s1 = await startVoiceCall(alice, "ava", calls);
      const s2 = await startVoiceCall(bob, "ava", calls);
      await chats.updateMany({ _id: { $in: [s1.chatId, s2.chatId] } }, { $set: { createdAt: created } });
      m.conversations.set("conv_amb", rawConv("conv_amb", agentId, "done", { metadata: { start_time_unix_secs: startSecs, call_duration_secs: 9 } }));
      await reconcileVoiceCalls(alice, "ava", rd);
      assert.equal((await chats.findOne({ _id: s1.chatId }))!.voiceCall!.conversationId, null);
      assert.deepEqual(counted, [33]);
      await chats.deleteMany({ _id: { $in: [s1.chatId, s2.chatId] } });
    });

    await t("a manager reading someone else's voice call leaves an audit entry; the owner reading their own does not", async () => {
      const manager = viewer("mia", ["aibots_manager"]);
      const audit = (await getDb()).collection("aibots_activity_logs");
      const before = await audit.countDocuments({ entityId: chatId });
      await getVoiceCall(alice, chatId);
      assert.equal(await audit.countDocuments({ entityId: chatId }), before);
      await getVoiceCall(manager, chatId);
      const rows = await audit.find({ entityId: chatId, actorId: "mia" }).toArray();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].action, "view");
    });

    await t("text chat is refused for voice agents and for a voice call's row", async () => {
      assert.match(textChatBlockReason({ kind: "voice" }, null)!, /voice agent/);
      assert.match(textChatBlockReason({ kind: "text" }, { voiceCall: { conversationId: null } })!, /voice call/);
      assert.equal(textChatBlockReason({ kind: "text" }, { }), null);
      assert.equal(textChatBlockReason({ kind: null }, null), null);
    });

    await t("remote ids that cannot be deleted right now are queued and removed later; an archive during a sync deletes the just-created agent", async () => {
      await mkBot("orphan", { voice: { ...emptyVoiceConfig(), voiceId: "v", language: "en", elevenAgentId: "agent_orphan", knowledgeDocIds: ["doc_orphan"] } });
      await removeRemoteVoiceAgent("orphan", { client: async () => null });
      const queue = (await getDb()).collection(CLEANUP_COLLECTION);
      assert.deepEqual((await queue.find({}).toArray()).map((r) => r._id).sort(), ["agent_orphan", "doc_orphan"]);
      m.reqs.length = 0;
      assert.equal(await drainRemoteCleanup(createAgentClient({ apiKey: "k", fetch: m.fetch })), 0);
      assert.ok(m.reqs.some((r) => r.method === "DELETE" && r.path === "/convai/agents/agent_orphan"));
      assert.equal(await queue.countDocuments({}), 0);

      await mkBot("racer");
      m.reqs.length = 0;
      const archiveDuringSync = async () => {
        await col.updateOne({ _id: "racer" }, { $set: { status: "inactive" } });
        return { docs: [{ name: "FAQ", text: "x" }], skipped: [] };
      };
      const r = await syncVoiceAgent("racer", { client: deps().client, knowledge: archiveDuringSync });
      assert.ok(r.ok);
      const created = m.reqs.find((x) => x.method === "POST" && x.path === "/convai/agents/create");
      assert.ok(created);
      assert.ok(m.reqs.some((x) => x.method === "DELETE" && x.path.startsWith("/convai/agents/")));
      assert.ok(m.reqs.some((x) => x.method === "DELETE" && x.path.startsWith("/convai/knowledge-base/")));
      assert.equal((await col.findOne({ _id: "racer" }))!.voice!.elevenAgentId, null);
    });
  });

  console.log("agentos voice: all passed");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
