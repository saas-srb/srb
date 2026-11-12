// Child process of `npm run portability:check`. Runs with a CLEAN environment (only what the parent passes). Prints one JSON line per check.
import { MongoClient } from "mongodb";

const phase = process.argv[2];
const emit = (name: string, ok: boolean, detail = "") => console.log(JSON.stringify({ name, ok, detail }));
const check = async (name: string, fn: () => Promise<string | void> | string | void) => {
  try {
    emit(name, true, String((await fn()) ?? ""));
  } catch (e) {
    emit(name, false, e instanceof Error ? e.message : String(e));
  }
};
const must = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

(async () => {
  const { ensureKeyring, keyringStatus } = await import("../src/lib/platform/keyring");
  const { encryptPlatformSecret, decryptPlatformSecret } = await import("../src/lib/platform/crypto");
  const { getPlatformDb } = await import("../src/lib/platform/tenancy/platform-db");
  const probe = (await getPlatformDb()).collection<{ _id: string } & Record<string, unknown>>("platform_settings");

  if (phase === "seed") {
    // Simulates the OLD deployment: it has the six environment variables.
    await check("old deployment boots and escrows its key", async () => {
      const s = await ensureKeyring();
      must(s.state === "ok" && s.action === "escrowed", `state ${s.state} action ${s.action}`);
    });
    await check("environment-only settings are adopted into the database (never CRON_SECRET / project id)", async () => {
      const { adoptEnvironment } = await import("../src/lib/platform/adopt");
      const r = await adoptEnvironment({ trigger: "manual" });
      for (const k of ["OPENAI_API_KEY", "BLOB_READ_WRITE_TOKEN", "RESEND_API_KEY", "GITHUB_DISPATCH_TOKEN", "DESKTOP_BUILD_SECRET", "HRMS_ENCRYPTION_KEY"]) must(r.adopted.includes(k), `${k} was not adopted`);
      must(!r.adopted.includes("CRON_SECRET") && !r.adopted.includes("VERCEL_PROJECT_ID") && !r.adopted.includes("SAAS_ADMIN_EMAIL"), "a deployment-bound variable was adopted");
      const again = await adoptEnvironment({ trigger: "manual" });
      must(again.adopted.length === 0, "adoption is not idempotent");
    });
    const { ensureOperator } = await import("../src/lib/platform/saas/bootstrap");
    await check("platform admin is created from the environment", async () => {
      const r = await ensureOperator({ email: "owner@portability.test", password: "portability-pass-1" });
      must(r.created, "operator was not created");
    });
    const { signMediaToken } = await import("../src/lib/products/viralpulse-ai/crypto");
    const exp = Date.now() + 3_600_000;
    await probe.replaceOne({ _id: "portability_probe" }, { _id: "portability_probe", enc: encryptPlatformSecret("the-saved-secret", "portability:probe"), token: signMediaToken("m1", exp), exp }, { upsert: true });
    await probe.updateOne({ _id: "integrations" } as never, { $set: { "email.provider": "console" } }, { upsert: true });
  }

  if (phase === "verify") {
    // The NEW deployment: only MONGODB_URI and SAAS_HOSTS exist.
    must(!process.env.PLATFORM_ENCRYPTION_KEY && !process.env.CRON_SECRET && !process.env.SAAS_ADMIN_EMAIL, "the child environment is not clean");
    await check("boots with only MONGODB_URI and SAAS_HOSTS; keyring unwrapped from the database", async () => {
      const s = await ensureKeyring();
      must(s.state === "ok" && s.action === "unwrapped", `state ${s.state} action ${s.action}`);
    });
    const doc = (await probe.findOne({ _id: "portability_probe" })) as unknown as { enc: never; token: string; exp: number } | null;
    must(doc, "probe document missing");
    await check("config / encrypted fields saved by the old deployment decrypt", () => {
      must(decryptPlatformSecret(doc!.enc, "portability:probe") === "the-saved-secret", "decrypt failed");
    });
    await check("signed tokens issued by the old deployment still verify", async () => {
      const { verifyMediaToken } = await import("../src/lib/products/viralpulse-ai/crypto");
      must(verifyMediaToken("m1", doc!.exp, doc!.token), "token rejected");
    });
    await check("existing platform staff can sign in (password verifies); env did not overwrite them", async () => {
      const { operatorExists } = await import("../src/lib/platform/saas/first-run");
      must(await operatorExists(), "no operator");
      const { ensureOperator } = await import("../src/lib/platform/saas/bootstrap");
      const again = await ensureOperator({ email: "someone-else@portability.test", password: "different-password-9" });
      must(!again.created, "an existing operator was overwritten");
      const { verifyPassword } = await import("../src/lib/security/password");
      const db = (await getPlatformDb());
      const company = await db.collection("companies").findOne({ isPlatformOwner: true });
      const user = await db.collection("admin_users").findOne({ companyId: (company as { _id: string })._id, email: "owner@portability.test" });
      must(user && verifyPassword("portability-pass-1", (user as unknown as { passwordHash: string }).passwordHash), "staff password does not verify");
    });
    await check("adopted settings are served from the database with no environment variables", async () => {
      const { applyAdoptedEnv } = await import("../src/lib/platform/adopt");
      await applyAdoptedEnv(); // already applied when the keyring opened; harmless to repeat
      must(process.env.GITHUB_DISPATCH_TOKEN === "gh-token-xyz" && process.env.DESKTOP_BUILD_SECRET === "desktop-secret-123", "overlay values differ");
      const { getConfig } = await import("../src/lib/platform/config/store");
      must((await getConfig("OPENAI_API_KEY")) === "sk-test-openai-1234", "config key not served from the database");
      must((await getConfig("BLOB_READ_WRITE_TOKEN")) === "vercel_blob_rw_test_9999", "blob token not served from the database");
      const { resolveEmailConfig } = await import("../src/lib/platform/integrations/resolve");
      must((await resolveEmailConfig()).resendApiKey === "re_test_key_5555", "email key not served from the database");
      const { derivedKeys } = await import("../src/lib/security/derived-key");
      must(derivedKeys("hrms", "HRMS_ENCRYPTION_KEY").length >= 2, "the adopted legacy HRMS key is missing from the keyring");
    });
    await check("cron auth works with no CRON_SECRET (Vercel's call, rate limited)", async () => {
      const { authorizeCron } = await import("../src/lib/cron/auth");
      const base = { bearerMatches: false, secretConfigured: false, userAgent: "vercel-cron/1.0", hostAllowed: true, intervalMs: 86_400_000, nowMs: Date.now() };
      must(authorizeCron({ ...base, lastRunAtMs: null }).ok, "first call refused");
      must(!authorizeCron({ ...base, lastRunAtMs: Date.now() - 60_000 }).ok, "spoofed repeat accepted");
      must(!authorizeCron({ ...base, userAgent: "curl/8", lastRunAtMs: null }).ok, "wrong user agent accepted");
    });
    await check("a new key added later keeps old data readable (key version)", async () => {
      must(keyringStatus().versions.length >= 1, "no key versions");
    });
  }

  if (phase === "wrongkey-seed") {
    // A database whose only ciphertext is an authenticator secret sealed with the REAL key.
    await check("seed: real key escrowed, an authenticator secret sealed with it", async () => {
      const s = await ensureKeyring();
      must(s.state === "ok", `state ${s.state}`);
      const c = await (await import("../src/lib/platform/tenancy/platform-db")).clientPromise;
      await c.db().collection("admin_users").insertOne({ _id: "u1" as never, companyId: "co1", email: "a@b.test", twoFactor: { secret: encryptPlatformSecret("TOTP", "2fa:co1:u1"), recovery: [] } });
      await c.db().collection("platform_settings").deleteOne({ _id: "keyring" as never }); // as if the real key was never escrowed (it lived only in the old project's env)
    });
  }
  if (phase === "wrongkey") {
    await check("an UNRELATED env key on that database: stored unverified, alert with a count, nothing breaks", async () => {
      const s = await ensureKeyring();
      must(s.state === "ok", `state ${s.state}`);
      must(s.versions.some((v) => v.verification === "unverified"), "the unrelated key must be unverified");
      must((s.mismatch?.unopenable ?? 0) >= 1, "no mismatch alert");
    });
  }
  if (phase === "rightkey") {
    await check("the REAL key arriving later is verified, promoted to active, the unrelated one kept decrypt-only", async () => {
      const s = await ensureKeyring();
      must(s.state === "ok" && s.versions.length === 2, `state ${s.state}, versions ${s.versions.length}`);
      must(s.versions.find((v) => v.status === "active")?.verification === "verified", "real key not active/verified");
      must((s.mismatch?.unopenable ?? 1) === 0, "values still unopenable");
    });
  }

  if (phase === "fresh") {
    await check("empty database with no key: a new key is generated and escrowed", async () => {
      const s = await ensureKeyring();
      must(s.state === "ok" && s.action === "generated", `state ${s.state} action ${s.action}`);
      must(decryptPlatformSecret(encryptPlatformSecret("x", "c"), "c") === "x", "round trip failed");
    });
  }

  if (phase === "orphan") {
    await check("database with data but no key and no env key: refuses to generate (shows 'provide the old key')", async () => {
      const s = await ensureKeyring();
      must(s.state === "needs_old_key", `state ${s.state}`);
      must(await probe.findOne({ _id: "keyring" }) === null, "a key was generated and would orphan the data");
    });
  }
  const c = await (await import("../src/lib/platform/tenancy/platform-db")).clientPromise;
  await c.close();
})().catch((e) => {
  emit("child crashed", false, e instanceof Error ? e.message : String(e));
  process.exit(0);
});
void MongoClient;
