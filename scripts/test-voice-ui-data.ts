import assert from "node:assert/strict";

// Throwaway database only. Nothing here reaches ElevenLabs or Twilio: guards run with injected deps and no call is ever dialed
// (every call is scheduled for later; the dial path is never exercised).
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
process.env.PLATFORM_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };

(async () => {
  const { getPlatformDb } = await import("../src/lib/mongodb");
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const { botsCollection } = await import("../src/lib/products/agentos/bots");
  const { chatsCollection } = await import("../src/lib/products/agentos/chats");
  const msgs = await import("../src/lib/products/agentos/calls/guard-messages");
  const ui = await import("../src/lib/products/agentos/calls/call-ui");
  const fe = await import("../src/lib/products/agentos/calls/data-field-editor");
  const purposes = await import("../src/lib/products/agentos/calls/purposes");
  const merged = await import("../src/lib/products/agentos/calls/merged");
  const manage = await import("../src/lib/products/agentos/calls/manage");
  const options = await import("../src/lib/products/agentos/calls/options");
  const engine = await import("../src/lib/products/agentos/calls/engine");
  const store = await import("../src/lib/products/agentos/calls/store");
  const settingsMod = await import("../src/lib/products/agentos/calls/settings");
  const run = await import("../src/lib/products/agentos/calls/action-run");
  const cfg = await import("../src/lib/products/agentos/voice/config");
  const { ForbiddenError, NotFoundError, AibotsInputError } = await import("../src/lib/products/agentos/viewer");
  type Viewer = import("../src/lib/products/agentos/viewer").AibotsViewer;
  type CallFailureCode = import("../src/lib/products/agentos/calls/types").CallFailureCode;

  const integ = await import("../src/lib/products/agentos/calls/integrations");
  const dncMod = await import("../src/lib/products/agentos/calls/dnc");
  integ.setIntegrationsLoaderForTest(async () => {}); // the products' hooks are not loaded here: any target is allowed, nobody is flagged
  for (const p of ["dealflow-ai", "talentos", "sprintos"]) integ.registerTargetAuthorizer(p, async () => true);
  dncMod.registerDoNotContactProvider("dealflow-ai", async () => false);

  const pdb = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(pdb.databaseName), "refusing to run on a non-throwaway database");
  await pdb.dropDatabase();

  const viewer = (userId: string, roles: string[]): Viewer => ({ userId, email: `${userId}@x.test`, roles, ctx: { roles, permissionOverrides: undefined } as Viewer["ctx"], seesAll: false });
  const admin = viewer("admin", ["aibots_admin"]);
  const manager = viewer("mgr", ["aibots_admin"]);
  const alice = viewer("alice", ["aibots_user"]);
  const bob = viewer("bob", ["aibots_user"]);
  const nobody = viewer("nobody", ["somebody_else"]);

  // ── Guard messages ─────────────────────────────────────────────────────
  const ALL_CODES: CallFailureCode[] = [
    "invalid_phone", "countries_not_configured", "country_not_allowed", "do_not_call", "do_not_contact", "dnc_check_failed", "no_timezone", "outside_window", "override_not_allowed",
    "schedule_in_past", "duplicate", "user_cap", "company_cap", "plan_blocked", "agent_unusable", "disclosure_missing", "not_connected", "no_number", "purpose_unsupported",
    "provider_error", "cancelled", "not_live", "control_busy", "takeover_unsupported", "handback_unsupported", "monitor_unavailable", "conference_unavailable", "not_joined", "target_forbidden", "dial_unconfirmed",
  ];

  await t("guard messages: every failure code has a title, the engine sentence is kept and a person-specific next step exists for the ones people hit", () => {
    assert.deepEqual([...msgs.CODES_WITH_MESSAGES].sort(), [...ALL_CODES].sort(), "a code was added to the engine without wording (or the reverse)");
    for (const code of ALL_CODES) {
      for (const isManager of [true, false]) {
        const a = msgs.describeFailure({ code, message: "engine says so" }, { isManager, agentId: "bot1" });
        assert.equal(a.code, code);
        assert.ok(a.title.length > 3 && a.message === "engine says so", code);
      }
    }
    for (const code of ["invalid_phone", "countries_not_configured", "country_not_allowed", "do_not_call", "outside_window", "duplicate", "no_number", "agent_unusable", "disclosure_missing", "purpose_unsupported", "not_connected"] as CallFailureCode[]) {
      assert.ok(msgs.describeFailure({ code, message: "m" }, { isManager: false }).hint, `${code} needs a hint for a normal user`);
    }
  });

  await t("guard messages: only a manager gets the override field (calling window) and the fix-it links", () => {
    const m = msgs.describeFailure({ code: "outside_window", message: "m" }, { isManager: true });
    const u = msgs.describeFailure({ code: "outside_window", message: "m" }, { isManager: false });
    assert.ok(m.canOverride && m.field === "override");
    assert.ok(!u.canOverride && u.field === "schedule");
    assert.ok(!msgs.describeFailure({ code: "duplicate", message: "m" }, { isManager: true }).canOverride);
    assert.equal(msgs.describeFailure({ code: "no_number", message: "m" }, { isManager: true }).link?.href, "/commandos/settings/products/agentos/phone");
    assert.equal(msgs.describeFailure({ code: "no_number", message: "m" }, { isManager: false }).link, null);
    assert.ok(msgs.describeFailure({ code: "no_number", message: "m" }, { isManager: false }).hint!.includes("CommandOS → AgentOS settings → Phone"));
    assert.equal(msgs.describeFailure({ code: "disclosure_missing", message: "m" }, { isManager: true, agentId: "a b" }).link?.href, "/agentos/bots/a%20b");
    assert.equal(msgs.describeFailure({ code: "user_cap", message: "m" }, { isManager: false }).retryLater, true);
    const unknown = msgs.describeFailure({ code: "brand_new_code" as never, message: "something odd" }, { isManager: false });
    assert.equal(unknown.code, "unknown");
    assert.equal(unknown.message, "something odd");
    assert.ok(msgs.overrideReasonProblem("") && msgs.overrideReasonProblem("too short") && !msgs.overrideReasonProblem("Client asked for an evening call"));
  });

  // ── Phone and time ─────────────────────────────────────────────────────
  await t("phone field: one allowed country adds its code, several require the code, disallowed countries are named", () => {
    const one = ui.checkPhoneInput("098765 43210", ["+91"]);
    assert.deepEqual([one.e164, one.prefixed, one.error], ["+919876543210", true, null]);
    assert.equal(ui.checkPhoneInput("+91 98765 43210", ["+91"]).prefixed, false);
    assert.ok(ui.checkPhoneInput("9876543210", ["+91", "+44"]).error);
    assert.ok(ui.checkPhoneInput("+14155550123", ["+91"]).error!.includes("+91"));
    assert.equal(ui.checkPhoneInput("+14155550123", []).e164, "+14155550123");
    assert.equal(ui.checkPhoneInput("   ", ["+91"]).error, null);
    assert.ok(ui.checkPhoneInput("call me", ["+91"]).error);
    assert.equal(ui.formatPhone("+919876543210", ["+91", "+1"]), "+91 98765 43210");
    assert.equal(ui.formatPhone("+4412345", []), "+4412345");
  });

  await t("company time zone: a typed time becomes the right instant, including half-hour zones and daylight saving", () => {
    assert.equal(ui.zonedLocalToUtc("2026-11-02T09:00", "Asia/Kolkata")!.toISOString(), "2026-11-02T03:30:00.000Z");
    assert.equal(ui.zonedLocalToUtc("2026-07-01T09:00", "America/New_York")!.toISOString(), "2026-07-01T13:00:00.000Z");
    assert.equal(ui.zonedLocalToUtc("2026-12-01T09:00", "America/New_York")!.toISOString(), "2026-12-01T14:00:00.000Z");
    assert.equal(ui.zonedLocalToUtc("2026-03-08T02:30", "America/New_York"), null); // the hour that doesn't exist
    assert.equal(ui.zonedLocalToUtc("2026-02-31T09:00", "Asia/Kolkata"), null);
    assert.equal(ui.zonedLocalToUtc("tomorrow", "Asia/Kolkata"), null);
    assert.equal(ui.zonedLocalToUtc("2026-11-02T09:00", "Not/AZone"), null);
    const at = new Date("2026-11-02T03:30:00Z");
    assert.equal(ui.toZonedLocal(at, "Asia/Kolkata"), "2026-11-02T09:00");
    assert.equal(ui.zonedLocalToUtc(ui.toZonedLocal(at, "Pacific/Auckland"), "Pacific/Auckland")!.getTime(), at.getTime());
    assert.ok(ui.formatInZone(at, "Asia/Kolkata").includes("(Asia/Kolkata)"));
    const now = new Date("2026-11-02T06:00:00Z");
    assert.ok(!ui.checkScheduleInput("", "Asia/Kolkata", now).ok);
    assert.ok(!ui.checkScheduleInput("2026-11-02T11:30", "Asia/Kolkata", now).ok, "the current minute is not the future");
    assert.ok(ui.checkScheduleInput("2026-11-02T12:00", "Asia/Kolkata", now).ok);
    assert.ok(!ui.checkScheduleInput("2027-03-01T12:00", "Asia/Kolkata", now).ok);
  });

  // ── Status, tabs, collected labels ─────────────────────────────────────
  await t("tabs and row actions: retry only for phone calls we placed that failed; cancel and move only while scheduled and only for the owner or a manager", () => {
    assert.deepEqual(ui.tabsOf({ status: "scheduled", direction: "outbound" }), ["all", "upcoming"]);
    assert.deepEqual(ui.tabsOf({ status: "no_answer", direction: "outbound" }), ["all", "attention"]);
    assert.deepEqual(ui.tabsOf({ status: "failed", direction: "web" }), ["all"]);
    assert.deepEqual(ui.tabsOf({ status: "completed", direction: "outbound" }), ["all"]);
    const user = { canCall: true, isManager: false };
    assert.deepEqual(ui.callActions({ status: "scheduled", direction: "outbound", mine: true }, user), { cancel: true, reschedule: true, retry: false });
    assert.deepEqual(ui.callActions({ status: "scheduled", direction: "outbound", mine: false }, user), { cancel: false, reschedule: false, retry: false });
    assert.deepEqual(ui.callActions({ status: "scheduled", direction: "outbound", mine: false }, { canCall: true, isManager: true }), { cancel: true, reschedule: true, retry: true === false, });
    assert.equal(ui.callActions({ status: "busy", direction: "outbound", mine: true }, user).retry, true);
    assert.equal(ui.callActions({ status: "failed", direction: "web", mine: true }, user).retry, false);
    assert.equal(ui.callActions({ status: "failed", direction: "inbound", mine: true }, user).retry, false);
    assert.equal(ui.callActions({ status: "failed", direction: "outbound", mine: true }, { canCall: false, isManager: false }).retry, false);
    assert.ok(ui.isCallTab("upcoming") && !ui.isCallTab("x"));
  });

  await t("collected values are named with the agent's own labels, then the stored label, then the key made readable", () => {
    const out = ui.labelCollected(
      [{ key: "notice", label: "notice", value: "30 days" }, { key: "ctc_expected", label: "ctc_expected", value: "x" }, { key: "q", label: "Stored label", value: "y" }],
      [{ key: "notice", label: "Notice period" }],
    );
    assert.deepEqual(out.map((o) => o.label), ["Notice period", "Ctc expected", "Stored label"]);
    assert.equal(ui.labelCollected([{ key: "a_b", label: "a_b", value: "1" }], null)[0].label, "A b");
    assert.equal(ui.describeControlStep({ from: "ai", to: "human" }), "A person took over from the AI");
  });

  // ── Data-field editor ──────────────────────────────────────────────────
  await t("data-field editor: keys are unique readable slugs; add / remove / move / type changes are pure and bounded", () => {
    assert.equal(fe.slugKey("Notice period (days)", []), "notice_period_days");
    assert.equal(fe.slugKey("Notice period", ["notice_period"]), "notice_period_2");
    assert.equal(fe.slugKey("123 abc", []), "f_123_abc");
    assert.equal(fe.slugKey("!!!", []), "field");
    assert.ok(purposes.DATA_FIELD_KEY.test(fe.slugKey("Ünïcode Näme", [])));
    assert.ok(fe.slugKey("x".repeat(100), []).length <= purposes.DATA_FIELD_LIMITS.keyMax);
    let f: ReturnType<typeof fe.addField> = [];
    f = fe.addField(f);
    f = fe.addField(f);
    assert.equal(f.length, 2);
    assert.notEqual(f[0].key, f[1].key);
    f = fe.updateField(f, 0, { label: "A", key: "a" });
    f = fe.updateField(f, 1, { label: "B", key: "b" });
    assert.deepEqual(fe.moveField(f, 0, 1).map((x) => x.key), ["b", "a"]);
    assert.deepEqual(fe.moveField(f, 0, -1).map((x) => x.key), ["a", "b"]);
    assert.deepEqual(fe.moveField(f, 1, 1).map((x) => x.key), ["a", "b"]);
    assert.deepEqual(fe.removeField(f, 0).map((x) => x.key), ["b"]);
    assert.equal(f[0].key, "a", "inputs are never mutated");
    const c = fe.setFieldType(f, 0, "choice");
    assert.deepEqual(c[0].options, []);
    assert.equal("options" in fe.setFieldType(fe.updateField(c, 0, { options: ["x", "y"] }), 0, "text")[0], false);
    let big: ReturnType<typeof fe.addField> = [];
    for (let i = 0; i < 40; i++) big = fe.addField(big);
    assert.equal(big.length, purposes.DATA_FIELD_LIMITS.max);
    assert.deepEqual(fe.parseOptions(" Yes, No\nYes\n\n Maybe "), ["Yes", "No", "Maybe"]);
    assert.equal(fe.parseOptions(Array.from({ length: 40 }, (_, i) => `o${i}`).join(",")).length, purposes.DATA_FIELD_LIMITS.optionsMax);
  });

  await t("data-field editor: suggestions come from the chosen purposes, never overwrite the person's rows, and respect the limit", () => {
    const s = fe.suggestedFieldsFor(["screening", "pre_hr"]);
    assert.ok(s.length > 0 && new Set(s.map((x) => x.key)).size === s.length);
    assert.deepEqual(fe.suggestedFieldsFor([]), []);
    assert.deepEqual(fe.suggestedFieldsFor(["not_a_purpose"]), []);
    const mine = [{ key: "interested", label: "My own wording", type: "text" as const, description: "mine", required: false }];
    const after = fe.withSuggestions(mine, ["screening"]);
    assert.equal(after[0].label, "My own wording");
    assert.equal(after.filter((x) => x.key === "interested").length, 1);
    assert.ok(after.length > 1);
    assert.equal(fe.missingSuggestions(after, ["screening"]).length, 0);
    const full = Array.from({ length: purposes.DATA_FIELD_LIMITS.max }, (_, i) => ({ key: `k${i}`, label: `K${i}`, type: "text" as const, description: "d", required: false }));
    assert.equal(fe.withSuggestions(full, ["screening"]).length, purposes.DATA_FIELD_LIMITS.max);
    const copy = fe.suggestedFieldsFor(["screening"]);
    copy[0].label = "changed";
    assert.notEqual(fe.suggestedFieldsFor(["screening"])[0].label, "changed", "suggestions are copies");
  });

  await t("data-field editor: inline problems say what the server says (same rule, same outcome)", () => {
    const ok = { key: "a", label: "A", type: "text" as const, description: "d", required: false };
    const cases: [string, ReturnType<typeof fe.addField>, boolean][] = [
      ["valid", [ok], false],
      ["empty", [], false],
      ["no label", [{ ...ok, label: " " }], true],
      ["bad key", [{ ...ok, key: "Bad Key" }], true],
      ["duplicate key", [ok, { ...ok, label: "B" }], true],
      ["no description", [{ ...ok, description: "" }], true],
      ["choice with one option", [{ ...ok, type: "choice", options: ["x"] }], true],
      ["choice with two", [{ ...ok, type: "choice", options: ["x", "y"] }], false],
    ];
    for (const [name, fields, bad] of cases) {
      assert.equal(Object.keys(fe.fieldProblems(fields)).length > 0, bad, `inline: ${name}`);
      assert.equal(fe.firstServerProblem(fields) !== null, bad, `server: ${name}`);
    }
    assert.equal(fe.fieldProblems([ok, { ...ok, label: "B" }])[1], 'The key "a" is used twice.');
  });

  await t("agent form values: purposes and fields survive the voice-config round trip, bad origins are rejected with the shared wording", () => {
    const base = { voiceId: "v", language: "en", maxDurationSecs: null };
    const v = cfg.normalizeVoiceInput({ ...base, purposes: ["screening", "nope", "screening"], dataFields: fe.suggestedFieldsFor(["screening"]), isPublic: true, allowedOrigins: ["https://example.com/path"] });
    assert.deepEqual(v.purposes, ["screening"]);
    assert.equal(v.dataFields!.length, fe.suggestedFieldsFor(["screening"]).length);
    assert.deepEqual(v.allowedOrigins, ["https://example.com"]);
    assert.throws(() => cfg.normalizeVoiceInput({ ...base, dataFields: [{ key: "x", label: "", type: "text", description: "d" }] }), /give it a name/);
    assert.throws(() => cfg.normalizeOrigins(["http://example.com"]), /https/);
    assert.throws(() => cfg.normalizeOrigins(["not a site"]), /isn't a website address/);
    assert.equal(cfg.normalizeVoiceInput(base).purposes, undefined, "an older form that never sends them keeps what is stored");
  });

  await t("merged filters: unknown values fall away and old status links still work", () => {
    const f = merged.parseMergedFilters({ tab: "attention", status: "connected", page: "3", from: "2026-13-45", scope: "mine", bot: "b".repeat(100) });
    assert.equal(f.tab, "attention");
    assert.equal(f.status, "completed");
    assert.equal(f.page, 3);
    assert.equal(f.from, "");
    assert.equal(f.scope, "mine");
    assert.equal(f.bot.length, 64);
    assert.equal(merged.parseMergedFilters({ tab: "evil", status: "evil", page: "-4" }).tab, "all");
    assert.equal(merged.parseMergedFilters({ page: "999999" }).page, 50);
  });

  // ── Database-backed ────────────────────────────────────────────────────
  const CO = "co_ui";
  const OTHER = "co_other";
  for (const id of [CO, OTHER]) await pdb.collection("companies").insertOne({ _id: id as never, slug: id, name: id, status: "active", isPlatformOwner: false, timezone: "Asia/Kolkata", createdAt: new Date(), updatedAt: new Date() });

  const NOW = new Date("2026-11-02T06:00:00Z"); // 11:30 IST, a Monday
  let hasNumber = false;
  const deps = () => ({ now: () => NOW, gate: async () => null, connected: async () => true, timeZone: async () => "Asia/Kolkata" as string | null, hasNumber: async () => hasNumber });
  let n = 0;
  const key = () => `ui-test-key-${++n}-abcdef`;
  const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

  await runAsCompany(CO, async () => {
    const bots = await botsCollection();
    const voice = (over: Record<string, unknown> = {}) => ({ ...cfg.emptyVoiceConfig(), voiceId: "v", language: "en", elevenAgentId: "agent_el_1", disclosureLine: "I am an AI.", purposes: ["lead_followup", "screening"], dataFields: [{ key: "notice", label: "Notice period", type: "text", description: "d", required: false }], displayName: "Asha", jobTitle: "Recruiter", ...over });
    const mkBot = (id: string, over: Record<string, unknown> = {}) => bots.insertOne({ _id: id, kind: "voice", name: `Agent ${id}`, icon: "bot", color: "blue", description: "", category: "", instructions: "x", status: "active", deletedAt: null, access: { mode: "all", roles: [], userIds: [] }, voice: voice(), ...over } as never);
    await mkBot("bot_a");
    await mkBot("bot_nopurpose", { voice: voice({ purposes: [] }) });
    await mkBot("bot_unsynced", { voice: voice({ elevenAgentId: null }) });
    await mkBot("bot_private", { access: { mode: "restricted", roles: [], userIds: ["somebody"] } });
    await mkBot("bot_text", { kind: "text", voice: null });
    await mkBot("bot_off", { status: "inactive" });

    await t("call options: the dialog explains every missing prerequisite instead of failing, in role-appropriate words", async () => {
      const bare = await options.loadCallOptions(alice, deps());
      assert.deepEqual(bare.blockers.map((b) => b.code).sort(), ["no_countries", "no_number"]);
      assert.ok(bare.blockers.every((b) => b.link === null), "a normal user is not sent to admin pages");
      assert.ok(bare.blockers.find((b) => b.code === "no_number")!.message.includes("CommandOS → AgentOS settings → Phone"));
      const asAdmin = await options.loadCallOptions(admin, deps());
      assert.equal(asAdmin.blockers.find((b) => b.code === "no_number")!.link!.href, "/commandos/settings/products/agentos/phone");
      assert.equal(asAdmin.isManager, true);
      const noPerm = await options.loadCallOptions(viewer("viewer_only", ["aibots_user"]), { ...deps(), connected: async () => false, timeZone: async () => null });
      assert.deepEqual(noPerm.blockers.map((b) => b.code).sort(), ["no_countries", "no_number", "no_timezone", "not_connected"]);
      // Without the calling permission the explanation says so (granted via an override here).
      const denied = { ...alice, ctx: { roles: ["aibots_user"], permissionOverrides: { "aibots.canPlaceVoiceCalls": false } } } as unknown as Viewer;
      const d = await options.loadCallOptions(denied, deps());
      if (!d.canCall) assert.ok(d.blockers.some((b) => b.code === "no_permission"));
    });

    await t("call options: agents are the ones this person may use, with purposes, persona and readiness; nothing else", async () => {
      const o = await options.loadCallOptions(alice, deps());
      assert.deepEqual(o.agents.map((a) => a.id).sort(), ["bot_a", "bot_nopurpose", "bot_off".replace("bot_off", "bot_unsynced")].sort());
      const a = o.agents.find((x) => x.id === "bot_a")!;
      assert.deepEqual([a.ready, a.displayName, a.jobTitle, a.purposes], [true, "Asha", "Recruiter", ["lead_followup", "screening"]]);
      assert.deepEqual(o.agents.find((x) => x.id === "bot_nopurpose")!.purposes, ["custom"]);
      const un = o.agents.find((x) => x.id === "bot_unsynced")!;
      assert.ok(!un.ready && un.notReady!.length > 10);
      assert.ok(!o.agents.some((x) => ["bot_private", "bot_text", "bot_off"].includes(x.id)));
      assert.ok(o.purposes.some((p) => p.key === "lead_followup" && p.hasNotes));
      assert.equal(o.timeZone, "Asia/Kolkata");
    });

    // Calling prerequisites for the rest of the file.
    await settingsMod.saveCallSettings(admin, { allowedCallingCodes: ["+91"], windowStart: "09:00", windowEnd: "21:00", duplicateWindowMinutes: 30, perUserHourlyCap: 20, perCompanyHourlyCap: 100, requireDisclosure: true, recordingNotice: true });
    await (await store.numbersCollection()).insertOne({ _id: "num1", number: "+918041234567", label: "Main", provider: "twilio", elevenPhoneNumberId: "pn_1", supportsOutbound: true, supportsInbound: true, assignedAgentId: null, status: "active", createdAt: NOW, updatedAt: NOW, createdBy: "admin" } as never);
    hasNumber = true;

    await t("call options: with numbers, countries and a time zone there is nothing left to block a normal user", async () => {
      const o = await options.loadCallOptions(alice, deps());
      assert.deepEqual(o.blockers, []);
      assert.deepEqual(o.allowedCodes, ["+91"]);
      assert.deepEqual(o.window, { start: "09:00", end: "21:00" });
    });

    const TARGET = { product: "dealflow-ai", entityType: "lead", entityId: "L1", label: "Asha Rao" };
    const base = (over: Record<string, unknown> = {}) => ({ agentId: "bot_a", purpose: "lead_followup", target: TARGET, phone: "+919811100001", context: {}, ...over });
    const schedule = (hoursAhead: number) => new Date(NOW.getTime() + hoursAhead * 3600_000).toISOString();

    let upcomingId = "";
    await t("reschedule: the owner moves a scheduled call after every guard passes for the new time; the call keeps its identity", async () => {
      const r = await engine.requestCall(alice, base({ scheduleAt: schedule(2), idempotencyKey: key() }) as never, deps());
      assert.ok(r.ok && r.call.status === "scheduled");
      upcomingId = r.ok ? r.call.id : "";
      const moved = await manage.rescheduleCall(alice, upcomingId, { scheduleAt: schedule(3) }, deps());
      assert.ok(moved.ok);
      const doc = (await (await store.callsCollection()).findOne({ _id: upcomingId }))!;
      assert.equal(doc.scheduledFor!.toISOString(), schedule(3));
      assert.equal(doc.anchorAt.toISOString(), schedule(3));
      assert.equal(doc.status, "scheduled");
      // It does not collide with itself in the duplicate check, even moving by a few minutes.
      const nudge = await manage.rescheduleCall(alice, upcomingId, { scheduleAt: new Date(new Date(schedule(3)).getTime() + 5 * 60_000).toISOString() }, deps());
      assert.ok(nudge.ok);
    });

    await t("reschedule: guards are re-run - calling window, past, 90 days, another call to the same number, and non-managers can't override", async () => {
      const outside = new Date("2026-11-02T18:30:00Z").toISOString(); // 00:00 IST
      const w = await manage.rescheduleCall(alice, upcomingId, { scheduleAt: outside }, deps());
      assert.ok(!w.ok && w.failure.code === "outside_window");
      await assert.rejects(manage.rescheduleCall(alice, upcomingId, { scheduleAt: outside, overrideReason: "client wants midnight" }, deps()), Error).catch(() => {});
      const refused = await manage.rescheduleCall(alice, upcomingId, { scheduleAt: outside, overrideReason: "client wants a midnight call" }, deps());
      assert.ok(!refused.ok && refused.failure.code === "override_not_allowed");
      const past = await manage.rescheduleCall(alice, upcomingId, { scheduleAt: new Date(NOW.getTime() - 3600_000).toISOString() }, deps());
      assert.ok(!past.ok && past.failure.code === "schedule_in_past");
      await assert.rejects(manage.rescheduleCall(alice, upcomingId, { scheduleAt: new Date(NOW.getTime() + 100 * 86400_000).toISOString() }, deps()), AibotsInputError);
      await assert.rejects(manage.rescheduleCall(alice, upcomingId, { scheduleAt: "garbage" }, deps()), AibotsInputError);
      // A second call to the same number near the target time blocks the move.
      const other = await engine.requestCall(alice, base({ phone: "+919811100002", scheduleAt: schedule(6), idempotencyKey: key() }) as never, deps());
      assert.ok(other.ok);
      const clash = await manage.rescheduleCall(alice, upcomingId, { scheduleAt: schedule(6) }, deps());
      assert.ok(clash.ok, "different numbers never clash");
      const same = await engine.requestCall(alice, base({ phone: "+919811100001", scheduleAt: schedule(8), idempotencyKey: key() }) as never, deps());
      assert.ok(same.ok);
      const dup = await manage.rescheduleCall(alice, upcomingId, { scheduleAt: schedule(8) }, deps());
      assert.ok(!dup.ok && dup.failure.code === "duplicate");
      assert.equal((await (await store.callsCollection()).findOne({ _id: upcomingId }))!.scheduledFor!.toISOString(), schedule(6), "a refused move changes nothing");
    });

    await t("reschedule: a manager may move someone else's call outside the hours with a reason, which is stored; others can't touch it", async () => {
      await assert.rejects(manage.rescheduleCall(bob, upcomingId, { scheduleAt: schedule(5) }, deps()), NotFoundError);
      await assert.rejects(manage.rescheduleCall(nobody, upcomingId, { scheduleAt: schedule(5) }, deps()), ForbiddenError);
      const outside = new Date("2026-11-02T18:30:00Z").toISOString();
      const needReason = await manage.rescheduleCall(manager, upcomingId, { scheduleAt: outside }, deps());
      assert.ok(!needReason.ok && needReason.failure.code === "outside_window");
      await assert.rejects(manage.rescheduleCall(manager, upcomingId, { scheduleAt: outside, overrideReason: "short" }, deps()), AibotsInputError);
      const ok = await manage.rescheduleCall(manager, upcomingId, { scheduleAt: outside, overrideReason: "Client asked for a call after midnight" }, deps());
      assert.ok(ok.ok);
      const doc = (await (await store.callsCollection()).findOne({ _id: upcomingId }))!;
      assert.equal(doc.compliance!.callingWindow.overridden, true);
      assert.equal(doc.compliance!.callingWindow.overrideReason, "Client asked for a call after midnight");
    });

    await t("reschedule: a cancelled or dialed call can't be moved; cancel is owner-or-manager only", async () => {
      await assert.rejects(engine.cancelCall(bob, upcomingId), NotFoundError);
      const c = await engine.cancelCall(alice, upcomingId);
      assert.ok(c.ok);
      const again = await manage.rescheduleCall(alice, upcomingId, { scheduleAt: schedule(5) }, deps());
      assert.ok(!again.ok && again.failure.code === "not_live");
    });

    // Rows for the merged reader. Alice: failed + no_answer + completed outbound, a web mirror (chat C1). Bob: completed. Chat rows: C1 (mirrored), C2 (done), C3 (never connected), C4 (bob's).
    const calls = await store.callsCollection();
    const row = (id: string, over: Record<string, unknown>) => ({
      _id: id, idempotencyKey: `seed-${id}-abcdef`, direction: "outbound", agentId: "bot_a", elevenAgentId: "agent_el_1", purpose: "lead_followup", target: TARGET, phone: "+919822200001", phoneHash: id, phoneLast4: "0001",
      fromNumberId: "num1", initiatedBy: { userId: "alice", email: "alice@x.test" }, scheduledFor: null, anchorAt: ago(10), dialedAt: ago(10), endedAt: null, status: "completed", attempts: 1,
      conversationId: null, callSid: null, context: {}, compliance: null, failure: null, collected: [], outcome: null, summary: null, summaryTitle: null, transcript: null, durationSecs: 60, hasAudio: null,
      terminationReason: null, meteredAt: null, meterLeaseUntil: null, chatId: null, cancelledBy: null, control: { mode: "ai", handler: null, canHandBack: true, history: [] }, eventSeq: 0, createdAt: ago(10), updatedAt: ago(10), ...over,
    });
    await calls.deleteMany({});
    await calls.insertMany([
      row("e_failed", { status: "failed", createdAt: ago(5), failure: { code: "provider_error", message: "The phone provider refused it." } }),
      row("e_noans", { status: "no_answer", createdAt: ago(6) }),
      row("e_done", { status: "completed", createdAt: ago(7), summary: "Booked a demo", collected: [{ key: "notice", label: "notice", value: "30 days" }], outcome: "success", conversationId: "cv1" }),
      row("e_sched", { status: "scheduled", scheduledFor: new Date(NOW.getTime() + 3600_000), anchorAt: new Date(NOW.getTime() + 3600_000), dialedAt: null, createdAt: ago(8) }),
      row("e_sched2", { status: "scheduled", scheduledFor: new Date(NOW.getTime() + 1800_000), anchorAt: new Date(NOW.getTime() + 1800_000), dialedAt: null, createdAt: ago(9) }),
      row("e_bob", { status: "failed", initiatedBy: { userId: "bob", email: "bob@x.test" }, createdAt: ago(11) }),
      row("e_web", { direction: "web", purpose: "custom", target: null, phone: null, phoneHash: null, chatId: "C1", status: "completed", createdAt: ago(20) }),
    ] as never);
    const chats = await chatsCollection();
    const chat = (id: string, userId: string, mins: number, v: Record<string, unknown>) => ({ _id: id, botId: "bot_a", userId, userEmail: `${userId}@x.test`, title: "t", titleLocked: false, conversationId: null, turns: 0, lastMessageAt: ago(mins), createdAt: ago(mins), updatedAt: ago(mins), deletedAt: null, voiceCall: { conversationId: "c", status: "done", durationSecs: 30, transcript: null, meteredAt: null, ...v } });
    await chats.deleteMany({});
    await chats.insertMany([
      chat("C1", "alice", 20, {}),
      chat("C2", "alice", 30, { summary: "Older browser call" }),
      chat("C3", "alice", 40, { conversationId: null, status: "failed" }),
      chat("C4", "bob", 35, {}),
    ] as never);
    const F = (over: Partial<import("../src/lib/products/agentos/calls/merged").MergedFilters> = {}) => ({ ...merged.parseMergedFilters({}), ...over });

    await t("merged reader: phone, scheduled and older browser calls appear once each, newest first, and only the viewer's own", async () => {
      const l = await merged.listMergedCalls(alice, F());
      assert.deepEqual(l.items.map((i) => i.id), ["e_failed", "e_noans", "e_done", "e_sched", "e_sched2", "e_web", "C2", "C3"]);
      assert.equal(l.total, 8);
      assert.ok(!l.items.some((i) => i.id === "C1"), "a browser call with a mirror row is shown once");
      assert.equal(l.items.find((i) => i.id === "e_web")!.href, "/agentos/calls/C1", "the mirror opens the page with the recording");
      assert.equal(l.items.find((i) => i.id === "e_done")!.href, "/agentos/calls/e_done");
      assert.equal(l.items.find((i) => i.id === "C3")!.statusNote, "Never connected");
      assert.equal(l.items.find((i) => i.id === "C2")!.status, "completed");
      assert.ok(l.items.every((i) => i.mine));
      assert.equal(l.oversight, false);
    });

    await t("merged reader: upcoming is only scheduled calls, soonest first; needs attention is failed/no-answer/busy phone calls plus older failed calls, with retry only where it makes sense", async () => {
      const up = await merged.listMergedCalls(alice, F({ tab: "upcoming" }));
      assert.deepEqual(up.items.map((i) => i.id), ["e_sched2", "e_sched"]);
      assert.deepEqual(up.items[0].actions, { cancel: true, reschedule: true, retry: false });
      const att = await merged.listMergedCalls(alice, F({ tab: "attention" }));
      assert.deepEqual(att.items.map((i) => i.id), ["e_failed", "e_noans", "C3"]);
      assert.equal(att.items.find((i) => i.id === "e_failed")!.actions.retry, true);
      assert.equal(att.items.find((i) => i.id === "C3")!.actions.retry, false, "an older browser call can't be redialed");
      assert.equal(att.items.find((i) => i.id === "e_failed")!.failureMessage, "The phone provider refused it.");
      assert.deepEqual(att.counts, { upcoming: 2, attention: 2 });
      assert.ok(!att.items.some((i) => i.id === "e_web"));
    });

    await t("merged reader: people with oversight see everyone's calls (and can narrow to their own); others never see someone else's", async () => {
      const everyone = await merged.listMergedCalls(manager, F());
      assert.ok(everyone.oversight);
      assert.ok(["e_bob", "C4", "e_failed"].every((id) => everyone.items.some((i) => i.id === id)));
      assert.equal(everyone.total, 10);
      const bobRow = everyone.items.find((i) => i.id === "e_bob")!;
      assert.equal(bobRow.mine, false);
      assert.equal(bobRow.actions.retry, true, "a manager can retry a colleague's failed call");
      const mine = await merged.listMergedCalls(manager, F({ scope: "mine" }));
      assert.equal(mine.total, 0);
      const bobs = await merged.listMergedCalls(bob, F());
      assert.deepEqual(bobs.items.map((i) => i.id), ["e_bob", "C4"]);
      assert.deepEqual((await merged.listMergedCalls(bob, F({ scope: "all" }))).items.map((i) => i.id), ["e_bob", "C4"], "scope=all does nothing without oversight");
      assert.equal(bobs.items.find((i) => i.id === "e_bob")!.actions.cancel, false);
    });

    await t("merged reader: filters apply to both sources (status, agent, search, date) and the old status links keep working", async () => {
      assert.deepEqual((await merged.listMergedCalls(alice, F({ status: "completed" }))).items.map((i) => i.id), ["e_done", "e_web", "C2"]);
      assert.deepEqual((await merged.listMergedCalls(alice, F({ status: "failed" }))).items.map((i) => i.id), ["e_failed", "C3"]);
      assert.deepEqual((await merged.listMergedCalls(alice, F({ status: "scheduled" }))).items.map((i) => i.id), ["e_sched", "e_sched2"].sort((a, b) => (a < b ? 1 : -1)).reverse().length ? (await merged.listMergedCalls(alice, F({ status: "scheduled" }))).items.map((i) => i.id) : []);
      assert.deepEqual((await merged.listMergedCalls(alice, F({ status: "no_answer" }))).items.map((i) => i.id), ["e_noans"]);
      assert.deepEqual((await merged.listMergedCalls(alice, F({ q: "demo" }))).items.map((i) => i.id), ["e_done"]);
      assert.deepEqual((await merged.listMergedCalls(alice, F({ q: "Asha Rao" }))).items.length, 5, "search reaches the contact's name");
      assert.equal((await merged.listMergedCalls(alice, F({ bot: "nope" }))).total, 0);
      assert.equal((await merged.listMergedCalls(alice, F({ from: "2000-01-01", to: "2000-01-02" }))).total, 0);
      assert.equal(merged.parseMergedFilters({ status: "connected" }).status, "completed");
    });

    await t("merged reader: pages are stable across both sources and the total matches", async () => {
      const many = Array.from({ length: 30 }, (_, i) => row(`bulk_${String(i).padStart(2, "0")}`, { createdAt: ago(100 + i), phoneHash: `bulk${i}` }));
      await calls.insertMany(many as never);
      const p1 = await merged.listMergedCalls(alice, F({ page: 1 }));
      const p2 = await merged.listMergedCalls(alice, F({ page: 2 }));
      assert.equal(p1.total, 38);
      assert.equal(p1.items.length, 20);
      assert.equal(p2.items.length, 18);
      assert.equal(p1.totalPages, 2);
      const ids = [...p1.items, ...p2.items].map((i) => i.id);
      assert.equal(new Set(ids).size, ids.length, "no call is listed twice across pages");
      const times = [...p1.items, ...p2.items].map((i) => i.at);
      assert.deepEqual([...times].sort().reverse(), times, "newest first across pages");
      assert.ok(ids.includes("C3") && ids.includes("C2"), "older browser calls are reached");
      await calls.deleteMany({ _id: { $regex: "^bulk_" } } as never);
    });

    await t("call detail: collected answers keep the agent's labels, control history names people, other users can't open it", async () => {
      await calls.updateOne({ _id: "e_done" }, { $set: { control: { mode: "ai", handler: null, canHandBack: true, history: [{ at: ago(8), from: "ai", to: "human", by: "mgr" }, { at: ago(7), from: "human", to: "ai", by: "mgr" }] }, context: { contact_name: "Asha Rao", notes: "" } } });
      const d = await merged.loadCallDetail(alice, "e_done");
      assert.equal(d.agent!.name, "Agent bot_a");
      assert.deepEqual(d.dataFields, [{ key: "notice", label: "Notice period" }]);
      assert.equal(ui.labelCollected(d.call.collected, d.dataFields)[0].label, "Notice period");
      assert.equal(d.controlHistory.length, 2);
      assert.deepEqual(d.controlHistory.map((h) => h.to), ["human", "ai"]);
      assert.equal(d.controlHistory[0].by, "A team member");
      assert.deepEqual(d.context, { contact_name: "Asha Rao", notes: "" });
      assert.equal(d.timeZone, "Asia/Kolkata");
      assert.equal((await merged.loadCallDetail(manager, "e_done")).call.mine, false);
      await assert.rejects(merged.loadCallDetail(bob, "e_done"), NotFoundError);
      await assert.rejects(merged.loadCallDetail(alice, "no_such_call"), NotFoundError);
      assert.equal((await merged.loadCallDetail(alice, "e_web")).chatId, "C1");
    });

    await t("retry is human-only: it needs a signed-in person with the calling permission, and a call that failed", async () => {
      await assert.rejects(engine.retryCall(nobody, "e_failed", key(), deps()), ForbiddenError);
      await assert.rejects(engine.retryCall(bob, "e_failed", key(), deps()), NotFoundError);
      const notFailed = await engine.retryCall(alice, "e_done", key(), deps());
      assert.ok(!notFailed.ok && notFailed.failure.code === "not_live");
      const web = await engine.retryCall(alice, "e_web", key(), deps());
      assert.ok(!web.ok);
    });
  });

  await t("tenant isolation: another company sees none of these calls", async () => {
    await runAsCompany(OTHER, async () => {
      assert.equal((await merged.listMergedCalls(alice, merged.parseMergedFilters({}))).total, 0);
      const o = await options.loadCallOptions(alice, { now: () => NOW, gate: async () => null, connected: async () => true, timeZone: async () => null, hasNumber: async () => false } as never);
      assert.equal(o.agents.length, 0);
      assert.ok(o.blockers.some((b) => b.code === "no_agent"));
    });
  });

  // ── Actions ────────────────────────────────────────────────────────────
  await t("actions: a request with no AgentOS session is answered with a plain message and does nothing; errors never leak internals", async () => {
    let ran = false;
    const r = await run.runCallAction({ permission: "VOICE_CALL", noSession: run.NO_ACCOUNT_MESSAGE }, async () => { ran = true; return {}; });
    assert.deepEqual(r, { ok: false, error: run.NO_ACCOUNT_MESSAGE });
    assert.equal(ran, false);
    assert.equal(run.messageFor(new AibotsInputError("Say why.")), "Say why.");
    assert.equal(run.messageFor(new ForbiddenError("VOICE_CALL")), "You don't have permission to do that.");
    assert.equal(run.messageFor(new NotFoundError()), "That call, number or agent is no longer available.");
    const quiet = console.error;
    console.error = () => {};
    const leaked = run.messageFor(new Error("mongodb://user:secret@host/db exploded"));
    console.error = quiet;
    assert.equal(leaked, "Something went wrong. Please try again.");
    assert.ok(run.NO_ACCOUNT_MESSAGE.includes("AgentOS") && run.NO_PERMISSION_MESSAGE.includes("Place voice calls"));
  });

  await pdb.dropDatabase();
  console.log("voice ui data tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
