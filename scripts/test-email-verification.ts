/**
 * Email verification (sign-up is never gated on it) against a real MongoDB in a
 * THROWAWAY database that is dropped at the end:
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/ev_test_$(date +%s) EMAIL_PROVIDER=console PLATFORM_ROOT_DOMAIN=localhost \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-email-verification.ts
 */
import assert from "node:assert/strict";
import { sampleBusinessInput } from "@/lib/platform/business-taxonomy";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { startSignup } from "@/lib/platform/signup";
import { setSignupMode } from "@/lib/platform/settings";
import { acceptInvitation, inviteTeammate } from "@/lib/platform/invitations";
import { consumeVerification, describeVerification, isEmailVerified, sendVerificationEmail, showVerifyStrip, verifyStripHiddenOn, MAX_SENDS_PER_HOUR } from "@/lib/platform/email-verification";
import { isSameOriginPost } from "@/lib/platform/email-verification-rule";
import fs from "node:fs";
import { getDb } from "@/lib/mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("/").pop()?.split("?")[0] ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri) || !dbName.includes("test")) {
  console.error(`Refusing to run: MONGODB_URI must be a local throwaway database with "test" in its name (got "${dbName}").`);
  process.exit(1);
}
if (process.env.EMAIL_PROVIDER !== "console") {
  console.error("Refusing to run: set EMAIL_PROVIDER=console so no real email is sent.");
  process.exit(1);
}

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}

const sentEmails: string[] = [];
const origLog = console.log;
console.log = (...args: unknown[]) => {
  const line = args.map(String).join(" ");
  if (line.includes("[email:console]")) sentEmails.push(line);
  else origLog(...args);
};
const emailsTo = (addr: string) => sentEmails.filter((e) => e.includes(`to=${addr}`));
const tokenIn = (mail: string) => mail.match(/workspace\/verify-email\?token=([a-f0-9]+)/)?.[1] ?? "";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function run() {
  const platform = await getPlatformDb();
  await setSignupMode("open", "test");
  const signup = (slug: string, email: string, key: string) => startSignup({ companyName: `${slug} Co`, slug, name: "Owner", email, password: "correct-horse-battery", businessCategories: sampleBusinessInput().categories, businessSubCategories: sampleBusinessInput().subCategories, acceptTerms: true }, { hostHint: "localhost:3000", clientKey: key });
  const idOf = async (slug: string) => String((await platform.collection("companies").findOne({ slug }))!._id);
  const usersOf = (companyId: string) => runAsCompany(companyId, async () => (await getDb()).collection("admin_users"));
  const ownerOf = async (companyId: string, email: string) => runAsCompany(companyId, async () => (await getDb()).collection("admin_users").findOne({ email }));

  console.log("state");
  const s1 = await signup("alpha", "a@alpha.test", "k1");
  const alpha = await idOf("alpha");
  await check("a new owner is emailVerified:false and a verification email was sent automatically to the company's own host", async () => {
    assert.ok(s1.ok && s1.kind === "created");
    const owner = await ownerOf(alpha, "a@alpha.test");
    assert.equal(owner?.emailVerified, false);
    const mail = emailsTo("a@alpha.test").find((m) => m.includes("verify-email"));
    assert.ok(mail, "email sent");
    assert.ok(mail.includes("http://alpha.localhost:3000/commandos/verify-email?token="), "link on the company's host");
  });
  await check("a legacy user (no emailVerified field) counts as verified", async () => {
    assert.equal(isEmailVerified({}), true);
    assert.equal(isEmailVerified({ emailVerified: true }), true);
    assert.equal(isEmailVerified({ emailVerified: false }), false);
    assert.equal(isEmailVerified({ emailVerified: null }), true);
    await (await usersOf(alpha)).insertOne({ email: "legacy@alpha.test", name: "Legacy", passwordHash: "x", roles: ["employee"], createdAt: new Date() });
    assert.equal(isEmailVerified((await ownerOf(alpha, "legacy@alpha.test"))!), true);
    const res = await runAsCompany(alpha, async () => sendVerificationEmail(String((await ownerOf(alpha, "legacy@alpha.test"))!._id), "http://alpha.localhost:3000"));
    assert.ok(!res.ok, "nothing to verify for a legacy user");
  });
  await check("accepting an invitation makes the user verified", async () => {
    const owner = await ownerOf(alpha, "a@alpha.test");
    const invited = await runAsCompany(alpha, () => inviteTeammate({ email: "dev@alpha.test", name: "Dev", preset: "developer" }, { id: String(owner!._id), email: "a@alpha.test" }, "http://alpha.localhost:3000"));
    assert.ok(invited.ok, invited.ok ? "" : invited.error);
    const token = emailsTo("dev@alpha.test")[0].match(/workspace\/invite\?token=([a-f0-9]+)/)![1];
    const accepted = await runAsCompany(alpha, () => acceptInvitation(token, { name: "Dev", password: "another-long-password" }));
    assert.ok(accepted.ok, accepted.ok ? "" : accepted.error);
    const dev = await ownerOf(alpha, "dev@alpha.test");
    assert.equal(dev?.emailVerified, true);
    assert.ok(dev?.emailVerifiedAt);
  });

  console.log("token");
  await check("only a sha256 hash is stored, never the raw token", async () => {
    const token = tokenIn(emailsTo("a@alpha.test").find((m) => m.includes("verify-email"))!);
    assert.ok(token);
    const docs = await runAsCompany(alpha, async () => (await getDb()).collection("email_verifications").find({}).toArray());
    assert.equal(docs.length, 1);
    assert.equal(docs[0].tokenHash, sha256(token));
    assert.ok(!JSON.stringify(docs).includes(token));
    const ms = docs[0].expiresAt.getTime() - docs[0].createdAt.getTime();
    assert.equal(ms, 24 * 60 * 60 * 1000, "24h expiry");
  });
  const token = tokenIn(emailsTo("a@alpha.test").find((m) => m.includes("verify-email"))!);
  await check("describing a token (the page's GET) does not consume it", async () => {
    assert.deepEqual(await runAsCompany(alpha, () => describeVerification(token)), { email: "a@alpha.test" });
    assert.deepEqual(await runAsCompany(alpha, () => describeVerification(token)), { email: "a@alpha.test" });
    assert.equal((await ownerOf(alpha, "a@alpha.test"))?.emailVerified, false);
  });
  await check("a token does not work on another company's host", async () => {
    await signup("beta", "b@beta.test", "k2");
    const beta = await idOf("beta");
    assert.equal(await runAsCompany(beta, () => describeVerification(token)), null);
    const res = await runAsCompany(beta, () => consumeVerification(token));
    assert.equal(res.ok, false);
    assert.equal((await ownerOf(alpha, "a@alpha.test"))?.emailVerified, false);
    assert.equal((await ownerOf(beta, "b@beta.test"))?.emailVerified, false);
  });
  await check("consuming verifies only the token's user, and works once", async () => {
    const res = await runAsCompany(alpha, () => consumeVerification(token));
    assert.deepEqual(res, { ok: true, email: "a@alpha.test" });
    const owner = await ownerOf(alpha, "a@alpha.test");
    assert.equal(owner?.emailVerified, true);
    assert.ok(owner?.emailVerifiedAt);
    assert.equal((await ownerOf("" + (await idOf("beta")), "b@beta.test"))?.emailVerified, false, "another company's owner untouched");
    assert.equal((await runAsCompany(alpha, () => consumeVerification(token))).ok, false, "single use");
    assert.equal(await runAsCompany(alpha, () => describeVerification(token)), null);
  });
  await check("an expired token is refused", async () => {
    const beta = await idOf("beta");
    const user = await ownerOf(beta, "b@beta.test");
    await runAsCompany(beta, async () => (await getDb()).collection("email_verifications").deleteMany({}));
    const before = emailsTo("b@beta.test").length;
    const res = await runAsCompany(beta, () => sendVerificationEmail(String(user!._id), "http://beta.localhost:3000"));
    assert.ok(res.ok);
    const t = tokenIn(emailsTo("b@beta.test")[before]);
    await runAsCompany(beta, async () => (await getDb()).collection("email_verifications").updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } }));
    assert.equal(await runAsCompany(beta, () => describeVerification(t)), null);
    assert.equal((await runAsCompany(beta, () => consumeVerification(t))).ok, false);
    assert.equal((await ownerOf(beta, "b@beta.test"))?.emailVerified, false);
  });

  console.log("rate limit and failure");
  await check(`at most ${MAX_SENDS_PER_HOUR} sends per user per hour`, async () => {
    await signup("gamma", "g@gamma.test", "k3"); // already sent 1 on sign-up
    const gamma = await idOf("gamma");
    const id = String((await ownerOf(gamma, "g@gamma.test"))!._id);
    const r2 = await runAsCompany(gamma, () => sendVerificationEmail(id, "http://gamma.localhost:3000"));
    const r3 = await runAsCompany(gamma, () => sendVerificationEmail(id, "http://gamma.localhost:3000"));
    const r4 = await runAsCompany(gamma, () => sendVerificationEmail(id, "http://gamma.localhost:3000"));
    assert.ok(r2.ok && r3.ok);
    assert.ok(!r4.ok && /hour/.test(r4.error), JSON.stringify(r4));
    assert.equal(emailsTo("g@gamma.test").filter((m) => m.includes("verify-email")).length, 3);
  });
  await check("an email failure never fails the sign-up (the owner can still use the strip later)", async () => {
    const prev = { p: process.env.EMAIL_PROVIDER, k: process.env.RESEND_API_KEY };
    process.env.EMAIL_PROVIDER = "resend";
    delete process.env.RESEND_API_KEY;
    const origErr = console.error;
    console.error = () => {};
    try {
      const res = await signup("delta", "d@delta.test", "k4");
      assert.ok(res.ok && res.kind === "created", JSON.stringify(res));
      assert.ok(await platform.collection("companies").findOne({ slug: "delta" }));
      const delta = await idOf("delta");
      const user = await ownerOf(delta, "d@delta.test");
      assert.equal(user?.emailVerified, false);
      const failed = await runAsCompany(delta, () => sendVerificationEmail(String(user!._id), "http://delta.localhost:3000"));
      assert.ok(!failed.ok && /couldn't send/i.test(failed.error));
    } finally {
      console.error = origErr;
      process.env.EMAIL_PROVIDER = prev.p;
      if (prev.k !== undefined) process.env.RESEND_API_KEY = prev.k;
    }
  });
  await check("a bad user id is refused without throwing", async () => {
    const res = await runAsCompany(alpha, () => sendVerificationEmail("nope", "http://alpha.localhost:3000"));
    assert.ok(!res.ok);
    assert.ok(!(await runAsCompany(alpha, () => sendVerificationEmail(String(new ObjectId()), "http://alpha.localhost:3000"))).ok);
  });

  console.log("strip rule (pure)");
  await check("shows only for an unverified user outside the platform owner's company, and not on /commandos/verify-email", () => {
    assert.equal(showVerifyStrip({ emailVerified: false, isPlatformOwnerCompany: false }), true);
    assert.equal(showVerifyStrip({ emailVerified: true, isPlatformOwnerCompany: false }), false);
    assert.equal(showVerifyStrip({ emailVerified: false, isPlatformOwnerCompany: true }), false);
    assert.equal(verifyStripHiddenOn("/commandos/verify-email"), true);
    assert.equal(verifyStripHiddenOn("/commandos"), false);
    assert.equal(verifyStripHiddenOn("/commandos/settings"), false);
  });

  console.log("entry point (form POST to a route handler)");
  await check("the verify page is a plain form POST to /commandos/verify-email/confirm (no server action / client router); the route exports POST only", () => {
    const page = fs.readFileSync("src/app/commandos/verify-email/page.tsx", "utf8");
    assert.ok(page.includes('method="post"') && page.includes('action="/commandos/verify-email/confirm"') && page.includes("Verify my email"));
    const route = fs.readFileSync("src/app/commandos/verify-email/confirm/route.ts", "utf8");
    assert.ok(/export async function POST/.test(route) && !/export async function GET/.test(route), "POST only: a GET never consumes");
    assert.ok(route.includes("303") && route.includes("/commandos?emailVerified=1") && route.includes("requestOrigin()") && !route.includes("req.url"));
    assert.ok(!fs.existsSync("src/app/commandos/verify-email/actions.ts"), "no server-action redirect");
  });
  await check("same-origin rule: cross-site posts are refused", () => {
    assert.equal(isSameOriginPost({ secFetchSite: "same-origin", origin: null, host: "a.localhost" }), true);
    assert.equal(isSameOriginPost({ secFetchSite: "cross-site", origin: "http://a.localhost", host: "a.localhost" }), false);
    assert.equal(isSameOriginPost({ secFetchSite: null, origin: "http://a.localhost:3000", host: "a.localhost:3000" }), true);
    assert.equal(isSameOriginPost({ secFetchSite: null, origin: "http://evil.test", host: "a.localhost:3000" }), false);
    assert.equal(isSameOriginPost({ secFetchSite: null, origin: "garbage", host: "a.localhost" }), false);
    assert.equal(isSameOriginPost({ secFetchSite: null, origin: null, host: "a.localhost" }), true);
  });
  await check("error path: a used/foreign token consumes nothing and the page falls back to the expired card", async () => {
    assert.equal((await runAsCompany(alpha, () => consumeVerification("deadbeef"))).ok, false);
    assert.equal(await runAsCompany(alpha, () => describeVerification(token)), null);
  });
}

async function main() {
  origLog(`Scratch database: ${dbName}\n`);
  const client = await clientPromise;
  try {
    await run();
  } finally {
    await client.db().dropDatabase();
    await client.close();
    origLog(`\nDropped ${dbName}.`);
  }
  origLog(`${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
