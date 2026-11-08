import assert from "node:assert/strict";

// Security regressions of the voice calling system. Throwaway database only (MONGODB_URI=…/zz_throwaway_*); no network, no real call.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
process.env.SECURITY_STRICT = "1"; // the front door as production runs it
delete process.env.VERCEL;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };

(async () => {
  const { NextRequest } = await import("next/server");
  const { classify, gateApi } = await import("../src/lib/security/gate");
  const { clientIpFrom, fromForwardedFor, trustedProxyHops } = await import("../src/lib/security/ip");
  const phone = await import("../src/lib/products/agentos/calls/phone");
  const notices = await import("../src/lib/products/agentos/calls/notices");
  const tw = await import("../src/lib/products/agentos/calls/conference-twilio");
  const el = await import("../src/lib/products/agentos/voice/elevenlabs-agent");
  const store = await import("../src/lib/products/agentos/calls/store");
  const dnc = await import("../src/lib/products/agentos/calls/dnc");
  const integ = await import("../src/lib/products/agentos/calls/integrations");
  const engine = await import("../src/lib/products/agentos/calls/engine");
  const { getDb, getPlatformDb } = await import("../src/lib/mongodb");
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  type Viewer = import("../src/lib/products/agentos/viewer").AibotsViewer;

  // ── 1. The front door lets Twilio and ElevenLabs through to their handlers (and nothing else) ─────────────────────────────────────────
  const HOST = "demo.localhost:3000";
  const door = async (path: string, headers: Record<string, string>, method = "POST") => (await gateApi(new NextRequest(`http://${HOST}${path}`, { method, headers }), HOST, "co_x", false))?.status ?? 200;
  const twilio = { "user-agent": "TwilioProxy/1.1", "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "abc=" };
  const browser = { origin: `http://${HOST}`, "sec-fetch-site": "same-origin", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "content-type": "application/json" };
  const eleven = { "user-agent": "python-httpx/0.27", "content-type": "application/json", "elevenlabs-signature": "t=1,v0=abc" };

  await t("gate: the Twilio callbacks and the ElevenLabs webhook are machine routes, POST only", () => {
    for (const p of ["/api/agentos/twilio/voice", "/api/agentos/twilio/status", "/api/agentos/twilio/transcription", "/api/agentos/voice/webhook"]) {
      assert.equal(classify(p, "POST"), "machine", p);
      assert.equal(classify(p, "GET"), "session", `${p} by GET is not opened`);
    }
  });

  await t("gate: with their signature header they reach the handler; without one, or from a script posing as a browser session, they do not", async () => {
    for (const p of ["/api/agentos/twilio/voice", "/api/agentos/twilio/status", "/api/agentos/twilio/transcription"]) {
      assert.equal(await door(p, twilio), 200, p);
      assert.equal(await door(p, { "user-agent": twilio["user-agent"], "content-type": twilio["content-type"] }), 403, `${p} unsigned`);
    }
    assert.equal(await door("/api/agentos/voice/webhook", eleven), 200);
    assert.equal(await door("/api/agentos/voice/webhook", { "user-agent": "x", "content-type": "application/json" }), 403, "unsigned");
  });

  await t("gate: body size limits stay (64 KB for Twilio, 5 MB for the ElevenLabs post-call webhook)", async () => {
    assert.equal(await door("/api/agentos/twilio/voice", { ...twilio, "content-length": String(64 * 1024 + 1) }), 413);
    assert.equal(await door("/api/agentos/twilio/voice", { ...twilio, "content-length": "2000" }), 200);
    assert.equal(await door("/api/agentos/voice/webhook", { ...eleven, "content-length": String(5_000_001) }), 413);
    assert.equal(await door("/api/agentos/voice/webhook", { ...eleven, "content-length": "900000" }), 200);
  });

  await t("gate: nothing else under /api/agentos is opened (calls, audio, chat, bots, cron lookalikes, other Twilio paths)", async () => {
    for (const p of ["/api/agentos/calls/abc/audio", "/api/agentos/chat", "/api/agentos/bots/b1/files", "/api/agentos/twilio/other", "/api/agentos/twilio/voice/extra", "/api/agentos/voice/other", "/api/agentos/voice/webhook/x"]) {
      assert.equal(classify(p, "POST"), "session", p);
      assert.equal(await door(p, browser), 401, `${p} still needs a session`);
      assert.equal(await door(p, twilio), 403, `${p}: a signature header does not open it`);
    }
  });

  // ── 2. Client address: explicit trust ─────────────────────────────────────────────────────────────────────────────────────────────────
  await t("client IP: x-real-ip and cf-connecting-ip are not believed by default; the right-most x-forwarded-for entry is (1 proxy)", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    assert.equal(clientIpFrom(h({ "x-real-ip": "6.6.6.6", "x-forwarded-for": "9.9.9.9, 203.0.113.7" }), {}), "203.0.113.7");
    assert.equal(clientIpFrom(h({ "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "203.0.113.7" }), {}), "203.0.113.7");
    assert.equal(clientIpFrom(h({ "x-real-ip": "6.6.6.6" }), {}), "unknown", "no trusted header at all: one shared bucket, not the caller's claim");
    assert.equal(clientIpFrom(h({ "x-vercel-forwarded-for": "6.6.6.6", "x-forwarded-for": "203.0.113.7" }), {}), "203.0.113.7", "off Vercel the platform header is just another header");
  });

  await t("client IP: Vercel's header, Cloudflare only when TRUST_CLOUDFLARE=1, and TRUSTED_PROXY_HOPS counts proxies from the right", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    assert.equal(clientIpFrom(h({ "x-vercel-forwarded-for": "198.51.100.4", "x-forwarded-for": "1.1.1.1" }), { VERCEL: "1" }), "198.51.100.4");
    assert.equal(clientIpFrom(h({ "cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), { TRUST_CLOUDFLARE: "1" }), "198.51.100.9");
    assert.equal(clientIpFrom(h({ "cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), { TRUST_CLOUDFLARE: "0" }), "2.2.2.2");
    assert.equal(clientIpFrom(h({ "x-forwarded-for": "evil, 1.1.1.1, 2.2.2.2" }), { TRUSTED_PROXY_HOPS: "2" }), "1.1.1.1");
    assert.equal(clientIpFrom(h({ "x-forwarded-for": "evil, 1.1.1.1, 2.2.2.2" }), { TRUSTED_PROXY_HOPS: "0" }), "unknown", "no proxy in front: forwarding headers are ignored");
    assert.equal(fromForwardedFor("only-one", 3), "only-one", "fewer entries than hops: the oldest entry, never out of range");
    assert.equal(fromForwardedFor("", 1), "unknown");
    assert.equal(trustedProxyHops(undefined), 1);
    assert.equal(trustedProxyHops("3"), 3);
    for (const bad of ["-1", "x", "99", "1.5", ""]) assert.equal(trustedProxyHops(bad), 1, bad);
  });

  // ── 3. Masking, notices, opening words ────────────────────────────────────────────────────────────────────────────────────────────────
  await t("PII: phone numbers are masked in provider/Twilio error text and logs; URL secrets are redacted", async () => {
    assert.equal(phone.maskPhonesInText("The 'To' number +919876543210 is not valid"), "The 'To' number +91••••3210 is not valid");
    assert.equal(phone.maskPhonesInText("bad number 98765 43210 and 12"), "bad number ••••3210 and 12");
    assert.ok(!phone.logText(new Error("failed for +919876543210 at https://x.test/api/agentos/twilio/voice?t=SECRETTOKEN&c=1")).match(/9876543210|SECRETTOKEN/));
    const fetchFake = (async () => new Response(JSON.stringify({ message: "Invalid To +919876543210", code: 21211 }), { status: 400, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const rest = tw.createTwilioRest({ accountSid: "AC" + "1".repeat(32), authToken: "tok" }, fetchFake);
    await assert.rejects(rest.createCall({ to: "+919876543210", from: "+911234567890", url: "https://x", statusCallback: "https://x", timeoutSecs: 30 }), (e: unknown) => e instanceof tw.TwilioError && !/9876543210/.test(e.message) && /3210/.test(e.message));
    const elFetch = (async () => new Response(JSON.stringify({ detail: { message: "number +919876543210 is blocked" } }), { status: 400, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const client = el.createAgentClient({ apiKey: "sk_x", fetch: elFetch });
    await assert.rejects(client.outboundCall({ agentId: "a", phoneNumberId: "p", toNumber: "+919876543210" }), (e: unknown) => e instanceof Error && !/9876543210/.test(e.message));
  });

  await t("notices: English and Hindi by the agent's language; opening = recording notice + disclosure + greeting, only what is on", () => {
    assert.equal(notices.noticeLanguage("hi"), "hi");
    assert.equal(notices.noticeLanguage("hi-IN"), "hi");
    assert.equal(notices.noticeLanguage("en"), "en");
    assert.equal(notices.noticeLanguage("fr"), "en");
    assert.match(notices.RECORDING_NOTICE.hi, /रिकॉर्ड/);
    assert.match(notices.announcementText("joined", "en"), /A team member has joined the call/);
    assert.match(notices.announcementText("took_over", "hi"), /कॉल/);
    const base = { language: "en", disclosureLine: "I am an AI assistant.", firstMessage: "Hello Asha!" };
    assert.equal(notices.composeOpening({ ...base, recordingNotice: false, requireDisclosure: true }), "I am an AI assistant. Hello Asha!");
    assert.match(notices.composeOpening({ ...base, recordingNotice: true, requireDisclosure: true })!, /^This call may be recorded.* I am an AI assistant\. Hello Asha!$/);
    assert.match(notices.composeOpening({ ...base, language: "hi", recordingNotice: true, requireDisclosure: false })!, /^यह कॉल रिकॉर्ड.* Hello Asha!$/);
    assert.equal(notices.composeOpening({ ...base, recordingNotice: false, requireDisclosure: false }), null, "nothing to say: the agent keeps its own greeting");
    assert.equal(notices.composeOpening({ ...base, disclosureLine: "  ", recordingNotice: false, requireDisclosure: true }), null);
  });

  await t("TwiML: the recording notice is a <Say> before the lead joins the AI (in the call's language); the announcement is a <Say> for the lead only; first-message override only when given", () => {
    const withNotice = tw.leadConferenceTwiml({ name: "sr-x", statusUrl: "https://a/s", transcription: null, notice: { text: notices.RECORDING_NOTICE.hi, languageCode: "hi-IN" } });
    assert.match(withNotice, /^<\?xml[^>]*\?><Response><Say language="hi-IN">[^<]*रिकॉर्ड[^<]*<\/Say><Dial>/);
    const without = tw.leadConferenceTwiml({ name: "sr-x", statusUrl: "https://a/s", transcription: null });
    assert.doesNotMatch(without, /<Say/);
    assert.match(tw.announcementTwiml(notices.announcementText("joined", "en"), "en-IN"), /<Say language="en-IN">A team member has joined the call\.<\/Say>/);
    assert.match(tw.announcementTwiml("x", "multi"), /<Say>x<\/Say>/);
    assert.deepEqual(el.openingOverride({ a: "b" }, null), { dynamic_variables: { a: "b" } });
    assert.deepEqual(el.openingOverride(undefined, "Hi"), { dynamic_variables: {}, conversation_config_override: { agent: { first_message: "Hi" } } });
  });

  // ── 4. Indexes are created before anything is inserted ────────────────────────────────────────────────────────────────────────────────
  await t("indexes: marked done only after creation succeeded; a failed unique index stops the caller and is retried", async () => {
    let fail = true;
    const created: string[] = [];
    const fakeDb = { collection: (c: string) => ({ createIndex: async (keys: Record<string, number>, o?: { unique?: boolean }) => { const k = `${c}:${Object.keys(keys)[0]}${o?.unique ? ":unique" : ""}`; if (fail && k === "agentos_calls:idempotencyKey:unique") throw new Error("boom"); created.push(k); } }) };
    store.setIndexDbForTest(async () => fakeDb as never);
    const quiet = console.error; const logged: string[] = [];
    console.error = (...a: unknown[]) => { logged.push(a.join(" ")); };
    try {
      await assert.rejects(store.ensureCallIndexes(), /boom/);
      assert.equal(store.callIndexesReady(), false, "not marked done: the unique idempotency index does not exist yet");
      assert.ok(logged.some((l) => /idempotency index failed/.test(l)), "the failure is surfaced in the log");
      fail = false;
      await store.ensureCallIndexes();
      assert.equal(store.callIndexesReady(), true);
      assert.ok(created.includes("agentos_calls:idempotencyKey:unique"));
      const n = created.length;
      await store.ensureCallIndexes();
      assert.equal(created.length, n, "done means done: no more calls");
      // concurrent first calls share one attempt
      store.setIndexDbForTest(async () => fakeDb as never);
      created.length = 0;
      await Promise.all([store.ensureCallIndexes(), store.ensureCallIndexes(), store.ensureCallIndexes()]);
      assert.equal(created.filter((k) => k === "agentos_calls:idempotencyKey:unique").length, 1);
    } finally {
      console.error = quiet;
      store.setIndexDbForTest(null);
    }
  });

  // ── Database-backed ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const pdb = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(pdb.databaseName), "refusing to run on a non-throwaway database");
  await pdb.dropDatabase();
  store.resetCallIndexes();
  const CO = "co_sec";
  await pdb.collection("companies").insertOne({ _id: CO as never, slug: CO, name: "Sec Works", status: "active", isPlatformOwner: false, timezone: "Asia/Kolkata", createdAt: new Date(), updatedAt: new Date() });

  const viewer = (userId: string, roles: string[]): Viewer => ({ userId, email: `${userId}@x.test`, roles, ctx: { roles, permissionOverrides: undefined } as Viewer["ctx"], seesAll: false });
  const caller = viewer("caller", ["aibots_user"]); // may place calls (VOICE_CALL) and nothing else
  const hr = viewer("hr", ["aibots_user", "hr"]);
  const pmsManager = viewer("pm", ["aibots_user", "pms_manager"]);
  const lmsAgent = viewer("lms_agent", ["aibots_user", "lms_agent"]);
  const lmsManager = viewer("lms_mgr", ["aibots_user", "lms_manager"]);
  const silent = console.error;

  await runAsCompany(CO, async () => {
    const db = await getDb();
    assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");

    await t("do-not-contact fails closed: an empty provider registry is an error, not 'nobody objects'", async () => {
      dnc.clearDoNotContactProviders();
      console.error = () => {};
      const r = await dnc.checkProviders({ phone: "+919876543210", target: null });
      console.error = silent;
      assert.deepEqual(r, { blocked: null, error: "none-registered" });
      dnc.registerDoNotContactProvider("x", async () => false);
      assert.deepEqual(await dnc.checkProviders({ phone: "+919876543210", target: null }), { blocked: null, error: null });
      dnc.clearDoNotContactProviders();
    });

    await t("integrations: loaded once and awaited; a failed load is retried and every dependent step refuses", async () => {
      let loads = 0;
      let failing = true;
      integ.setIntegrationsLoaderForTest(async () => { loads++; if (failing) throw new Error("import failed"); });
      console.error = () => {};
      await assert.rejects(integ.ensureIntegrations(), /import failed/);
      await assert.rejects(integ.ensureIntegrations(), /import failed/); // retried, not cached as a success
      assert.equal(loads, 2);
      assert.equal(await integ.authorizeTarget(caller, { product: "talentos", entityType: "applicant", entityId: "x", label: "x" }), false, "authorization fails closed when the products could not be loaded");
      console.error = silent;
      failing = false;
      assert.equal(loads, 3, "authorizeTarget tried to load too (and failed)");
      await integ.ensureIntegrations();
      await integ.ensureIntegrations();
      assert.equal(loads, 4, "one successful load per process");
      // The real loader registers every product: do-not-contact, target authorizers, settled handlers.
      integ.setIntegrationsLoaderForTest(null);
      dnc.clearDoNotContactProviders();
      await integ.ensureIntegrations();
      const probe = await dnc.checkProviders({ phone: "+919000000123", target: null });
      assert.deepEqual(probe, { blocked: null, error: null }, "talentos, sprintos and dealflow-ai providers are all registered and answering");
    });

    // --- records the tests target --------------------------------------------------------------------------------------------------------
    const { ObjectId } = await import("mongodb");
    const appId = new ObjectId();
    await db.collection("career_applications").insertOne({ _id: appId, name: "Asha", email: "a@x.test", phone: "+91 98765 43210", positionTitle: "Engineer", status: "new", createdAt: new Date() } as never);
    await db.collection("pms_projects").insertOne({ _id: "proj1", name: "Portal", clientId: "cli1", deletedAt: null } as never);
    await db.collection("pms_clients").insertOne({ _id: "cli1", name: "Acme", primaryContact: { name: "Ravi", phone: "+91 90000 11111" }, doNotContact: false, deletedAt: null } as never);
    await db.collection("lead_records").insertOne({ _id: "lead1", name: "Priya", phone: "+91 98111 22233", type: "client", stage: "inquiry", status: "open", doNotContact: false, deletedAt: null, applicationId: null, createdAt: new Date() } as never);

    const target = (product: string, entityType: string, entityId: string) => ({ product, entityType, entityId, label: "x" });
    const can = (v: Viewer, tg: ReturnType<typeof target>) => integ.authorizeTarget(v, tg);

    await t("target authorizers: default deny for an unknown product, a record that does not exist, or a person without the product's right", async () => {
      assert.equal(await can(hr, target("nobody-registered", "thing", "1")), false, "unknown product");
      // TalentOS: HR (may manage employees) only
      assert.equal(await can(hr, target("talentos", "applicant", String(appId))), true);
      assert.equal(await can(caller, target("talentos", "applicant", String(appId))), false, "no HR right");
      assert.equal(await can(pmsManager, target("talentos", "applicant", String(appId))), false, "another product's manager");
      assert.equal(await can(hr, target("talentos", "applicant", String(new ObjectId()))), false, "no such applicant");
      assert.equal(await can(hr, target("talentos", "applicant", "not-an-id")), false);
      assert.equal(await can(hr, target("talentos", "employee", String(appId))), false, "only applicants");
      // SprintOS: project managers
      assert.equal(await can(pmsManager, target("sprintos", "project", "proj1")), true);
      assert.equal(await can(pmsManager, target("sprintos", "client", "cli1")), true);
      assert.equal(await can(caller, target("sprintos", "project", "proj1")), false);
      assert.equal(await can(hr, target("sprintos", "project", "proj1")), false);
      assert.equal(await can(pmsManager, target("sprintos", "project", "nope")), false);
      await db.collection("pms_projects").updateOne({ _id: "proj1" } as never, { $set: { deletedAt: new Date() } });
      assert.equal(await can(pmsManager, target("sprintos", "project", "proj1")), false, "a deleted project");
      await db.collection("pms_projects").updateOne({ _id: "proj1" } as never, { $set: { deletedAt: null } });
      // DealFlow: leads need VIEW_LEADS, applicants VIEW_CAREERS
      assert.equal(await can(lmsAgent, target("dealflow-ai", "lead", "lead1")), true);
      assert.equal(await can(caller, target("dealflow-ai", "lead", "lead1")), false);
      assert.equal(await can(lmsAgent, target("dealflow-ai", "applicant", String(appId))), false, "agents cannot see careers");
      assert.equal(await can(lmsManager, target("dealflow-ai", "applicant", String(appId))), true);
      assert.equal(await can(lmsAgent, target("dealflow-ai", "lead", "ghost")), false);
      assert.equal(await can(lmsManager, target("dealflow-ai", "mystery", "lead1")), false);
    });

    await t("requestCall: a user without the product's rights cannot target its records (nothing is created, nothing dialed)", async () => {
      const calls = await store.callsCollection();
      let n = 0;
      const ask = (v: Viewer, tg: ReturnType<typeof target>) => engine.requestCall(v, { agentId: "bot", purpose: "lead_followup", target: tg, phone: "+919876543210", idempotencyKey: `sec-key-${++n}-abcdef` }, { gate: async () => null, connected: async () => true, timeZone: async () => "Asia/Kolkata" });
      for (const [v, tg] of [[caller, target("talentos", "applicant", String(appId))], [caller, target("sprintos", "project", "proj1")], [caller, target("dealflow-ai", "lead", "lead1")], [caller, target("made-up", "x", "1")]] as const) {
        const r = await ask(v, tg);
        assert.ok(!r.ok && r.failure.code === "target_forbidden", JSON.stringify(r));
      }
      assert.equal(await calls.countDocuments({}), 0);
      // With the right the request goes on to the next guard (calling countries are not configured in this test): proof the authorizer let it through.
      const r = await ask(hr, target("talentos", "applicant", String(appId)));
      assert.ok(!r.ok && r.failure.code === "countries_not_configured", JSON.stringify(r));
    });

    await t("settled handlers verify the record still exists and write nothing for a deleted one", async () => {
      const { writeBackApplicantCall } = await import("../src/lib/products/talentos/calls");
      const { writeBackProjectCall } = await import("../src/lib/products/sprintos/calls");
      const { recordDealflowCall, listCallResults } = await import("../src/lib/dealflow-ai/call-results");
      const mk = (id: string, tg: ReturnType<typeof target>) => ({
        _id: id, idempotencyKey: `k-${id}-xxxxxxxx`, direction: "outbound", agentId: "a", elevenAgentId: "e", purpose: "screening", target: tg, phone: "+919876543210", phoneHash: "h", phoneLast4: "3210",
        fromNumberId: null, initiatedBy: { userId: "u", email: "u@x.test" }, scheduledFor: null, anchorAt: new Date(), dialedAt: new Date(), endedAt: new Date(), status: "completed", attempts: 1, conversationId: null,
        callSid: null, context: {}, compliance: null, failure: null, collected: [], outcome: "success", summary: "ok", summaryTitle: null, transcript: null, durationSecs: 30, hasAudio: null, terminationReason: null,
        meteredAt: null, meterLeaseUntil: null, chatId: null, cancelledBy: null, control: { mode: "ai", handler: null, canHandBack: true, history: [] }, eventSeq: 0, createdAt: new Date(), updatedAt: new Date(),
      }) as never;
      assert.equal(await writeBackApplicantCall(mk("w1", target("talentos", "applicant", String(appId)))), true);
      assert.equal(await writeBackApplicantCall(mk("w2", target("talentos", "applicant", String(new ObjectId())))), false);
      assert.equal(await writeBackProjectCall(mk("w3", target("sprintos", "project", "proj1"))), true);
      assert.equal(await writeBackProjectCall(mk("w4", target("sprintos", "project", "gone"))), false);
      assert.equal(await writeBackProjectCall(mk("w5", target("sprintos", "client", "gone"))), false);
      assert.equal(await recordDealflowCall(mk("w6", target("dealflow-ai", "lead", "lead1"))), true);
      assert.equal(await recordDealflowCall(mk("w7", target("dealflow-ai", "lead", "ghost"))), false);
      assert.equal(await recordDealflowCall(mk("w8", target("dealflow-ai", "submission", "bogus"))), false);
      assert.equal((await listCallResults("lead", "ghost")).length, 0);
      await db.collection("lead_records").updateOne({ _id: "lead1" } as never, { $set: { deletedAt: new Date() } });
      assert.equal(await recordDealflowCall(mk("w9", target("dealflow-ai", "lead", "lead1"))), false, "a soft-deleted lead");
    });

    await t("do-not-contact by number is exact at any scale (no cap on flagged rows): TalentOS and SprintOS", async () => {
      const apps = db.collection("career_applications");
      const clients = db.collection("pms_clients");
      const filler = Array.from({ length: 5600 }, (_, i) => ({ name: `F${i}`, phone: `+91 7${String(i).padStart(9, "0")}`, doNotContact: true, createdAt: new Date() }));
      await apps.insertMany(filler.map((f) => ({ ...f })) as never[]);
      await clients.insertMany(filler.map((f, i) => ({ _id: `fc${i}`, name: f.name, primaryContact: { phone: f.phone }, doNotContact: true, deletedAt: null })) as never[]);
      // the one that matters is inserted last, in a different written format
      await apps.insertOne({ name: "Late", phone: "098765-00099", doNotContact: true, createdAt: new Date() } as never);
      await clients.insertOne({ _id: "late-client", name: "Late", primaryContact: { phone: "(+91) 91234 00088" }, doNotContact: true, deletedAt: null } as never);
      const ask = (p: string) => dnc.checkProviders({ phone: p, target: null });
      assert.equal((await ask("+919876500099")).blocked, "talentos");
      assert.equal((await ask("+919123400088")).blocked, "sprintos");
      assert.equal((await ask("+917000000007")).blocked, "talentos", "a filler row is found too");
      assert.deepEqual(await ask("+919876500098"), { blocked: null, error: null }, "one digit off is not a match");
      assert.deepEqual(await ask("+919123400089"), { blocked: null, error: null });
      assert.deepEqual(await ask("+14155550123"), { blocked: null, error: null });
    });
  });

  console.log("voice security tests passed");
  process.exit(0);
})().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
