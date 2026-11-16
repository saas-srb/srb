import assert from "node:assert/strict";
import webpush from "web-push";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { CONNECTION_PROVIDERS, PLATFORM_FALLBACK, canUseSrb, providerByKey } from "../src/lib/platform/connections/catalog";
import { cardStatus, connectionIdOf, usedByProducts } from "../src/lib/platform/connections/cards";
import { TESTERS, hasTester, pingWebhooks, probeStorage, runTester, scrub, sendTestEmailToPerson, type TesterDeps } from "../src/lib/platform/connections/testers";
import { ENV, resolveConnection } from "../src/lib/platform/connections/resolve";
import { getConnectionView, getSavedConnection, saveConnection, setConnectionMode } from "../src/lib/platform/connections/store";
import { platformServiceReady } from "../src/lib/platform/connections/platform-services";
import { missingSettings, testSetting } from "../src/lib/platform/setup/missing";
import { DEFAULT_PANELS } from "../src/lib/platform/panels/types";
import { pushKeys } from "../src/lib/push/vapid";

// Provider tests with stubbed HTTP (nothing leaves this machine), the shared status/used-by sources, and company-keys-first then SRB
// for every provider on a throwaway database. Run: npm run test:connections
let passed = 0;
const T = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };

type Call = { url: string; init?: RequestInit };
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function stub(reply: (c: Call) => Response | Promise<Response> | Error) {
  const calls: Call[] = [];
  const deps: TesterDeps = {
    fetch: async (url, init) => { const c = { url, init }; calls.push(c); const r = await reply(c); if (r instanceof Error) throw r; return r; },
    smtpVerify: async () => {}, googleToken: async () => {}, livekitList: async () => {}, vapidCheck: () => {},
  };
  return { deps, calls };
}

/** Valid-looking credentials for a provider (every required field filled). */
function sample(provider: string): Record<string, string> {
  if (provider === "vapid") { const k = webpush.generateVAPIDKeys(); return { publicKey: k.publicKey, privateKey: k.privateKey, subject: "mailto:ops@example.com" }; }
  if (provider === "razorpay") return { keyId: "rzp_test_abcdefgh12345", keySecret: "razorpay-secret-value" };
  const p = providerByKey.get(provider)!;
  return Object.fromEntries(p.fields.filter((f) => f.required || f.defaultValue).map((f) => [f.key, f.key === "port" ? "587" : f.kind === "select" ? (f.defaultValue ?? f.options![0].value) : `${provider}-${f.key}-value1234`]));
}

(async () => {
  console.log("one tester interface (stubbed HTTP)");
  const HTTP_PROVIDERS = ["openai", "gemini", "elevenlabs", "resend", "sendgrid", "twilio", "whatsapp-cloud", "razorpay", "pagespeed", "meta", "google", "linkedin", "x"];
  await T("every provider that says it is testable has a real tester (or a managed check), and no tester is orphaned", () => {
    const managed = new Set(["storage", "webhooks", "razorpay"]);
    for (const p of CONNECTION_PROVIDERS.filter((x) => x.testable)) assert.ok(hasTester(p.key) || managed.has(p.key), `${p.key} is testable but has no check`);
    for (const k of Object.keys(TESTERS)) assert.ok(providerByKey.has(k), `tester ${k} has no card`);
    for (const k of ["openai", "gemini", "elevenlabs", "twilio", "livekit", "smtp", "resend", "sendgrid", "razorpay", "google-service-account", "meta", "google", "linkedin", "x", "vapid", "whatsapp-cloud", "pagespeed"]) assert.ok(hasTester(k), k);
  });
  await T("an accepted credential reads as plain success; each provider calls its own service, read-only", async () => {
    const hosts: Record<string, string> = { openai: "api.openai.com", gemini: "generativelanguage.googleapis.com", elevenlabs: "api.elevenlabs.io", resend: "api.resend.com", sendgrid: "api.sendgrid.com", twilio: "api.twilio.com", "whatsapp-cloud": "graph.facebook.com", razorpay: "api.razorpay.com", pagespeed: "www.googleapis.com", meta: "graph.facebook.com", google: "oauth2.googleapis.com", linkedin: "www.linkedin.com", x: "api.x.com" };
    for (const k of HTTP_PROVIDERS) {
      const { deps, calls } = stub(() => res(k === "google" || k === "linkedin" || k === "x" ? 400 : 200, k === "google" ? { error: "invalid_grant" } : {}));
      const out = await runTester(k, sample(k), deps);
      assert.equal(out.ok, true, `${k}: ${out.message}`);
      assert.equal(calls.length, 1, k);
      assert.equal(new URL(calls[0].url).host, hosts[k], k);
      const method = (calls[0].init?.method ?? "GET").toUpperCase();
      assert.ok(["GET", "POST"].includes(method) && (method === "GET" || ["meta", "google", "linkedin", "x"].includes(k)), `${k} uses ${method}`);
    }
  });
  await T("a refused credential reads as a plain problem with the service's own words, and never contains the secret", async () => {
    for (const k of ["openai", "gemini", "elevenlabs", "resend", "sendgrid", "twilio", "whatsapp-cloud", "pagespeed"]) {
      const creds = sample(k);
      const echoed = Object.values(creds).find((v) => v.length > 8)!;
      const { deps } = stub(() => res(401, { error: { message: `Incorrect key provided: ${echoed}` } }));
      const out = await runTester(k, creds, deps);
      assert.equal(out.ok, false, k);
      assert.match(out.message, /401/);
      assert.ok(!out.message.includes(echoed), `${k} leaked its key`);
      assert.match(out.message, /\*\*\*/);
    }
    const out = await runTester("razorpay", sample("razorpay"), stub(() => res(401, {})).deps);
    assert.deepEqual(out, { ok: false, message: "Razorpay rejected these keys. Check the Key ID and Key Secret." });
    assert.equal((await runTester("razorpay", { keyId: "nope", keySecret: "x" }, stub(() => res(200)).deps)).ok, false, "a malformed key id is refused before any call");
  });
  await T("secrets travel in headers or a request body, not in the address (PageSpeed's API key is the one that Google requires in it)", async () => {
    for (const k of HTTP_PROVIDERS.filter((x) => x !== "pagespeed")) {
      const creds = sample(k);
      const { deps, calls } = stub(() => res(200));
      await runTester(k, creds, deps);
      const secretFields = k === "razorpay" ? ["keySecret"] : (providerByKey.get(k)?.fields ?? []).filter((f) => f.kind === "secret").map((f) => f.key);
      for (const f of secretFields) assert.ok(!calls[0].url.includes(encodeURIComponent(creds[f])), `${k} put its ${f} in its URL`);
    }
  });
  await T("a timeout and a network error are plain messages and carry no key", async () => {
    const t = new Error("x"); t.name = "TimeoutError";
    assert.deepEqual(await runTester("openai", sample("openai"), stub(() => t).deps), { ok: false, message: "The service didn't answer in time." });
    const out = await runTester("openai", { apiKey: "sk-supersecret-123" }, stub(() => new Error("connect ECONNREFUSED sk-supersecret-123")).deps);
    assert.equal(out.ok, false);
    assert.ok(!out.message.includes("sk-supersecret-123"));
  });
  await T("OAuth apps (Google/YouTube, LinkedIn, X) and Meta: a wrong client reads as a problem, a known client with a fake code is fine", async () => {
    for (const k of ["google", "linkedin", "x"]) {
      assert.equal((await runTester(k, sample(k), stub(() => res(401, { error: "invalid_client" })).deps)).ok, false, `${k} bad client`);
      assert.equal((await runTester(k, sample(k), stub(() => res(400, { error: "invalid_client", error_description: "Client authentication failed" })).deps)).ok, false, `${k} bad client 400`);
      assert.equal((await runTester(k, sample(k), stub(() => res(400, { error: "invalid_grant" })).deps)).ok, true, `${k} known client`);
      assert.equal((await runTester(k, sample(k), stub(() => res(503, {})).deps)).ok, false, `${k} outage`);
    }
    assert.equal((await runTester("meta", sample("meta"), stub(() => res(400, { error: { message: "Error validating client secret." } })).deps)).ok, false);
    assert.equal((await runTester("meta", sample("meta"), stub(() => res(200, { access_token: "app|tok" })).deps)).ok, true);
  });
  await T("SMTP, Google service account, LiveKit and push keys use their own checks (all stubbed)", async () => {
    const boom = async () => { throw new Error("535 bad login"); };
    const base = stub(() => res(200)).deps;
    assert.equal((await runTester("smtp", sample("smtp"), base)).ok, true);
    assert.match((await runTester("smtp", sample("smtp"), { ...base, smtpVerify: boom })).message, /535 bad login/);
    assert.equal((await runTester("google-service-account", sample("google-service-account"), base)).ok, true);
    assert.equal((await runTester("google-service-account", sample("google-service-account"), { ...base, googleToken: boom })).ok, false);
    let host = "";
    assert.equal((await runTester("livekit", { url: "wss://x.livekit.cloud", apiKey: "k", apiSecret: "s" }, { ...base, livekitList: async (h) => { host = h; } })).ok, true);
    assert.equal(host, "https://x.livekit.cloud");
    assert.equal((await runTester("livekit", sample("livekit"), { ...base, livekitList: boom })).ok, false);
    const real = (await import("../src/lib/platform/connections/testers")).defaultDeps();
    assert.equal((await runTester("vapid", sample("vapid"), { ...base, vapidCheck: real.vapidCheck })).ok, true, "a real generated pair is valid");
    assert.equal((await runTester("vapid", { publicKey: "x", privateKey: "y" }, { ...base, vapidCheck: real.vapidCheck })).ok, false);
  });
  await T("a service without a check says so honestly instead of claiming it works", async () => {
    const out = await runTester("turn", { url: "turn:x" }, stub(() => res(200)).deps);
    assert.match(out.message, /no automatic check/);
  });
  await T("file storage probe: writes, reads back, removes; a broken store or wrong bytes is a problem; cleanup always runs", async () => {
    const files = new Map<string, Buffer>();
    const good = { put: async (k: string, b: Buffer) => void files.set(k, b), get: async (k: string) => files.get(k) ?? null, remove: async (k: string) => void files.delete(k) };
    assert.equal((await probeStorage(good)).ok, true);
    assert.equal(files.size, 0, "the test file was removed");
    assert.equal((await probeStorage({ ...good, get: async () => Buffer.from("other") })).ok, false);
    assert.equal(files.size, 0);
    const down = await probeStorage({ ...good, put: async () => { throw new Error("db offline"); } });
    assert.deepEqual([down.ok, /db offline/.test(down.message)], [false, true]);
  });
  await T("webhooks ping: each URL gets one signed connection.test event; nothing configured and a failing endpoint are plain problems", async () => {
    const sent: { url: string; secret: string; type: string; payload: { test?: boolean } }[] = [];
    const ok = async (url: string, payload: unknown, o: { secret: string; eventType: string }) => { sent.push({ url, secret: o.secret, type: o.eventType, payload: payload as never }); return { ok: true, status: 200, error: null }; };
    const r = await pingWebhooks([{ name: "Hook A", url: "https://a.example/h", secret: "s1" }, { name: "Hook B", url: "https://b.example/h", secret: "s2" }], ok);
    assert.equal(r.ok, true);
    assert.deepEqual(sent.map((s) => [s.url, s.type, s.payload.test]), [["https://a.example/h", "connection.test", true], ["https://b.example/h", "connection.test", true]]);
    assert.equal(r.message.includes("s1"), false, "the signing secret is not in the result");
    assert.equal((await pingWebhooks([], ok)).ok, false);
    const bad = await pingWebhooks([{ name: "Hook A", url: "https://a.example/h", secret: "s1" }], async () => ({ ok: false, status: 500, error: "HTTP 500" }));
    assert.deepEqual([bad.ok, /Hook A: HTTP 500/.test(bad.message)], [false, true]);
  });
  await T("the test email goes only to the signed-in person's own address, and never when it is missing or malformed", async () => {
    const sent: string[] = [];
    const sender = { send: async (to: string) => { sent.push(to); return { ok: true }; } };
    assert.equal((await sendTestEmailToPerson("me@acme.test", sender)).ok, true);
    assert.deepEqual(sent, ["me@acme.test"]);
    for (const bad of [null, undefined, "", "not-an-email", "a@b"]) assert.equal((await sendTestEmailToPerson(bad as never, sender)).ok, false);
    assert.equal(sent.length, 1, "nothing else was sent");
    assert.equal((await sendTestEmailToPerson("me@acme.test", { send: async () => ({ ok: false, error: "provider down" }) })).message.includes("provider down"), true);
    const src = (await import("node:fs")).readFileSync("src/app/(products)/commandos/(protected)/settings/integrations/actions.ts", "utf8");
    assert.match(src, /export async function sendTestEmailAction\(\): Promise<TestOutcome>/, "the action takes no address");
  });
  await T("scrub removes every credential value but leaves short or empty ones alone", () => {
    assert.equal(scrub("key abcd1234 and xy", { a: "abcd1234", b: "xy", c: "" }), "key *** and xy");
  });

  console.log("status badges from the real state");
  await T("'Using SRB' only when the platform really has the service; otherwise 'Not available from SRB, add your own'", () => {
    const base = { canSrb: true, srbReady: true, mode: "srb" as const, hasOwnKeys: false, lastTestOk: null };
    assert.equal(cardStatus(base), "using_srb");
    assert.equal(cardStatus({ ...base, srbReady: false }), "srb_unavailable");
    assert.equal(cardStatus({ ...base, srbReady: false, mode: "own", hasOwnKeys: true }), "using_own", "own keys work even where SRB has none");
    assert.equal(cardStatus({ ...base, canSrb: false, srbReady: false }), "not_set_up", "services SRB never provides are just not set up");
  });

  console.log("used by, from the live product registry");
  const registry = DEFAULT_PANELS.map((p) => ({ key: p.key, name: p.name, connections: p.connections }));
  await T("a card lists the products whose registry row declares it, in registry order", () => {
    assert.deepEqual(usedByProducts("razorpay", registry), ["SRB TalentOS", "SRB CashFlow AI", "SRB SpendIQ", "SRB Cohort AI"]);
    assert.ok(usedByProducts("resend", registry).length >= 15, "email is used by every product");
    assert.equal(connectionIdOf("smtp"), "email");
    assert.equal(connectionIdOf("vapid"), "push");
    assert.deepEqual(usedByProducts("elevenlabs", registry), ["SRB TalentOS", "SRB DealFlow AI", "SRB AgentOS", "SRB SiteCraft AI"]);
  });
  await T("changing a registry row moves the card's list; a product switched off for the company drops out; nothing is hand-written", () => {
    const edited = registry.map((p) => (p.key === "pms" ? { ...p, connections: [...p.connections, "openai"] } : p));
    assert.ok(usedByProducts("openai", edited).includes("SRB SprintOS"));
    assert.ok(!usedByProducts("openai", registry).includes("SRB SprintOS"));
    assert.ok(!usedByProducts("openai", registry, new Set(["aibots"])).includes("SRB AgentOS"));
    const fs = require("node:fs") as typeof import("node:fs");
    assert.ok(!/USED_BY/.test(fs.readFileSync("src/lib/platform/connections/cards.ts", "utf8")), "the hand-written map is gone");
    assert.ok(!/usedBy:/.test(fs.readFileSync("src/lib/platform/connections/catalog.ts", "utf8")), "no hand-written list in the catalog either");
  });
  await T("every connection a built-in product declares is a real card, and every card with fields is used by at least one product", () => {
    const ids = new Set(CONNECTION_PROVIDERS.flatMap((p) => [connectionIdOf(p.key)]).concat(["ai-chatbot"]));
    for (const p of DEFAULT_PANELS) for (const c of p.connections) assert.ok(ids.has(c), `${p.key} declares unknown connection ${c}`);
    for (const p of CONNECTION_PROVIDERS.filter((x) => x.key !== "webhooks")) assert.ok(usedByProducts(p.key, registry).length > 0, `${p.key} is used by no product`);
  });

  console.log("one source for the staff checklist and the cards (throwaway database)");
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  const clearEnv = () => { for (const m of Object.values(ENV)) for (const names of Object.values(m)) for (const n of names) delete process.env[n]; delete process.env.RESEND_API_KEY; delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.EMAIL_PROVIDER; };
  const setPlatform = (provider: string) => {
    if (provider === "vapid") { const k = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = k.publicKey; process.env.VAPID_PRIVATE_KEY = k.privateKey; return; }
    if (providerByKey.get(provider)?.group === "email") { process.env.RESEND_API_KEY = "re_platform_key_123"; return; }
    for (const [field, names] of Object.entries(ENV[provider])) process.env[names[0]] = `platform-${provider}-${field}-9999`;
  };
  await runAsCompany("co_src", async () => {
    await T("cards and the Missing-settings checklist answer from the same function: 'configured' always equals 'SRB ready'", async () => {
      clearEnv();
      for (const [id, provider] of [["email", "resend"], ["openai", "openai"], ["elevenlabs", "elevenlabs"], ["twilio", "twilio"], ["push", "vapid"]] as const) {
        const before = (await missingSettings()).find((m) => m.id === id)!;
        assert.equal(before.configured, false, `${id} empty`);
        assert.equal(await platformServiceReady(provider), false, `${provider} empty`);
        setPlatform(provider);
        const after = (await missingSettings()).find((m) => m.id === id)!;
        assert.equal(after.configured, true, `${id} set`);
        assert.equal(await platformServiceReady(provider), true, `${provider} set`);
        assert.equal(after.provider, provider);
      }
      clearEnv();
    });
    await T("a partly configured service (Twilio SID without the token) is NOT ready, in the cards or the checklist", async () => {
      process.env.TWILIO_ACCOUNT_SID = "AC999";
      assert.equal(await platformServiceReady("twilio"), false);
      assert.equal((await missingSettings()).find((m) => m.id === "twilio")!.configured, false);
      process.env.TWILIO_AUTH_TOKEN = "tok99999";
      assert.equal(await platformServiceReady("twilio"), true);
      clearEnv();
    });
    await T("the staff test and the company test are the same tester: one stubbed call each, same URL and result", async () => {
      process.env.OPENAI_API_KEY = "sk-platform-abcdef";
      const urls: string[] = [];
      const fetchFn = (async (url: string) => { urls.push(url); return res(200); }) as unknown as typeof fetch;
      const staff = await testSetting("openai", fetchFn);
      assert.deepEqual(staff, { ok: true, message: "OpenAI accepted the credentials." });
      const { deps, calls } = stub(() => res(200));
      const company = await runTester("openai", { apiKey: "sk-platform-abcdef" }, deps);
      assert.equal(company.message, "OpenAI accepted the credentials.");
      assert.equal(urls[0], calls[0].url);
      const refused = await testSetting("openai", (async () => res(401, { error: { message: "bad sk-platform-abcdef" } })) as unknown as typeof fetch);
      assert.equal(refused.ok, false);
      assert.ok(!JSON.stringify(refused).includes("sk-platform-abcdef"), "no secret in the staff result either");
      clearEnv();
    });
  });

  console.log("company keys first, then SRB, for every provider (throwaway database)");
  const FALLBACK = [...PLATFORM_FALLBACK];
  const OWN_ONLY = CONNECTION_PROVIDERS.filter((p) => p.fields.length > 0 && !canUseSrb(p.key)).map((p) => p.key);
  await T("the provider lists are what the product says: SRB can run AI, voice, phone, search data, calls, email and push; never payments or social", () => {
    for (const k of ["openai", "elevenlabs", "twilio", "pagespeed", "google-service-account", "livekit", "turn", "smtp", "resend", "sendgrid", "vapid"]) assert.ok(canUseSrb(k), k);
    for (const k of ["gemini", "meta", "google", "linkedin", "x", "whatsapp-cloud"]) assert.ok(OWN_ONLY.includes(k), k);
  });
  for (const provider of FALLBACK) {
    await T(`${provider}: SRB fallback with nothing saved, own keys win once saved, switching to SRB keeps them, switching back uses them`, async () => {
      clearEnv();
      setPlatform(provider);
      const platformValues = Object.fromEntries(Object.entries(ENV[provider]).map(([f, n]) => [f, process.env[n[0]]!]));
      await runAsCompany(`co_${provider}`, async () => {
        const fallback = await resolveConnection(provider);
        assert.equal(fallback?.source, "platform", "SRB fallback");
        assert.deepEqual(fallback?.values, platformValues);
        const own = sample(provider);
        const saved = await saveConnection(provider, own, "u1");
        assert.equal(saved.ok, true, saved.ok ? "" : saved.error);
        const mine = await resolveConnection(provider);
        assert.equal(mine?.source, "workspace", "own wins");
        for (const [f, v] of Object.entries(own)) if (providerByKey.get(provider)!.fields.find((x) => x.key === f)) assert.equal(mine?.values[f], v, f);
        assert.deepEqual(await setConnectionMode(provider, "srb", "u1"), { ok: true });
        assert.equal((await resolveConnection(provider))?.source, "platform", "SRB chosen");
        assert.equal((await getConnectionView(provider)).saved, true, "own keys kept");
        assert.deepEqual(await setConnectionMode(provider, "own", "u1"), { ok: true });
        assert.equal((await resolveConnection(provider))?.source, "workspace", "own again");
      });
      await runAsCompany("co_nokeys", async () => assert.equal((await resolveConnection(provider))?.source, "platform", "another company still gets SRB"));
      clearEnv();
    });
  }
  for (const provider of OWN_ONLY) {
    await T(`${provider}: never falls back to SRB (own account only); switching to SRB is not offered`, async () => {
      clearEnv();
      for (const [field, names] of Object.entries(ENV[provider] ?? {})) process.env[names[0]] = `platform-${provider}-${field}`;
      await runAsCompany(`co_own_${provider}`, async () => {
        assert.equal(await resolveConnection(provider), null, "the platform's keys are never lent for this");
        const saved = await saveConnection(provider, sample(provider), "u1");
        assert.equal(saved.ok, true, saved.ok ? "" : saved.error);
        assert.equal((await resolveConnection(provider))?.source, "workspace");
      });
      assert.equal(canUseSrb(provider), false);
      clearEnv();
    });
  }
  for (const provider of ["smtp", "resend", "sendgrid"]) {
    await T(`${provider}: the company's own sender is used when saved; SRB's (the platform's) otherwise, and saved keys survive switching`, async () => {
      clearEnv();
      process.env.RESEND_API_KEY = "re_platform_key_123";
      await runAsCompany(`co_mail_${provider}`, async () => {
        assert.equal(await getSavedConnection(provider), null, "nothing saved: the email layer falls back to SRB's account");
        const ok = await saveConnection(provider, sample(provider), "u1");
        assert.equal(ok.ok, true, ok.ok ? "" : ok.error);
        assert.ok(await getSavedConnection(provider), "own wins");
        await setConnectionMode(provider, "srb", "u1");
        assert.equal(await getSavedConnection(provider), null, "SRB chosen");
        assert.equal((await getConnectionView(provider)).saved, true);
        await setConnectionMode(provider, "own", "u1");
        assert.ok(await getSavedConnection(provider));
      });
      assert.equal(await platformServiceReady(provider), true, "SRB's email is the platform's real provider");
      clearEnv();
    });
  }
  await T("push: own VAPID pair wins, SRB's is the fallback, switching keeps the pair", async () => {
    clearEnv();
    setPlatform("vapid");
    const srbKey = process.env.VAPID_PUBLIC_KEY;
    await runAsCompany("co_push", async () => {
      assert.deepEqual([(await pushKeys())?.own, (await pushKeys())?.publicKey], [false, srbKey]);
      const mine = sample("vapid");
      assert.equal((await saveConnection("vapid", mine, "u1")).ok, true);
      assert.deepEqual([(await pushKeys())?.own, (await pushKeys())?.publicKey], [true, mine.publicKey]);
      await setConnectionMode("vapid", "srb", "u1");
      assert.deepEqual([(await pushKeys())?.own, (await pushKeys())?.publicKey], [false, srbKey]);
      assert.equal((await getConnectionView("vapid")).saved, true);
      await setConnectionMode("vapid", "own", "u1");
      assert.equal((await pushKeys())?.publicKey, mine.publicKey);
    });
    clearEnv();
  });

  await (await getPlatformDb()).dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
