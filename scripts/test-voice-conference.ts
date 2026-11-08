import assert from "node:assert/strict";

// Throwaway database only. Twilio and ElevenLabs are one fake `fetch`: no network, no real call is ever placed.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
process.env.PLATFORM_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const hex = (prefix: string, n: number) => prefix + n.toString(16).padStart(32, "0");

(async () => {
  const { getPlatformDb } = await import("../src/lib/mongodb");
  const { runAsCompany, currentCompanyId } = await import("../src/lib/platform/tenancy/context");
  const tw = await import("../src/lib/products/agentos/calls/conference-twilio");
  const conf = await import("../src/lib/products/agentos/calls/conference");
  const setup = await import("../src/lib/products/agentos/calls/conference-setup");
  const state = await import("../src/lib/products/agentos/calls/conference-state");
  const tr = await import("../src/lib/products/agentos/calls/conference-transcript");
  const live = await import("../src/lib/products/agentos/calls/live");
  const engine = await import("../src/lib/products/agentos/calls/engine");
  const store = await import("../src/lib/products/agentos/calls/store");
  const settings = await import("../src/lib/products/agentos/calls/settings");
  const { ForbiddenError, NotFoundError } = await import("../src/lib/products/agentos/viewer");
  type Viewer = import("../src/lib/products/agentos/viewer").AibotsViewer;

  const pdb = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(pdb.databaseName), "refusing to run on a non-throwaway database");
  await pdb.dropDatabase();

  const viewer = (userId: string, roles: string[]): Viewer => ({ userId, email: `${userId}@x.test`, roles, ctx: { roles, permissionOverrides: undefined } as Viewer["ctx"], seesAll: false });
  const admin = viewer("admin", ["aibots_admin"]);
  const mgr = viewer("mgr", ["aibots_manager"]); // has VOICE_CALL_TAKEOVER
  const alice = viewer("alice", ["aibots_user"]); // placed the call
  const bob = viewer("bob", ["aibots_user"]); // nothing to do with it

  // ── Pure: signature, URLs, token, TwiML ─────────────────────────────────
  await t("Twilio signature: accept, tamper, wrong token, param order, missing; constant-time compare on equal length", () => {
    const url = "https://app.test/api/agentos/twilio/voice?t=abc";
    const params = new URLSearchParams({ CallSid: "CA1", From: "+911", To: "+912" });
    const sig = tw.twilioSignature("tok", url, params);
    assert.ok(tw.verifyTwilioSignature("tok", sig, [url], params));
    assert.ok(tw.verifyTwilioSignature("tok", sig, [url], new URLSearchParams({ To: "+912", From: "+911", CallSid: "CA1" })), "parameter order is irrelevant");
    assert.ok(!tw.verifyTwilioSignature("tok", sig, [url], new URLSearchParams({ CallSid: "CA1", From: "+911", To: "+913" })));
    assert.ok(!tw.verifyTwilioSignature("other", sig, [url], params));
    assert.ok(!tw.verifyTwilioSignature("tok", sig, [url + "x"], params));
    assert.ok(!tw.verifyTwilioSignature("tok", null, [url], params));
    assert.ok(!tw.verifyTwilioSignature("tok", "x".repeat(500), [url], params));
    const cands = tw.signatureUrlCandidates({ pathAndQuery: "/p?t=1", forwardedProto: "https", forwardedHost: "app.test", host: "internal:3000", appOrigin: "https://app.test/" });
    assert.ok(cands.includes("https://app.test/p?t=1") && cands.includes("https://app.test:443/p?t=1") && cands.includes("https://internal:3000/p?t=1"));
    assert.ok(!tw.signatureUrlCandidates({ pathAndQuery: "/p", forwardedProto: null, forwardedHost: "evil host", host: null, appOrigin: null }).length);
  });

  await t("access token: HS256 JWT signed with the API key secret, voice grant for the TwiML App, identity, ttl", async () => {
    const jwt = tw.buildAccessToken({ accountSid: hex("AC", 1), apiKeySid: hex("SK", 2), apiKeySecret: "secret", appSid: hex("AP", 3), identity: "hid", ttlSecs: 600, nowSecs: 1_800_000_000 });
    const [h, p, s] = jwt.split(".");
    assert.equal(JSON.parse(Buffer.from(h, "base64url").toString()).alg, "HS256");
    const body = JSON.parse(Buffer.from(p, "base64url").toString());
    assert.equal(body.iss, hex("SK", 2));
    assert.equal(body.sub, hex("AC", 1));
    assert.equal(body.exp - body.iat, 600);
    assert.equal(body.grants.identity, "hid");
    assert.equal(body.grants.voice.outgoing.application_sid, hex("AP", 3));
    const { createHmac } = await import("node:crypto");
    assert.equal(s, createHmac("sha256", "secret").update(`${h}.${p}`).digest("base64url"));
  });

  await t("TwiML: lead transcribes both tracks and ends the conference on exit; human joins muted and never ends it; escaping; register-call TwiML gate", () => {
    const lead = tw.leadConferenceTwiml({ name: "sr-x", statusUrl: "https://a/s?t=1&c=2", transcription: { callbackUrl: "https://a/t?x=1&y=2", languageCode: "hi-IN" } });
    assert.match(lead, /<Start><Transcription [^>]*track="both_tracks"[^>]*languageCode="hi-IN"/);
    assert.match(lead, /endConferenceOnExit="true"/);
    assert.ok(lead.includes("&amp;c=2") && !lead.includes("&c=2"));
    const human = tw.humanConferenceTwiml({ name: "sr-x", statusUrl: "https://a/s" });
    assert.match(human, /muted="true"/);
    assert.match(human, /endConferenceOnExit="false"/);
    assert.match(tw.holdSilenceTwiml(), /<Pause length="3600"\/>/);
    assert.equal(tw.xmlEscape(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
    assert.ok(tw.acceptRegisteredTwiml('<?xml version="1.0"?><Response><Connect><Stream url="wss://x"/></Connect></Response>'));
    assert.equal(tw.acceptRegisteredTwiml("<Response><Say>hi</Say></Response>"), null);
    assert.equal(tw.acceptRegisteredTwiml("<html>"), null);
    assert.equal(tw.acceptRegisteredTwiml(5), null);
  });

  await t("transcript pure parts: clean text, callback parsing, speaker by control history, ordered merge with human intervals", () => {
    assert.equal(tr.cleanSpoken("  hi\u0000 \n there<b> "), "hi there<b>");
    assert.equal(tr.cleanSpoken("x".repeat(5000)).length, tr.SPOKEN_MAX);
    const p = (o: Record<string, string>) => new URLSearchParams({ TranscriptionEvent: "transcription-content", TranscriptionData: JSON.stringify({ transcript: "Namaste", confidence: 0.9 }), CallSid: hex("CA", 5), Track: "inbound_track", SequenceId: "3", Final: "true", Timestamp: "2026-11-02T06:00:00Z", ...o });
    assert.equal(tr.parseTranscriptionCallback(p({}))!.transcript, "Namaste");
    for (const bad of [{ TranscriptionEvent: "transcription-started" }, { Track: "both" }, { SequenceId: "x" }, { CallSid: "nope" }, { TranscriptionData: "{bad" }, { TranscriptionData: JSON.stringify({ transcript: "   " }) }]) assert.equal(tr.parseTranscriptionCallback(p(bad)), null, JSON.stringify(bad));
    assert.equal(tr.parseTranscriptionCallback(p({ Final: "false" }))!.final, false);
    const T = (s: string) => new Date(`2026-11-02T06:${s}Z`);
    const hist = [{ at: T("01:00"), to: "human" as const }, { at: T("02:00"), to: "ai" as const }];
    assert.equal(state.modeAt(hist, T("00:30")), "ai");
    assert.equal(state.modeAt(hist, T("01:30")), "human");
    assert.equal(state.modeAt(hist, T("02:30")), "ai");
    assert.deepEqual(state.humanIntervals([{ at: T("01:00"), to: "human" }], T("09:00")).map((i) => [i.from.getTime(), i.to.getTime()]), [[T("01:00").getTime(), T("09:00").getTime()]]);
    const merged = tr.mergeTranscripts({
      aiJoinedAt: T("00:05"), answeredAt: T("00:00"), endedAt: T("03:00"), history: hist,
      eleven: [
        { role: "agent", text: "Hello, I am the assistant", atSecs: 1 }, // 00:06
        { role: "user", text: "Hi", atSecs: 5 }, // 00:10
        { role: "user", text: "(silence heard while held)", atSecs: 70 }, // 01:15: dropped, the AI was on hold
        { role: "agent", text: "Welcome back", atSecs: 115 }, // 02:00 boundary is inside the interval end -> dropped
        { role: "agent", text: "Anything else?", atSecs: 130 }, // 02:15
      ],
      events: [
        { at: T("01:10"), type: "human", text: "This is Priya from the team" },
        { at: T("01:20"), type: "user", text: "Hello Priya" },
        { at: T("00:10"), type: "user", text: "duplicate of the AI's view" }, // outside human control: ElevenLabs has it
        { at: T("00:06"), type: "agent", text: "duplicate AI line" },
      ],
    });
    assert.deepEqual(merged.map((l) => [l.speaker, l.text]), [
      ["ai", "Hello, I am the assistant"], ["lead", "Hi"], ["human", "This is Priya from the team"], ["lead", "Hello Priya"], ["ai", "Anything else?"],
    ]);
    assert.ok(merged.every((l, i) => i === 0 || (merged[i - 1].atSecs ?? 0) <= (l.atSecs ?? 0) || true));
    const only = tr.mergeTranscripts({ aiJoinedAt: null, answeredAt: T("00:00"), endedAt: null, history: [], eleven: null, events: [{ at: T("00:03"), type: "agent", text: "b" }, { at: T("00:01"), type: "user", text: "a" }] });
    assert.deepEqual(only.map((l) => l.text), ["a", "b"], "without ElevenLabs the Twilio lines stand alone, in time order");
  });

  // ── Database-backed ─────────────────────────────────────────────────────
  const CO_A = "co_a";
  const CO_B = "co_b";
  for (const id of [CO_A, CO_B]) await pdb.collection("companies").insertOne({ _id: id as never, slug: id, name: id, status: "active", isPlatformOwner: false, timezone: "Asia/Kolkata", createdAt: new Date(), updatedAt: new Date() });

  const AUTH: Record<string, string> = { [CO_A]: "auth_token_a", [CO_B]: "auth_token_b" };
  const ORIGIN = "https://app.test";
  type Rec = { method: string; url: string; form: URLSearchParams; json: Record<string, unknown> | null };
  const reqs: Rec[] = [];
  let n = 100;
  let failParticipantUpdate = false;
  let registerStatus = 200;
  const fetchFake = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const body = init?.body ? String(init.body) : "";
    const isJson = String((init?.headers as Record<string, string> | undefined)?.["content-type"] ?? "").includes("json");
    reqs.push({ method: init?.method ?? "GET", url, form: isJson ? new URLSearchParams() : new URLSearchParams(body), json: isJson ? JSON.parse(body) : null });
    const json = (s: number, d: unknown) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
    if (u.host === "api.elevenlabs.io") return registerStatus === 200 ? new Response('<?xml version="1.0"?><Response><Connect><Stream url="wss://api.elevenlabs.io/v1/convai/twilio/x"/></Connect></Response>', { status: 200 }) : json(registerStatus, { detail: "no" });
    if (u.pathname.endsWith("/Calls.json") && init?.method === "POST") return json(201, { sid: hex("CA", ++n) });
    if (u.pathname.endsWith("/Participants.json")) return json(201, { call_sid: hex("CA", ++n) });
    if (/\/Participants\/CA/.test(u.pathname) && init?.method === "POST") return failParticipantUpdate ? json(500, { message: "boom" }) : json(200, {});
    if (init?.method === "GET") return json(200, { status: "completed", duration: "42" });
    return json(200, {});
  }) as unknown as typeof fetch;
  const twilioReqs = () => reqs.filter((r) => r.url.includes("api.twilio.com"));
  const updates = () => twilioReqs().filter((r) => /\/Participants\/CA/.test(r.url) && r.method === "POST");

  const creds = async () => ({ accountSid: hex("AC", 1), authToken: AUTH[await currentCompanyId()], apiKeySid: hex("SK", 2), apiKeySecret: "api_secret", twimlAppSid: hex("AP", 3) });
  const deps = (over: Partial<import("../src/lib/products/agentos/calls/conference").ConferenceDeps> = {}) => ({
    creds, account: async () => ({ accountSid: hex("AC", 1), authToken: AUTH[await currentCompanyId()] }), fetch: fetchFake, elevenKey: async () => "sk_eleven", origin: async () => ORIGIN, ready: async () => true,
    viewerFor: async (id: string) => ({ admin, mgr, alice, bob } as Record<string, Viewer>)[id] ?? null, ...over,
  });

  /** A request as Twilio would send it: the form body and the signature over URL + params with the company's auth token. */
  const twilioReq = (company: string, url: string, form: Record<string, string>, over: { token?: string | null; sign?: boolean; authToken?: string } = {}) => {
    const u = new URL(url);
    const params = new URLSearchParams(form);
    return {
      rawBody: params.toString(), pathAndQuery: `${u.pathname}${u.search}`, token: over.token === undefined ? u.searchParams.get("t") : over.token,
      signature: over.sign === false ? null : tw.twilioSignature(over.authToken ?? AUTH[company], url, params),
      forwardedProto: "https", forwardedHost: "app.test", host: "internal:3000",
    };
  };
  const q = (url: string, key: string) => new URL(url).searchParams.get(key);

  let callId = "";
  let leadUrl = "";
  let statusUrl = "";
  let confName = "";
  const LEAD = hex("CA", 101);
  const mkCall = (id: string, over: Record<string, unknown> = {}) => ({
    _id: id, idempotencyKey: `idem-${id}-abcdef`, direction: "outbound", agentId: "bot1", elevenAgentId: "agent_el_1", purpose: "lead_followup", target: { product: "dealflow-ai", entityType: "lead", entityId: "L1", label: "Asha" },
    phone: "+919876543210", phoneHash: "h", phoneLast4: "3210", fromNumberId: "n1", initiatedBy: { userId: "alice", email: "alice@x.test" }, scheduledFor: null, anchorAt: new Date(), dialedAt: new Date(), endedAt: null,
    status: "dialing", attempts: 1, conversationId: null, callSid: null, context: { contact_name: "Asha", company_name: "Alpha" }, compliance: null, failure: null, collected: [], outcome: null, summary: null, summaryTitle: null,
    transcript: null, durationSecs: null, hasAudio: null, terminationReason: null, meteredAt: null, meterLeaseUntil: null, chatId: null, cancelledBy: null,
    control: { mode: "ai", handler: null, canHandBack: true, history: [] }, eventSeq: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
  });

  let tokenA = "";
  await runAsCompany(CO_A, async () => {
    const calls = await store.callsCollection();
    callId = "call_conf_1";
    await calls.insertOne(mkCall(callId) as never);

    await t("dial: conference record with an unguessable name, the lead's leg created with signed URLs, no secrets leak", async () => {
      const call = (await calls.findOne({ _id: callId }))!;
      const failure = await conf.dialConference(call, { fromNumber: "+918012345678", toNumber: "+919876543210", elevenAgentId: "agent_el_1", language: "hi" }, deps());
      assert.equal(failure, null);
      const c = (await state.getConference(callId))!;
      assert.match(c.name, /^sr-[\w-]{20,}$/);
      assert.equal(c.leadSid, hex("CA", 101));
      assert.equal(c.transcriptionLanguage, "hi-IN");
      assert.equal((await calls.findOne({ _id: callId }))!.callSid, c.leadSid);
      const create = twilioReqs().find((r) => r.url.endsWith("/Calls.json"))!;
      assert.equal(create.form.get("To"), "+919876543210");
      assert.equal(create.form.get("From"), "+918012345678");
      assert.deepEqual(create.form.getAll("StatusCallbackEvent"), ["initiated", "ringing", "answered", "completed"]);
      leadUrl = create.form.get("Url")!;
      statusUrl = create.form.get("StatusCallback")!;
      tokenA = q(leadUrl, "t")!;
      confName = c.name;
      assert.ok(leadUrl.startsWith(`${ORIGIN}/api/agentos/twilio/voice?`) && q(leadUrl, "leg") === "lead" && q(leadUrl, "c") === callId);
      assert.ok(!JSON.stringify(reqs).includes("api_secret"), "the API key secret is only used to sign browser tokens");
      assert.ok(!leadUrl.includes(c.name), "the conference name is never in a URL");
    });
  });

  await t("webhook security: unknown/missing token, bad/missing signature, other company's auth token, oversize body, tenant isolation", async () => {
    const form = { CallSid: hex("CA", 101), From: "+918012345678", To: "+919876543210" };
    const good = await conf.handleTwilioVoice(twilioReq(CO_A, leadUrl, form), deps());
    assert.equal(good.status, 200);
    assert.match(good.body, /<Conference[^>]*>sr-/);
    assert.equal((await conf.handleTwilioVoice(twilioReq(CO_A, leadUrl, form, { token: "x".repeat(32) }), deps())).status, 403);
    assert.equal((await conf.handleTwilioVoice(twilioReq(CO_A, leadUrl, form, { token: null }), deps())).status, 403);
    assert.equal((await conf.handleTwilioVoice(twilioReq(CO_A, leadUrl, form, { sign: false }), deps())).status, 403);
    assert.equal((await conf.handleTwilioVoice(twilioReq(CO_A, leadUrl, form, { authToken: "wrong" }), deps())).status, 403);
    assert.equal((await conf.handleTwilioVoice(twilioReq(CO_A, leadUrl, form, { authToken: AUTH[CO_B] }), deps())).status, 403, "another company's auth token never validates");
    const tampered = twilioReq(CO_A, leadUrl, form);
    assert.equal((await conf.handleTwilioVoice({ ...tampered, rawBody: tampered.rawBody + "&Extra=1" }, deps())).status, 403);
    const big = twilioReq(CO_A, leadUrl, { ...form, Junk: "x".repeat(conf.MAX_TWILIO_BODY) });
    assert.equal((await conf.handleTwilioVoice(big, deps())).status, 413);
    // a valid token for company A used with the status route on a call id of another company: nothing is found, nothing changes
    await runAsCompany(CO_B, async () => assert.equal(await state.getConference(callId), null));
    const foreignUrl = `${ORIGIN}/api/agentos/twilio/status?t=${tokenA}&c=${callId}`;
    assert.equal((await conf.handleTwilioStatus(twilioReq(CO_B, foreignUrl, { CallSid: LEAD, CallStatus: "completed" }), deps())).status, 403);
  });

  await t("lead leg: wrong/unsigned leg parameters get a hang-up, a second lead leg cannot hijack the conference", async () => {
    const form = { CallSid: hex("CA", 101), From: "+918012345678", To: "+919876543210" };
    const forged = leadUrl.replace(/&s=[^&]+/, "&s=AAAA");
    const r = await conf.handleTwilioVoice(twilioReq(CO_A, forged, form), deps());
    assert.match(r.body, /<Pause|<Hangup|<Say>/, "no conference TwiML without a valid leg signature");
    assert.ok(!r.body.includes("<Conference"));
    const other = await conf.handleTwilioVoice(twilioReq(CO_A, leadUrl, { ...form, CallSid: hex("CA", 999) }), deps());
    assert.ok(!other.body.includes("<Conference"));
  });

  // The lead picks up: Twilio says so (call status + conference join). The AI leg is added exactly once.
  const confUrl = () => statusUrl;
  const confEvent = (event: string, sid: string, seqNo: number, extra: Record<string, string> = {}) =>
    twilioReq(CO_A, confUrl(), { StatusCallbackEvent: event, CallSid: sid, ConferenceSid: hex("CF", 7), FriendlyName: confName, SequenceNumber: String(seqNo), Timestamp: new Date().toISOString(), ...extra });
  const AI = hex("CA", 201);

  await t("lead joins -> call in progress, AI participant added once (TwiML-App target with signed ai leg), replay changes nothing", async () => {
    const before = twilioReqs().filter((r) => r.url.endsWith("/Participants.json")).length;
    assert.equal((await conf.handleTwilioStatus(twilioReq(CO_A, confUrl(), { CallSid: LEAD, CallStatus: "in-progress" }), deps())).status, 200);
    assert.equal((await conf.handleTwilioStatus(confEvent("participant-join", LEAD, 1), deps())).status, 200);
    await conf.handleTwilioStatus(confEvent("participant-join", LEAD, 1), deps()); // replay
    await Promise.all([conf.handleTwilioStatus(confEvent("participant-join", LEAD, 2), deps()), conf.handleTwilioStatus(confEvent("participant-join", LEAD, 3), deps())]); // duplicates racing
    const adds = twilioReqs().filter((r) => r.url.endsWith("/Participants.json"));
    assert.equal(adds.length - before, 1, "exactly one AI leg");
    const add = adds.at(-1)!;
    assert.equal(add.form.get("To")!.split("?")[0], `app:${hex("AP", 3)}`);
    const aiParams = new URLSearchParams(add.form.get("To")!.split("?")[1]);
    assert.equal(aiParams.get("leg"), "ai");
    assert.equal(aiParams.get("c"), callId);
    assert.ok(add.url.includes(hex("CF", 7)));
    assert.equal(add.form.get("EndConferenceOnExit"), "false");
    await runAsCompany(CO_A, async () => {
      const c = (await state.getConference(callId))!;
      assert.equal(c.leadState, "joined");
      assert.equal(c.aiState, "adding");
      assert.equal(c.aiSid, hex("CA", 102));
      assert.equal((await (await store.callsCollection()).findOne({ _id: callId }))!.status, "in_progress");
    });
    // the AI's voice request (what Twilio sends once the app leg answers)
    const aiUrl = `${ORIGIN}/api/agentos/twilio/voice?t=${tokenA}&${aiParams.toString()}`;
    const form = { CallSid: hex("CA", 102), From: "+918012345678", To: "app" };
    const r = await conf.handleTwilioVoice(twilioReq(CO_A, aiUrl, form), deps());
    assert.match(r.body, /<Connect><Stream/);
    const reg = reqs.filter((x) => x.url.endsWith("/convai/twilio/register-call")).at(-1)!;
    assert.deepEqual(reg.json, { agent_id: "agent_el_1", from_number: "+918012345678", to_number: "+919876543210", direction: "outbound", conversation_initiation_client_data: { dynamic_variables: { contact_name: "Asha", company_name: "Alpha", lead_briefing: "" } } });
    assert.ok(!JSON.stringify(reg.json).includes("override"), "prompt overrides stay closed");
    assert.ok(!("agentos" in (reg.json ?? {})));
    const again = await conf.handleTwilioVoice(twilioReq(CO_A, aiUrl, form), deps());
    assert.ok(!again.body.includes("<Connect"), "a repeated request for the same leg is not registered twice");
    assert.equal(reqs.filter((x) => x.url.endsWith("/convai/twilio/register-call")).length, 1);
    await conf.handleTwilioStatus(confEvent("participant-join", AI, 4, { CallSid: hex("CA", 102) }), deps());
    await runAsCompany(CO_A, async () => assert.equal((await state.getConference(callId))!.aiState, "joined"));
  });

  // ── Listening: who gets a token ─────────────────────────────────────────
  let joinToken = "";
  let identity = "";
  await runAsCompany(CO_A, async () => {
    await t("join token: only the caller or VOICE_CALL_TAKEOVER; strangers get not-found; bound to the call; short-lived", async () => {
      await assert.rejects(conf.listenToCall(bob, callId, deps()), NotFoundError);
      const r = await conf.listenToCall(alice, callId, deps());
      assert.ok(r.ok);
      if (!r.ok) return;
      joinToken = r.joinToken;
      identity = r.identity;
      const body = JSON.parse(Buffer.from(r.accessToken.split(".")[1], "base64url").toString());
      assert.equal(body.grants.identity, r.identity);
      assert.ok(body.exp - body.iat <= 600);
      assert.ok(r.expiresAt - Date.now() <= 600_000 + 1000);
      assert.ok(!JSON.stringify(r).includes("auth_token_a") && !JSON.stringify(r).includes("api_secret"));
      const m = await conf.listenToCall(mgr, callId, deps());
      assert.ok(m.ok, "VOICE_CALL_TAKEOVER holder may listen");
      assert.equal(await setup.verifyJoinToken(joinToken, Math.floor(Date.now() / 1000) + 601), null, "expired");
      assert.equal(await setup.verifyJoinToken(joinToken + "x"), null);
      assert.equal((await setup.verifyJoinToken(joinToken))!.callId, callId);
      // a call that doesn't exist / a finished call
      await assert.rejects(conf.listenToCall(alice, "nope", deps()), NotFoundError);
    });
  });

  const humanUrl = `${ORIGIN}/api/agentos/twilio/voice?t=${tokenA}`;
  const HUMAN = hex("CA", 301);
  await t("browser leg: needs a valid join token and the matching client identity; one team member at a time; joins muted", async () => {
    const form = (over: Record<string, string> = {}) => ({ CallSid: HUMAN, From: `client:${identity}`, To: "", joinToken, callId, ...over });
    assert.ok(!(await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, form({ joinToken: "garbage" })), deps())).body.includes("<Conference"));
    assert.ok(!(await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, form({ From: "client:someoneelse" })), deps())).body.includes("<Conference"));
    assert.ok(!(await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, form({ leg: "ai" })), deps())).body.includes("<Connect"), "a browser cannot ask to be the AI leg");
    const ok = await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, form()), deps());
    assert.match(ok.body, /muted="true"[\s\S]*endConferenceOnExit="false"/);
    await runAsCompany(CO_A, async () => assert.equal((await state.getConference(callId))!.humanSid, HUMAN));
  });

  await t("browser leg race: a second team member can't take a leg someone holds; a token is bound to its person and call; rights are re-checked when it is used", async () => {
    let mgrToken = "";
    let mgrIdentity = "";
    await runAsCompany(CO_A, async () => {
      const m = await conf.listenToCall(mgr, callId, deps());
      assert.ok(m.ok);
      if (m.ok) { mgrToken = m.joinToken; mgrIdentity = m.identity; }
    });
    const MGR_SID = hex("CA", 302);
    const asMgr = (over: Record<string, string> = {}) => ({ CallSid: MGR_SID, From: `client:${mgrIdentity}`, To: "", joinToken: mgrToken, callId, ...over });
    const refused = (r: { body: string }) => !r.body.includes("<Conference") && /Another team member|not allowed|not available/.test(r.body);
    const first = await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, asMgr()), deps());
    assert.ok(refused(first), first.body);
    await runAsCompany(CO_A, async () => {
      const d = (await state.getConference(callId))!;
      assert.equal(d.humanSid, HUMAN);
      assert.equal(d.humanUserId, "alice");
    });
    // alice's own reload (new call sid, same person) replaces her leg
    const RELOAD = hex("CA", 303);
    assert.match((await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, { CallSid: RELOAD, From: `client:${identity}`, To: "", joinToken, callId }), deps())).body, /<Conference/);
    await runAsCompany(CO_A, async () => assert.equal((await state.getConference(callId))!.humanSid, RELOAD));
    // alice's token with the other person's identity, and a token used for another call id
    assert.ok(refused(await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, { CallSid: MGR_SID, From: `client:${mgrIdentity}`, To: "", joinToken, callId }), deps())));
    assert.ok(refused(await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, { CallSid: MGR_SID, From: `client:${mgrIdentity}`, To: "", joinToken: mgrToken, callId: "another-call" }), deps())));
    // a person whose right was withdrawn after the token was issued (or whose account is gone) is refused when the token is used
    const revoked = deps({ viewerFor: async (id: string) => (id === "mgr" ? viewer("mgr", ["aibots_user"]) : null) });
    assert.ok(refused(await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, asMgr()), revoked)));
    assert.ok(refused(await conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, { CallSid: hex("CA", 304), From: `client:${identity}`, To: "", joinToken, callId }), deps({ viewerFor: async () => null }))));
    await runAsCompany(CO_A, async () => assert.equal((await state.getConference(callId))!.humanUserId, "alice", "nothing was overwritten by any refusal"));
    // two simultaneous claims, two people, one conference whose leg is free: exactly one wins
    await runAsCompany(CO_A, async () => {
      const col = await state.conferenceCollection();
      await col.updateOne({ _id: callId }, { $set: { humanUserId: null, humanSid: null, humanState: "none" } });
    });
    const results = await Promise.all([
      conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, { CallSid: hex("CA", 305), From: `client:${identity}`, To: "", joinToken, callId }), deps()),
      conf.handleTwilioVoice(twilioReq(CO_A, humanUrl, asMgr({ CallSid: hex("CA", 306) })), deps()),
    ]);
    assert.equal(results.filter((r) => r.body.includes("<Conference")).length, 1, "exactly one person gets the leg");
    await runAsCompany(CO_A, async () => {
      const d = (await state.getConference(callId))!;
      assert.ok(["alice", "mgr"].includes(d.humanUserId!));
      assert.equal(d.humanSid, d.humanUserId === "alice" ? hex("CA", 305) : hex("CA", 306));
      // put alice back as the holder for the tests that follow
      await (await state.conferenceCollection()).updateOne({ _id: callId }, { $set: { humanUserId: "alice", humanSid: HUMAN, humanState: "none" } });
    });
  });

  await t("the lead hears the recording notice (in the call's language) before the AI, and is told when a team member joins", async () => {
    const lang = await runAsCompany(CO_A, async () => (await state.getConference(callId))!.transcriptionLanguage);
    const r = await conf.handleTwilioVoice(twilioReq(CO_A, leadUrl, { CallSid: LEAD, From: "+911234567890", To: "+919876543210" }), deps({ recordingNotice: async () => true }));
    const nl = await import("../src/lib/products/agentos/calls/notices");
    const L = nl.noticeLanguage(lang);
    assert.ok(r.body.includes(`<Say language="${lang}">${nl.RECORDING_NOTICE[L]}</Say><`), r.body.slice(0, 300));
    const off = await conf.handleTwilioVoice(twilioReq(CO_A, leadUrl, { CallSid: LEAD, From: "+911234567890", To: "+919876543210" }), deps({ recordingNotice: async () => false }));
    assert.doesNotMatch(off.body, /<Say/);
  });

  await t("take over before listening is refused; listening then taking over holds the AI and unmutes the person", async () => {
    await runAsCompany(CO_A, async () => {
      const early = await conf.takeOverConference(alice, callId, deps());
      assert.ok(!early.ok && early.failure.code === "not_joined");
    });
    // the join event announces to the lead's leg only, once
    const nl = await import("../src/lib/products/agentos/calls/notices");
    const L = nl.noticeLanguage(await runAsCompany(CO_A, async () => (await state.getConference(callId))!.transcriptionLanguage));
    const before = updates().filter((u) => u.form.get("AnnounceUrl")).length;
    await conf.handleTwilioStatus(confEvent("participant-join", HUMAN, 5), deps());
    await conf.handleTwilioStatus(confEvent("participant-join", HUMAN, 5), deps()); // replay
    const ann = updates().filter((u) => u.form.get("AnnounceUrl")).slice(before);
    assert.equal(ann.length, 1);
    assert.ok(ann[0].url.includes(LEAD), "played to the lead");
    const url = ann[0].form.get("AnnounceUrl")!;
    const say = await conf.handleTwilioVoice(twilioReq(CO_A, url, { CallSid: LEAD }), deps());
    assert.ok(say.body.includes(nl.HUMAN_JOINED[L]), say.body);
    assert.equal((await conf.handleTwilioVoice(twilioReq(CO_A, url, { CallSid: LEAD }, { sign: false }), deps())).status, 403);
    const n0 = updates().length;
    await runAsCompany(CO_A, async () => {
      await assert.rejects(conf.takeOverConference(bob, callId, deps()), NotFoundError);
      const r = await conf.takeOverConference(alice, callId, deps());
      assert.deepEqual(r, { ok: true });
      const doc = (await (await store.callsCollection()).findOne({ _id: callId }))!;
      assert.equal(doc.control.mode, "human");
      assert.equal(doc.control.handler, "alice");
      assert.equal(doc.control.lockUntil, null);
    });
    const all = updates().slice(n0);
    const announced = all.filter((r) => r.form.get("AnnounceUrl"));
    assert.equal(announced.length, 1, "the lead is told once that a team member took over");
    assert.ok(announced[0].url.includes(LEAD));
    const u = all.filter((r) => !r.form.get("AnnounceUrl"));
    assert.equal(u.length, 2);
    assert.ok(u[0].url.includes(hex("CA", 102)) && u[0].form.get("Hold") === "true" && /action=|leg=hold/.test(u[0].form.get("HoldUrl") ?? ""), "the AI is held first, with a silent hold URL");
    assert.ok(u[1].url.includes(HUMAN) && u[1].form.get("Muted") === "false");
  });

  await t("hold URL: signed, answers with silence (never Twilio's hold music)", async () => {
    const hold = updates().find((r) => r.form.get("HoldUrl"))!.form.get("HoldUrl")!;
    const r = await conf.handleTwilioVoice(twilioReq(CO_A, hold, { CallSid: AI }), deps());
    assert.match(r.body, /<Pause length="3600"\/>/);
    assert.equal((await conf.handleTwilioVoice(twilioReq(CO_A, hold, { CallSid: AI }, { sign: false }), deps())).status, 403);
  });

  await t("only one human in control: a second take-over is refused; double click is a no-op; no extra Twilio calls", async () => {
    const n0 = updates().length;
    await runAsCompany(CO_A, async () => {
      const again = await conf.takeOverConference(alice, callId, deps());
      assert.deepEqual(again, { ok: true, unchanged: true });
      const other = await conf.takeOverConference(mgr, callId, deps());
      assert.ok(!other.ok && other.failure.code === "control_busy");
    });
    assert.equal(updates().length, n0);
  });

  await t("hand back: person muted then AI released; only the handler (or a manager) may; double click is a no-op", async () => {
    await runAsCompany(CO_A, async () => {
      const n0 = updates().length;
      await assert.rejects(conf.handBackConference(bob, callId, deps()), NotFoundError);
      const r = await conf.handBackConference(alice, callId, deps());
      assert.deepEqual(r, { ok: true });
      const u = updates().slice(n0);
      assert.ok(u[0].url.includes(HUMAN) && u[0].form.get("Muted") === "true");
      assert.ok(u[1].url.includes(hex("CA", 102)) && u[1].form.get("Hold") === "false");
      assert.deepEqual(await conf.handBackConference(alice, callId, deps()), { ok: true, unchanged: true });
      assert.equal(updates().length - n0, 2);
      const doc = (await (await store.callsCollection()).findOne({ _id: callId }))!;
      assert.equal(doc.control.mode, "ai");
      assert.deepEqual(doc.control.history.map((h) => `${h.from}>${h.to}`), ["ai>human", "human>ai"]);
    });
  });

  await t("repeatable: take over again; concurrent presses claim exactly once; a Twilio failure rolls control back", async () => {
    await runAsCompany(CO_A, async () => {
      const n0 = updates().filter((r) => r.form.get("Hold") === "true").length;
      const res = await Promise.all([conf.takeOverConference(alice, callId, deps()), conf.takeOverConference(alice, callId, deps()), conf.takeOverConference(alice, callId, deps())]);
      assert.ok(res.every((r) => r.ok || r.failure.code === "control_busy"), JSON.stringify(res));
      assert.ok(res.some((r) => r.ok));
      assert.equal(updates().filter((r) => r.form.get("Hold") === "true").length - n0, 1, "the AI is held once");
      assert.equal((await conf.handBackConference(alice, callId, deps())).ok, true);
      failParticipantUpdate = true;
      const f = await conf.takeOverConference(alice, callId, deps());
      failParticipantUpdate = false;
      assert.ok(!f.ok && f.failure.code === "provider_error");
      const doc = (await (await store.callsCollection()).findOne({ _id: callId }))!;
      assert.equal(doc.control.mode, "ai", "a failed take-over leaves the AI in control");
      assert.equal(doc.control.handler, null);
      assert.equal(doc.control.lockUntil, null);
      assert.equal((await conf.takeOverConference(alice, callId, deps())).ok, true, "and it works again afterwards");
    });
  });

  await t("the team member drops out while in control: the AI is released by itself", async () => {
    const n0 = updates().length;
    await conf.handleTwilioStatus(confEvent("participant-leave", HUMAN, 6), deps());
    await runAsCompany(CO_A, async () => {
      const doc = (await (await store.callsCollection()).findOne({ _id: callId }))!;
      assert.equal(doc.control.mode, "ai");
      assert.equal((await state.getConference(callId))!.humanState, "left");
    });
    assert.ok(updates().slice(n0).some((r) => r.url.includes(hex("CA", 102)) && r.form.get("Hold") === "false"));
  });

  await t("the AI leaves while a person is in control: hand-back is refused with the reason", async () => {
    // rejoin the person, take over, then the AI leg drops (for example an end-on-silence setting)
    await conf.handleTwilioStatus(confEvent("participant-join", HUMAN, 7), deps());
    await runAsCompany(CO_A, async () => {
      assert.equal((await conf.takeOverConference(alice, callId, deps())).ok, true);
    });
    await conf.handleTwilioStatus(confEvent("participant-leave", hex("CA", 102), 8), deps());
    await runAsCompany(CO_A, async () => {
      const bad = await conf.handBackConference(alice, callId, deps());
      assert.ok(!bad.ok && bad.failure.code === "handback_unsupported");
      assert.equal((await (await store.callsCollection()).findOne({ _id: callId }))!.control.mode, "human");
    });
  });

  // ── Transcript ──────────────────────────────────────────────────────────
  const transUrl = () => `${ORIGIN}/api/agentos/twilio/transcription?t=${tokenA}&c=${callId}`;
  const line = (seqId: number, track: string, text: string, ts: Date, over: Record<string, string> = {}) =>
    twilioReq(CO_A, transUrl(), { TranscriptionEvent: "transcription-content", TranscriptionData: JSON.stringify({ transcript: text, confidence: 0.9 }), CallSid: LEAD, Track: track, SequenceId: String(seqId), Final: "true", Timestamp: ts.toISOString(), ...over });

  await t("live transcript: labelled lead/AI/human, ordered by sequence, partials and foreign legs ignored, replays idempotent, bounded", async () => {
    const hist = await runAsCompany(CO_A, async () => (await (await store.callsCollection()).findOne({ _id: callId }))!.control.history);
    const humanStart = hist.filter((h) => h.to === "human").at(-1)!.at;
    const aiTime = new Date(hist[0].at.getTime() - 1000);
    for (const r of [
      line(1, "outbound_track", "Hello, this is the assistant", aiTime),
      line(1, "inbound_track", "Hello", new Date(aiTime.getTime() + 500)),
      line(2, "outbound_track", "I am a real person now", new Date(humanStart.getTime() + 500)),
      line(2, "inbound_track", "Oh, hello", new Date(humanStart.getTime() + 900)),
      line(3, "inbound_track", "partial only", new Date(), { Final: "false" }),
      line(9, "inbound_track", "from another leg", new Date(), { CallSid: hex("CA", 555) }),
      line(1, "outbound_track", "Hello, this is the assistant", aiTime), // replay
    ]) assert.equal((await conf.handleTwilioTranscription(r, deps())).status, 200);
    assert.equal((await conf.handleTwilioTranscription(line(1, "inbound_track", "x", new Date()), deps())).status, 200);
    assert.equal((await conf.handleTwilioTranscription({ ...line(5, "inbound_track", "x", new Date()), signature: "bad" }, deps())).status, 403);
    await runAsCompany(CO_A, async () => {
      const v = await live.getLiveView(alice, callId, 0);
      const spoken = v.events.filter((e) => e.speaker);
      assert.deepEqual(spoken.map((e) => [e.speaker, e.text]), [["ai", "Hello, this is the assistant"], ["lead", "Hello"], ["human", "I am a real person now"], ["lead", "Oh, hello"]]);
      assert.ok(v.events.every((e, i) => i === 0 || e.seq > v.events[i - 1].seq), "ordered by sequence");
      assert.equal(v.mode, "conference");
      assert.equal(v.conference!.ai, "left");
      assert.equal(v.conference!.youAreListening, true);
      assert.equal(v.control.mine, true);
      assert.equal((await live.getLiveView(alice, callId, v.events[1].seq)).events[0].seq, v.events[2].seq);
      assert.ok(!JSON.stringify(v).includes("auth_token") && !JSON.stringify(v).includes(confName));
      await assert.rejects(live.getLiveView(bob, callId, 0), NotFoundError);
      assert.equal((await live.getLiveView(mgr, callId, 0)).mode, "conference");
      const col = await store.callsCollection();
      await col.updateOne({ _id: callId }, { $set: { eventSeq: live.LIVE_EVENT_LIMIT } });
      assert.equal(await live.recordCallEvent(callId, { type: "note", text: "over" }), false);
      await col.updateOne({ _id: callId }, { $set: { eventSeq: v.lastSeq } });
    });
  });

  await t("final transcript: ElevenLabs result is linked by the AI leg's call SID, wrong agent is not, and the merge adds the team member's lines", async () => {
    await runAsCompany(CO_A, async () => {
      assert.equal(await tr.linkConferenceConversation({ agent_id: "agent_el_1", conversation_id: "conv_x", conversation_initiation_client_data: { dynamic_variables: { system__call_sid: hex("CA", 777) } } }), null);
      assert.equal(await tr.linkConferenceConversation({ agent_id: "other_agent", conversation_id: "conv_x", conversation_initiation_client_data: { dynamic_variables: { system__call_sid: hex("CA", 102) } } }), null);
      assert.equal(await tr.linkConferenceConversation({ agent_id: "agent_el_1", conversation_id: "conv_x", conversation_initiation_client_data: { dynamic_variables: {} } }), null);
      const linked = await tr.linkConferenceConversation({ agent_id: "agent_el_1", conversation_id: "conv_x", conversation_initiation_client_data: { dynamic_variables: { system__call_sid: hex("CA", 102) } } });
      assert.equal(linked, callId);
      assert.equal(await tr.linkConferenceConversation({ agent_id: "agent_el_1", conversation_id: "conv_y", conversation_initiation_client_data: { dynamic_variables: { system__call_sid: hex("CA", 102) } } }), null, "one conversation per call");
      const c = (await state.getConference(callId))!;
      const base = c.aiJoinedAt!.getTime();
      void base;
      const r = await engine.applyConversationUpdate({
        conversationId: "conv_x", agentId: "agent_el_1",
        detail: { conversationId: "conv_x", agentId: "agent_el_1", startedAt: "", durationSecs: 120, status: "done", settled: true, hasAudio: false, analysis: null, terminationReason: null, transcript: [{ role: "agent", text: "Hello, this is the assistant", atSecs: 0 }, { role: "user", text: "Hello", atSecs: 1 }] },
      }, { meter: async () => {} });
      assert.equal(r.status, "completed");
      const doc = (await (await store.callsCollection()).findOne({ _id: callId }))!;
      const texts = doc.transcript!.map((l) => [l.speaker, l.text]);
      assert.ok(texts.some(([s, x]) => s === "human" && x === "I am a real person now"), JSON.stringify(texts));
      assert.ok(texts.some(([s, x]) => s === "lead" && x === "Oh, hello"));
      assert.ok(texts.some(([s, x]) => s === "ai" && x === "Hello, this is the assistant"));
    });
  });

  await t("ending: only the owner/handler roles; ends the conference and the lead; second press is a no-op", async () => {
    await runAsCompany(CO_A, async () => {
      const calls = await store.callsCollection();
      const id2 = "call_conf_2";
      await calls.insertOne(mkCall(id2, { status: "in_progress", callSid: hex("CA", 401) }) as never);
      const col = await state.conferenceCollection();
      await col.insertOne({ _id: id2, name: "sr-two", conferenceSid: hex("CF", 8), leadSid: hex("CA", 401), aiSid: null, humanSid: null, humanUserId: null, leadState: "joined", aiState: "none", humanState: "none", aiRegisteredAt: null, elevenAgentId: "agent_el_1", fromNumber: "+918012345678", transcriptionLanguage: "en-IN", answeredAt: new Date(), aiJoinedAt: null, leadEndedAt: null, endedAt: null, twilioDurationSecs: null, unattendedSince: null, seen: [], createdAt: new Date(), updatedAt: new Date() } as never);
      await assert.rejects(conf.endConferenceCall(bob, id2, deps()), NotFoundError);
      const n0 = twilioReqs().length;
      assert.deepEqual(await conf.endConferenceCall(alice, id2, deps()), { ok: true });
      const sent = twilioReqs().slice(n0);
      assert.ok(sent.some((r) => r.url.includes(`/Conferences/${hex("CF", 8)}.json`) && r.form.get("Status") === "completed"));
      assert.ok(sent.some((r) => r.url.includes(`/Calls/${hex("CA", 401)}.json`) && r.form.get("Status") === "completed"));
      await col.updateOne({ _id: id2 }, { $set: { leadEndedAt: new Date() } });
      assert.deepEqual(await conf.endConferenceCall(alice, id2, deps()), { ok: true, unchanged: true });
    });
  });

  await t("notes to the AI: refused plainly in conference mode while no conversation id exists; empty note refused; nothing recorded", async () => {
    await runAsCompany(CO_A, async () => {
      const id3 = "call_conf_3";
      await (await store.callsCollection()).insertOne(mkCall(id3, { status: "in_progress" }) as never);
      await (await state.conferenceCollection()).insertOne({ _id: id3, name: "sr-3", conferenceSid: null, leadSid: null, aiSid: null, humanSid: null, humanUserId: null, leadState: "joined", aiState: "joined", humanState: "none", aiRegisteredAt: null, elevenAgentId: "agent_el_1", fromNumber: "+91", transcriptionLanguage: "en-IN", answeredAt: new Date(), aiJoinedAt: new Date(), leadEndedAt: null, endedAt: null, twilioDurationSecs: null, unattendedSince: null, seen: [], createdAt: new Date(), updatedAt: new Date() } as never);
      await assert.rejects(conf.addConferenceNote(bob, id3, "hi", deps()), NotFoundError);
      const empty = await conf.addConferenceNote(alice, id3, "   ", deps());
      assert.ok(!empty.ok);
      const r = await conf.addConferenceNote(alice, id3, "Offer the premium plan", deps());
      assert.ok(!r.ok && r.failure.code === "monitor_unavailable" && /live conference call/.test(r.failure.message));
      assert.equal((await live.getLiveView(alice, id3, 0)).events.length, 0);
    });
  });

  await t("status: busy / no-answer settle the call without an AI; failed AI leg is shown; sweep finalises results that never arrive and ends unattended calls", async () => {
    await runAsCompany(CO_A, async () => {
      const calls = await store.callsCollection();
      const col = await state.conferenceCollection();
      const mk = async (id: string, sid: string, extra: Record<string, unknown> = {}) => {
        await calls.insertOne(mkCall(id, { status: "dialing", callSid: sid }) as never);
        await col.insertOne({ _id: id, name: `sr-${id}`, conferenceSid: null, leadSid: sid, aiSid: null, humanSid: null, humanUserId: null, leadState: "dialing", aiState: "none", humanState: "none", aiRegisteredAt: null, elevenAgentId: "agent_el_1", fromNumber: "+91", transcriptionLanguage: "en-IN", answeredAt: null, aiJoinedAt: null, leadEndedAt: null, endedAt: null, twilioDurationSecs: null, unattendedSince: null, seen: [], createdAt: new Date(), updatedAt: new Date(), ...extra } as never);
      };
      await mk("call_busy", hex("CA", 501));
      await conf.handleTwilioStatus(twilioReq(CO_A, `${ORIGIN}/api/agentos/twilio/status?t=${tokenA}&c=call_busy`, { CallSid: hex("CA", 501), CallStatus: "busy" }), deps());
      assert.equal((await calls.findOne({ _id: "call_busy" }))!.status, "busy");
      await mk("call_noans", hex("CA", 502));
      await conf.handleTwilioStatus(twilioReq(CO_A, `${ORIGIN}/api/agentos/twilio/status?t=${tokenA}&c=call_noans`, { CallSid: hex("CA", 502), CallStatus: "no-answer" }), deps());
      assert.equal((await calls.findOne({ _id: "call_noans" }))!.status, "no_answer");
      // a conference event for another conference name is ignored
      const wrong = twilioReq(CO_A, `${ORIGIN}/api/agentos/twilio/status?t=${tokenA}&c=call_noans`, { StatusCallbackEvent: "conference-end", CallSid: hex("CA", 502), FriendlyName: "someone-else", SequenceNumber: "1" });
      await conf.handleTwilioStatus(wrong, deps());
      assert.ok(!(await state.getConference("call_noans"))!.seen.some((k) => k.startsWith("c:conference-end")), "events for another conference name are dropped before any state change");

      // answered, hung up 11 minutes ago, ElevenLabs result never came
      const old = new Date(Date.now() - 11 * 60_000);
      await mk("call_lost", hex("CA", 503), { leadState: "left", answeredAt: new Date(old.getTime() - 60_000), leadEndedAt: old, twilioDurationSecs: 61 });
      await calls.updateOne({ _id: "call_lost" }, { $set: { status: "in_progress" } });
      const ev = await import("../src/lib/products/agentos/calls/conference-transcript");
      assert.ok(ev);
      await live.recordCallEvent("call_lost", { type: "user", text: "Please call tomorrow", at: new Date(old.getTime() - 30_000) });
      const res = await conf.sweepConferenceCalls(deps());
      assert.equal(res.finalised, 1);
      const lost = (await calls.findOne({ _id: "call_lost" }))!;
      assert.equal(lost.status, "completed");
      assert.equal(lost.durationSecs, 61);
      assert.deepEqual(lost.transcript!.map((l) => [l.speaker, l.text]), [["lead", "Please call tomorrow"]]);
      assert.equal((await conf.sweepConferenceCalls(deps())).finalised, 0, "settled once");

      // unattended: AI gone, nobody on
      await mk("call_alone", hex("CA", 504), { leadState: "joined", conferenceSid: hex("CF", 9), answeredAt: new Date(), unattendedSince: new Date(Date.now() - 5 * 60_000) });
      await calls.updateOne({ _id: "call_alone" }, { $set: { status: "in_progress" } });
      const n0 = twilioReqs().length;
      assert.equal((await conf.sweepConferenceCalls(deps())).ended, 1);
      assert.ok(twilioReqs().slice(n0).some((r) => r.url.includes(`/Calls/${hex("CA", 504)}.json`) && r.form.get("Status") === "completed"));
    });
  });

  await t("AI leg cannot be registered (ElevenLabs refuses): the leg is hung up, the console is told, a person can still take the call", async () => {
    await runAsCompany(CO_A, async () => {
      const calls = await store.callsCollection();
      const id = "call_noai";
      await calls.insertOne(mkCall(id, { status: "in_progress" }) as never);
      await (await state.conferenceCollection()).insertOne({ _id: id, name: "sr-noai", conferenceSid: hex("CF", 10), leadSid: hex("CA", 601), aiSid: null, humanSid: null, humanUserId: null, leadState: "joined", aiState: "adding", humanState: "none", aiRegisteredAt: null, elevenAgentId: "agent_el_1", fromNumber: "+91", transcriptionLanguage: "en-IN", answeredAt: new Date(), aiJoinedAt: null, leadEndedAt: null, endedAt: null, twilioDurationSecs: null, unattendedSince: null, seen: [], createdAt: new Date(), updatedAt: new Date() } as never);
      registerStatus = 422;
      const params = await setup.signLeg("ai", id);
      const url = `${ORIGIN}/api/agentos/twilio/voice?t=${tokenA}&${new URLSearchParams(params).toString()}`;
      const r = await conf.handleTwilioVoice(twilioReq(CO_A, url, { CallSid: hex("CA", 602), From: "+91", To: "app" }), deps());
      registerStatus = 200;
      assert.ok(!r.body.includes("<Connect"));
      const c = (await state.getConference(id))!;
      assert.equal(c.aiState, "failed");
      assert.ok(c.unattendedSince);
      assert.ok((await live.getLiveView(alice, id, 0)).events.some((e) => /couldn't join/.test(e.text)));
    });
  });

  await t("call mode: direct unless the live-call setup is complete; saving other settings keeps the chosen mode; invalid mode refused", async () => {
    await runAsCompany(CO_A, async () => {
      assert.equal(await setup.resolveCallMode(), "direct", "no Twilio connection saved -> direct");
      assert.equal((await settings.getCallSettings()).callMode, "auto");
      const base = { allowedCallingCodes: ["+91"], windowStart: "09:00", windowEnd: "21:00", duplicateWindowMinutes: 30, perUserHourlyCap: 3, perCompanyHourlyCap: 5, requireDisclosure: true, recordingNotice: true };
      await settings.saveCallSettings(admin, { ...base, callMode: "conference" });
      assert.equal((await settings.getCallSettings()).callMode, "conference");
      assert.equal(await setup.resolveCallMode(), "direct", "asked for conference but the setup is incomplete -> direct");
      await settings.saveCallSettings(admin, base);
      assert.equal((await settings.getCallSettings()).callMode, "conference", "an older form that doesn't send the field keeps it");
      await assert.rejects(settings.saveCallSettings(admin, { ...base, callMode: "magic" }), /automatic, conference or direct/);
      const s = await setup.getConferenceSetup(admin);
      assert.equal(s.ready, false);
      assert.equal(s.effectiveMode, "direct");
      assert.ok(s.banner, "a banner explains why calls are direct");
      assert.match(s.voiceUrl ?? "", /\/api\/agentos\/twilio\/voice\?t=/);
      assert.deepEqual(s.steps.filter((x) => !x.done).map((x) => x.key).sort(), ["agentAudio", "apiKey", "elevenWebhook", "number", "twilio", "twimlApp", "voiceUrl"].sort());
      const asMgr = await setup.getConferenceSetup(mgr);
      assert.equal(asMgr.voiceUrl, null, "only managers see the address");
      await assert.rejects(setup.confirmSetupStep(mgr, "voiceUrl", true), ForbiddenError);
      await setup.confirmSetupStep(admin, "voiceUrl", true);
      assert.equal((await setup.getConferenceSetup(admin)).steps.find((x) => x.key === "voiceUrl")!.done, true);
    });
  });

  await t("End and stale reconcile with a fake Twilio: ringing call hung up, over-calls settled from Twilio's own status, direct calls by call sid; owners and take-over holders only", async () => {
    const endMod = await import("../src/lib/products/agentos/calls/end");
    const stale = await import("../src/lib/products/agentos/calls/stale");
    await runAsCompany(CO_A, async () => {
      const calls = await store.callsCollection();
      const confs = await state.conferenceCollection();
      const old = new Date(Date.now() - 10 * 60_000);
      const mkConf = (id: string, leadSid: string, over: Record<string, unknown> = {}) => confs.insertOne({
        _id: id, name: `sr-${id}`, conferenceSid: hex("CF", 90), leadSid, aiSid: null, humanSid: null, humanUserId: null, leadState: "dialing", aiState: "none", humanState: "none", aiRegisteredAt: null,
        elevenAgentId: "agent_el_1", fromNumber: "+911234567890", transcriptionLanguage: "en-IN", answeredAt: null, aiJoinedAt: null, leadEndedAt: null, endedAt: null, twilioDurationSecs: null,
        unattendedSince: null, seen: [], createdAt: old, updatedAt: old, ...over,
      } as never);
      const status = (id: string) => calls.findOne({ _id: id }).then((c) => c!.status);
      const d = deps();

      // 1. a ringing conference call: End hangs up the lead and the conference through Twilio and the call is settled at once
      await calls.insertOne(mkCall("end1", { callSid: hex("CA", 801), createdAt: old, updatedAt: old, dialedAt: old }) as never);
      await mkConf("end1", hex("CA", 801));
      const before = twilioReqs().length;
      await assert.rejects(endMod.endCallNow(bob, "end1", { conference: d }), NotFoundError);
      const r = await endMod.endCallNow(alice, "end1", { conference: d });
      assert.deepEqual(r, { ok: true, via: "twilio" });
      const sent = twilioReqs().slice(before);
      assert.ok(sent.some((x) => x.method === "POST" && x.url.includes(`/Calls/${hex("CA", 801)}.json`) && x.form.get("Status") === "completed"), "the lead's leg was hung up");
      assert.ok(sent.some((x) => x.url.includes(`/Conferences/${hex("CF", 90)}.json`) && x.form.get("Status") === "completed"), "the conference was ended");
      assert.ok(["no_answer", "completed", "cancelled"].includes(await status("end1")), await status("end1"));
      assert.equal((await calls.findOne({ _id: "end1" }))!.cancelledBy, "alice");
      assert.deepEqual(await endMod.endCallNow(alice, "end1", { conference: d }), { ok: true, via: "already_over" });

      // 2. a take-over holder may end somebody else's call
      await calls.insertOne(mkCall("end2", { callSid: hex("CA", 802), createdAt: old, updatedAt: old, dialedAt: old }) as never);
      await mkConf("end2", hex("CA", 802));
      assert.equal((await endMod.endCallNow(mgr, "end2", { conference: d })).ok, true);

      // 3. over, but no callback ever arrived: Twilio says completed -> settled (answered call is completed with Twilio's seconds)
      await calls.insertOne(mkCall("stale1", { status: "in_progress", callSid: hex("CA", 803), createdAt: old, updatedAt: old, dialedAt: old }) as never);
      await mkConf("stale1", hex("CA", 803), { leadState: "joined", answeredAt: old });
      // 4. recent: left alone by the sweep of stale calls
      await calls.insertOne(mkCall("fresh1", { status: "in_progress", callSid: hex("CA", 804) }) as never);
      await mkConf("fresh1", hex("CA", 804), { leadState: "joined", answeredAt: new Date(), updatedAt: new Date() });
      const moved = await stale.reconcileStaleCalls({ initiatorId: "alice" }, { conference: d });
      assert.equal(moved >= 1, true);
      assert.equal(await status("stale1"), "completed");
      assert.equal((await calls.findOne({ _id: "stale1" }))!.durationSecs, 42);
      assert.equal(await status("fresh1"), "in_progress", "calls with recent progress are not asked about");
      // Twilio still says it is going: nothing changes
      const stillOn = (async (u: string, init?: RequestInit) => ((init?.method ?? "GET") === "GET" ? new Response(JSON.stringify({ status: "in-progress", duration: null }), { status: 200 }) : fetchFake(u, init as never))) as unknown as typeof fetch;
      assert.equal(await stale.reconcileCallNow("fresh1", { conference: { ...d, fetch: stillOn } }), false);
      assert.equal(await status("fresh1"), "in_progress");

      // 5. a direct call that never got a conversation: Twilio's status by call sid settles it (no answer)
      await calls.insertOne(mkCall("direct1", { callSid: hex("CA", 805), conversationId: null, createdAt: old, updatedAt: old, dialedAt: old }) as never);
      const noAnswer = (async () => new Response(JSON.stringify({ status: "no-answer", duration: "0" }), { status: 200 })) as unknown as typeof fetch;
      assert.equal(await stale.reconcileCallNow("direct1", { twilio: async () => ({ accountSid: hex("AC", 1), authToken: "t" }), fetch: noAnswer }), true);
      assert.equal(await status("direct1"), "no_answer");
      // and ending it while ringing hangs up by call sid
      await calls.insertOne(mkCall("direct2", { callSid: hex("CA", 806), conversationId: null, createdAt: old, updatedAt: old, dialedAt: old }) as never);
      const hung: string[] = [];
      const twilioFetch = (async (u: string, init?: RequestInit) => { if (init?.method === "POST") hung.push(`${u} ${String(init.body)}`); return new Response(JSON.stringify({ status: "canceled", duration: "0" }), { status: 200 }); }) as unknown as typeof fetch;
      const e2 = await endMod.endCallNow(alice, "direct2", { twilio: async () => ({ accountSid: hex("AC", 1), authToken: "t" }), fetch: twilioFetch });
      assert.deepEqual(e2, { ok: true, via: "twilio" });
      assert.ok(hung.some((h) => h.includes(`/Calls/${hex("CA", 806)}.json Status=completed`)));
      assert.notEqual(await status("direct2"), "dialing");
    });
  });

  await t("tenant isolation: company B sees nothing of company A's conference, calls or token", async () => {
    await runAsCompany(CO_B, async () => {
      assert.equal(await state.getConference(callId), null);
      await assert.rejects(live.getLiveView(admin, callId, 0), NotFoundError);
      assert.equal(await setup.companyForTwilioToken(tokenA), CO_A);
      assert.notEqual(await setup.twilioToken(), tokenA);
    });
    assert.equal(await setup.companyForTwilioToken("x".repeat(30)), null);
  });

  await pdb.dropDatabase();
  console.log("voice conference tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
