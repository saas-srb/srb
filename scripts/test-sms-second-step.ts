/**
 * SMS second step on a throwaway database, Twilio stubbed (nothing leaves the machine).
 *   MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_sms_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-sms-second-step.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

if (!/zz_throwaway/.test(process.env.MONGODB_URI ?? "")) { console.error("MONGODB_URI must name a throwaway database"); process.exit(2); }
process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "DLT_ENTITY_ID", "DLT_TEMPLATE_ID", "DLT_SENDER_ID", "RESEND_API_KEY", "EMAIL_PROVIDER"]) delete process.env[k];
const ringStore = () => ((globalThis as unknown as { __keyring: { loaded: unknown } }).__keyring ??= { loaded: null });
ringStore().loaded = { state: "unavailable", keys: [], action: null, message: null, at: Date.now() + 1e12 };

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failures.push(name); console.log("  ✗", name, "\n   ", e instanceof Error ? e.message : e); }
}

(async () => {
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const { getDb, clientPromise } = await import("../src/lib/mongodb");
  const { hashPassword } = await import("../src/lib/lms-auth");
  const { verifyHubCredentials } = await import("../src/lib/hub-auth");
  const sms = await import("../src/lib/security/sms-otp");
  const server = await import("../src/lib/security/second-step-server");
  const C = "co-sms";
  const PASS = "Pass#12345678";
  const db = (await clientPromise).db();
  await db.dropDatabase();

  const sent: { to: string; from: string; body: string; dlt?: string }[] = [];
  let providerDown = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    if (!String(_u).includes("twilio.com")) return realFetch(_u as never, init);
    if (providerDown) return new Response("{}", { status: 500 });
    const f = new URLSearchParams(String(init?.body));
    sent.push({ to: f.get("To")!, from: f.get("From")!, body: f.get("Body")!, dlt: f.get("DltTemplateId") ?? undefined });
    return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
  }) as typeof fetch;
  const configure = (dlt: boolean) => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_SMS_FROM = "+15005550006";
    if (dlt) { process.env.DLT_ENTITY_ID = "E1"; process.env.DLT_TEMPLATE_ID = "T1"; process.env.DLT_SENDER_ID = "SELFRN"; } else for (const k of ["DLT_ENTITY_ID", "DLT_TEMPLATE_ID", "DLT_SENDER_ID"]) delete process.env[k];
    server.bustSecondStepPolicyCache();
  };
  const user = async (email: string, phone = "+919876543210") =>
    runAsCompany(C, async () => {
      const users = (await getDb()).collection("admin_users");
      return (await users.insertOne({ email, name: email, passwordHash: hashPassword(PASS), roles: ["admin"], status: "active", failedLoginAttempts: 0, lockedUntil: null, emailVerified: true, createdAt: new Date(), secondStep: { sms: { e164: phone, verifiedAt: new Date() }, preferred: "sms" } } as never)).insertedId;
    });
  const login = (email: string, code = "", resend = false, method: string | null = null) => runAsCompany(C, () => verifyHubCredentials(email, PASS, code, { resend, method }));
  const doc = (email: string) => runAsCompany(C, async () => (await getDb()).collection("admin_users").findOne({ email }));
  const clearOtp = () => runAsCompany(C, async () => (await getDb()).collection("sms_otps").deleteMany({}));
  const lastCode = () => /(\d{6})/.exec(sent[sent.length - 1]?.body ?? "")?.[1];

  await check("off by default and gated on provider + DLT: nothing is offered, nothing is sent", async () => {
    await user("a@sms.test");
    configure(false);
    delete process.env.TWILIO_ACCOUNT_SID;
    assert.equal(await sms.smsConfigured(), false);
    assert.equal(await runAsCompany(C, () => sms.smsUsableFor("+919876543210")), false);
    const r = await login("a@sms.test");
    assert.ok(!r.ok && r.nothingUsable, "SMS is the only method and it is not on: calm 'nothing usable' state");
    assert.ok(!/administrator/i.test(`${r.info}`), "no 'ask your administrator' wording at sign-in");
    assert.equal(sent.length, 0);
  });

  await check("DLT gating: +91 needs the DLT fields, other countries need only the provider", async () => {
    configure(false);
    assert.equal(await runAsCompany(C, () => sms.smsUsableFor("+919876543210")), false);
    assert.equal(await runAsCompany(C, () => sms.smsUsableFor("+14155550132")), true);
    configure(true);
    assert.equal(await runAsCompany(C, () => sms.smsUsableFor("+919876543210")), true);
  });

  await check("sign-in texts a code (policy on), single use, hashed, and the DLT fields travel with +91 numbers", async () => {
    configure(true);
    await server.savePlatformPolicy({ smsAllowed: true }, "tester");
    const first = await login("a@sms.test");
    assert.ok(!first.ok && first.method === "sms", JSON.stringify(first));
    assert.equal(first.hint, "+91 ******3210");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "+919876543210");
    assert.equal(sent[0].from, "SELFRN", "the DLT sender id is the From for +91");
    assert.equal(sent[0].dlt, "T1");
    const stored = await runAsCompany(C, async () => (await getDb()).collection("sms_otps").findOne({}));
    assert.ok(stored && !JSON.stringify(stored).includes(lastCode()!), "only a hash is stored");
    const code = lastCode()!;
    assert.ok(!(await login("a@sms.test", "000000", false, "sms")).ok, "a wrong code does not sign in");
    assert.ok((await login("a@sms.test", code, false, "sms")).ok, "the right code signs in");
    assert.ok(!(await login("a@sms.test", code, false, "sms")).ok, "single use");
  });

  await check("resend cooldown, hourly and daily caps and the per-number cap", async () => {
    await clearOtp();
    const id = await user("b@sms.test", "+919812345678");
    const id2 = await user("c@sms.test", "+919812345678");
    const r1 = await runAsCompany(C, () => sms.sendSmsCode(id as never, "+919812345678", "login"));
    assert.ok(r1.ok);
    const again = await runAsCompany(C, () => sms.sendSmsCode(id as never, "+919812345678", "login"));
    assert.ok(!again.ok && again.waitSeconds && again.waitSeconds > 0 && again.waitSeconds <= 45, "cooldown");
    // five an hour per person and purpose
    await runAsCompany(C, async () => (await getDb()).collection("sms_otps").updateOne({ adminId: String(id) }, { $set: { sentAt: new Date(Date.now() - 60_000), sends: Array.from({ length: 5 }, () => new Date()) } }));
    const hourly = await runAsCompany(C, () => sms.sendSmsCode(id as never, "+919812345678", "login"));
    assert.ok(!hourly.ok && /hour/.test(hourly.error));
    // the same number through another account is capped too
    const flood = await runAsCompany(C, () => sms.sendSmsCode(id2 as never, "+919812345678", "login"));
    assert.ok(!flood.ok && /this number/.test(flood.error), JSON.stringify(flood));
    // ten a day per person
    const id3 = await user("d@sms.test", "+919800000001");
    await runAsCompany(C, async () => (await getDb()).collection("sms_otps").insertOne({ _id: `${String(id3)}:enable`, adminId: String(id3), purpose: "enable", numberHash: "x", codeHash: "x", expiresAt: new Date(Date.now() + 1000), attempts: 0, sentAt: new Date(Date.now() - 3_000_000), sends: Array.from({ length: 10 }, () => new Date(Date.now() - 7_200_000)) } as never));
    const daily = await runAsCompany(C, () => sms.sendSmsCode(id3 as never, "+919800000001", "login"));
    assert.ok(!daily.ok && /today/.test(daily.error));
  });

  await check("a provider failure is never counted as the person's failure, and the other methods open", async () => {
    await clearOtp();
    await user("e@sms.test", "+919822222222");
    await runAsCompany(C, async () => (await getDb()).collection("admin_users").updateOne({ email: "e@sms.test" }, { $set: { "secondStep.recovery": [require("node:crypto").createHash("sha256").update("abcde12345").digest("hex")] } }));
    providerDown = true;
    const r = await login("e@sms.test");
    assert.ok(!r.ok && r.method === "recovery", "the recovery method opens instead");
    assert.ok(!/provider|server|twilio|500|key/i.test(`${r.info} ${r.error}`));
    assert.equal((await doc("e@sms.test"))?.failedLoginAttempts ?? 0, 0);
    providerDown = false;
  });

  await check("wrong SMS codes: five tries per code, and only genuine wrong codes count at sign-in", async () => {
    await clearOtp();
    await user("f@sms.test", "+919833333333");
    const first = await login("f@sms.test");
    assert.ok(!first.ok && first.method === "sms");
    const code = lastCode()!;
    for (let i = 0; i < 5; i++) await login("f@sms.test", "111111", false, "sms");
    assert.ok(!(await login("f@sms.test", code, false, "sms")).ok, "the code is dead after five wrong tries");
    await server.savePlatformPolicy({ smsAllowed: false }, "tester");
  });

  globalThis.fetch = realFetch;
  await db.dropDatabase();
  (await clientPromise).close();
  console.log(`\n${passed} passed${failures.length ? `, ${failures.length} failed: ${failures.join("; ")}` : ""}`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
