import assert from "node:assert/strict";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { botsCollection, type BotDoc } from "../src/lib/products/agentos/bots";
import { chatsCollection, type ChatDoc } from "../src/lib/products/agentos/chats";
import { AibotsInputError, NotFoundError, type AibotsViewer } from "../src/lib/products/agentos/viewer";
import { createAgentClient, mapAnalysis, mapConversation } from "../src/lib/products/agentos/voice/elevenlabs-agent";
import { finishVoiceCall, getVoiceCall } from "../src/lib/products/agentos/voice/calls";
import { clearCallAudioCache, getCallAudio, listCalls } from "../src/lib/products/agentos/voice/call-history";
import {
  activeLineIndex, buildCallQuery, callState, formatClock, istRange, pageCount, parseCallFilters, parseRange, searchTranscript, splitMatches, transcriptToText,
} from "../src/lib/products/agentos/voice/call-format";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*). ElevenLabs is never called: the client gets a mock fetch.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const viewer = (userId: string, roles: string[]): AibotsViewer => ({ userId, email: `${userId}@x.test`, roles, ctx: { roles, permissionOverrides: undefined } as AibotsViewer["ctx"], seesAll: false });
const alice = viewer("alice", ["aibots_user"]);
const bob = viewer("bob", ["aibots_user"]);
const boss = viewer("boss", ["aibots_manager"]); // has VIEW_CHATS

const AUDIO = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 251));
let audioFetches = 0;
let audioStatus = 200;
const mock = (async (url: string) => {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/v1/, "");
  const json = (s: number, d: unknown) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
  if (path.endsWith("/audio")) {
    audioFetches++;
    if (audioStatus !== 200) return json(audioStatus, { detail: { message: "gone" } });
    return new Response(AUDIO, { status: 200, headers: { "content-type": "audio/mpeg" } });
  }
  if (path === "/convai/conversations/conv_1") {
    return json(200, {
      conversation_id: "conv_1", agent_id: "agent_1", status: "done", has_audio: true,
      transcript: [{ role: "agent", message: "Hello!", time_in_call_secs: 0 }, { role: "user", message: "Book me a table", time_in_call_secs: 4 }],
      metadata: { start_time_unix_secs: Math.floor(Date.now() / 1000), call_duration_secs: 61, termination_reason: "end_call tool" },
      analysis: { call_successful: "success", transcript_summary: "Caller booked a table.", call_summary_title: "Table booking", data_collection_results: { party: { value: 4 }, empty: { value: "" } } },
    });
  }
  return json(404, {});
}) as unknown as typeof fetch;
const client = async () => createAgentClient({ apiKey: "sk_secret_key", fetch: mock });

(async () => {
  // ── Pure ────────────────────────────────────────────────────────────────
  await t("parseRange: absolute, open-ended, suffix, clamped, unsatisfiable, ignored", async () => {
    assert.deepEqual(parseRange("bytes=0-99", 1000), { start: 0, end: 99 });
    assert.deepEqual(parseRange("bytes=500-", 1000), { start: 500, end: 999 });
    assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
    assert.deepEqual(parseRange("bytes=-5000", 1000), { start: 0, end: 999 });
    assert.deepEqual(parseRange("bytes=900-5000", 1000), { start: 900, end: 999 });
    assert.equal(parseRange("bytes=1000-", 1000), "unsatisfiable");
    assert.equal(parseRange("bytes=-0", 1000), "unsatisfiable");
    assert.equal(parseRange("bytes=0-1", 0), "unsatisfiable");
    assert.equal(parseRange(null, 1000), null);
    assert.equal(parseRange("items=0-5", 1000), null);
    assert.equal(parseRange("bytes=0-1,5-9", 1000), null);
    assert.equal(parseRange("bytes=50-10", 1000), null);
    assert.equal(parseRange("bytes=-", 1000), null);
  });

  await t("callState, clock, pagination and filters", async () => {
    assert.equal(callState({ connected: false, status: "failed" }), "not_connected");
    assert.equal(callState({ connected: true, status: "done" }), "connected");
    assert.equal(callState({ connected: true, status: "processing" }), "processing");
    assert.equal(callState({ connected: true, status: "started" }), "processing");
    assert.equal(callState({ connected: true, status: "failed" }), "failed");
    assert.equal(formatClock(61), "1:01");
    assert.equal(formatClock(3725), "1:02:05");
    assert.equal(formatClock(null), "0:00");
    assert.equal(pageCount(0), 1);
    assert.equal(pageCount(41), 3);
    const f = parseCallFilters({ bot: "b1", status: "bogus", from: "2026-02-30x", to: "2026-03-05", scope: "mine", page: "-3", q: "  hi  " });
    assert.deepEqual({ ...f }, { bot: "b1", status: "", q: "hi", from: "", to: "2026-03-05", scope: "mine", page: 1 });
    assert.equal(parseCallFilters({ page: "7" }).page, 7);
    assert.equal(parseCallFilters({ status: ["connected", "failed"] }).status, "connected");
    const r = istRange("2026-03-01", "2026-03-01");
    assert.equal(r.gte!.toISOString(), "2026-02-28T18:30:00.000Z");
    assert.equal(r.lt!.getTime() - r.gte!.getTime(), 86_400_000);
    const and = (buildCallQuery(parseCallFilters({ q: "a.b(" }), "u1") as { $and: { $or?: { userEmail?: RegExp }[] }[] }).$and;
    const rx = and.find((c) => c.$or)!.$or![0].userEmail!;
    assert.ok(rx.test("a.b(") && !rx.test("axb("), "regex special characters are escaped");
  });

  const lines = [
    { role: "agent" as const, text: "Hello and welcome", atSecs: 0 },
    { role: "user" as const, text: "I want to BOOK a table", atSecs: 4 },
    { role: "agent" as const, text: "Sure, booking now", atSecs: 9 },
  ];
  await t("transcript search, highlight split, active line and text export", async () => {
    assert.deepEqual(searchTranscript(lines, "book"), [1, 2]);
    assert.deepEqual(searchTranscript(lines, "  "), []);
    assert.deepEqual(splitMatches("a Book b", "book"), [{ text: "a ", match: false }, { text: "Book", match: true }, { text: " b", match: false }]);
    assert.deepEqual(splitMatches("abc", ""), [{ text: "abc", match: false }]);
    assert.equal(activeLineIndex(lines, -1), -1);
    assert.equal(activeLineIndex(lines, 5), 1);
    assert.equal(activeLineIndex(lines, 99), 2);
    const txt = transcriptToText(lines, { agentName: "Ava", callerName: "You", startedAt: "2026-03-01T04:00:00.000Z", durationSecs: 61 });
    assert.ok(txt.startsWith("Call with Ava\nCaller: You\nStarted: "));
    assert.ok(txt.includes("Duration: 1:01"));
    assert.ok(txt.includes("[0:04] You: I want to BOOK a table"));
    assert.ok(txt.includes("[0:09] Ava: Sure, booking now"));
  });

  await t("analysis mapping keeps summary, success and non-empty data only", async () => {
    const a = mapAnalysis({ call_successful: "success", transcript_summary: " Hi ", call_summary_title: "T", data_collection_results: { party: { value: 4 }, e: { value: "" }, n: null } });
    assert.deepEqual(a, { summary: "Hi", title: "T", callSuccess: "success", data: [{ key: "party", value: "4" }] });
    assert.equal(mapAnalysis(null), null);
    assert.equal(mapAnalysis({ call_successful: "weird" }), null);
    assert.equal(mapConversation({ conversation_id: "c", status: "done", has_audio: false }).hasAudio, false);
  });

  // ── Database ────────────────────────────────────────────────────────────
  await runAsCompany("co_x", async () => {
    assert.ok((await getDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
    await (await getPlatformDb()).dropDatabase();
    const now = new Date();
    await (await botsCollection()).insertOne({ _id: "ava", name: "Ava", icon: "bot", color: "indigo", description: "", category: "General", instructions: "x", model: "m", temperature: null, allowAttachments: false, starterPrompts: [], access: { mode: "all", roles: [], userIds: [] }, status: "active", vectorStoreId: null, kind: "voice", voice: { voiceId: "v", voiceName: "V", language: "en", firstMessage: "Hi", maxDurationSecs: null, elevenAgentId: "agent_1", syncedAt: null, syncError: null, knowledgeDocIds: [] }, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null, deletedAt: null } as unknown as BotDoc);
    const col = await chatsCollection();
    const at = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000);
    const mk = async (id: string, userId: string, minsAgo: number, voiceCall: ChatDoc["voiceCall"] | undefined, extra: Partial<ChatDoc> = {}) => {
      await col.insertOne({ _id: id, botId: "ava", userId, userEmail: `${userId}@x.test`, title: "Voice call", titleLocked: false, conversationId: null, turns: 0, lastMessageAt: at(minsAgo), createdAt: at(minsAgo), updatedAt: at(minsAgo), deletedAt: null, ...(voiceCall ? { voiceCall } : {}), ...extra } as ChatDoc);
    };
    const done = (conv: string, extra: Partial<NonNullable<ChatDoc["voiceCall"]>> = {}): NonNullable<ChatDoc["voiceCall"]> => ({ conversationId: conv, status: "done", durationSecs: 61, transcript: [{ role: "agent", text: "Hello", atSecs: 0 }], meteredAt: now, hasAudio: true, summary: "Booked a table", ...extra });
    await mk("c_alice1", "alice", 10, done("conv_a1"));
    await mk("c_alice2", "alice", 3000, { conversationId: null, status: "started", durationSecs: null, transcript: null, meteredAt: null });
    await mk("c_bob1", "bob", 20, done("conv_b", { summary: "Refund asked", callSuccess: "failure" }));
    await mk("c_bob_proc", "bob", 5, done("conv_p", { status: "processing", transcript: null, hasAudio: null }));
    await mk("c_text", "alice", 1, undefined, { conversationId: "openai_conv" });
    await mk("c_gone", "bob", 40, done("conv_g"), { deletedAt: new Date() });

    const ids = (l: { items: { chatId: string }[] }) => l.items.map((i) => i.chatId);
    const F = (o: Record<string, string> = {}) => parseCallFilters(o);

    await t("list scoping: a normal user sees only their own calls; text chats and deleted calls never appear", async () => {
      const a = await listCalls(alice, F());
      assert.deepEqual(ids(a), ["c_alice1", "c_alice2"]);
      assert.equal(a.oversight, false);
      assert.equal(a.total, 2);
      assert.deepEqual(ids(await listCalls(bob, F())), ["c_bob_proc", "c_bob1"]);
      // asking for "everyone" or another agent's data does not widen a normal user's scope
      assert.deepEqual(ids(await listCalls(alice, F({ scope: "all", q: "bob@x.test" }))), []);
    });

    await t("oversight sees everyone's calls, can narrow to their own, and rows carry state, badges and the agent", async () => {
      const all = await listCalls(boss, F());
      assert.equal(all.oversight, true);
      assert.deepEqual(ids(all), ["c_bob_proc", "c_alice1", "c_bob1", "c_alice2"]);
      assert.deepEqual(ids(await listCalls(boss, F({ scope: "mine" }))), []);
      const byId = new Map(all.items.map((i) => [i.chatId, i]));
      assert.equal(byId.get("c_alice1")!.state, "connected");
      assert.equal(byId.get("c_alice1")!.hasAudio, true);
      assert.equal(byId.get("c_alice1")!.hasTranscript, true);
      assert.equal(byId.get("c_alice1")!.bot!.name, "Ava");
      assert.equal(byId.get("c_alice1")!.summary, "Booked a table");
      assert.equal(byId.get("c_alice2")!.state, "not_connected");
      assert.equal(byId.get("c_alice2")!.hasAudio, false);
      assert.equal(byId.get("c_bob_proc")!.state, "processing");
      assert.equal(byId.get("c_bob_proc")!.hasTranscript, false);
      assert.deepEqual(all.agents, [{ value: "ava", label: "Ava" }]);
    });

    await t("filters: status, agent, date range (IST), search, pagination", async () => {
      assert.deepEqual(ids(await listCalls(boss, F({ status: "connected" }))), ["c_alice1", "c_bob1"]);
      assert.deepEqual(ids(await listCalls(boss, F({ status: "not_connected" }))), ["c_alice2"]);
      assert.deepEqual(ids(await listCalls(boss, F({ status: "processing" }))), ["c_bob_proc"]);
      assert.deepEqual(ids(await listCalls(boss, F({ bot: "nobody" }))), []);
      assert.deepEqual(ids(await listCalls(boss, F({ bot: "ava", q: "bob@" }))), ["c_bob_proc", "c_bob1"]);
      assert.deepEqual(ids(await listCalls(boss, F({ q: "refund" }))), ["c_bob1"]);
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const recent = await listCalls(boss, F({ from: today, to: today }));
      assert.ok(!ids(recent).includes("c_alice2"), "the 2-day-old call is outside today's IST range");
      assert.deepEqual(ids(await listCalls(boss, F({ to: "2000-01-01" }))), []);
      for (let i = 0; i < 25; i++) await mk(`bulk${i}`, "carol", 100 + i, done(`conv_bulk${i}`));
      const p1 = await listCalls(boss, F({ page: "1" }));
      const p2 = await listCalls(boss, F({ page: "2" }));
      assert.equal(p1.items.length, 20);
      assert.equal(p2.items.length, 9);
      assert.equal(p1.totalPages, 2);
      assert.equal(new Set([...ids(p1), ...ids(p2)]).size, 29);
    });

    await t("detail: owner and oversight can open a call, others get NotFound, oversight view is audited once per window", async () => {
      const own = await getVoiceCall(alice, "c_alice1");
      assert.equal(own.transcript!.length, 1);
      assert.equal(own.connected, true);
      await assert.rejects(getVoiceCall(bob, "c_alice1"), NotFoundError);
      await assert.rejects(getVoiceCall(alice, "c_text"), NotFoundError);
      await assert.rejects(getVoiceCall(alice, "c_gone"), NotFoundError);
      await getVoiceCall(boss, "c_alice1");
      await getVoiceCall(boss, "c_alice1");
      const audits = await (await getDb()).collection("aibots_activity_logs").countDocuments({ actorId: "boss", entityId: "c_alice1" });
      assert.equal(audits, 1);
    });

    await t("finishing a call stores summary, success, data collection, audio flag and termination reason", async () => {
      await mk("c_fin", "alice", 1, { conversationId: null, status: "started", durationSecs: null, transcript: null, meteredAt: null });
      const v = await finishVoiceCall(alice, "c_fin", "conv_1", { client, gate: async () => null, meter: async () => {} });
      assert.equal(v.summary, "Caller booked a table.");
      assert.equal(v.summaryTitle, "Table booking");
      assert.equal(v.callSuccess, "success");
      assert.deepEqual(v.dataCollection, [{ key: "party", value: "4" }]);
      assert.equal(v.hasAudio, true);
      assert.equal(v.terminationReason, "end_call tool");
      assert.equal(v.durationSecs, 61);
      assert.equal(v.transcript!.length, 2);
    });

    await t("audio: owner and oversight get the bytes; others, never-connected, deleted and text rows are refused without any upstream call", async () => {
      clearCallAudioCache();
      audioFetches = 0;
      const a = await getCallAudio(alice, "c_alice1", { client });
      assert.equal(a.contentType, "audio/mpeg");
      assert.equal(a.bytes.byteLength, 1000);
      assert.equal((await getCallAudio(boss, "c_alice1", { client })).bytes.byteLength, 1000);
      assert.equal(audioFetches, 1, "the second request is served from the short-lived cache");
      const before = audioFetches;
      await assert.rejects(getCallAudio(bob, "c_alice1", { client }), NotFoundError);
      await assert.rejects(getCallAudio(alice, "c_alice2", { client }), NotFoundError);
      await assert.rejects(getCallAudio(alice, "c_gone", { client }), NotFoundError);
      await assert.rejects(getCallAudio(alice, "c_text", { client }), NotFoundError);
      await assert.rejects(getCallAudio(alice, "x".repeat(100), { client }), NotFoundError);
      assert.equal(audioFetches, before);
    });

    await t("audio: a cached recording is not served to someone who may not see the call", async () => {
      await getCallAudio(alice, "c_alice1", { client });
      await assert.rejects(getCallAudio(bob, "c_alice1", { client }), NotFoundError);
    });

    await t("audio: ElevenLabs 404 reads as no recording, other failures as a plain message with no key or URL", async () => {
      clearCallAudioCache();
      audioStatus = 404;
      await assert.rejects(getCallAudio(alice, "c_alice1", { client }), NotFoundError);
      audioStatus = 500;
      await assert.rejects(getCallAudio(alice, "c_alice1", { client }), (e: Error) => e instanceof AibotsInputError && !/sk_secret|api\.elevenlabs/.test(e.message));
      audioStatus = 200;
      await assert.rejects(getCallAudio(alice, "c_alice1", { client: async () => null }), (e: Error) => e instanceof AibotsInputError && /Integrations/.test(e.message));
    });
  });

  console.log("agentos calls: all passed");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
