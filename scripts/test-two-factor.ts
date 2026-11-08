/**
 * Two-step sign-in: the RFC 6238 test vectors, set-up, sign-in with a code, a recovery code, replay of a used code, lock-out on wrong codes, and
 * a Super Admin reset. Throwaway database, dropped at the end.
 *
 *   PLATFORM_ENCRYPTION_KEY=$(openssl rand -base64 32) MONGODB_URI=mongodb://127.0.0.1:27017/tf_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-two-factor.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { base32Encode, totpAtStep, verifyTotp } from "@/lib/security/totp";
import { confirmTwoFactorSetup, disableTwoFactor, resetTwoFactor, startTwoFactorSetup, twoFactorStatus } from "@/lib/security/two-factor";
import { verifyHubCredentials } from "@/lib/hub-auth";
import { hashPassword } from "@/lib/lms-auth";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  const pdb = await getPlatformDb();
  if (!/test/.test(pdb.databaseName)) throw new Error(`Refusing to run against "${pdb.databaseName}"`);
  if (!process.env.PLATFORM_ENCRYPTION_KEY) throw new Error("Set PLATFORM_ENCRYPTION_KEY (openssl rand -base64 32).");
  process.env.EMAIL_PROVIDER = "console";

  await check("RFC 6238 vectors (SHA-1, secret 12345678901234567890)", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    assert.equal(totpAtStep(secret, Math.floor(59 / 30), 8), "94287082");
    assert.equal(totpAtStep(secret, Math.floor(1111111109 / 30), 8), "07081804");
    assert.equal(totpAtStep(secret, Math.floor(20000000000 / 30), 8), "65353130");
  });
  await check("a code is accepted in its step and one step either side, never twice, never anything else", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30000);
    assert.equal(verifyTotp(secret, totpAtStep(secret, step), 0, now), step);
    assert.equal(verifyTotp(secret, totpAtStep(secret, step - 1), 0, now), step - 1);
    assert.equal(verifyTotp(secret, totpAtStep(secret, step - 3), 0, now), null);
    assert.equal(verifyTotp(secret, totpAtStep(secret, step), step, now), null, "replay refused");
    assert.equal(verifyTotp(secret, "12345", 0, now), null);
    assert.equal(verifyTotp(secret, "abcdef", 0, now), null);
  });

  const A = randomUUID();
  await pdb.collection("companies").insertOne({ _id: A as never, slug: "alpha", name: "Alpha", status: "active", isPlatformOwner: false, createdAt: new Date(), updatedAt: new Date() });
  const id = new ObjectId();
  await runAsCompany(A, async () => {
    await (await getDb()).collection("admin_users").insertOne({ _id: id, email: "boss@alpha.test", passwordHash: hashPassword("Correct-horse-1"), failedLoginAttempts: 0, lockedUntil: null, createdAt: new Date(), lastLoginAt: null, roles: ["super_admin"] } as never);
  });
  const as = <T,>(fn: () => Promise<T>) => runAsCompany(A, fn);
  let secret = "";
  let recovery: string[] = [];

  await check("without two-step, a password is enough", async () => {
    assert.ok((await as(() => verifyHubCredentials("boss@alpha.test", "Correct-horse-1"))).ok);
  });
  await check("set-up gives a secret and a QR code, and refuses a wrong first code", async () => {
    const s = await as(() => startTwoFactorSetup(id, "boss@alpha.test"));
    assert.ok(s.ok);
    if (!s.ok) return;
    secret = s.secret;
    assert.match(s.qr, /^data:image\/png;base64,/);
    const bad = await as(() => confirmTwoFactorSetup(id, "000000"));
    assert.ok(!bad.ok);
    assert.equal((await as(() => twoFactorStatus(id))).enabled, false);
  });
  await check("the first right code turns it on and returns ten recovery codes", async () => {
    const now = Date.now();
    const code = totpAtStep(secret, Math.floor(now / 30000));
    const r = await as(() => confirmTwoFactorSetup(id, code));
    assert.ok(r.ok);
    if (!r.ok) return;
    recovery = r.recovery;
    assert.equal(recovery.length, 10);
    const st = await as(() => twoFactorStatus(id));
    assert.deepEqual([st.enabled, st.recoveryLeft], [true, 10]);
    const doc = await as(async () => (await getDb()).collection("admin_users").findOne({ _id: id }));
    assert.ok(!JSON.stringify(doc).includes(secret), "the secret is stored encrypted");
  });
  await check("a password alone no longer signs in: the form is asked for the code", async () => {
    const r = await as(() => verifyHubCredentials("boss@alpha.test", "Correct-horse-1"));
    assert.ok(!r.ok && r.needsCode === true);
  });
  await check("the code from the app signs in; the same code cannot be used again", async () => {
    // the setup used this step; the next step's code is the one a person would read next
    const next = totpAtStep(secret, Math.floor(Date.now() / 30000) + 1);
    assert.ok((await as(() => verifyHubCredentials("boss@alpha.test", "Correct-horse-1", next))).ok);
    const again = await as(() => verifyHubCredentials("boss@alpha.test", "Correct-horse-1", next));
    assert.ok(!again.ok && again.needsCode === true, "replay refused");
  });
  await check("a recovery code works once", async () => {
    assert.ok((await as(() => verifyHubCredentials("boss@alpha.test", "Correct-horse-1", recovery[0]))).ok);
    assert.ok(!(await as(() => verifyHubCredentials("boss@alpha.test", "Correct-horse-1", recovery[0]))).ok);
    assert.equal((await as(() => twoFactorStatus(id))).recoveryLeft, 9);
  });
  await check("a wrong password is still the generic error, and wrong codes lock the account like wrong passwords", async () => {
    const wrongPw = await as(() => verifyHubCredentials("boss@alpha.test", "nope", "123456"));
    assert.ok(!wrongPw.ok && wrongPw.error === "Invalid email or password." && !wrongPw.needsCode);
    for (let i = 0; i < 5; i++) await as(() => verifyHubCredentials("boss@alpha.test", "Correct-horse-1", "000000"));
    const locked = await as(() => verifyHubCredentials("boss@alpha.test", "Correct-horse-1", recovery[1]));
    assert.ok(!locked.ok && /Too many failed attempts/.test(locked.error));
    await as(async () => (await getDb()).collection("admin_users").updateOne({ _id: id }, { $set: { failedLoginAttempts: 0, lockedUntil: null } }));
  });
  await check("a Super Admin reset switches it off, and it can be set up again", async () => {
    await as(() => resetTwoFactor(id));
    assert.ok((await as(() => verifyHubCredentials("boss@alpha.test", "Correct-horse-1"))).ok);
    const s = await as(() => startTwoFactorSetup(id, "boss@alpha.test"));
    assert.ok(s.ok);
    if (!s.ok) return;
    assert.ok((await as(() => confirmTwoFactorSetup(id, totpAtStep(s.secret, Math.floor(Date.now() / 30000))))).ok);
  });
  await check("turning it off needs a valid code", async () => {
    assert.ok(!(await as(() => disableTwoFactor(id, "111111"))).ok);
    assert.equal((await as(() => twoFactorStatus(id))).enabled, true);
    const doc = await as(async () => (await getDb()).collection<{ twoFactor: { secret: { c: string; iv: string; t: string } } }>("admin_users").findOne({ _id: id }));
    assert.ok(doc?.twoFactor);
  });

  console.log(`${passed} checks passed`);
  await (await clientPromise).db().dropDatabase();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
