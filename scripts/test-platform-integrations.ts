/**
 * Platform integrations + platform settings checks against a throwaway
 * database that is dropped at the end. No network: fetch is mocked for the
 * Vercel check, email goes through the console adapter.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/integrations_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-platform-integrations.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

for (const k of ["RESEND_API_KEY", "EMAIL_PROVIDER", "EMAIL_FROM", "VERCEL_API_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID", "DOMAIN_PROVIDER", "PLATFORM_ROOT_DOMAIN", "PLATFORM_HOSTS"]) delete process.env[k];
const TEST_KEY = randomBytes(32).toString("base64");
process.env.PLATFORM_ENCRYPTION_KEY = TEST_KEY;

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  const dbName = new URL(uri.replace(/^mongodb(\+srv)?:/, "http:")).pathname.slice(1);
  if (!/test/.test(dbName)) throw new Error(`Refusing to run: MONGODB_URI must name a throwaway *test* database (got "${dbName || "(none)"}")`);
  const { getPlatformDb, clientPromise } = await import("@/lib/platform/tenancy/platform-db");
  const db = await getPlatformDb();
  try {
    await run(db);
  } finally {
    await db.dropDatabase();
    await (await clientPromise).close();
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
}

async function run(db: import("mongodb").Db) {
  const { resolveEmailConfig, resolveDomainConfig, getIntegrationsView, saveIntegrations, sendIntegrationsTestEmail, testDomainProvider } = await import("@/lib/platform/integrations");
  const { bustIntegrationsCache } = await import("@/lib/platform/integrations/store");
  const { activeDomainProvider } = await import("@/lib/platform/domains");
  const { activeEmailProvider, sendEmail } = await import("@/lib/platform/email");
  const { platformRootDomain, companySubdomain, createCompanyWithOwner } = await import("@/lib/platform/tenancy/provisioning");
  const settings = await import("@/lib/platform/settings");
  const { isSlugAvailable } = await import("@/lib/platform/signup");
  const { slugFormatError } = await import("@/lib/platform/tenancy/slug");

  const now = new Date();
  await db.collection<{ _id: string }>("companies").insertOne({ _id: "owner", slug: "owner", name: "Owner", status: "active", isPlatformOwner: true, createdAt: now, updatedAt: now } as never);
  const settingsCol = db.collection<{ _id: string }>("platform_settings");
  const audit = db.collection("platform_audit_log");
  const blank = { email: { provider: "" as const, apiKey: "", clearApiKey: false, from: "" }, domains: { provider: "" as const, token: "", clearToken: false, projectId: "", teamId: "", rootDomain: "" } };

  console.log("Resolution order");
  await check("nothing saved, nothing in env → defaults", async () => {
    const e = await resolveEmailConfig();
    assert.equal(e.provider, "console");
    assert.equal(e.providerSource, "default");
    assert.equal(e.explicit, false);
    assert.equal(e.resendApiKey, null);
    assert.equal(e.fromSource, "default");
    const d = await resolveDomainConfig();
    assert.equal(d.provider, "manual");
    assert.equal(d.rootDomain, "localhost");
    assert.equal(platformRootDomain(), "localhost");
    assert.equal((await activeDomainProvider()).id, "manual");
  });

  await check("env-only deployment keeps working with nothing saved", async () => {
    process.env.RESEND_API_KEY = "re_env_key_9999";
    process.env.EMAIL_FROM = "Env <env@example.com>";
    process.env.VERCEL_API_TOKEN = "env-vercel-token-7777";
    process.env.VERCEL_PROJECT_ID = "prj_env";
    process.env.PLATFORM_ROOT_DOMAIN = "env.test";
    const e = await resolveEmailConfig();
    assert.equal(e.provider, "resend");
    assert.equal(e.resendApiKey, "re_env_key_9999");
    assert.equal(e.apiKeySource, "env");
    assert.equal(e.from, "Env <env@example.com>");
    assert.equal(e.fromSource, "env");
    assert.equal((await activeEmailProvider()).id, "resend");
    const d = await resolveDomainConfig();
    assert.equal(d.provider, "vercel");
    assert.deepEqual(d.vercel, { token: "env-vercel-token-7777", project: "prj_env", team: null });
    assert.equal(d.rootDomain, "env.test");
    assert.equal(platformRootDomain(), "env.test");
    const view = await getIntegrationsView();
    assert.equal(view.email.apiKey.source, "env");
    assert.equal(view.email.apiKey.last4, "9999");
    assert.equal(view.email.apiKey.saved, false);
  });

  await check("DB values win over env", async () => {
    const res = await saveIntegrations(
      {
        email: { provider: "resend", apiKey: "re_db_secret_ABCD", clearApiKey: false, from: "Platform <hello@platform.test>" },
        domains: { provider: "vercel", token: "db-vercel-token-WXYZ", clearToken: false, projectId: "prj_db", teamId: "team_db", rootDomain: "Platform.Test" },
      },
      "admin-1",
    );
    assert.ok(res.ok, JSON.stringify(res));
    const e = await resolveEmailConfig();
    assert.equal(e.resendApiKey, "re_db_secret_ABCD");
    assert.equal(e.apiKeySource, "db");
    assert.equal(e.from, "Platform <hello@platform.test>");
    assert.equal(e.providerSource, "db");
    const d = await resolveDomainConfig();
    assert.deepEqual(d.vercel, { token: "db-vercel-token-WXYZ", project: "prj_db", team: "team_db" });
    assert.equal(d.rootDomain, "platform.test", "normalised");
    assert.equal(platformRootDomain(), "platform.test", "sync accessor sees the save at once");
    assert.equal(companySubdomain("acme"), "acme.platform.test");
  });

  await check("secrets are encrypted at rest", async () => {
    const raw = JSON.stringify(await settingsCol.findOne({ _id: "integrations" }));
    assert.ok(!raw.includes("re_db_secret_ABCD"), "plaintext API key stored");
    assert.ok(!raw.includes("db-vercel-token-WXYZ"), "plaintext token stored");
    const doc = (await settingsCol.findOne({ _id: "integrations" })) as unknown as { email: { resendApiKey: { enc: { c: string }; last4: string } } };
    assert.equal(doc.email.resendApiKey.last4, "ABCD");
    assert.ok(doc.email.resendApiKey.enc.c.length > 0);
  });

  await check("the view never returns a secret or its ciphertext", async () => {
    const view = await getIntegrationsView();
    const json = JSON.stringify(view);
    const doc = (await settingsCol.findOne({ _id: "integrations" })) as unknown as { email: { resendApiKey: { enc: { c: string; t: string } } }; domains: { vercelToken: { enc: { c: string } } } };
    for (const bad of ["re_db_secret_ABCD", "db-vercel-token-WXYZ", "re_env_key_9999", "env-vercel-token-7777", doc.email.resendApiKey.enc.c, doc.email.resendApiKey.enc.t, doc.domains.vercelToken.enc.c]) {
      assert.ok(!json.includes(bad), `view leaks ${bad.slice(0, 6)}…`);
    }
    assert.ok(!/"enc"|"iv"/.test(json), "view carries encrypted fields");
    assert.equal(view.email.apiKey.last4, "ABCD");
    assert.equal(view.email.apiKey.source, "db");
    assert.equal(view.domains.token.last4, "WXYZ");
    assert.equal(view.domains.rootDomain.effective, "platform.test");
  });

  await check("blank secret keeps the saved one; clear falls back to env", async () => {
    const keep = await saveIntegrations({ ...blank, email: { ...blank.email, provider: "resend" }, domains: { ...blank.domains, projectId: "prj_db" } }, "admin-1");
    assert.ok(keep.ok);
    assert.equal((await resolveEmailConfig()).resendApiKey, "re_db_secret_ABCD");
    assert.equal((await resolveEmailConfig()).from, "Env <env@example.com>", "blank from → env");
    assert.equal((await resolveDomainConfig()).rootDomain, "env.test", "blank root → env");
    const clear = await saveIntegrations({ ...blank, email: { ...blank.email, clearApiKey: true }, domains: { ...blank.domains, clearToken: true } }, "admin-1");
    assert.ok(clear.ok);
    const e = await resolveEmailConfig();
    assert.equal(e.resendApiKey, "re_env_key_9999");
    assert.equal(e.apiKeySource, "env");
    assert.equal((await resolveDomainConfig()).tokenSource, "env");
  });

  await check("audit records changes without secrets", async () => {
    const rows = await audit.find({ action: "settings.integrations.update" }).toArray();
    assert.ok(rows.length >= 3);
    const json = JSON.stringify(rows);
    assert.ok(!json.includes("re_db_secret_ABCD") && !json.includes("db-vercel-token-WXYZ"));
    assert.equal((rows[0].details as { secrets: Record<string, string> }).secrets["email.apiKey"], "set");
    assert.ok(rows.some((r) => (r.details as { secrets: Record<string, string> }).secrets["email.apiKey"] === "cleared"));
  });

  await check("validation rejects bad input", async () => {
    const res = await saveIntegrations({ email: { ...blank.email, from: "not an address", provider: "smtp" as never }, domains: { ...blank.domains, rootDomain: "bad_domain", projectId: "has space" } }, "admin-1");
    assert.ok(!res.ok);
    assert.ok(!res.ok && "email.from" in res.errors && "email.provider" in res.errors && "domains.rootDomain" in res.errors && "domains.projectId" in res.errors);
  });

  await check("secrets can't be saved without PLATFORM_ENCRYPTION_KEY", async () => {
    delete process.env.PLATFORM_ENCRYPTION_KEY;
    try {
      const res = await saveIntegrations({ ...blank, email: { ...blank.email, apiKey: "re_new_key_1111" } }, "admin-1");
      assert.ok(!res.ok && "email.apiKey" in res.errors);
      assert.equal((await getIntegrationsView()).encryptionConfigured, false);
    } finally {
      process.env.PLATFORM_ENCRYPTION_KEY = TEST_KEY;
    }
  });

  await check("an undecryptable stored secret is flagged and env takes over", async () => {
    assert.ok((await saveIntegrations({ ...blank, email: { ...blank.email, apiKey: "re_db_secret_EFGH" } }, "admin-1")).ok);
    process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64"); // key rotated without re-entering
    try {
      bustIntegrationsCache();
      const view = await getIntegrationsView();
      assert.equal(view.email.apiKey.unreadable, true);
      assert.equal(view.email.apiKey.source, "env");
      assert.equal((await resolveEmailConfig()).resendApiKey, "re_env_key_9999");
    } finally {
      process.env.PLATFORM_ENCRYPTION_KEY = TEST_KEY;
    }
  });

  await check("test buttons: console email and read-only Vercel check", async () => {
    assert.ok((await saveIntegrations({ ...blank, email: { ...blank.email, provider: "console" }, domains: { ...blank.domains, provider: "vercel", token: "db-vercel-token-WXYZ", projectId: "prj_db" } }, "admin-1")).ok);
    const cfg = await resolveEmailConfig();
    assert.equal(cfg.provider, "console");
    assert.equal(cfg.explicit, true);
    const quiet = console.log;
    console.log = () => {};
    try {
      assert.ok((await sendIntegrationsTestEmail("admin@example.com", "admin-1")).ok);
      assert.ok((await sendEmail({ to: "x@example.com", subject: "s", html: "<p>h</p>", text: "h" })).ok);
    } finally {
      console.log = quiet;
    }
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(`${init?.method ?? "GET"} ${url.pathname} ${(init?.headers as Record<string, string>)?.Authorization}`);
      return new Response(JSON.stringify(url.pathname === "/v9/projects/prj_db" ? { name: "platform-site" } : { error: { code: "not_found" } }), { status: url.pathname === "/v9/projects/prj_db" ? 200 : 404 });
    }) as typeof fetch;
    try {
      const ok = await testDomainProvider("admin-1");
      assert.ok(ok.ok && ok.message.includes("platform-site"), JSON.stringify(ok));
      assert.deepEqual(calls, ["GET /v9/projects/prj_db Bearer db-vercel-token-WXYZ"], "one read-only call with the DB token");
      assert.equal((await activeDomainProvider()).id, "vercel");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  console.log("Platform settings");
  await check("sign-up mode defaults to open and persists, audited", async () => {
    assert.equal(await settings.getSignupMode(), "open");
    await settings.setSignupMode("approval", "admin-1");
    assert.equal(await settings.getSignupMode(), "approval");
    await settings.setSignupMode("closed", "admin-1");
    assert.equal(await settings.getSignupMode(), "closed");
    const rows = await audit.find({ action: "settings.signup_mode.update" }).sort({ at: 1 }).toArray();
    assert.deepEqual(rows.map((r) => r.details), [{ from: "open", to: "approval" }, { from: "approval", to: "closed" }]);
    await assert.rejects(() => settings.setSignupMode("sometimes" as never, "admin-1"));
  });

  await check("general settings have sensible defaults", async () => {
    const s = await settings.getPlatformSettings();
    assert.equal(s.platformName, "Demo Company");
    assert.equal(s.defaultTimezone, "Asia/Kolkata");
    assert.equal(s.defaultLocale, "en-IN");
    assert.equal(s.maintenanceBanner, "");
    assert.deepEqual(s.reservedSubdomains, []);
    assert.equal((await settings.platformEmailIdentity()).supportLine, null);
  });

  const base = { ...settings.PLATFORM_SETTINGS_DEFAULTS };
  await check("invalid settings are rejected", async () => {
    const res = await settings.savePlatformSettings({ ...base, platformName: "X", supportEmail: "nope", supportUrl: "ftp://x", defaultLocale: "!!", defaultTimezone: "Mars/Base", reservedSubdomains: ["ok", "bad_label"] }, "admin-1");
    assert.ok(!res.ok);
    for (const k of ["platformName", "supportEmail", "supportUrl", "defaultLocale", "defaultTimezone", "reservedSubdomains"]) assert.ok(!res.ok && k in res.errors, `no error for ${k}`);
  });

  await check("settings save, apply at once, and are audited", async () => {
    const res = await settings.savePlatformSettings(
      { ...base, platformName: "Orbit Cloud", supportEmail: "help@orbit.test", supportUrl: "https://help.orbit.test", defaultLocale: "en-us", defaultTimezone: "Europe/London", maintenanceBanner: "  Upgrade   tonight ", reservedSubdomains: ["Demo", "www", "staging", "demo"] },
      "admin-1",
    );
    assert.ok(res.ok, JSON.stringify(res));
    const s = await settings.getPlatformSettings();
    assert.equal(s.platformName, "Orbit Cloud");
    assert.equal(s.defaultLocale, "en-US", "canonical locale");
    assert.equal(s.maintenanceBanner, "Upgrade tonight");
    assert.deepEqual(s.reservedSubdomains, ["demo", "staging"], "lowercased, de-duplicated, built-ins dropped");
    assert.equal((await settings.platformEmailIdentity()).supportLine, "Need help? Contact help@orbit.test or https://help.orbit.test.");
    const row = await audit.findOne({ action: "settings.platform.update" });
    assert.ok(row && (row.details as { changed: string[] }).changed.includes("reservedSubdomains"));
  });

  await check("reserved subdomains merge with the built-in list and block new workspaces", async () => {
    const all = await settings.reservedSubdomains();
    assert.ok(all.has("www") && all.has("admin") && all.has("demo") && all.has("staging"));
    assert.equal(slugFormatError("demo"), null, "the client-side format check only knows the built-ins");
    assert.equal(await settings.reservedSlugError("demo"), "That address is reserved.");
    assert.equal(await settings.reservedSlugError("acme"), null);
    assert.equal(await isSlugAvailable("demo"), false);
    assert.equal(await isSlugAvailable("acme"), true);
    const created = await createCompanyWithOwner({ name: "Demo", slug: "demo", owner: { email: "o@demo.test", name: "O", passwordHash: "x", mustChangePassword: false } });
    assert.ok(!created.ok && created.error.includes("reserved"));
    assert.equal(await db.collection("companies").countDocuments({ slug: "demo" }), 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
