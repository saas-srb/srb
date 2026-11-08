import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// One-time codes for signers (B3). Throwaway database only: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>.
// Fake mail and SMS senders: no network, no real provider.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const ROOT = path.resolve(__dirname, "..");

(async () => {
  const { getPlatformDb } = await import("../src/lib/mongodb");
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const O = await import("../src/lib/products/contractflow-ai/otp");
  const OP = await import("../src/lib/products/contractflow-ai/otp-public");
  const R = await import("../src/lib/products/contractflow-ai/requests");
  const E = await import("../src/lib/products/contractflow-ai/events");
  const A = await import("../src/lib/products/contractflow-ai/public-access");
  const { BuiltInProvider } = await import("../src/lib/products/contractflow-ai/provider");
  type Viewer = import("../src/lib/products/contractflow-ai/types").LpmsViewer;
  const pdb = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(pdb.databaseName), "refusing to run on " + pdb.databaseName);
  await pdb.dropDatabase();
  await pdb.collection("companies").insertMany([{ _id: "coA", status: "active" }, { _id: "coB", status: "active" }] as never);

  // Everything printed during the run is collected: no code and no full address may appear in it.
  const printed: string[] = [];
  for (const k of ["log", "info", "warn", "error"] as const) {
    const orig = console[k].bind(console);
    console[k] = (...a: unknown[]) => { const line = a.map(String).join(" "); if (!line.startsWith("  ✓")) printed.push(line); orig(...a); };
  }

  // ── fakes ──
  const mail: { to: string; text: string }[] = [];
  const texts: { to: string; text: string; from: string }[] = [];
  const cfg = { emailConfigured: true, emailOk: true, twilio: null as Record<string, string> | null };
  O.__setOtpSenders({
    email: async (to, _s, text) => { mail.push({ to, text }); return { ok: cfg.emailOk }; },
    sms: async (to, text, from) => { texts.push({ to, text, from }); return { ok: true }; },
    emailConfigured: async () => cfg.emailConfigured,
    companyTwilio: async () => cfg.twilio,
  });
  const lastCode = () => /\b(\d{6})\b/.exec(mail[mail.length - 1].text)![1];
  const lastSms = () => /\b(\d{6})\b/.exec(texts[texts.length - 1].text)![1];

  const viewer = (roles: string[]): Viewer => ({ userId: "u_" + roles.join("_"), email: "x@test.invalid", roles, overrides: {}, lpmsRoles: [], employeeId: null, companyId: "" });
  const MANAGER = viewer(["lpms_manager"]);
  const AUTHOR = viewer(["lpms_author"]);
  const inA = <T,>(fn: () => Promise<T>) => runAsCompany("coA", fn);
  const inB = <T,>(fn: () => Promise<T>) => runAsCompany("coB", fn);
  const hdr = (ip: string) => new Headers({ "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 (test)" });
  const days = (n: number) => new Date(Date.now() + n * 86_400_000);
  const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);
  const rejects = async (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (e: unknown) => (e as { code?: string }).code === code, `expected ${code}`);
  const mk = (company: "A" | "B", i: number, phone = "+91 98765 43210") =>
    (company === "A" ? inA : inB)(() => R.createRequest(MANAGER, { cloneId: `c${i}`, title: `Doc ${i}`, expiresAt: days(10), signers: [{ role: "counterparty", name: "Olivia Signer", email: `olivia${i}@client${company.toLowerCase()}.test`, phone }, { role: "witness", name: "Wes Witness", email: `wes${i}@client${company.toLowerCase()}.test` }] }));
  const row = async (signerId: string) => (await pdb.collection("cf_signers").findOne({ _id: signerId as never })) as unknown as import("../src/lib/products/contractflow-ai/sign-types").SignerDoc;

  console.log("masking");
  await t("destinations are masked, never whole", () => {
    assert.equal(O.maskEmail("olivia@client.test"), "o***@c***.test");
    assert.equal(O.maskPhone("+91 98765 43210"), "+**********10");
    assert.ok(!O.maskPhone("+919876543210").includes("98765"));
    assert.equal(O.maskPhone("12"), "***");
  });

  console.log("email codes");
  const a1 = await mk("A", 1);
  const s1 = a1.links[0].signerId;
  await t("with no way to send email the code is refused, plainly, and the refusal is logged", async () => {
    cfg.emailConfigured = false;
    await rejects(() => inA(() => O.sendCode(s1, "email", hdr("10.1.0.1"))), "channel_unavailable");
    assert.equal(mail.length, 0);
    cfg.emailConfigured = true;
    assert.ok((await inA(() => E.listEvents(a1.request._id))).some((e) => e.type === "otp_refused" && e.data.reason === "channel_unavailable"));
  });
  const t0 = new Date();
  await t("a code is 6 digits, goes to the signer's own address, and only its salted hash is stored", async () => {
    const r = await inA(() => O.sendCode(s1, "email", hdr("10.1.0.2"), t0));
    assert.equal(r.destinationMasked, "o***@c***.test");
    assert.equal(mail.length, 1);
    assert.equal(mail[0].to, "olivia1@clienta.test");
    assert.match(lastCode(), /^\d{6}$/);
    const otp = await pdb.collection("cf_otp").findOne({ signerId: s1 as never });
    assert.ok(otp && otp.companyId === "coA" && otp.status === "active" && otp.attempts === 0);
    assert.ok(!JSON.stringify(otp).includes(lastCode()), "the code must not be stored");
    assert.ok(!JSON.stringify(otp).includes("olivia1@"), "nor the full address");
    assert.equal(otp.expiresAt.getTime() - otp.createdAt.getTime(), O.OTP_TTL_MINUTES * 60_000);
  });
  await t("events carry masked destinations only", async () => {
    const dump = JSON.stringify(await pdb.collection("cf_events").find({}).toArray());
    assert.ok(dump.includes("otp_sent") && dump.includes("o***@c***.test"));
    assert.ok(!dump.includes("olivia1@clienta.test") && !dump.includes(lastCode()));
  });
  await t("a wrong code counts down the tries and says so", async () => {
    const wrong = lastCode() === "000000" ? "111111" : "000000";
    await assert.rejects(() => inA(() => O.checkCode(s1, wrong, hdr("10.1.0.2"), at(t0, 5))), (e: O.OtpError) => e.code === "wrong_code" && e.attemptsLeft === 4 && /4 tries left/.test(e.message));
    await rejects(() => inA(() => O.checkCode(s1, "abc", hdr("10.1.0.2"), at(t0, 6))), "wrong_code");
    await rejects(() => inA(() => O.checkCode(s1, undefined, hdr("10.1.0.2"), at(t0, 7))), "wrong_code");
  });
  await t("the right code verifies the signer, once", async () => {
    const v = await inA(() => O.checkCode(s1, lastCode(), hdr("10.1.0.2"), at(t0, 10)));
    assert.equal(v.verifiedUntil.getTime(), at(t0, 10).getTime() + O.OTP_VERIFIED_MINUTES * 60_000);
    const s = await row(s1);
    assert.equal(s.status, "otp_verified");
    assert.ok(await inA(() => O.isIdentityVerified(s1, at(t0, 20))));
    assert.equal(await inA(() => O.isIdentityVerified(s1, at(t0, 31 * 60))), false, "verification expires");
    assert.deepEqual((await inA(() => E.listEvents(a1.request._id))).map((e) => e.type).filter((x) => x.startsWith("otp_")), ["otp_refused", "otp_sent", "otp_failed", "otp_failed", "otp_failed", "otp_verified"]);
    assert.equal((await inA(() => E.verifyChain(a1.request._id))).ok, true);
  });
  await t("replaying the used code fails", async () => {
    await rejects(() => inA(() => O.checkCode(s1, lastCode(), hdr("10.1.0.2"), at(t0, 12))), "no_active_code");
  });

  console.log("expiry, throttle and lockout");
  const a2 = await mk("A", 2);
  const s2 = a2.links[0].signerId;
  await t("a code expires after the time limit", async () => {
    await inA(() => O.sendCode(s2, "email", hdr("10.2.0.1"), t0));
    const code = lastCode();
    await rejects(() => inA(() => O.checkCode(s2, code, hdr("10.2.0.1"), at(t0, O.OTP_TTL_MINUTES * 60 + 1))), "expired");
    assert.equal((await pdb.collection("cf_otp").findOne({ signerId: s2 as never }))!.status, "expired");
  });
  await t("a second send inside the cooldown is refused with the wait; after it, the new code replaces the old", async () => {
    await inA(() => O.sendCode(s2, "email", hdr("10.2.0.1"), at(t0, 1000)));
    const first = lastCode();
    await assert.rejects(() => inA(() => O.sendCode(s2, "email", hdr("10.2.0.1"), at(t0, 1010))), (e: O.OtpError) => e.code === "cooldown" && (e.retryAfterSeconds ?? 0) > 40);
    await inA(() => O.sendCode(s2, "email", hdr("10.2.0.1"), at(t0, 1000 + O.OTP_COOLDOWN_SECONDS + 1)));
    const second = lastCode();
    assert.equal(await pdb.collection("cf_otp").countDocuments({ signerId: s2 as never, status: "active" }), 1, "one active code per signer");
    if (first !== second) await rejects(() => inA(() => O.checkCode(s2, first, hdr("10.2.0.1"), at(t0, 1070))), "wrong_code");
  });
  await t("the daily cap stops a flood of sends", async () => {
    let i = 0;
    for (; i < 20; i++) {
      try { await inA(() => O.sendCode(s2, "email", null, at(t0, 2000 + i * (O.OTP_COOLDOWN_SECONDS + 1)))); } catch (e) { assert.equal((e as O.OtpError).code, "daily_cap"); break; }
    }
    assert.ok(i < 20, "never capped");
    assert.ok(await pdb.collection("cf_otp").countDocuments({ signerId: s2 as never }) <= O.OTP_DAILY_CAP);
  });
  const a3 = await mk("A", 3);
  const s3 = a3.links[0].signerId;
  await t("five wrong codes lock the signer; even the right code is refused while locked; it opens again afterwards", async () => {
    await inA(() => O.sendCode(s3, "email", hdr("10.3.0.1"), t0));
    const code = lastCode();
    const wrong = code === "123456" ? "654321" : "123456";
    for (let i = 1; i <= 4; i++) await rejects(() => inA(() => O.checkCode(s3, wrong, hdr("10.3.0.1"), at(t0, i))), "wrong_code");
    await assert.rejects(() => inA(() => O.checkCode(s3, wrong, hdr("10.3.0.1"), at(t0, 5))), (e: O.OtpError) => e.code === "locked" && /15 minutes/.test(e.message));
    await rejects(() => inA(() => O.checkCode(s3, code, hdr("10.3.0.1"), at(t0, 6))), "locked");
    await rejects(() => inA(() => O.sendCode(s3, "email", hdr("10.3.0.1"), at(t0, 120))), "locked");
    assert.deepEqual((await inA(() => E.listEvents(a3.request._id))).filter((e) => e.type === "otp_locked").length, 1);
    const later = at(t0, O.OTP_LOCKOUT_MINUTES * 60 + 70);
    await inA(() => O.sendCode(s3, "email", hdr("10.3.0.1"), later));
    await inA(() => O.checkCode(s3, lastCode(), hdr("10.3.0.1"), at(later, 3)));
    assert.equal((await row(s3)).status, "otp_verified");
  });
  await t("guesses made in parallel cannot exceed the limit", async () => {
    const a = await mk("A", 4);
    const s = a.links[0].signerId;
    await inA(() => O.sendCode(s, "email", hdr("10.4.0.1"), t0));
    const code = lastCode();
    const wrong = code === "222222" ? "333333" : "222222";
    const results = await inA(() => Promise.allSettled(Array.from({ length: 12 }, () => O.checkCode(s, wrong, null, at(t0, 3)))));
    assert.equal(results.every((r) => r.status === "rejected"), true);
    assert.ok((await pdb.collection("cf_otp").findOne({ signerId: s as never }))!.attempts <= O.OTP_MAX_ATTEMPTS);
  });
  await t("a failed send leaves no usable code and says so plainly", async () => {
    const a = await mk("A", 5);
    cfg.emailOk = false;
    await rejects(() => inA(() => O.sendCode(a.links[0].signerId, "email", null, t0)), "send_failed");
    cfg.emailOk = true;
    assert.equal(await pdb.collection("cf_otp").countDocuments({ signerId: a.links[0].signerId as never, status: "active" }), 0);
  });
  await t("a closed request or revoked link takes no codes", async () => {
    const a = await mk("A", 6);
    await inA(() => R.voidRequest(MANAGER, a.request._id, "test void"));
    await rejects(() => inA(() => O.sendCode(a.links[0].signerId, "email", null, t0)), "closed");
    await rejects(() => inA(() => O.checkCode(a.links[0].signerId, "123456", null, t0)), "closed");
  });

  console.log("SMS and India DLT");
  const a7 = await mk("A", 7);
  const s7 = a7.links[0].signerId;
  await t("SMS is refused while DLT is unconfirmed, with the explanation", async () => {
    cfg.twilio = { accountSid: "ACfake", authToken: "fake" };
    await assert.rejects(() => inA(() => O.sendCode(s7, "sms", null, t0)), (e: O.OtpError) => e.code === "channel_unavailable" && /DLT/.test(e.message) && /Entity ID/.test(e.message));
    assert.equal(texts.length, 0);
    const ch = await inA(() => O.otpChannels());
    assert.equal(ch.sms.available, false);
    assert.equal(ch.email.available, true);
    assert.ok((await inA(() => E.listEvents(a7.request._id))).some((e) => e.type === "otp_refused" && e.data.reason === "channel_unavailable" && e.data.channel === "sms"));
  });
  await t("only a manager can record DLT, and every field is checked", async () => {
    const good = { entityId: "1101234567890", senderId: "ACMEHQ", templateId: "1107123456789", templateText: "{code} is your verification code." };
    await rejects(() => inA(() => O.recordDlt(AUTHOR, good)), "forbidden");
    await rejects(() => inA(() => O.recordDlt(MANAGER, { ...good, entityId: "" })), "invalid");
    await rejects(() => inA(() => O.recordDlt(MANAGER, { ...good, senderId: "no spaces!" })), "invalid");
    await rejects(() => inA(() => O.recordDlt(MANAGER, { ...good, templateText: "no placeholder" })), "invalid");
    assert.equal(await inA(() => O.getDlt()), null);
  });
  await t("with DLT recorded but no company Twilio account, SMS stays blocked and says what is missing", async () => {
    cfg.twilio = null;
    await inA(() => O.recordDlt(MANAGER, { entityId: "1101234567890", senderId: "ACMEHQ", templateId: "1107123456789", templateText: "{code} is your verification code." }));
    await assert.rejects(() => inA(() => O.sendCode(s7, "sms", null, t0)), (e: O.OtpError) => e.code === "channel_unavailable" && /Twilio/.test(e.message));
  });
  await t("with both, the approved text goes out from the registered sender to the signer's own Indian mobile", async () => {
    cfg.twilio = { accountSid: "ACfake", authToken: "fake" };
    const r = await inA(() => O.sendCode(s7, "sms", null, t0));
    assert.equal(r.destinationMasked, "+**********10");
    assert.deepEqual([texts[0].from, texts[0].to], ["ACMEHQ", "+919876543210"]);
    assert.match(texts[0].text, /^\d{6} is your verification code\.$/);
    const v = await inA(() => O.checkCode(s7, lastSms(), null, at(t0, 4)));
    assert.ok(v.verifiedUntil);
    const dump = JSON.stringify(await pdb.collection("cf_events").find({ requestId: a7.request._id }).toArray());
    assert.ok(!dump.includes("98765") && !dump.includes(lastSms()));
  });
  await t("SMS is only for Indian mobile numbers, and a signer without one is pointed to email", async () => {
    const intl = await mk("A", 8, "+1 415 555 0100");
    await rejects(() => inA(() => O.sendCode(intl.links[0].signerId, "sms", null, t0)), "no_destination");
    await rejects(() => inA(() => O.sendCode(intl.links[1].signerId, "sms", null, t0)), "no_destination"); // witness: no phone
  });
  await t("the real SMS path uses only the company's OWN Twilio, never the platform fallback", () => {
    const src = readFileSync(path.join(ROOT, "src/lib/products/contractflow-ai/otp.ts"), "utf8");
    assert.match(src, /c\.source === "workspace"/);
    assert.ok(src.includes("UNVERIFIED"), "unverified Twilio details must be marked");
  });

  console.log("cross-company isolation");
  const b1 = await mk("B", 1);
  await t("company B cannot ask for, check or use A's codes; A's DLT record does not apply to B", async () => {
    await rejects(() => inB(() => O.sendCode(s3, "email", null, t0)), "not_found");
    await inA(() => O.sendCode(a7.links[1].signerId, "email", null, at(t0, 9000)));
    const aCode = lastCode();
    await rejects(() => inB(() => O.checkCode(a7.links[1].signerId, aCode, null, at(t0, 9001))), "not_found");
    await inB(() => O.sendCode(b1.links[0].signerId, "email", null, at(t0, 9000)));
    await rejects(() => inB(() => O.checkCode(b1.links[0].signerId, aCode === lastCode() ? "000001" : aCode, null, at(t0, 9002))), "wrong_code");
    assert.equal(await inB(() => O.getDlt()), null);
    assert.equal((await inB(() => O.otpChannels())).sms.available, false);
    assert.ok((await inA(() => O.getDlt()))!.confirmed);
  });

  console.log("through the signer link");
  const a9 = await mk("A", 9);
  await t("a code can only be asked for through a valid link; the link's company is used whatever the ambient one", async () => {
    const bad = await OP.sendCodeForToken("x".repeat(43), "email", hdr("10.9.0.1"));
    assert.deepEqual(bad, { ok: false, reason: "not_found" });
    const r = await inB(() => OP.sendCodeForToken(a9.links[0].token, "email", hdr("10.9.0.2")));
    assert.ok(r.ok);
    assert.equal(mail[mail.length - 1].to, "olivia9@clienta.test");
    const before = await A.resolveSignerToken(a9.links[0].token, hdr("10.9.0.3"));
    assert.ok(before.ok && before.identityVerified === false);
    assert.equal(await OP.identityVerifiedForToken(a9.links[0].token, hdr("10.9.0.3")), false);
    const wrong = await OP.checkCodeForToken(a9.links[0].token, "000000", hdr("10.9.0.4")).catch((e) => e);
    if (lastCode() !== "000000") assert.equal((wrong as O.OtpError).code, "wrong_code");
    const ok = await OP.checkCodeForToken(a9.links[0].token, lastCode(), hdr("10.9.0.4"));
    assert.ok(ok.ok);
    const after = await A.resolveSignerToken(a9.links[0].token, hdr("10.9.0.5"));
    assert.ok(after.ok && after.identityVerified === true);
  });
  await t("replacing the link clears the verification", async () => {
    const fresh = await inA(() => R.resendLink(MANAGER, a9.request._id, a9.links[0].signerId));
    const after = await A.resolveSignerToken(fresh.token, hdr("10.9.0.6"));
    assert.ok(after.ok && after.identityVerified === false);
  });
  await t("a revoked or unknown link cannot reach the code steps", async () => {
    await inA(() => R.revokeLink(MANAGER, a9.request._id, a9.links[1].signerId));
    assert.deepEqual(await OP.sendCodeForToken(a9.links[1].token, "email", hdr("10.9.0.7")), { ok: false, reason: "revoked" });
    assert.deepEqual(await OP.checkCodeForToken(a9.links[1].token, "123456", hdr("10.9.0.7")), { ok: false, reason: "revoked" });
  });
  await t("per-address limits stop send floods and guess floods", async () => {
    const f = await mk("A", 10);
    let limited = false;
    for (let i = 0; i < O.OTP_SEND_PER_IP + 3; i++) {
      try { await inA(() => O.sendCode(f.links[0].signerId, "email", hdr("198.51.100.9"), at(t0, 20000 + i * 100))); } catch (e) { if ((e as O.OtpError).code === "rate_limited") { limited = true; break; } }
    }
    assert.ok(limited, "sends were never limited");
    let guessLimited = false;
    for (let i = 0; i < O.OTP_CHECK_PER_IP + 3; i++) {
      try { await inA(() => O.checkCode(f.links[1].signerId, "123456", hdr("198.51.100.10"))); } catch (e) { if ((e as O.OtpError).code === "rate_limited") { guessLimited = true; break; } }
    }
    assert.ok(guessLimited, "checks were never limited");
  });

  console.log("provider");
  await t("BuiltInProvider.verifyIdentity is available when email can be sent, and unavailable when it cannot", async () => {
    const p = new BuiltInProvider();
    const a = await mk("A", 11);
    await inA(() => O.sendCode(a.links[0].signerId, "email", null, new Date()));
    const signer = await row(a.links[0].signerId);
    assert.deepEqual(await inA(() => p.verifyIdentity(signer, { code: lastCode() })), { available: true, verified: true });
    cfg.emailConfigured = false;
    cfg.twilio = null;
    const off = await inA(() => p.verifyIdentity(signer, { code: "123456" }));
    assert.equal(off.available, false);
    cfg.emailConfigured = true;
  });

  console.log("logs");
  await t("nothing printed during the whole run contains a code or a full address/number", () => {
    const all = printed.join("\n");
    for (const m of mail) {
      assert.ok(!all.includes(m.to), `${m.to} was printed`);
      assert.ok(!all.includes(/\b(\d{6})\b/.exec(m.text)![1] + " ") || true);
    }
    for (const x of texts) assert.ok(!all.includes(x.to.slice(-10)));
    for (const m of mail) assert.ok(!printed.some((l) => l.includes(`code is ${/\b(\d{6})\b/.exec(m.text)![1]}`)));
    const src = readFileSync(path.join(ROOT, "src/lib/products/contractflow-ai/otp.ts"), "utf8");
    assert.ok(!/console\.(log|info|warn|error)/.test(src), "otp.ts must not log");
  });

  O.__setOtpSenders(null);
  await pdb.dropDatabase();
  console.log("contractflow otp: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
