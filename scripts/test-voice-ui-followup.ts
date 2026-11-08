import assert from "node:assert/strict";

// Throwaway database only. Nothing here reaches ElevenLabs or Twilio: the recording is served from an injected client.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
process.env.PLATFORM_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };

(async () => {
  const { getPlatformDb } = await import("../src/lib/mongodb");
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const { botsCollection } = await import("../src/lib/products/agentos/bots");
  const display = await import("../src/lib/products/agentos/calls/call-display");
  const merged = await import("../src/lib/products/agentos/calls/merged");
  const store = await import("../src/lib/products/agentos/calls/store");
  const setup = await import("../src/lib/products/agentos/calls/conference-setup");
  const settingsMod = await import("../src/lib/products/agentos/calls/settings");
  const audio = await import("../src/lib/products/agentos/calls/audio");
  const { NotFoundError, ForbiddenError, AibotsInputError } = await import("../src/lib/products/agentos/viewer");
  type Viewer = import("../src/lib/products/agentos/viewer").AibotsViewer;

  const pdb = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(pdb.databaseName), "refusing to run on a non-throwaway database");
  await pdb.dropDatabase();

  // ── Pure wording and decisions ─────────────────────────────────────────
  await t("direction labels, masking and caller names", () => {
    assert.deepEqual(Object.values(display.DIRECTION_LABEL), ["Outbound", "Inbound", "Web", "Website visitor"]);
    assert.match(display.listedPhone({ direction: "inbound", phone: "+919876543210" }, true)!, /^\+91•+3210$/);
    assert.equal(display.listedPhone({ direction: "inbound", phone: "+919876543210" }, false), "+919876543210");
    assert.equal(display.listedPhone({ direction: "outbound", phone: "+919876543210" }, true), "+919876543210", "numbers we dialed are not masked");
    assert.equal(display.listedPhone({ direction: "web", phone: null }, true), null);
    assert.equal(display.callerName({ direction: "inbound", phone: "+919876543210", target: { label: "Ravi" } }, true), "Ravi");
    assert.match(display.callerName({ direction: "inbound", phone: "+919876543210", target: null }, true)!, /•/);
    assert.equal(display.callerName({ direction: "web_public", phone: null, target: null }, true), "Website visitor");
    assert.equal(display.callerName({ direction: "web_public", phone: null, target: null, visitorName: "Meera" }, true), "Meera");
    assert.equal(display.callerName({ direction: "outbound", phone: "+91", target: null }, true), null);
  });

  await t("speaker labels name who really spoke", () => {
    const out = { direction: "outbound" as const };
    assert.equal(display.speakerName({ role: "user", speaker: "human" }, out, "Asha"), "Team member");
    assert.equal(display.speakerName({ role: "agent", speaker: "ai" }, out, "Asha"), "Asha");
    assert.equal(display.speakerName({ role: "user", speaker: "lead" }, out, "Asha"), "Lead");
    assert.equal(display.speakerName({ role: "user", speaker: "lead" }, { direction: "inbound" }, "Asha"), "Caller");
    assert.equal(display.speakerName({ role: "user" }, { direction: "web_public" }, "Asha"), "Visitor");
    assert.equal(display.speakerName({ role: "agent" }, out, "Asha"), "Asha");
  });

  await t("recording info: never claims a conference recording holds the team member", () => {
    const base = { status: "completed", conversationId: "cv", hasAudio: true, conference: false };
    assert.deepEqual(display.recordingInfo(base), { available: true, note: null });
    const conf = display.recordingInfo({ ...base, conference: true });
    assert.ok(conf.available && /does not include what a team member said/.test(conf.note!));
    assert.ok(!display.recordingInfo({ ...base, status: "in_progress" }).available);
    assert.ok(!display.recordingInfo({ ...base, conversationId: null }).available);
    assert.equal(display.recordingInfo({ ...base, conversationId: null }).note, null);
    assert.ok(!display.recordingInfo({ ...base, hasAudio: false }).available);
    assert.equal(display.audioAccess({ userId: "a", oversight: false }, { initiatedByUserId: "a" }), "allow");
    assert.equal(display.audioAccess({ userId: "b", oversight: false }, { initiatedByUserId: "a" }), "deny");
    assert.equal(display.audioAccess({ userId: "b", oversight: true }, { initiatedByUserId: null }), "allow");
    assert.equal(display.audioAccess({ userId: "b", oversight: false }, { initiatedByUserId: null }), "deny");
  });

  await t("setup summary, Twilio field status, abuse summary and website form validation", () => {
    assert.deepEqual(display.setupSummary([{ label: "A", done: true }, { label: "B", done: false }]), { ready: false, missing: ["B"] });
    assert.deepEqual(display.setupSummary([{ label: "A", done: true }]), { ready: true, missing: [] });
    const sid = "AC" + "a".repeat(32);
    const ok = setup.twilioFieldStatus("workspace", { accountSid: sid, authToken: "x", apiKeySid: "SK" + "b".repeat(32), apiKeySecret: "s", twimlAppSid: "AP" + "c".repeat(32) });
    assert.ok(ok.fields.every((f) => f.ok));
    const bad = setup.twilioFieldStatus("workspace", { accountSid: sid, authToken: "x", apiKeySid: "nope" });
    assert.deepEqual(bad.fields.filter((f) => !f.ok).map((f) => `${f.key}:${f.problem}`), ["apiKeySid:malformed", "apiKeySecret:missing", "twimlAppSid:missing"]);
    assert.ok(JSON.stringify(ok).indexOf("authToken\":\"x") === -1, "values are never returned");
    const a = display.abuseSummary({ ip_limit: 2, replay: 5, cap_exhausted: 0 });
    assert.equal(a.total, 7);
    assert.deepEqual(a.lines.map((l) => l.kind), ["replay", "ip_limit"]);
    const L = settingsMod.PUBLIC_SETTING_LIMITS;
    assert.ok(Object.values(display.validatePublicForm({ dailyMinutes: "30", perIp: "3", perAgent: "30", maxSession: "300" }, L)).every((e) => e === null));
    const e = display.validatePublicForm({ dailyMinutes: "-1", perIp: "0", perAgent: "x", maxSession: "5" }, L);
    assert.ok(e.dailyMinutes && e.perIp && e.perAgent && e.maxSession);
  });

  // ── Data side ──────────────────────────────────────────────────────────
  const viewer = (userId: string, roles: string[]): Viewer => ({ userId, email: `${userId}@x.test`, roles, ctx: { roles, permissionOverrides: undefined } as Viewer["ctx"], seesAll: false });
  const admin = viewer("admin", ["aibots_admin"]);
  const manager = viewer("mgr", ["aibots_manager"]); // VIEW_CHATS, no VOICE_CALL_MANAGE
  const alice = viewer("alice", ["aibots_user"]);
  const bob = viewer("bob", ["aibots_user"]);
  const nobody = viewer("nobody", ["somebody_else"]);
  const NOW = new Date("2026-11-02T06:00:00Z");
  const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

  const audioCalls: string[] = [];
  const client = async () => ({ getConversationAudio: async (id: string) => { audioCalls.push(id); return { bytes: new Uint8Array([1, 2, 3]).buffer, contentType: "audio/mpeg" }; } }) as never;

  for (const id of ["co_followup", "co_other"]) await pdb.collection("companies").insertOne({ _id: id as never, slug: id, name: id, status: "active", isPlatformOwner: false, timezone: "Asia/Kolkata", createdAt: new Date(), updatedAt: new Date() });
  await runAsCompany("co_followup", async () => {
    await (await botsCollection()).insertOne({ _id: "bot_a", kind: "voice", name: "Agent A", icon: "bot", color: "blue", description: "", category: "", instructions: "x", status: "active", deletedAt: null, access: { mode: "all", roles: [], userIds: [] }, voice: { elevenAgentId: "agent_el_1", displayName: "Asha", dataFields: [] } } as never);
    const row = (id: string, over: Record<string, unknown>) => ({
      _id: id, idempotencyKey: `seed-${id}-abcdef`, direction: "outbound", agentId: "bot_a", elevenAgentId: "agent_el_1", purpose: "lead_followup", target: null, phone: "+919822200001", phoneHash: id, phoneLast4: "0001",
      fromNumberId: "num1", initiatedBy: { userId: "alice", email: "alice@x.test" }, scheduledFor: null, anchorAt: ago(10), dialedAt: ago(10), endedAt: ago(8), status: "completed", attempts: 1,
      conversationId: `cv_${id}`, callSid: null, context: {}, compliance: null, failure: null, collected: [], outcome: null, summary: null, summaryTitle: null, transcript: null, durationSecs: 60, hasAudio: true,
      terminationReason: null, meteredAt: null, meterLeaseUntil: null, chatId: null, cancelledBy: null, control: { mode: "ai", handler: null, canHandBack: true, history: [] }, eventSeq: 0, createdAt: ago(10), updatedAt: ago(10), ...over,
    });
    const calls = await store.callsCollection();
    await calls.insertMany([
      row("out1", { createdAt: ago(5) }),
      row("in1", { direction: "inbound", initiatedBy: null, phone: "+919000000001", purpose: "support", createdAt: ago(6), summary: "Asked about pricing" }),
      row("web1", { direction: "web_public", initiatedBy: null, phone: null, phoneHash: null, purpose: "support", createdAt: ago(7), context: { visitor_name: "Meera" }, publicMeta: { origin: "https://partner.example" } }),
      row("conf1", { createdAt: ago(8), control: { mode: "ai", handler: null, canHandBack: true, history: [{ at: ago(9), from: "ai", to: "human", by: "mgr" }] }, transcript: [{ role: "agent", text: "Hello", atSecs: 1, speaker: "ai" }, { role: "user", text: "Hi, it is the team", atSecs: 5, speaker: "human" }] }),
      row("noaudio", { createdAt: ago(9), hasAudio: false }),
      row("live1", { createdAt: ago(1), status: "in_progress", endedAt: null }),
    ] as never);
    const F = (over: Partial<import("../src/lib/products/agentos/calls/merged").MergedFilters> = {}) => ({ ...merged.parseMergedFilters({}), ...over });

    await t("Call History: inbound and website calls appear for oversight with direction and a masked caller; a normal user never sees them", async () => {
      const l = await merged.listMergedCalls(manager, F());
      const byId = new Map(l.items.map((i) => [i.id, i]));
      assert.equal(byId.get("in1")!.direction, "inbound");
      assert.match(byId.get("in1")!.phone!, /^\+91•+0001$/);
      assert.match(byId.get("in1")!.caller!, /•/);
      assert.equal(byId.get("web1")!.direction, "web_public");
      assert.equal(byId.get("web1")!.caller, "Meera");
      assert.equal(byId.get("web1")!.origin, "https://partner.example");
      assert.match(byId.get("out1")!.phone!, /•/, "someone else's outbound number stays masked without call management (existing rule)");
      assert.equal((await merged.listMergedCalls(admin, F())).items.find((i) => i.id === "out1")!.phone, "+919822200001");
      const alices = await merged.listMergedCalls(alice, F());
      assert.deepEqual(alices.items.map((i) => i.id).sort(), ["conf1", "live1", "noaudio", "out1"]);
      assert.equal((await merged.listMergedCalls(nobody, F())).items.length, 0);
    });

    await t("number masking follows the setting, and the direction filter narrows the list", async () => {
      await settingsMod.savePublicCallSettings(admin, { maskInboundNumbers: false });
      const open = await merged.listMergedCalls(manager, F());
      assert.equal(open.items.find((i) => i.id === "in1")!.phone, "+919000000001");
      assert.equal(open.items.find((i) => i.id === "in1")!.caller, "+919000000001");
      await settingsMod.savePublicCallSettings(admin, { maskInboundNumbers: true });
      assert.deepEqual((await merged.listMergedCalls(manager, F({ direction: "inbound" }))).items.map((i) => i.id), ["in1"]);
      assert.deepEqual((await merged.listMergedCalls(manager, F({ direction: "web_public" }))).items.map((i) => i.id), ["web1"]);
      assert.equal(merged.parseMergedFilters({ direction: "bogus" }).direction, "");
      assert.equal(merged.parseMergedFilters({ direction: "inbound" }).direction, "inbound");
      await assert.rejects(settingsMod.savePublicCallSettings(alice, { maskInboundNumbers: false }), ForbiddenError);
      await assert.rejects(settingsMod.savePublicCallSettings(admin, { publicDailyMinutes: -3 }), AibotsInputError);
    });

    await t("call detail: recording info, caller and control history", async () => {
      const web = await merged.loadCallDetail(manager, "web1");
      assert.equal(web.caller, "Meera");
      assert.equal(web.origin, "https://partner.example");
      assert.equal(web.recording.url, "/api/agentos/calls/web1/audio");
      const conf = await merged.loadCallDetail(manager, "conf1");
      assert.ok(/does not include what a team member said/.test(conf.recording.note!));
      assert.equal(conf.controlHistory.length, 1);
      assert.equal(conf.call.transcript![1].speaker, "human");
      assert.equal((await merged.loadCallDetail(manager, "noaudio")).recording.url, null);
      assert.equal((await merged.loadCallDetail(alice, "live1")).recording.url, null);
      await assert.rejects(merged.loadCallDetail(alice, "in1"), NotFoundError);
    });

    await t("audio route data: owner or oversight only, no recording when none exists, same answer for a missing id", async () => {
      const a = await audio.getEngineCallAudio(alice, "out1", { client });
      assert.equal(a.contentType, "audio/mpeg");
      assert.equal(a.bytes.byteLength, 3);
      assert.deepEqual(audioCalls, ["cv_out1"]);
      await audio.getEngineCallAudio(manager, "in1", { client }); // oversight, not the owner
      await assert.rejects(audio.getEngineCallAudio(bob, "out1", { client }), NotFoundError);
      await assert.rejects(audio.getEngineCallAudio(alice, "in1", { client }), NotFoundError, "inbound calls belong to nobody: oversight only");
      await assert.rejects(audio.getEngineCallAudio(nobody, "out1", { client }), NotFoundError);
      await assert.rejects(audio.getEngineCallAudio(alice, "does-not-exist", { client }), NotFoundError);
      await assert.rejects(audio.getEngineCallAudio(manager, "noaudio", { client }), NotFoundError);
      assert.ok(!audioCalls.includes("cv_noaudio"), "the provider is not asked when the call has no recording");
    });

    await t("audio is tenant scoped: another company cannot play this company's call", async () => {
      await runAsCompany("co_other", async () => {
        await assert.rejects(audio.getEngineCallAudio(admin, "out1", { client }), NotFoundError);
      });
    });

    await t("setup panel data: managers get the Twilio field status and the address; others get neither", async () => {
      const mgr = await setup.getConferenceSetup(admin);
      assert.ok(mgr.twilio && mgr.twilio.source === "none" && mgr.twilio.fields.every((f) => !f.ok));
      const other = await setup.getConferenceSetup(manager);
      assert.equal(other.twilio, null);
      assert.equal(other.voiceUrl, null);
      assert.ok(other.steps.every((s) => s.help === ""));
    });
  });

  await pdb.dropDatabase(); // throwaway: asserted above
  console.log("voice ui follow-up: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
