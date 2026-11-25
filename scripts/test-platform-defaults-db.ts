import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { saveConfig, getConfigView } from "../src/lib/platform/config/store";
import { platformEmail, sendEmail } from "../src/lib/platform/email";
import webpush from "web-push";
import { pushKeys } from "../src/lib/push/vapid";
import { saveIntegrations } from "../src/lib/platform/integrations";
import { addCustomDomain, listCompanyDomains } from "../src/lib/platform/domains/custom";
import { getObject, putObject } from "../src/lib/storage/blob";
import { CONNECTION_PROVIDERS } from "../src/lib/platform/connections/catalog";
import { senderForTenant } from "../src/lib/platform/white-label";
import { platformServiceReady } from "../src/lib/platform/connections/platform-services";
import { saveConnection, setConnectionMode } from "../src/lib/platform/connections/store";
import { resolveConnection } from "../src/lib/platform/connections/resolve";
import { defaultUsage, consoleFacts, testPlatformDefault } from "../src/lib/platform/defaults/console";

// Two companies on a throwaway database: one on the platform default, one with its own. Provider calls are stubbed; nothing leaves the machine.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };

(async () => {
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await db.dropDatabase();
  const now = new Date();
  const A = randomUUID(), B = randomUUID();
  await db.collection("companies").insertMany([[A, "a"], [B, "b"]].map(([id, slug]) => ({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now })));
  const key = async (id: string) => (await runAsCompany(id, () => resolveConnection("openai")))?.values.apiKey ?? null;
  const OWN = "sk-own-company-b-1234567890", P1 = "sk-platform-one-1234567890", P2 = "sk-platform-two-1234567890";

  await T("the platform default flows to a company without its own; a company's own key wins", async () => {
    assert.deepEqual(await saveConfig({ OPENAI_API_KEY: P1 }, "staff1"), { ok: true });
    const r = await runAsCompany(B, () => saveConnection("openai", { apiKey: OWN } as never, "u1"));
    assert.equal((r as { ok: boolean }).ok, true, JSON.stringify(r));
    await runAsCompany(B, () => setConnectionMode("openai", "own", "u1"));
    assert.equal(await key(A), P1);
    assert.equal(await key(B), OWN);
  });
  await T("impact: one company uses the default, one uses its own", async () => {
    assert.deepEqual((await defaultUsage()).openai, { usingDefault: 1, usingOwn: 1 });
    assert.equal((await consoleFacts()).openai.configured, true);
  });
  await T("changing the default reaches only the company on it; going back to the default and removing it behave", async () => {
    await saveConfig({ OPENAI_API_KEY: P2 }, "staff1");
    assert.equal(await key(A), P2);
    assert.equal(await key(B), OWN);
    await runAsCompany(B, () => setConnectionMode("openai", "srb", "u1"));
    assert.equal(await key(B), P2, "back on the default");
    assert.deepEqual((await defaultUsage()).openai, { usingDefault: 2, usingOwn: 0 });
    await runAsCompany(B, () => setConnectionMode("openai", "own", "u1"));
    assert.equal(await key(B), OWN, "the saved own key was kept");
    await saveConfig({ OPENAI_API_KEY: { clear: true } }, "staff1");
    if (!process.env.OPENAI_API_KEY) assert.equal(await key(A), null, "no default: not set up");
    assert.equal(await key(B), OWN);
  });
  await T("testing a default is read-only, audited, and no secret reaches the result, the audit log or storage in plain text", async () => {
    await saveConfig({ OPENAI_API_KEY: P1 }, "staff1");
    const calls: string[] = [];
    const out = await testPlatformDefault("openai", "staff1", { fetch: async (url: string) => { calls.push(url); return new Response(JSON.stringify({ error: { message: `bad key ${P1}` } }), { status: 401 }); } } as never);
    assert.equal(out.ok, false);
    assert.equal(calls.length, 1);
    assert.ok(!out.message.includes(P1), out.message);
    const audit = JSON.stringify(await db.collection("platform_audit_log").find({}).toArray()) + JSON.stringify(await db.listCollections().toArray());
    assert.ok(!audit.includes(P1) && !audit.includes(P2));
    assert.ok(!JSON.stringify(await db.collection("platform_settings").find({}).toArray()).includes(P1), "encrypted at rest");
    assert.deepEqual(await testPlatformDefault("razorpay", "staff1"), { ok: false, message: "There is no test for this card." });
  });
  const GROUPS: [string, Record<string, string>, Record<string, string>, string][] = [
    ["twilio", { TWILIO_ACCOUNT_SID: "ACplatform000", TWILIO_AUTH_TOKEN: "plat-token-111" }, { accountSid: "ACown0000000", authToken: "own-token-222", whatsappFrom: "whatsapp:+10000000000" }, "accountSid"],
    ["elevenlabs", { ELEVENLABS_API_KEY: "el-platform-111" }, { apiKey: "el-own-222" }, "apiKey"],
    ["pagespeed", { PAGESPEED_API_KEY: "ps-platform-111" }, { apiKey: "ps-own-222" }, "apiKey"],
    ["google-service-account", { GOOGLE_SEO_CLIENT_EMAIL: "plat@x.iam.gserviceaccount.com", GOOGLE_SEO_PRIVATE_KEY: "-----BEGIN PRIVATE KEY----- plat" }, { clientEmail: "own@y.iam.gserviceaccount.com", privateKey: "-----BEGIN PRIVATE KEY----- own" }, "clientEmail"],
    ["livekit", { LIVEKIT_URL: "wss://platform.example", LIVEKIT_API_KEY: "lk-plat", LIVEKIT_API_SECRET: "lk-plat-secret" }, { url: "wss://own.example", apiKey: "lk-own", apiSecret: "lk-own-secret" }, "url"],
    ["turn", { MESSENGER_TURN_URL: "turn:platform.example:3478" }, { url: "turn:own.example:3478" }, "url"],
  ];
  for (const [provider, platform, mine, field] of GROUPS) {
    await T(`${provider}: default to one company, own to the other, change reaches only the default one, removal means not set up`, async () => {
      const read = async (id: string) => (await runAsCompany(id, () => resolveConnection(provider)))?.values[field] ?? null;
      const first = Object.keys(platform)[0];
      assert.deepEqual(await saveConfig(platform, "staff1"), { ok: true });
      const r = (await runAsCompany(B, () => saveConnection(provider, mine as never, "u1"))) as { ok: boolean };
      assert.equal(r.ok, true, JSON.stringify(r));
      await runAsCompany(B, () => setConnectionMode(provider, "own", "u1"));
      assert.equal(await read(A), platform[first]);
      assert.equal(await read(B), mine[field]);
      await saveConfig({ [first]: `${platform[first]}-changed` }, "staff1");
      assert.equal(await read(A), `${platform[first]}-changed`);
      assert.equal(await read(B), mine[field]);
      assert.equal((await defaultUsage())[provider]?.usingOwn ?? 1, 1);
      await saveConfig(Object.fromEntries(Object.keys(platform).map((k) => [k, { clear: true as const }])), "staff1");
      if (!process.env[first]) assert.equal(await read(A), null);
      assert.equal(await read(B), mine[field]);
    });
  }
  await T("platform email: SMTP then SendGrid stand in only when there is no Resend account; the sender is the platform's address under the company's name; a company's own account is untouched", async () => {
    assert.deepEqual(await saveConfig({ PLATFORM_SENDGRID_API_KEY: "SG.platform-key-123", PLATFORM_SENDGRID_FROM: "no-reply@platform.example" }, "staff1"), { ok: true });
    assert.equal((await platformEmail()).provider.id, "sendgrid");
    assert.deepEqual(await saveConfig({ PLATFORM_SMTP_HOST: "smtp.platform.example", PLATFORM_SMTP_PASSWORD: "pass word secret 99", PLATFORM_SMTP_FROM: "mail@platform.example" }, "staff1"), { ok: true });
    const p = await platformEmail();
    assert.equal(p.provider.id, "smtp");
    assert.equal(p.from, "mail@platform.example");
    assert.equal(await runAsCompany(A, () => senderForTenant(p.from)), "a <mail@platform.example>");
    assert.equal(await runAsCompany(A, () => platformServiceReady("smtp")), true);
    const bad = await saveConfig({ PLATFORM_SMTP_FROM: "Acme <boss@company.example>" }, "staff1");
    assert.equal(bad.ok, false, "only a bare address is accepted");
    const view = JSON.stringify(await getConfigView());
    assert.ok(!view.includes("SG.platform-key-123") && !view.includes("pass word secret"), "secrets never come back");
    await saveConfig({ PLATFORM_SMTP_HOST: { clear: true }, PLATFORM_SENDGRID_API_KEY: { clear: true } }, "staff1");
    assert.equal((await platformEmail()).provider.id, "console");
  });
  const domainsInput = (token: string, provider: "vercel" | "" = "vercel") => ({ provider, token, clearToken: !token, projectId: token ? "prj_platform" : "", teamId: "", rootDomain: "" });
  const noEmail = { provider: "" as const, apiKey: "", clearApiKey: false, from: "" };

  await T("push: the platform VAPID pair serves a company without its own; an own pair wins; changing or removing the default reaches only the company on it", async () => {
    const [p1, p2, mine] = [webpush.generateVAPIDKeys(), webpush.generateVAPIDKeys(), webpush.generateVAPIDKeys()];
    const key = async (id: string) => (await runAsCompany(id, pushKeys))?.publicKey ?? null;
    assert.deepEqual(await saveConfig({ VAPID_PUBLIC_KEY: p1.publicKey, VAPID_PRIVATE_KEY: p1.privateKey }, "staff1"), { ok: true });
    const r = await runAsCompany(B, () => saveConnection("vapid", { publicKey: mine.publicKey, privateKey: mine.privateKey } as never, "u1"));
    assert.equal((r as { ok: boolean }).ok, true, JSON.stringify(r));
    assert.deepEqual([await key(A), await key(B)], [p1.publicKey, mine.publicKey]);
    assert.equal((await runAsCompany(B, pushKeys))!.own, true);
    await saveConfig({ VAPID_PUBLIC_KEY: p2.publicKey, VAPID_PRIVATE_KEY: p2.privateKey }, "staff1");
    assert.deepEqual([await key(A), await key(B)], [p2.publicKey, mine.publicKey]);
    await saveConfig({ VAPID_PUBLIC_KEY: { clear: true }, VAPID_PRIVATE_KEY: { clear: true } }, "staff1");
    if (!process.env.VAPID_PUBLIC_KEY) assert.deepEqual([await key(A), await key(B)], [null, mine.publicKey]);
  });
  await T("resend: the platform key sends for a company without its own, from the platform's sender; an own key and sender win", async () => {
    const calls: { key: string; from: string }[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { calls.push({ key: String((init!.headers as Record<string, string>).Authorization).slice(7), from: JSON.parse(String(init!.body)).from }); return new Response(JSON.stringify({ id: "1" }), { status: 200 }); }) as typeof fetch;
    try {
      const mail = (id: string) => runAsCompany(id, () => sendEmail({ to: "x@example.test", subject: "s", html: "h", text: "t" }));
      const platform = (apiKey: string, clear = false) => saveIntegrations({ email: { provider: clear ? "" : "resend", apiKey, clearApiKey: clear, from: clear ? "" : "hello@platform.example" }, domains: domainsInput("", "") }, "staff1");
      assert.ok((await platform("re_platform_one_1111")).ok);
      const r = (await runAsCompany(B, () => saveConnection("resend", { apiKey: "re_own_company_2222", from: "me@own.example" } as never, "u1"))) as { ok: boolean };
      assert.equal(r.ok, true, JSON.stringify(r));
      await mail(A); await mail(B);
      assert.deepEqual(calls, [{ key: "re_platform_one_1111", from: "a <hello@platform.example>" }, { key: "re_own_company_2222", from: "me@own.example" }]);
      assert.ok((await platform("re_platform_new_3333")).ok);
      calls.length = 0; await mail(A); await mail(B);
      assert.deepEqual(calls.map((c) => c.key), ["re_platform_new_3333", "re_own_company_2222"]);
      assert.ok((await platform("", true)).ok);
      calls.length = 0; await mail(A); await mail(B);
      if (!process.env.RESEND_API_KEY) assert.deepEqual(calls.map((c) => c.key), ["re_own_company_2222"], "no default: nothing is sent for the follower");
    } finally { globalThis.fetch = real; }
  });
  await T("domains: both companies' domains are attached with the platform's account (there is no company account); a change reaches both; removal means manual", async () => {
    assert.ok(!CONNECTION_PROVIDERS.find((p) => p.key === "domains")!.fields.length, "a company cannot save its own hosting account");
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { calls.push(String((init?.headers as Record<string, string>)?.Authorization).slice(7)); return new Response(JSON.stringify({ name: "x", verified: false, misconfigured: true }), { status: 200 }); }) as typeof fetch;
    try {
      const add = async (id: string, host: string) => { await db.collection("company_domains").deleteMany({ companyId: id, kind: "custom" }); const r = await runAsCompany(id, () => addCustomDomain(host)); assert.equal(r.ok, true, JSON.stringify(r)); };
      assert.ok((await saveIntegrations({ email: noEmail, domains: domainsInput("vercel-platform-1111") }, "staff1")).ok);
      await add(A, "one.alpha-example.com"); await add(B, "one.beta-example.com");
      assert.ok(calls.length >= 2 && calls.every((t) => t === "vercel-platform-1111"), calls.join());
      const mine = JSON.stringify(await runAsCompany(A, listCompanyDomains));
      assert.ok(mine.includes("one.alpha-example.com") && !mine.includes("beta-example"), "a company sees only its own domains");
      calls.length = 0;
      assert.ok((await saveIntegrations({ email: noEmail, domains: domainsInput("vercel-platform-2222") }, "staff1")).ok);
      await add(A, "two.alpha-example.com"); await add(B, "two.beta-example.com");
      assert.ok(calls.length >= 2 && calls.every((t) => t === "vercel-platform-2222"), calls.join());
      calls.length = 0;
      assert.ok((await saveIntegrations({ email: noEmail, domains: domainsInput("", "") }, "staff1")).ok);
      if (!process.env.VERCEL_API_TOKEN) { await add(A, "three.alpha-example.com"); assert.equal(calls.length, 0); }
    } finally { globalThis.fetch = real; }
  });
  await T("storage: both companies use the platform's storage (there is no company account); each file is kept under its own company; Blob without a token stays in the database", async () => {
    assert.ok(!CONNECTION_PROVIDERS.find((p) => p.key === "storage")!.fields.length);
    await saveConfig({ FILE_BACKEND: "blob" }, "staff1");
    for (const [id, name] of [[A, "a.txt"], [B, "b.txt"]]) await runAsCompany(id, () => putObject("platform-test", name, Buffer.from(`file of ${name}`), "text/plain"));
    const files = await db.collection("storage.files").find({}).toArray();
    assert.deepEqual(files.filter((f) => String(f.filename).startsWith("platform-test/")).map((f) => [f.filename, f.metadata.companyId]).sort(), [["platform-test/a.txt", A], ["platform-test/b.txt", B]]);
    assert.equal(await new Response((await runAsCompany(A, () => getObject("platform-test/a.txt")))!.stream).text(), "file of a.txt");
    await saveConfig({ FILE_BACKEND: { clear: true } }, "staff1");
  });
  await db.dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
