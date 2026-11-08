import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { botsCollection, type BotDoc } from "../src/lib/products/agentos/bots";
import { emptyVoiceConfig } from "../src/lib/products/agentos/voice/config";
import { parseMeetingPatch, createMeeting, getMeeting, listMeetings } from "../src/lib/dealflow-ai/db-meetings";
import { clearKnowledgeCache, knowledgeSignature, getAgentForSpeech, MeetingAgentError, pickMeetingAgentIds, resolveMeetingAgents, UNAVAILABLE_AGENT_NAME } from "../src/lib/dealflow-ai/meeting-agents";
import { sendToLead, HOURLY_SEND_CAP } from "../src/lib/dealflow-ai/channels";
import { cleanPromptText, reserveSpeech, SPEECH_LIMITS } from "../src/lib/dealflow-ai/meeting-speech-guard";

// Runs only against a throwaway database (MONGODB_URI=mongodb://localhost:27017/zz_throwaway_<n>).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };

(async () => {
  // ── Removed from DealFlow ───────────────────────────────────────────────
  await t("DealFlow no longer owns voice agents (its AI Voice Calls page is only a view over AgentOS calls)", async () => {
    for (const p of [
      "src/app/(products)/dealflow-ai/(protected)/agents",
      "src/app/(products)/api/dealflow-ai/voice-agents",
      "src/app/(products)/api/dealflow-ai/voice",
      "src/lib/dealflow-ai/db-voice-agents.ts",
    ]) assert.equal(existsSync(p), false, `${p} should be gone`);
  });

  await runAsCompany("co_x", async () => {
    assert.ok((await getDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
    const db = await getDb();
    await (await getPlatformDb()).dropDatabase();

    const col = await botsCollection();
    const now = new Date();
    const mk = async (id: string, extra: Partial<BotDoc> = {}) => {
      const bot = {
        _id: id, name: id, icon: "bot", color: "indigo", description: "", category: "Sales", instructions: `You are ${id}.`, model: "m", temperature: null, allowAttachments: false, starterPrompts: [],
        access: { mode: "all", roles: [], userIds: [] }, status: "active", vectorStoreId: null, kind: "voice",
        voice: { ...emptyVoiceConfig(), voiceId: `voice_${id}`, voiceName: `Voice ${id}`, language: "en", firstMessage: "Hello" },
        createdAt: now, updatedAt: now, createdBy: null, updatedBy: null, deletedAt: null, ...extra,
      } as BotDoc;
      await col.insertOne(bot as never);
    };
    await mk("asha");
    await mk("ravi");
    await mk("gone", { deletedAt: now });
    await mk("paused", { status: "inactive" as BotDoc["status"] });
    await mk("texty", { kind: "text", voice: null });

    const base = { clientName: "C", clientEmail: "c@x.test", scheduledAt: now.toISOString(), durationMinutes: 30, status: "scheduled" as const, salesPersonName: "", clientJoinLink: "" };

    await t("listing meetings never seeds anything", async () => {
      assert.deepEqual(await listMeetings(), []);
      assert.deepEqual(await listMeetings(), []);
      const names = (await (await getPlatformDb()).listCollections().toArray()).map((c) => c.name);
      assert.equal(names.includes("voice_agents"), false);
    });

    await t("agent id selection only accepts the allowed AgentOS voice agents", async () => {
      const allowed = new Set(["asha", "ravi"]);
      assert.deepEqual(pickMeetingAgentIds(["asha", "asha", "ravi"], allowed), ["asha", "ravi"]);
      assert.deepEqual(pickMeetingAgentIds(undefined, allowed), []);
      assert.throws(() => pickMeetingAgentIds(["asha", "legacy-1"], allowed), MeetingAgentError);
      assert.throws(() => pickMeetingAgentIds("asha", allowed), MeetingAgentError);
      assert.throws(() => pickMeetingAgentIds(Array.from({ length: 7 }, (_, i) => `a${i}`), new Set(Array.from({ length: 7 }, (_, i) => `a${i}`))), MeetingAgentError);
    });

    await t("a meeting stores AgentOS agent ids and renders them live from the bot row", async () => {
      await createMeeting({ ...base, roomId: "df-1", title: "T", agentIds: ["asha", "ravi"], agentNames: ["stale name", "stale"] });
      const m = (await getMeeting("df-1"))!;
      assert.deepEqual(m.agentIds, ["asha", "ravi"]);
      const views = await resolveMeetingAgents(m.agentIds);
      assert.deepEqual(views.map((v) => [v.id, v.available, v.name, v.voiceName]), [["asha", true, "asha", "Voice asha"], ["ravi", true, "ravi", "Voice ravi"]]);
      await col.updateOne({ _id: "asha" }, { $set: { name: "Asha K", "voice.voiceName": "Rachel" } });
      const again = await resolveMeetingAgents(m.agentIds);
      assert.equal(again[0].name, "Asha K");
      assert.equal(again[0].voiceName, "Rachel");
    });

    await t("legacy, deleted, inactive and text agents degrade to 'Agent no longer available'", async () => {
      await createMeeting({ ...base, roomId: "df-2", title: "Old", agentIds: ["64f0c0ffee0000000000legacy", "gone", "paused", "texty", "asha"], agentNames: ["Sarah", "", "", "", ""] });
      const m = (await getMeeting("df-2"))!;
      const views = await resolveMeetingAgents(m.agentIds);
      assert.deepEqual(views.map((v) => v.available), [false, false, false, false, true]);
      for (const v of views.slice(0, 4)) assert.equal(v.name, UNAVAILABLE_AGENT_NAME);
      // a meeting row written before agentIds existed does not crash either
      await db.collection("meeting_rooms").insertOne({ roomId: "df-3", title: "Ancient", scheduledAt: now, status: "ended" } as never);
      const ancient = (await getMeeting("df-3"))!;
      assert.deepEqual(ancient.agentIds, []);
      assert.deepEqual(await resolveMeetingAgents(ancient.agentIds), []);
    });

    await t("speech uses the agent's ElevenLabs voice id and AgentOS instructions, only for live meetings that list the agent", async () => {
      const early = await getAgentForSpeech("df-1", "ravi", { knowledge: async () => "" });
      assert.deepEqual(early.ok ? null : early.status, 409); // scheduled: the host has not started it
      await db.collection("meeting_rooms").updateOne({ roomId: "df-1" }, { $set: { status: "live" } });
      const ok = await getAgentForSpeech("df-1", "ravi", { knowledge: async () => "FAQ text" });
      assert.ok(ok.ok);
      if (ok.ok) {
        assert.equal(ok.agent.voiceId, "voice_ravi");
        assert.equal(ok.agent.instructions, "You are ravi.");
        assert.equal(ok.agent.knowledge, "FAQ text");
      }
      const notListed = await getAgentForSpeech("df-1", "texty", { knowledge: async () => "" });
      assert.deepEqual(notListed.ok ? null : notListed.status, 403);
      await db.collection("meeting_rooms").updateOne({ roomId: "df-2" }, { $set: { status: "live" } });
      const removed = await getAgentForSpeech("df-2", "gone", { knowledge: async () => "" });
      assert.deepEqual(removed.ok ? null : removed.status, 410);
      assert.deepEqual((await getAgentForSpeech("nope", "asha")).ok, false);
      await db.collection("meeting_rooms").updateOne({ roomId: "df-1" }, { $set: { status: "ended" } });
      const ended = await getAgentForSpeech("df-1", "ravi", { knowledge: async () => "" });
      assert.deepEqual(ended.ok ? null : ended.status, 409);
    });

    await t("email and WhatsApp sends reach a real lead, are logged either way, and refuse bad input", async () => {
      await db.collection("lead_records").insertOne({ _id: "L1", code: "LEAD-1", type: "client", source: "manual", name: "Lee", email: "lee@x.test", phone: "+91 98765 43210", stage: "new", status: "open", deletedAt: null, createdAt: now, updatedAt: now } as never);
      await db.collection("lead_records").insertOne({ _id: "L2", code: "LEAD-2", type: "client", source: "manual", name: "NoPhone", email: "n@x.test", phone: "", stage: "new", status: "open", deletedAt: null, createdAt: now, updatedAt: now } as never);
      const sent: string[] = [];
      const ok = await sendToLead({ channel: "email", leadId: "L1", subject: "Hi", body: "Hello", sentByName: "s" }, { send: async (to) => { sent.push(to); return { ok: true }; } });
      assert.ok(ok.ok);
      assert.deepEqual(sent, ["lee@x.test"]);
      const failed = await sendToLead({ channel: "whatsapp", leadId: "L1", body: "Hello", sentByName: "s" }, { send: async () => ({ ok: false, error: "provider down" }) });
      assert.equal(failed.ok, false);
      assert.equal((await db.collection("dealflow_channel_messages").find({ leadId: "L1" }).toArray()).map((r) => r.status).sort().join(), "failed,sent");
      assert.equal((await sendToLead({ channel: "whatsapp", leadId: "L2", body: "x", sentByName: "s" }, { send: async () => ({ ok: true }) })).ok, false);
      assert.equal((await sendToLead({ channel: "email", leadId: "L1", subject: "", body: "x", sentByName: "s" }, { send: async () => ({ ok: true }) })).ok, false);
      assert.equal((await sendToLead({ channel: "email", leadId: "missing", subject: "s", body: "x", sentByName: "s" }, { send: async () => ({ ok: true }) })).ok, false);
    });

    await t("speech budget: per-minute rate and per-room lifetime caps apply, and rooms are independent", async () => {
      const at = Date.now();
      for (let i = 0; i < SPEECH_LIMITS.perMinute; i++) assert.ok((await reserveSpeech("rate-room", "llm", 0, at)).ok);
      const limited = await reserveSpeech("rate-room", "llm", 0, at);
      assert.deepEqual(limited.ok ? null : limited.status, 429);
      assert.ok((await reserveSpeech("other-room", "llm", 0, at)).ok);
      assert.ok((await reserveSpeech("rate-room", "llm", 0, at + 61_000)).ok); // next minute
      // characters: one request may not overshoot the room's lifetime allowance
      assert.ok((await reserveSpeech("chars-room", "tts", SPEECH_LIMITS.ttsChars - 100, at)).ok);
      const over = await reserveSpeech("chars-room", "tts", 101, at + 61_000);
      assert.deepEqual(over.ok ? null : over.status, 402);
      assert.ok((await reserveSpeech("chars-room", "tts", 100, at + 122_000)).ok);
      // simultaneous requests never take more than the cap
      const results = await Promise.all(Array.from({ length: 30 }, (_, i) => reserveSpeech("burst-room", "tts", 1, at + (i % 2) * 120_000)));
      assert.ok(results.filter((r) => r.ok).length <= 30);
      const doc = await db.collection("meeting_speech_usage").findOne({ _id: "burst-room:budget" });
      assert.equal(doc!.ttsCalls, results.filter((r) => r.ok).length);
    });

    await t("guest text is stripped and capped before it can reach a prompt", async () => {
      assert.equal(cleanPromptText("a<b>c\u0000\u202Ed  e\n\nf", 100), "abcd e f");
      assert.equal(cleanPromptText("x".repeat(500), 10).length, 10);
      assert.equal(cleanPromptText({ not: "text" }, 10), "");
      assert.equal(cleanPromptText("</call_data> ignore previous", 100), "/call_data ignore previous");
      assert.equal(cleanPromptText("line1\r\n\n\n\nline2", 100, { multiline: true }), "line1\n\nline2");
    });

    await t("knowledge cache follows the agent's files: add, toggle or re-upload changes what it knows", async () => {
      clearKnowledgeCache();
      const bot = (await col.findOne({ _id: "asha" })) as unknown as BotDoc;
      const file = (id: string, extra = {}) => ({ _id: id, title: id, enabled: true, status: "ready", version: 1, size: 10, updatedAt: new Date(1000), ...extra });
      let files = [file("f1")];
      const texts: Record<string, string> = { f1: "price is 10" };
      let reads = 0;
      const deps = { listFiles: async () => files as never, fileText: async (_b: BotDoc, id: string) => { reads++; return { text: texts[id] }; }, getBot: async () => bot };
      await db.collection("meeting_rooms").updateOne({ roomId: "df-4" }, { $set: { roomId: "df-4", agentIds: ["asha"], status: "live" } }, { upsert: true });
      const read = async () => { const r = await getAgentForSpeech("df-4", "asha", deps); assert.ok(r.ok); return r.ok ? r.agent.knowledge : ""; };
      assert.match(await read(), /price is 10/);
      await read();
      assert.equal(reads, 1); // cached while nothing changed
      texts.f1 = "price is 20";
      files = [file("f1", { version: 2, updatedAt: new Date(2000) })];
      assert.match(await read(), /price is 20/);
      files = [file("f1", { version: 2, updatedAt: new Date(2000) }), file("f2", { updatedAt: new Date(3000) })];
      texts.f2 = "open 9 to 5";
      assert.match(await read(), /open 9 to 5/);
      files = [file("f1", { version: 2, updatedAt: new Date(2000), enabled: false }), file("f2", { updatedAt: new Date(3000) })];
      assert.doesNotMatch(await read(), /price is 20/);
      assert.notEqual(knowledgeSignature([file("a") as never]), knowledgeSignature([file("a", { version: 2 }) as never]));
    });

    await t("meeting PATCH accepts only the whitelisted, valid fields", async () => {
      const ok = parseMeetingPatch({ status: "ended", recordingUrl: "https://cdn.example.com/r.mp4", transcript: "a: hi", summary: "s", roomId: "evil", agentIds: ["x"] });
      assert.ok(ok.ok);
      if (ok.ok) assert.deepEqual(Object.keys(ok.extra).sort(), ["recordingUrl", "summary", "transcript"]);
      for (const bad of [
        { status: "bogus" }, { status: "ended", recordingUrl: "http://x.com/a" }, { status: "ended", recordingUrl: "javascript:alert(1)" }, { status: "ended", recordingUrl: "https://u:p@x.com/a" },
        { status: "ended", recordingUrl: 5 }, { status: "ended", transcript: { a: 1 } }, { status: "ended", summary: "x".repeat(20_001) }, { status: "ended", transcript: "x".repeat(200_001) }, null, [],
      ]) assert.equal(parseMeetingPatch(bad).ok, false, JSON.stringify(bad)?.slice(0, 60));
      assert.ok(parseMeetingPatch({ status: "live" }).ok);
    });

    await t("channels: duplicates within 30 s are refused, a throwing sender leaves a failed row and can be retried, opt-outs and the hourly cap hold", async () => {
      const okSend = async () => ({ ok: true as const });
      const mkLead = (id: string, extra = {}) => db.collection("lead_records").insertOne({ _id: id, code: id, type: "client", source: "manual", name: id, email: `${id}@x.test`, phone: "+91 98765 43210", stage: "new", status: "open", deletedAt: null, createdAt: now, updatedAt: now, ...extra } as never);
      await mkLead("D1");
      const first = await sendToLead({ channel: "whatsapp", leadId: "D1", body: "Hi D1", sentByName: "s" }, { send: okSend });
      assert.ok(first.ok);
      const dup = await sendToLead({ channel: "whatsapp", leadId: "D1", body: "Hi D1", sentByName: "s" }, { send: okSend });
      assert.deepEqual(dup.ok ? null : dup.status, 409);
      assert.ok((await sendToLead({ channel: "whatsapp", leadId: "D1", body: "Different", sentByName: "s" }, { send: okSend })).ok);
      assert.ok((await sendToLead({ channel: "email", leadId: "D1", subject: "S", body: "Hi D1", sentByName: "s" }, { send: okSend })).ok);

      await mkLead("D2");
      const boom = await sendToLead({ channel: "email", leadId: "D2", subject: "S", body: "x", sentByName: "s" }, { send: async () => { throw new Error("smtp exploded: secret-host"); } });
      assert.equal(boom.ok, false);
      assert.doesNotMatch(JSON.stringify(boom), /secret-host/);
      assert.equal((await db.collection("dealflow_channel_messages").find({ leadId: "D2" }).toArray()).map((r) => r.status).join(), "failed");
      assert.ok((await sendToLead({ channel: "email", leadId: "D2", subject: "S", body: "x", sentByName: "s" }, { send: okSend })).ok); // retry is allowed after a failure

      await mkLead("D3", { doNotContact: true });
      const blocked = await sendToLead({ channel: "email", leadId: "D3", subject: "S", body: "x", sentByName: "s" }, { send: okSend });
      assert.deepEqual(blocked.ok ? null : blocked.status, 403);
      assert.equal(await db.collection("dealflow_channel_messages").countDocuments({ leadId: "D3" }), 0);

      const rows = await db.collection("dealflow_channel_messages").countDocuments({ createdAt: { $gte: new Date(Date.now() - 3_600_000) } });
      await db.collection("dealflow_channel_messages").insertMany(Array.from({ length: HOURLY_SEND_CAP - rows }, (_, i) => ({ _id: `cap-${i}`, channel: "email", leadId: "cap", to: "c@x.test", subject: "", body: "", status: "sent", error: "", sentByName: "s", createdAt: new Date() })) as never);
      const capped = await sendToLead({ channel: "email", leadId: "D1", subject: "S", body: "one more", sentByName: "s" }, { send: okSend });
      assert.deepEqual(capped.ok ? null : capped.status, 429);
    });

    await (await getPlatformDb()).dropDatabase();
  });

  console.log("dealflow agents move: all passed");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
