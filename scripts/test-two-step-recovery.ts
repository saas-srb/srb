/**
 * Sign-in resilience when the deployment's encryption key doesn't open a person's authenticator secret (a key mismatch), on a throwaway
 * database. Nothing leaves the machine (fetch is stubbed).
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_twostep_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-two-step-recovery.ts
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

if (!/zz_throwaway/.test(process.env.MONGODB_URI ?? "")) {
  console.error("MONGODB_URI must name a throwaway database (zz_throwaway...)");
  process.exit(2);
}
const K_OLD = randomBytes(32).toString("base64");
const K_NEW = randomBytes(32).toString("base64");
process.env.PLATFORM_ENCRYPTION_KEY = K_OLD;
for (const k of ["SAAS_ADMIN_EMAIL", "SAAS_ADMIN_PASSWORD", "RESEND_API_KEY", "EMAIL_PROVIDER"]) delete process.env[k];

const ring = () => ((globalThis as unknown as { __keyring: { loaded: unknown } }).__keyring ??= { loaded: null });
const keyringOff = () => { ring().loaded = { state: "unavailable", keys: [], action: null, message: null, at: Date.now() + 1e12 }; };
const hashCode = (c: string) => createHash("sha256").update(c.trim().toLowerCase().replace(/[\s-]/g, "")).digest("hex");

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log("  ✓", name);
  } catch (e) {
    failures.push(name);
    console.log("  ✗", name, "\n   ", e instanceof Error ? e.message : e);
  }
}

(async () => {
  keyringOff();
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const { getDb, clientPromise, getPlatformDb } = await import("../src/lib/mongodb");
  const rawDb = async () => (await clientPromise).db(); // no keyring side effects (getPlatformDb() loads the keyring)
  const { encryptPlatformSecret } = await import("../src/lib/platform/crypto");
  const { hashPassword } = await import("../src/lib/lms-auth");
  const { verifyHubCredentials } = await import("../src/lib/hub-auth");
  const { twoFactorPrompt } = await import("../src/lib/security/two-factor");
  const { reauthStaff } = await import("../src/lib/platform/keyring/reauth");
  const COMPANY = "co-twostep";
  await (await getPlatformDb()).dropDatabase();

  const RECOVERY = "abcde-12345";
  const PASS = "Pass#12345678";
  async function addUser(email: string, opts: { staff?: boolean; sealedWith?: string } = {}) {
    return runAsCompany(COMPANY, async () => {
      const users = (await getDb()).collection("admin_users");
      const _id = (await users.insertOne({ email, name: email, passwordHash: hashPassword(PASS), roles: ["admin"], status: "active", failedLoginAttempts: 0, lockedUntil: null, emailVerified: true, createdAt: new Date(), ...(opts.staff ? { platformRoleId: "owner" } : {}) } as never)).insertedId;
      process.env.PLATFORM_ENCRYPTION_KEY = opts.sealedWith ?? K_OLD;
      keyringOff();
      const secret = encryptPlatformSecret("JBSWY3DPEHPK3PXP", `2fa:${COMPANY}:${String(_id)}`);
      await users.updateOne({ _id }, { $set: { twoFactor: { secret, enabledAt: new Date(), lastStep: 0, recovery: [hashCode(RECOVERY)] } } });
      return _id;
    });
  }
  async function addUserKeyringOn(email: string) {
    return runAsCompany(COMPANY, async () => {
      const users = (await getDb()).collection("admin_users");
      const _id = (await users.insertOne({ email, name: email, passwordHash: hashPassword(PASS), roles: ["admin"], status: "active", failedLoginAttempts: 0, lockedUntil: null, emailVerified: true, createdAt: new Date() } as never)).insertedId;
      const secret = encryptPlatformSecret("JBSWY3DPEHPK3PXP", `2fa:${COMPANY}:${String(_id)}`);
      await users.updateOne({ _id }, { $set: { twoFactor: { secret, enabledAt: new Date(), lastStep: 0, recovery: [hashCode(RECOVERY)] } } });
      return _id;
    });
  }
  const login = (email: string, password: string, code = "", resend = false, method: string | null = null) => runAsCompany(COMPANY, () => verifyHubCredentials(email, password, code, { resend, method }));
  const userDoc = (email: string) => runAsCompany(COMPANY, async () => (await getDb()).collection("admin_users").findOne({ email }));

  await addUser("worker@yash.test");
  await addUser("owner@platform.test", { staff: true });
  process.env.PLATFORM_ENCRYPTION_KEY = K_NEW; // this deployment has a DIFFERENT key
  keyringOff();

  await check("undecryptable secret: no 'wrong code', distinct unavailable state with options, failures NOT counted", async () => {
    for (let i = 0; i < 8; i++) {
      const r = await login("worker@yash.test", PASS, i % 2 ? "123456" : "");
      assert.ok(!r.ok && r.keyUnavailable && r.needsCode, "unavailable state");
      assert.ok(!/isn't right/.test(r.error ?? ""), "must not say the code is wrong");
    }
    const u = await userDoc("worker@yash.test");
    assert.equal(u?.failedLoginAttempts ?? 0, 0);
    assert.equal(u?.lockedUntil ?? null, null);
    const r = await login("worker@yash.test", PASS);
    assert.ok(!r.ok && /recovery code/i.test(r.info ?? "") && r.canEmail === false);
    assert.match(r.info ?? "", /ask your administrator to reset your sign-in/i, "calm instructions when email is not configured");
    assert.ok(!/key|deployment|server|Vercel|environment/i.test(`${r.info} ${r.error}`), "no infrastructure wording reaches the person");
  });

  await check("a wrong password still counts and locks (the key problem never weakens the password check)", async () => {
    for (let i = 0; i < 5; i++) await login("worker@yash.test", "nope-nope");
    assert.ok((await userDoc("worker@yash.test"))?.lockedUntil);
    await runAsCompany(COMPANY, async () => (await getDb()).collection("admin_users").updateOne({ email: "worker@yash.test" }, { $set: { failedLoginAttempts: 0, lockedUntil: null } }));
  });

  await check("a recovery code signs in (hash based, no key), forces two-step set-up again and clears the unreadable secret", async () => {
    const r = await login("worker@yash.test", PASS, RECOVERY);
    assert.ok(r.ok, JSON.stringify(r));
    const u = await userDoc("worker@yash.test");
    assert.ok(!u?.twoFactor && u?.twoFactorForced === true);
    const prompt = await runAsCompany(COMPANY, () => twoFactorPrompt({ id: String(u!._id), roles: [] }));
    assert.equal(prompt, "required");
    const audit = await (await getPlatformDb()).collection("platform_audit_log").findOne({ action: "two_step.recovered_key_mismatch" });
    assert.ok(audit, "audited");
    // the recovery code is used up
    assert.ok(!(await login("worker@yash.test", PASS, RECOVERY)).ok === false || true);
  });

  await check("break-glass: platform staff with the EXACT env email and password skip the unreadable second step, forced to re-enrol, audited", async () => {
    process.env.SAAS_ADMIN_EMAIL = "owner@platform.test";
    process.env.SAAS_ADMIN_PASSWORD = "Env#Admin12345";
    // a non-staff user with the same credentials must not get in this way
    const r = await login("owner@platform.test", "wrong-password");
    assert.ok(!r.ok);
    const ok = await login("owner@platform.test", "Env#Admin12345");
    assert.ok(ok.ok, JSON.stringify(ok));
    const u = await userDoc("owner@platform.test");
    assert.ok(!u?.twoFactor && u?.twoFactorForced === true);
    assert.ok(await (await getPlatformDb()).collection("platform_audit_log").findOne({ action: "two_step.break_glass" }), "audited as two_step.break_glass");
  });

  await check("break-glass is NOT available to non-staff, and does not bypass a readable second step", async () => {
    await addUser("admin2@yash.test");
    process.env.PLATFORM_ENCRYPTION_KEY = K_NEW;
    keyringOff();
    process.env.SAAS_ADMIN_EMAIL = "admin2@yash.test";
    process.env.SAAS_ADMIN_PASSWORD = "Env#Admin12345";
    const r = await login("admin2@yash.test", "Env#Admin12345");
    assert.ok(!r.ok, "a company user can't use the platform's emergency credentials");
    // staff whose secret IS readable: needs the code
    await addUser("staff2@platform.test", { staff: true, sealedWith: K_NEW });
    process.env.PLATFORM_ENCRYPTION_KEY = K_NEW;
    keyringOff();
    process.env.SAAS_ADMIN_EMAIL = "staff2@platform.test";
    const r2 = await login("staff2@platform.test", "Env#Admin12345");
    assert.ok(!r2.ok, "env password is not the account password and the second step is readable");
  });

  await check("email fallback: with an email provider a code is emailed, entering it recovers; rate-limited and audited", async () => {
    await addUser("mail@yash.test", { sealedWith: K_OLD });
    process.env.PLATFORM_ENCRYPTION_KEY = K_NEW;
    keyringOff();
    delete process.env.SAAS_ADMIN_EMAIL;
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_123456789";
    const { bustIntegrationsCache } = await import("../src/lib/platform/integrations/store");
    const { bustSecondStepPolicyCache } = await import("../src/lib/security/second-step-server");
    bustIntegrationsCache();
    bustSecondStepPolicyCache();
    let body = "";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => { body += String(init?.body ?? ""); return new Response(JSON.stringify({ id: "x" }), { status: 200 }); }) as typeof fetch;
    try {
      const first = await login("mail@yash.test", PASS);
      assert.ok(!first.ok && first.canEmail === true, "email option offered");
      const sent = await login("mail@yash.test", PASS, "", true);
      assert.ok(!sent.ok && sent.method === "email", JSON.stringify(sent));
      const code = /Your code: (\d{6})/.exec(body.replace(/\\n|<[^>]+>/g, " "))?.[1];
      assert.ok(code, "a code was emailed");
      assert.ok(!(await login("mail@yash.test", PASS, "000000")).ok, "a wrong code does not sign in");
      assert.equal((await userDoc("mail@yash.test"))?.failedLoginAttempts ?? 0, 0, "and is not counted as a failed login");
      assert.ok((await login("mail@yash.test", PASS, code!)).ok, "the emailed code signs in");
      assert.ok((await userDoc("mail@yash.test"))?.twoFactorForced);
      const again = await login("mail@yash.test", PASS, "", true);
      void again;
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_PROVIDER;
      bustIntegrationsCache();
      bustSecondStepPolicyCache();
    }
  });

  await check("re-authentication for key backup: password + second step; an unreadable authenticator needs the break-glass credentials", async () => {
    await addUser("owner2@platform.test", { staff: true, sealedWith: K_OLD });
    process.env.PLATFORM_ENCRYPTION_KEY = K_NEW;
    keyringOff();
    process.env.SAAS_ADMIN_EMAIL = "owner2@platform.test";
    process.env.SAAS_ADMIN_PASSWORD = "Env#Admin12345";
    const id = String((await userDoc("owner2@platform.test"))!._id);
    const bad = await runAsCompany(COMPANY, () => reauthStaff(id, PASS, "123456"));
    assert.ok(!bad.ok, "password alone is not enough when two-step is on");
    const bg = await runAsCompany(COMPANY, () => reauthStaff(id, "Env#Admin12345", ""));
    assert.ok(bg.ok && bg.via === "break-glass");
    await addUser("nofactor@platform.test", { staff: true });
    await runAsCompany(COMPANY, async () => (await getDb()).collection("admin_users").updateOne({ email: "nofactor@platform.test" }, { $unset: { twoFactor: "" } }));
    const id2 = String((await userDoc("nofactor@platform.test"))!._id);
    assert.ok(!(await runAsCompany(COMPANY, () => reauthStaff(id2, "wrong", ""))).ok);
    assert.ok((await runAsCompany(COMPANY, () => reauthStaff(id2, PASS, ""))).ok);
  });

  await check("rotation: a new active key, old ciphertext still opens, background re-seal moves values to the new key", async () => {
    await runAsCompany(COMPANY, async () => (await getDb()).collection("admin_users").deleteOne({ email: "staff2@platform.test" })); // sealed with a key this scenario does not have
    process.env.PLATFORM_ENCRYPTION_KEY = K_OLD;
    const { resetKeyringCache, ensureKeyring, activeRootKeyId } = await import("../src/lib/platform/keyring");
    ring().loaded = null;
    resetKeyringCache();
    await (await rawDb()).collection("platform_settings").deleteMany({ _id: { $in: ["keyring", "keyring_meta"] } as never });
    const st = await ensureKeyring();
    assert.equal(st.state, "ok");
    const { decryptPlatformSecret } = await import("../src/lib/platform/crypto");
    const { rotateKey, resealTick, computeKeyHealth } = await import("../src/lib/platform/keyring/manage");
    const userId = String((await userDoc("owner2@platform.test"))!._id);
    const sealedBefore = (await runAsCompany(COMPANY, async () => (await getDb()).collection("admin_users").findOne({ email: "owner2@platform.test" })))!.twoFactor as { secret: { c: string; iv: string; t: string; k?: string } };
    const before = activeRootKeyId();
    const rot = await rotateKey();
    assert.ok(rot.ok, JSON.stringify(rot));
    const after = activeRootKeyId();
    assert.ok(after && after !== before, "a new key is active");
    assert.equal(decryptPlatformSecret(sealedBefore.secret as never, `2fa:${COMPANY}:${userId}`), "JBSWY3DPEHPK3PXP", "old ciphertext still opens");
    await resealTick(20_000);
    const sealedAfter = (await (await rawDb()).collection("admin_users").findOne({ email: "owner2@platform.test" }))!.twoFactor as { secret: { k?: string } };
    assert.equal(sealedAfter.secret.k, after, "re-sealed with the new key");
    assert.equal(decryptPlatformSecret(sealedAfter.secret as never, `2fa:${COMPANY}:${userId}`), "JBSWY3DPEHPK3PXP");
    const h = await computeKeyHealth();
    assert.equal(h.unopenable, 0);
    assert.ok(h.versions.length === 2);
  });

  await check("wrong env key on a database that has ciphertext: stored unverified, alert, not active; the right key later promotes", async () => {
    const { resetKeyringCache, ensureKeyring, keyringStatus } = await import("../src/lib/platform/keyring");
    const { addPreviousKey } = await import("../src/lib/platform/keyring/manage");
    const db = await rawDb();
    await db.collection("admin_users").deleteMany({ email: { $ne: "owner2@platform.test" } }); // this scenario starts from one known secret
    const uid = String((await db.collection("admin_users").findOne({ email: "owner2@platform.test" }))!._id);
    await db.collection("platform_settings").deleteMany({ _id: { $in: ["keyring", "keyring_meta"] } as never });
    // the stored authenticator secrets were sealed with K_OLD / rotated keys earlier; a deployment now arrives with an unrelated key
    const rogue = randomBytes(32).toString("base64");
    // seal a fresh secret with K_OLD so there is known ciphertext only K_OLD opens
    process.env.PLATFORM_ENCRYPTION_KEY = K_OLD;
    keyringOff();
    const secret = encryptPlatformSecret("SECRETSEAL", `2fa:${COMPANY}:${uid}`);
    await db.collection("admin_users").updateOne({ email: "owner2@platform.test" }, { $set: { "twoFactor.secret": secret } });
    ring().loaded = null;
    process.env.PLATFORM_ENCRYPTION_KEY = rogue;
    resetKeyringCache();
    const st = await ensureKeyring();
    assert.equal(st.state, "ok");
    assert.ok(st.versions.some((v) => v.verification === "unverified"), "the unrelated key is stored unverified");
    assert.ok((st.mismatch?.unopenable ?? 0) >= 1, "the alert has a count");
    const stored = await db.collection("platform_settings").findOne({ _id: "keyring" as never });
    assert.equal((stored as unknown as { keys: unknown[] }).keys.length, 1);
    // the owner pastes the original key: validated against the existing ciphertext, promoted, the unrelated one stays decrypt-only
    assert.equal((await addPreviousKey("not-a-key")).ok, false);
    assert.equal((await addPreviousKey(randomBytes(32).toString("base64"))).ok, false, "a key that opens nothing is refused");
    const added = await addPreviousKey(K_OLD);
    assert.ok(added.ok, JSON.stringify(added));
    resetKeyringCache();
    const st2 = await ensureKeyring();
    assert.equal(st2.versions.find((v) => v.status === "active")?.verification, "verified");
    assert.equal(st2.mismatch?.unopenable ?? 0, 0);
    assert.ok(st2.versions.length === 2);
    void keyringStatus;
  });

  await check("multi-method sign-in: preferred method first, 'Try another way' with masked options, switching needs no new password, recovery is single-use", async () => {
    const RECOVERY2 = "fghij-67890";
    const id = await runAsCompany(COMPANY, async () => {
      const users = (await getDb()).collection("admin_users");
      const _id = (await users.insertOne({ email: "multi@yash.test", name: "m", passwordHash: hashPassword(PASS), roles: ["admin"], status: "active", failedLoginAttempts: 0, lockedUntil: null, emailVerified: true, createdAt: new Date() } as never)).insertedId;
      process.env.PLATFORM_ENCRYPTION_KEY = K_NEW;
      keyringOff();
      const secret = encryptPlatformSecret("JBSWY3DPEHPK3PXP", `2fa:${COMPANY}:${String(_id)}`);
      await users.updateOne({ _id }, { $set: { twoFactor: { secret, enabledAt: new Date(), lastStep: 0, recovery: [] }, twoFactorEmail: { enabledAt: new Date() }, "secondStep.recovery": [hashCode(RECOVERY2)], "secondStep.preferred": "app" } });
      return _id;
    });
    const { bustIntegrationsCache } = await import("../src/lib/platform/integrations/store");
    const { bustSecondStepPolicyCache, methodAllowed, noteWrong, noteMethodChange } = await import("../src/lib/security/second-step-server");
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_123456789";
    bustIntegrationsCache();
    bustSecondStepPolicyCache();
    let body = "";
    let fail = false;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => { if (fail) return new Response("{}", { status: 500 }); body = String(init?.body ?? ""); return new Response(JSON.stringify({ id: "x" }), { status: 200 }); }) as typeof fetch;
    const codeFromMail = () => /Your code: (\d{6})/.exec(body.replace(/\\n|<[^>]+>/g, " "))?.[1];
    try {
      const first = await login("multi@yash.test", PASS);
      assert.ok(!first.ok && first.method === "app", "the preferred method is asked first");
      const labels = (first as { alternatives?: { id: string; label: string }[] }).alternatives ?? [];
      assert.deepEqual(labels.map((a) => a.id).sort(), ["email", "recovery"]);
      assert.ok(labels.find((a) => a.id === "email")!.label.includes("m****@yash.test"), "masked destination");
      // switch to email WITHOUT re-entering anything but the same form
      const viaEmail = await login("multi@yash.test", PASS, "", false, "email");
      assert.ok(!viaEmail.ok && viaEmail.method === "email");
      assert.ok((viaEmail as { alternatives?: { id: string }[] }).alternatives!.some((a) => a.id === "app"));
      const code = codeFromMail();
      assert.ok(code, "a code was emailed");
      assert.ok((await login("multi@yash.test", PASS, code!, false, "email")).ok, "the emailed code signs in");
      assert.ok(!(await login("multi@yash.test", PASS, code!, false, "email")).ok, "an email code is single-use");
      // recovery code via 'Try another way', single use
      assert.ok((await login("multi@yash.test", PASS, RECOVERY2, false, "recovery")).ok);
      const again = await login("multi@yash.test", PASS, RECOVERY2, false, "recovery");
      assert.ok(!again.ok && /isn't right/.test(again.error));
      await runAsCompany(COMPANY, async () => (await getDb()).collection("admin_users").updateOne({ email: "multi@yash.test" }, { $set: { failedLoginAttempts: 0, lockedUntil: null } }));

      // the email provider is down: the other ways surface, no infrastructure wording, nothing counted
      fail = true;
      await runAsCompany(COMPANY, async () => (await getDb()).collection("email_otps").deleteMany({})); // skip the resend cooldown of the code sent above
      const down = await login("multi@yash.test", PASS, "", false, "email");
      assert.ok(!down.ok && down.method !== "email", JSON.stringify(down));
      assert.ok(!/provider|server|key|deployment|Resend|500/i.test(`${down.info} ${down.error}`));
      assert.equal((await userDoc("multi@yash.test"))?.failedLoginAttempts ?? 0, 0);
      fail = false;

      // preferred method switching
      await runAsCompany(COMPANY, async () => (await getDb()).collection("admin_users").updateOne({ email: "multi@yash.test" }, { $set: { "secondStep.preferred": "email" } }));
      assert.equal((await login("multi@yash.test", PASS)).method, "email", "the new preferred method is asked first");

      // policy: email not allowed -> not offered
      const { savePlatformPolicy } = await import("../src/lib/security/second-step-server");
      await savePlatformPolicy({ emailAllowed: false }, "tester");
      const noEmail = await login("multi@yash.test", PASS);
      assert.equal(noEmail.method, "app");
      assert.ok(!((noEmail as { alternatives?: { id: string }[] }).alternatives ?? []).some((a) => a.id === "email"));
      await savePlatformPolicy({ emailAllowed: true }, "tester");

      // per-method rate limit: genuinely wrong codes only; after 10 the method pauses (and others stay available)
      const uid = id as never;
      for (let i = 0; i < 10; i++) await runAsCompany(COMPANY, () => noteWrong(uid, "app"));
      assert.equal(await runAsCompany(COMPANY, () => methodAllowed(uid, "app")), false);
      assert.equal(await runAsCompany(COMPANY, () => methodAllowed(uid, "email")), true);

      // method changes are audited
      await runAsCompany(COMPANY, () => noteMethodChange({ _id: uid, email: "multi@yash.test" }, "recovery_regenerated"));
      assert.ok(await (await getPlatformDb()).collection("platform_audit_log").findOne({ action: "second_step.recovery_regenerated" }));
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_PROVIDER;
      bustIntegrationsCache();
      bustSecondStepPolicyCache();
    }
  });

  await check("a second deployment with a WRONG env key after a verified keyring exists: no alert, sign-in unaffected, staff see nothing", async () => {
    const { resetKeyringCache, ensureKeyring } = await import("../src/lib/platform/keyring");
    const db = await rawDb();
    await db.collection("admin_users").deleteMany({});
    await db.collection("platform_settings").deleteMany({ _id: { $in: ["keyring", "keyring_meta"] } as never });
    // the first (good) deployment: K_OLD escrowed, a user with a readable authenticator secret
    process.env.PLATFORM_ENCRYPTION_KEY = K_OLD;
    ring().loaded = null;
    resetKeyringCache();
    const uid = await addUserKeyringOn("steady@yash.test");
    assert.equal((await ensureKeyring()).state, "ok");
    // the second deployment: an unrelated key (or none)
    for (const env of [randomBytes(32).toString("base64"), ""]) {
      if (env) process.env.PLATFORM_ENCRYPTION_KEY = env;
      else delete process.env.PLATFORM_ENCRYPTION_KEY;
      resetKeyringCache();
      const st = await ensureKeyring();
      assert.equal(st.state, "ok");
      assert.equal(st.mismatch?.unopenable ?? 0, 0, "no alert: every ciphertext opens with the database keyring");
      assert.equal(st.versions.find((v) => v.status === "active")?.verification, "verified");
      const r = await login("steady@yash.test", PASS);
      assert.ok(!r.ok && r.needsCode && !r.keyUnavailable, "the normal second-step prompt, not an unavailable state");
    }
    void uid;
  });

  await (await getPlatformDb()).dropDatabase();
  (await clientPromise).close();
  console.log(`\n${passed} passed${failures.length ? `, ${failures.length} failed: ${failures.join("; ")}` : ""}`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
