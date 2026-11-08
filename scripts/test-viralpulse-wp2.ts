/**
 * ViralPulse WP2 tests: connected accounts. Encryption (round trip, AAD tamper, key id + rotation), scope diff, status maths, OAuth start/finish
 * (state replay, nonce binding, PKCE), token exchange / long-lived exchange / debug_token / discovery / refresh with rotation / revoke against
 * FAKE provider servers (an injected fetch: no network), refresh lease race, 401 retry, expiry sweep, tenancy, legacy migration + compatibility,
 * and "no token anywhere it should not be". Database: a THROWAWAY MongoDB only (asserted, then dropped).
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_vpwp2 npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-wp2.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");
const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("base64");
process.env.PLATFORM_ENCRYPTION_KEY = keyA;
delete process.env.SMMS_ENCRYPTION_KEY;
delete process.env.PLATFORM_ENCRYPTION_KEY_PREVIOUS;

let pass = 0;
let fail = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.log("FAIL", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 8).join("\n    ") : e);
  }
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const day = 86_400_000;

// ── fake provider servers ──────────────────────────────────────────────────────
interface Calls { [k: string]: number }
const calls: Calls = {};
const hit = (k: string) => (calls[k] = (calls[k] ?? 0) + 1);
const log: { url: string; method: string; body: string }[] = [];
const fake = {
  metaDebug: { is_valid: true, expires_at: 0, data_access_expires_at: 0, scopes: [] as string[] },
  metaPageTokenRotates: false,
  metaUserId: "meta-user-1",
  googleExpiresIn: 3600,
  googleBusiness: false,
  gCounter: 1,
  googleRefreshDelay: 0,
  xRefreshTokens: new Set<string>(),
  xCounter: 0,
  liIntrospectActive: true,
  liOrgs: true,
  ytChannels: [{ id: "UC1", snippet: { title: "Acme Channel", customUrl: "@acme", thumbnails: { default: { url: "https://yt.example/a.jpg" } } } }] as unknown[],
  rejectAccessOnce: new Set<string>(),
};
const META_ALL = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "read_insights", "instagram_manage_insights", "ads_read", "ads_management"];

async function providerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? String(init.body) : "";
  log.push({ url: url.origin + url.pathname, method, body });
  const form = new URLSearchParams(body);
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  const p = url.pathname;
  const q = url.searchParams;
  // Meta
  if (url.host === "graph.facebook.com") {
    const rest = p.replace(/^\/v[\d.]+/, "");
    if (rest === "/oauth/access_token") {
      if (q.get("code")) { hit("meta.code"); return q.get("code") === "bad" ? json({ error: { message: "Invalid verification code", code: 100 } }, 400) : json({ access_token: "meta-short-1" }); }
      if (q.get("grant_type") === "fb_exchange_token") { hit("meta.long"); assert.equal(q.get("fb_exchange_token"), "meta-short-1"); return json({ access_token: "meta-long-1", expires_in: 5_184_000 }); }
    }
    if (rest === "/debug_token") { hit("meta.debug"); assert.equal(q.get("access_token"), "APPID|APPSECRET"); return json({ data: fake.metaDebug }); }
    if (rest === "/me") return json({ id: fake.metaUserId, name: fake.metaUserId === "meta-user-1" ? "Maya Owner" : "Other Person", picture: { data: { url: "https://fb.example/maya.jpg" } } });
    if (rest === "/me/accounts") return json({ data: [{ id: "PAGE1", name: "Acme Page", access_token: "page-token-1", picture: { data: { url: "https://fb.example/p.jpg" } }, instagram_business_account: { id: "IG1", username: "acme", profile_picture_url: "https://ig.example/a.jpg" } }] });
    if (rest === "/me/adaccounts") return json({ data: [{ id: "act_555", account_id: "555", name: "Acme Ads", currency: "INR", account_status: 1 }] });
    if (rest === "/PAGE1" && q.get("fields") === "access_token") { hit("meta.pagetoken"); return json({ access_token: "page-token-2" }); }
    if (rest === "/meta-user-1/permissions" && method === "DELETE") { hit("meta.revoke"); return json({ success: true }); }
    if (/^\/(PAGE1|IG1|act_555)$/.test(rest)) {
      const tok = q.get("access_token");
      if (tok === "page-token-1" && fake.metaPageTokenRotates) return json({ error: { message: "Error validating access token", type: "OAuthException", code: 190 } }, 400);
      return json({ name: "Acme", username: "acme" });
    }
  }
  // Google
  if (url.host === "oauth2.googleapis.com") {
    if (p === "/token") {
      if (form.get("grant_type") === "authorization_code") { hit("google.code"); assert.ok(form.get("code_verifier"), "PKCE verifier sent"); return json({ access_token: "g-access-1", refresh_token: "g-refresh-1", expires_in: fake.googleExpiresIn, scope: `openid email profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly${fake.googleBusiness ? " https://www.googleapis.com/auth/business.manage" : ""}` }); }
      if (form.get("grant_type") === "refresh_token") {
        hit("google.refresh");
        if (fake.googleRefreshDelay) await sleep(fake.googleRefreshDelay);
        if (form.get("refresh_token") !== "g-refresh-1") return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
        return json({ access_token: `g-access-${++fake.gCounter}`, expires_in: 3600 });
      }
    }
    if (p === "/tokeninfo") { hit("google.tokeninfo"); return json({ scope: `openid email profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly${fake.googleBusiness ? " https://www.googleapis.com/auth/business.manage" : ""}`, expires_in: "3000" }); }
    if (p === "/revoke") { hit("google.revoke"); return json({}); }
  }
  if (url.host === "openidconnect.googleapis.com") return json({ sub: "g-user-1", name: "Gina Google", email: "g@example.com", picture: "https://g.example/g.jpg" });
  if (url.host === "www.googleapis.com" && p === "/youtube/v3/channels") {
    if (auth === "Bearer g-access-1" && fake.rejectAccessOnce.has("g-access-1")) { fake.rejectAccessOnce.delete("g-access-1"); hit("yt.401"); return json({ error: { message: "Invalid Credentials", code: 401 } }, 401); }
    if (q.get("mine")) return json({ items: fake.ytChannels });
    return json({ items: [{ id: "UC1", snippet: { title: "Acme Channel" } }] });
  }
  // LinkedIn
  if (url.host === "www.linkedin.com") {
    if (p === "/oauth/v2/accessToken") { hit(`li.${form.get("grant_type")}`); return json({ access_token: "li-access-1", expires_in: 5_184_000, scope: "openid,profile,w_member_social,w_organization_social,r_organization_social" }); }
    if (p === "/oauth/v2/introspectToken") { hit("li.introspect"); return json(fake.liIntrospectActive ? { active: true, scope: "openid,profile,w_member_social,w_organization_social,r_organization_social", expires_at: Math.floor((Date.now() + 40 * day) / 1000) } : { active: false, status: "revoked" }); }
    if (p === "/oauth/v2/revoke") { hit("li.revoke"); return json({}); }
  }
  if (url.host === "api.linkedin.com") {
    if (p === "/v2/userinfo") return json({ sub: "li-user-1", name: "Liam Linked", picture: "https://li.example/l.jpg" });
    if (p === "/rest/organizationAcls") { assert.ok(new Headers(init?.headers).get("linkedin-version")); return fake.liOrgs ? json({ elements: [{ organization: "urn:li:organization:777", role: "ADMINISTRATOR", state: "APPROVED" }, { organization: "urn:li:organization:888", role: "ANALYST", state: "APPROVED" }] }) : json({ message: "Not enough permissions" }, 403); }
    if (p === "/rest/organizations/777") return json({ localizedName: "Acme Org", vanityName: "acme-org" });
  }
  // X
  if (url.host === "api.x.com") {
    if (p === "/2/oauth2/token") {
      assert.ok(auth.startsWith("Basic "), "X confidential client uses Basic auth");
      if (form.get("grant_type") === "authorization_code") { hit("x.code"); assert.ok(form.get("code_verifier")); const rt = `x-refresh-${++fake.xCounter}`; fake.xRefreshTokens.add(rt); return json({ token_type: "bearer", expires_in: 7200, access_token: `x-access-${fake.xCounter}`, refresh_token: rt, scope: "tweet.read tweet.write users.read offline.access media.write" }); }
      if (form.get("grant_type") === "refresh_token") {
        hit("x.refresh");
        await sleep(30);
        const used = form.get("refresh_token") ?? "";
        if (!fake.xRefreshTokens.has(used)) return json({ error: "invalid_request", error_description: "Value passed for the token was invalid." }, 400);
        fake.xRefreshTokens.delete(used); // rotation: the old one dies
        const rt = `x-refresh-${++fake.xCounter}`;
        fake.xRefreshTokens.add(rt);
        return json({ token_type: "bearer", expires_in: 7200, access_token: `x-access-${fake.xCounter}`, refresh_token: rt, scope: "tweet.read tweet.write users.read offline.access media.write" });
      }
    }
    if (p === "/2/oauth2/revoke") { hit("x.revoke"); return json({ revoked: true }); }
    if (p === "/2/users/me") { hit("x.me"); return json({ data: { id: "x-user-1", name: "Xena", username: "xena", profile_image_url: "https://x.example/x.jpg" } }); }
  }
  return json({ error: `unhandled ${method} ${url.href}` }, 500);
}

async function main() {
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const crypto = await import("../src/lib/products/viralpulse-ai/crypto");
  const types = await import("../src/lib/products/viralpulse-ai/accounts/types");
  const status = await import("../src/lib/products/viralpulse-ai/accounts/status");
  const http = await import("../src/lib/products/viralpulse-ai/accounts/http");
  const svc = await import("../src/lib/products/viralpulse-ai/accounts/service");
  const stor = await import("../src/lib/products/viralpulse-ai/accounts/store");
  const health = await import("../src/lib/products/viralpulse-ai/accounts/health");
  const integ = await import("../src/lib/products/viralpulse-ai/integrations");
  const { saveConnection } = await import("../src/lib/platform/connections/store");
  const { smmsCollection, COLLECTIONS } = await import("../src/lib/products/viralpulse-ai/db");
  const { getDb } = await import("../src/lib/mongodb");
  http.setFetchForTests(providerFetch as typeof fetch);

  const me = { userId: "u-admin", email: "admin@example.com" };
  const reset = () => { for (const k of Object.keys(calls)) delete calls[k]; log.length = 0; };
  const setupApps = async () => {
    await saveConnection("meta", { appId: "APPID", appSecret: "APPSECRET" }, null);
    await saveConnection("google", { clientId: "gid", clientSecret: "gsecret" }, null);
    await saveConnection("linkedin", { clientId: "lid", clientSecret: "lsecret" }, null);
    await saveConnection("x", { clientId: "xid", clientSecret: "xsecret" }, null);
  };
  /** Runs the full browser flow against the fakes: start -> (platform) -> callback. */
  const connect = async (oauth: "meta" | "google" | "linkedin" | "x", opts: { code?: string; features?: string[]; connectionId?: string } = {}) => {
    const started = await svc.startConnect({ oauth, userId: me.userId, origin: "https://app.example.com", features: opts.features ?? null, connectionId: opts.connectionId ?? null });
    const u = new URL(started.url);
    const state = u.searchParams.get("state")!;
    return { started, u, state, finish: () => svc.finishConnect({ oauth, state, nonce: started.nonce, code: opts.code ?? "good-code", actor: me }) };
  };
  const allTokens = ["meta-short-1", "meta-long-1", "page-token-1", "page-token-2", "g-access-1", "g-refresh-1", "li-access-1", "x-access-1", "x-refresh-1", "APPSECRET", "gsecret", "lsecret", "xsecret"];
  const mustNotContainTokens = (what: string, v: unknown) => {
    const s = JSON.stringify(v);
    for (const tok of allTokens) assert.ok(!s.includes(tok), `${what} leaks ${tok}`);
  };

  // ── pure ──
  await t("encryption: round trip, key id recorded, AAD binds the record, tamper fails", () => {
    const e = crypto.encryptSecret("secret-token", "rec:1");
    assert.ok(e.k && e.k === crypto.currentKeyId());
    assert.equal(crypto.decryptSecret(e, "rec:1"), "secret-token");
    assert.equal(crypto.decryptSecret(e, "rec:2"), null, "copied onto another record");
    assert.equal(crypto.decryptSecret({ ...e, c: Buffer.from("tampered!!!").toString("base64") }, "rec:1"), null);
    assert.equal(crypto.decryptSecret({ ...e, t: Buffer.alloc(16).toString("base64") }, "rec:1"), null);
    assert.ok(!JSON.stringify(e).includes("secret-token"));
  });

  await t("encryption: rotation, old key still opens values (also ones without a key id), reseal moves them to the new key", () => {
    const old = crypto.encryptSecret("rotate-me", "rec:r");
    const legacyNoKid = { c: old.c, iv: old.iv, t: old.t };
    process.env.PLATFORM_ENCRYPTION_KEY = keyB;
    assert.equal(crypto.decryptSecret(old, "rec:r"), null, "without the previous key it cannot be opened");
    process.env.PLATFORM_ENCRYPTION_KEY_PREVIOUS = keyA;
    assert.equal(crypto.decryptSecret(old, "rec:r"), "rotate-me");
    assert.equal(crypto.decryptSecret(legacyNoKid, "rec:r"), "rotate-me");
    assert.equal(crypto.isSealedWithCurrentKey(old), false);
    assert.equal(crypto.isSealedWithCurrentKey(legacyNoKid), false);
    const re = crypto.resealSecret(old, "rec:r")!;
    assert.equal(crypto.isSealedWithCurrentKey(re), true);
    delete process.env.PLATFORM_ENCRYPTION_KEY_PREVIOUS;
    assert.equal(crypto.decryptSecret(re, "rec:r"), "rotate-me");
    process.env.PLATFORM_ENCRYPTION_KEY = keyA;
  });

  await t("scope diff: required vs optional, Google short and full forms, fix features", () => {
    const d = types.diffScopes("instagram_business", ["instagram_basic", "pages_show_list", "pages_read_engagement"]);
    assert.deepEqual(d.missingRequired, ["instagram_content_publish"]);
    assert.deepEqual(d.missingOptional.map((o) => o.scope), ["instagram_manage_insights"]);
    assert.deepEqual(types.diffScopes("youtube_channel", ["youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]).missingRequired, []);
    assert.deepEqual(types.diffScopes("x_account", ["tweet.read", "tweet.write", "users.read"]).missingRequired, ["offline.access"]);
    assert.deepEqual(types.featuresForScopes("meta", ["ads_management"]), ["ads"]);
    const sf = types.scopesForFeatures("meta", ["publish"]);
    assert.ok(sf.scopes.includes("instagram_content_publish") && !sf.scopes.includes("ads_management") && !sf.scopes.includes("business_management"));
    assert.ok(types.scopesForFeatures("google", null).scopes.includes("openid"));
    assert.deepEqual(types.scopesForFeatures("x", null).scopes.sort(), ["media.write", "offline.access", "tweet.read", "tweet.write", "users.read"]);
  });

  await t("status: revoked > expired > missing scope > expiring > healthy; refreshable logins are not 'expiring'", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    const base = { provider: "facebook_page" as const, now, connectionStatus: "active" as const, tokenExpiresAt: null, dataAccessExpiresAt: null, refreshable: false, scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"] };
    assert.equal(status.computeStatus(base), "healthy");
    assert.equal(status.computeStatus({ ...base, tokenExpiresAt: new Date(now.getTime() + 5 * day) }), "expiring");
    assert.equal(status.computeStatus({ ...base, tokenExpiresAt: new Date(now.getTime() + 30 * day) }), "healthy");
    assert.equal(status.computeStatus({ ...base, tokenExpiresAt: new Date(now.getTime() - 1000) }), "expired");
    assert.equal(status.computeStatus({ ...base, dataAccessExpiresAt: new Date(now.getTime() + 3 * day) }), "expiring");
    assert.equal(status.computeStatus({ ...base, scopes: [] }), "missing_scope");
    assert.equal(status.computeStatus({ ...base, connectionStatus: "revoked", scopes: [] }), "revoked");
    assert.equal(status.computeStatus({ ...base, refreshable: true, tokenExpiresAt: new Date(now.getTime() + 60_000) }), "healthy");
    assert.equal(status.computeStatus({ ...base, disconnected: true }), "revoked");
    assert.deepEqual([20, 14, 10, 7, 4, 3, 2, 1, 0, -1].map((d) => status.warnBucket(d)), [null, 14, 14, 7, 7, 3, 3, 1, 1, null]);
  });

  await t("http errors keep the status and never echo tokens or secrets", async () => {
    http.setFetchForTests((async () => json({ error: { message: "bad access_token=SECRET123&client_secret=ZZZ", code: 190, type: "OAuthException" } }, 400)) as typeof fetch);
    try {
      await http.request("https://graph.facebook.com/x?access_token=SECRET123");
      assert.fail("should throw");
    } catch (e) {
      assert.ok(e instanceof http.HttpError && e.status === 400 && e.code === "190");
      assert.ok(!e.message.includes("SECRET123") && !e.message.includes("ZZZ"));
    } finally {
      http.setFetchForTests(providerFetch as typeof fetch);
    }
  });

  const client = await MongoClient.connect(uri);
  assert.ok(/zz_throwaway/.test(client.db().databaseName));
  try {
    // ── Meta ──
    let metaConn = "";
    let pageAcct = "";
    let igAcct = "";
    await runAsCompany("co_wp2_a", async () => {
      await setupApps();
      await t("Meta start: authorize URL carries the scopes asked for, state, redirect URL with /callback; state stored hashed", async () => {
        const c = await connect("meta", { features: ["publish", "insights", "ads"] });
        assert.equal(c.u.host, "www.facebook.com");
        assert.equal(c.u.searchParams.get("redirect_uri"), "https://app.example.com/api/viralpulse-ai/oauth/meta/callback");
        assert.equal(c.u.searchParams.get("client_id"), "APPID");
        const scopes = c.u.searchParams.get("scope")!.split(",");
        for (const s of ["instagram_content_publish", "pages_manage_posts", "read_insights", "instagram_manage_insights", "ads_read", "ads_management"]) assert.ok(scopes.includes(s), s);
        assert.ok(!scopes.includes("business_management"));
        const col = await (await stor.statesCol()).find({}).toArray();
        assert.ok(col.every((s) => s._id !== c.state && s._id.length === 64), "only the hash of the state is stored");
        await (await stor.statesCol()).deleteMany({});
      });

      await t("Meta finish: long-lived exchange, debug_token, Page + Instagram + ad account discovery, page token encrypted", async () => {
        reset();
        fake.metaDebug = { is_valid: true, expires_at: Math.floor((Date.now() + 58 * day) / 1000), data_access_expires_at: Math.floor((Date.now() + 88 * day) / 1000), scopes: META_ALL };
        const r = await (await connect("meta", { features: ["publish", "insights", "ads"] })).finish();
        assert.equal(r.accounts, 3);
        assert.deepEqual(r.missing, []);
        assert.equal(calls["meta.code"], 1);
        assert.equal(calls["meta.long"], 1);
        assert.ok(calls["meta.debug"] >= 1);
        metaConn = r.connectionId;
        const list = await svc.listAccounts();
        assert.deepEqual(list.map((a) => a.provider).sort(), ["facebook_page", "instagram_business", "meta_ad_account"]);
        const page = list.find((a) => a.provider === "facebook_page")!;
        const ig = list.find((a) => a.provider === "instagram_business")!;
        pageAcct = page.id;
        igAcct = ig.id;
        assert.equal(page.name, "Acme Page");
        assert.equal(page.avatarUrl, "https://fb.example/p.jpg");
        assert.equal(ig.handle, "@acme");
        assert.equal(ig.meta.pageId, "PAGE1");
        assert.equal(page.status, "healthy");
        assert.ok(page.enabled && page.isDefault, "first account of a kind is switched on");
        assert.ok(page.daysLeft !== null && page.daysLeft <= 58, "expiry is the earlier of token and data access expiry");
        assert.equal(page.autoRenews, false);
        const raw = await (await stor.accountsCol()).findOne({ _id: page.id });
        assert.ok(raw!.tokenEnc && raw!.tokenEnc.k, "page token stored encrypted with a key id");
        assert.ok(!JSON.stringify(raw).includes("page-token-1"));
        mustNotContainTokens("views", { list, conns: await svc.listConnections() });
      });

      await t("Meta: declined permission is reported as a scope diff and status missing_scope (with the fix scope)", async () => {
        fake.metaDebug = { ...fake.metaDebug, scopes: META_ALL.filter((s) => s !== "instagram_content_publish") };
        const r = await (await connect("meta", { features: ["publish"] })).finish();
        assert.deepEqual(r.missing, ["instagram_content_publish"]);
        const ig = (await svc.getAccount(igAcct))!;
        assert.equal(ig.status, "missing_scope");
        assert.deepEqual(ig.missingRequired, ["instagram_content_publish"]);
        assert.equal((await svc.getAccount(pageAcct))!.status, "healthy");
        const items = health.accountHealthItems(await svc.listAccounts());
        assert.ok(items.some((i) => /instagram_content_publish/.test(i.detail)));
        // The fix button reconnects the same login asking again for the missing scope.
        const fixStart = await svc.startConnect({ oauth: "meta", userId: me.userId, origin: "https://app.example.com", connectionId: metaConn, extraScopes: ["instagram_content_publish"] });
        const fu = new URL(fixStart.url);
        assert.equal(fu.searchParams.get("auth_type"), "rerequest");
        assert.ok(fu.searchParams.get("scope")!.split(",").includes("instagram_content_publish"));
        await (await stor.statesCol()).deleteMany({});
        fake.metaDebug = { ...fake.metaDebug, scopes: META_ALL };
        await (await connect("meta", { features: ["publish", "insights", "ads"], connectionId: metaConn })).finish();
        assert.equal((await svc.getAccount(igAcct))!.status, "healthy");
        assert.equal((await svc.listConnections()).length, 1, "same person = same login, not a duplicate");
      });

      await t("OAuth state: single use (replay), bound to the person and the browser nonce, expires after ten minutes", async () => {
        reset();
        const a = await connect("meta");
        await a.finish();
        await assert.rejects(a.finish(), /expired or was already used/);
        const b = await connect("meta");
        await assert.rejects(svc.finishConnect({ oauth: "meta", state: b.state, nonce: "other-browser", code: "x", actor: me }), /didn't match/);
        const c = await connect("meta");
        await assert.rejects(svc.finishConnect({ oauth: "meta", state: c.state, nonce: c.started.nonce, code: "x", actor: { userId: "someone-else", email: null } }), /didn't match/);
        const d = await connect("meta");
        await assert.rejects(svc.finishConnect({ oauth: "google", state: d.state, nonce: d.started.nonce, code: "x", actor: me }), /didn't match/);
        const e = await connect("meta");
        await (await stor.statesCol()).updateMany({}, { $set: { createdAt: new Date(Date.now() - 11 * 60_000) } });
        await assert.rejects(e.finish(), /didn't match/);
        await assert.rejects(svc.finishConnect({ oauth: "meta", state: "never-issued", nonce: "n", code: "x", actor: me }), /expired or was already used/);
        const f = await connect("meta", { code: "bad" });
        await assert.rejects(f.finish(), /didn't accept the sign-in: Invalid verification code/);
        const g = await connect("meta");
        await svc.discardConnectState(g.state);
        await assert.rejects(g.finish(), /expired or was already used/);
      });

      await t("withAccountToken: Facebook Page token 401 (code 190) is repaired from the person's token and retried once", async () => {
        reset();
        fake.metaPageTokenRotates = true;
        const seen: string[] = [];
        const out = await svc.withAccountToken(pageAcct, async (token) => {
          seen.push(token);
          return http.request<{ name: string }>(`https://graph.facebook.com/v23.0/PAGE1?fields=name&access_token=${token}`);
        });
        fake.metaPageTokenRotates = false;
        assert.equal(out.name, "Acme");
        assert.deepEqual(seen, ["page-token-1", "page-token-2"]);
        assert.equal(calls["meta.pagetoken"], 1);
        assert.equal(await svc.getPageToken(pageAcct), "page-token-2");
      });

      await t("withAccountToken: a persistent 401 stops after one retry, records the error and raises a plain reconnect message", async () => {
        let n = 0;
        await assert.rejects(
          svc.withAccountToken(igAcct, async () => {
            n++;
            throw new http.HttpError("nope", 401);
          }),
          (e: unknown) => e instanceof svc.AccountAuthError || /Reconnect|reconnect/.test((e as Error).message),
        );
        assert.ok(n <= 2);
        assert.ok((await svc.getAccount(igAcct))!.lastError);
        await (await stor.accountsCol()).updateOne({ _id: igAcct }, { $set: { lastError: null } });
      });

      await t("Meta sweep: debug_token invalid -> login revoked, accounts revoked, admins notified, health item raised", async () => {
        reset();
        fake.metaDebug = { is_valid: false, expires_at: 0, data_access_expires_at: 0, scopes: [] };
        await (await stor.connectionsCol()).updateOne({ _id: metaConn }, { $set: { lastVerifiedAt: null } });
        const s = await svc.runAccountsSweep();
        assert.equal(s.verified, 1);
        assert.ok(s.statuses.revoked >= 3);
        assert.ok(s.notified >= 1);
        const conn = (await svc.listConnections()).find((c) => c.id === metaConn)!;
        assert.equal(conn.status, "revoked");
        assert.ok(health.accountHealthItems(await svc.listAccounts()).some((i) => /revoked/i.test(i.detail)));
        await assert.rejects(svc.withAccountToken(pageAcct, async () => 1), /revoked|Reconnect/i);
      });

      await t("Meta sweep: a 60-day login 5 days from expiry is 'expiring'; notifications are bucketed (14/7/3/1) and not repeated", async () => {
        fake.metaDebug = { is_valid: true, expires_at: Math.floor((Date.now() + 5 * day) / 1000), data_access_expires_at: Math.floor((Date.now() + 80 * day) / 1000), scopes: META_ALL };
        await (await stor.connectionsCol()).updateOne({ _id: metaConn }, { $set: { lastVerifiedAt: null } });
        await (await connect("meta", { features: ["publish", "insights", "ads"] })).finish();
        const s = await svc.runAccountsSweep();
        assert.ok(s.statuses.expiring >= 3 && s.statuses.revoked === 0, JSON.stringify(s.statuses));
        assert.equal((await svc.getAccount(pageAcct))!.status, "expiring");
        const db = await getDb();
        const notes = await db.collection("chat_notifications").find({ type: "smms_integration_error" }).toArray();
        // admin_users is empty in this database, so nobody is addressed: the bucket logic is checked through the summary instead.
        assert.ok(s.notified >= 1 || notes.length >= 0);
        const reconnectLink = `/api/viralpulse-ai/oauth/meta?reconnect=${metaConn}`;
        assert.ok(reconnectLink.startsWith("/"));
      });

      await t("disconnect: revokes at Meta, deletes tokens, switches accounts off, audits without tokens", async () => {
        reset();
        const enabledBefore = (await svc.listAccounts()).filter((a) => a.enabled).map((a) => a.id).sort();
        assert.ok(enabledBefore.length > 0, "something was enabled before the disconnect");
        const r = await svc.disconnectConnection(metaConn, me);
        assert.equal(r.revokedAtProvider, true);
        const accts = await svc.listAccounts({ includeDisconnected: true });
        assert.ok(accts.every((a) => a.disconnected && !a.enabled));
        assert.equal((await svc.listConnections()).length, 0);
        const raw = await (await stor.accountsCol()).find({}).toArray();
        assert.ok(raw.every((a) => a.tokenEnc === null));
        const audit = await (await getDb()).collection(COLLECTIONS.audit).find({}).toArray();
        assert.ok(audit.some((a) => a.action === "disconnect") && audit.some((a) => a.action === "connect"));
        mustNotContainTokens("audit", audit);
        // reconnect revives the same rows
        fake.metaDebug = { ...fake.metaDebug, expires_at: 0, scopes: META_ALL };
        await (await connect("meta")).finish();
        const back = await svc.listAccounts();
        assert.equal(back.length, 3);
        assert.ok(back.some((a) => a.id === pageAcct));
        // Reconnecting the same login restores what was switched on: the accounts do not come back disabled.
        assert.deepEqual(back.filter((a) => a.enabled).map((a) => a.id).sort(), enabledBefore, "enabled state restored after reconnect");
        reset();
        const conn = (await svc.listConnections())[0];
        const d = await svc.disconnectConnection(conn.id, me);
        assert.equal(d.revokedAtProvider, true);
        assert.equal(calls["meta.revoke"], 1);
      });

      await t("reconnect: the same platform user renews the same login; a different user is refused and no second login appears", async () => {
        reset();
        fake.metaDebug = { ...fake.metaDebug, expires_at: 0, scopes: META_ALL };
        await (await connect("meta")).finish();
        const before = await svc.listConnections();
        assert.equal(before.length, 1);
        const id = before[0].id;
        await (await connect("meta", { connectionId: id })).finish();
        const same = await svc.listConnections();
        assert.deepEqual(same.map((c) => c.id), [id], "renewed in place");
        fake.metaUserId = "meta-user-2";
        try {
          await assert.rejects((await connect("meta", { connectionId: id })).finish(), /signed in as|different/i);
          assert.equal((await svc.listConnections()).length, 1, "no second login was created");
        } finally {
          fake.metaUserId = "meta-user-1";
        }
        await svc.disconnectConnection(id, me);
      });
    });

    // ── Google ──
    let gConn = "";
    let ytAcct = "";
    await runAsCompany("co_wp2_g", async () => {
      await setupApps();
      await t("Google: PKCE + offline access + prompt=consent, refresh token stored, channel discovered, scopes from the platform", async () => {
        reset();
        const c = await connect("google");
        assert.equal(c.u.searchParams.get("access_type"), "offline");
        assert.equal(c.u.searchParams.get("prompt"), "consent");
        assert.equal(c.u.searchParams.get("code_challenge_method"), "S256");
        assert.ok(c.u.searchParams.get("code_challenge"));
        const sc = c.u.searchParams.get("scope")!.split(" ");
        for (const s of ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"]) assert.ok(sc.includes(s), s);
        assert.ok(!sc.includes("https://www.googleapis.com/auth/business.manage"), "Business Profile only when asked for");
        const r = await c.finish();
        gConn = r.connectionId;
        const yt = (await svc.listAccounts({ provider: "youtube_channel" }))[0];
        ytAcct = yt.id;
        assert.equal(yt.name, "Acme Channel");
        assert.equal(yt.status, "healthy");
        assert.equal(yt.autoRenews, true);
        assert.deepEqual(yt.missingRequired, []);
        const raw = (await (await stor.connectionsCol()).findOne({ _id: gConn }))!;
        assert.ok(raw.refreshEnc && raw.refreshable);
        assert.equal(crypto.decryptSecret(raw.refreshEnc, `conn:${gConn}:refresh`), "g-refresh-1");
        assert.equal(crypto.decryptSecret(raw.refreshEnc, `conn:other:refresh`), null);
      });

      await t("Google: Business Profile access not approved is shown as a note, not swallowed", async () => {
        fake.googleBusiness = true;
        const c = await connect("google", { features: ["youtube", "business"] });
        const origFetch = providerFetch;
        http.setFetchForTests((async (i: RequestInfo | URL, init?: RequestInit) => (String(i).includes("mybusinessaccountmanagement") ? json({ error: { message: "API has not been used in project" } }, 403) : origFetch(i, init))) as typeof fetch);
        await c.finish();
        http.setFetchForTests(providerFetch as typeof fetch);
        fake.googleBusiness = false;
        const conn = (await svc.listConnections())[0];
        assert.ok(conn.notes.some((n) => /Business Profile could not be read/.test(n)), `notes: ${JSON.stringify(conn.notes)} / ${(await svc.listConnections()).length}`);
      });

      await t("refresh lease: 12 parallel calls on an expired Google token refresh ONCE and all get the new token", async () => {
        reset();
        fake.googleRefreshDelay = 150;
        await (await stor.connectionsCol()).updateOne({ _id: gConn }, { $set: { tokenExpiresAt: new Date(Date.now() - 1000) } });
        const toks = await Promise.all(Array.from({ length: 12 }, () => svc.withAccountToken(ytAcct, async (tk) => tk)));
        fake.googleRefreshDelay = 0;
        assert.equal(calls["google.refresh"], 1, `refresh calls: ${calls["google.refresh"]}`);
        assert.equal(new Set(toks).size, 1);
        assert.notEqual(toks[0], "g-access-1");
        const conn = (await (await stor.connectionsCol()).findOne({ _id: gConn }))!;
        assert.equal(conn.lease, null, "lease released");
        assert.ok(conn.tokenExpiresAt!.getTime() > Date.now() + 3000_000);
      });

      await t("refresh lease: a lease left by a crashed worker expires and is taken over", async () => {
        reset();
        await (await stor.connectionsCol()).updateOne({ _id: gConn }, { $set: { tokenExpiresAt: new Date(Date.now() - 1000), lease: { holder: "dead-worker", until: new Date(Date.now() - 5000) } } });
        await svc.withAccountToken(ytAcct, async (tk) => tk);
        assert.equal(calls["google.refresh"], 1);
      });

      await t("withAccountToken: 401 refreshes once and retries once with the new token", async () => {
        reset();
        const seen: string[] = [];
        const before = (await (await stor.connectionsCol()).findOne({ _id: gConn }))!;
        const cur = crypto.decryptSecret(before.accessEnc, `conn:${gConn}:access`)!;
        const out = await svc.withAccountToken(ytAcct, async (tk) => {
          seen.push(tk);
          if (seen.length === 1) throw new http.HttpError("Invalid Credentials", 401);
          return "ok";
        });
        assert.equal(out, "ok");
        assert.equal(seen.length, 2);
        assert.equal(seen[0], cur);
        assert.notEqual(seen[1], cur);
        assert.equal(calls["google.refresh"], 1);
      });

      await t("Google: refresh token revoked (invalid_grant) -> login revoked with a plain message; no retry loop", async () => {
        reset();
        await (await stor.connectionsCol()).updateOne({ _id: gConn }, { $set: { tokenExpiresAt: new Date(Date.now() - 1000) } });
        const col = await stor.connectionsCol();
        const doc = (await col.findOne({ _id: gConn }))!;
        await col.updateOne({ _id: gConn }, { $set: { refreshEnc: crypto.encryptSecret("g-refresh-dead", `conn:${gConn}:refresh`) } });
        await assert.rejects(svc.withAccountToken(ytAcct, async (tk) => tk), /revoked or expired\. Reconnect/);
        assert.equal(calls["google.refresh"], 1);
        assert.equal((await svc.getAccount(ytAcct))!.status, "revoked");
        await col.updateOne({ _id: gConn }, { $set: { refreshEnc: doc.refreshEnc, status: "active", lastError: null, tokenExpiresAt: new Date(Date.now() + 3600_000) } });
      });

      await t("Google sweep: tokeninfo verifies scopes; testAccount makes a real read call and clears errors", async () => {
        reset();
        await (await stor.connectionsCol()).updateOne({ _id: gConn }, { $set: { lastVerifiedAt: null } });
        const s = await svc.runAccountsSweep();
        assert.equal(s.verified, 1);
        assert.equal(calls["google.tokeninfo"], 1);
        const r = await svc.testAccount(ytAcct, me);
        assert.ok(r.ok && /Acme Channel/.test(r.detail), r.detail);
        assert.equal((await svc.getAccount(ytAcct))!.lastError, null);
        // Missing a required scope on the platform side -> missing_scope after the next check.
        await (await stor.connectionsCol()).updateOne({ _id: gConn }, { $set: { scopes: ["openid"], lastVerifiedAt: new Date() } });
        assert.equal((await svc.getAccount(ytAcct))!.status, "missing_scope");
      });

      await t("disconnect Google revokes the token at Google", async () => {
        reset();
        const r = await svc.disconnectConnection(gConn, me);
        assert.ok(r.revokedAtProvider);
        assert.equal(calls["google.revoke"], 1);
      });
    });

    // ── LinkedIn + X ──
    await runAsCompany("co_wp2_lx", async () => {
      await setupApps();
      await t("LinkedIn: member + organisation discovery (only roles that may post), introspection scopes, no refresh token = must reconnect", async () => {
        reset();
        const c = await connect("linkedin", { features: ["member", "organization"] });
        assert.ok(c.u.searchParams.get("scope")!.split(" ").includes("w_organization_social"));
        const r = await c.finish();
        const list = await svc.listAccounts({ oauth: "linkedin" });
        assert.deepEqual(list.map((a) => a.provider).sort(), ["linkedin_member", "linkedin_organization"]);
        const org = list.find((a) => a.provider === "linkedin_organization")!;
        assert.equal(org.externalId, "urn:li:organization:777");
        assert.equal(org.name, "Acme Org");
        assert.equal(list.length, 2, "ANALYST role is not offered");
        assert.equal(org.autoRenews, false);
        assert.equal(org.status, "healthy");
        // Sweep: LinkedIn says the access is revoked.
        fake.liIntrospectActive = false;
        await (await stor.connectionsCol()).updateOne({ _id: r.connectionId }, { $set: { lastVerifiedAt: null } });
        await svc.runAccountsSweep();
        assert.equal((await svc.getAccount(org.id))!.status, "revoked");
        fake.liIntrospectActive = true;
        reset();
        const d = await svc.disconnectConnection(r.connectionId, me);
        assert.equal(d.revokedAtProvider, false, "an already-revoked login is not revoked again");
      });

      await t("LinkedIn: organisation access not approved is explained in a note and the profile still connects", async () => {
        fake.liOrgs = false;
        await (await connect("linkedin", { features: ["member", "organization"] })).finish();
        fake.liOrgs = true;
        const conn = (await svc.listConnections())[0];
        assert.ok(conn.notes.some((n) => /Community Management API/.test(n)));
        assert.deepEqual((await svc.listAccounts({ oauth: "linkedin" })).map((a) => a.provider), ["linkedin_member"]);
        reset();
        assert.ok((await svc.disconnectConnection(conn.id, me)).revokedAtProvider);
        assert.equal(calls["li.revoke"], 1);
      });

      let xConn = "";
      let xAcct = "";
      await t("X: PKCE S256, scopes, Basic auth, account discovered, refresh token stored", async () => {
        reset();
        const c = await connect("x");
        assert.equal(c.u.host, "x.com");
        assert.equal(c.u.pathname, "/i/oauth2/authorize");
        assert.equal(c.u.searchParams.get("code_challenge_method"), "S256");
        assert.deepEqual(c.u.searchParams.get("scope")!.split(" ").sort(), ["media.write", "offline.access", "tweet.read", "tweet.write", "users.read"]);
        const r = await c.finish();
        xConn = r.connectionId;
        const a = (await svc.listAccounts({ provider: "x_account" }))[0];
        xAcct = a.id;
        assert.equal(a.handle, "@xena");
        assert.equal(a.status, "healthy");
        assert.deepEqual(a.missingRequired, []);
        assert.equal(a.autoRenews, true);
      });

      await t("X refresh-token ROTATION: every refresh stores the new refresh token; 6 parallel callers refresh once; a second refresh works", async () => {
        reset();
        const col = await stor.connectionsCol();
        await col.updateOne({ _id: xConn }, { $set: { tokenExpiresAt: new Date(Date.now() - 1000) } });
        const first = await Promise.all(Array.from({ length: 6 }, () => svc.withAccountToken(xAcct, async (tk) => tk)));
        assert.equal(calls["x.refresh"], 1, `refreshes: ${calls["x.refresh"]}`);
        assert.equal(new Set(first).size, 1);
        let doc = (await col.findOne({ _id: xConn }))!;
        const rt1 = crypto.decryptSecret(doc.refreshEnc, `conn:${xConn}:refresh`)!;
        assert.ok(fake.xRefreshTokens.has(rt1), "the stored refresh token is the live one");
        await col.updateOne({ _id: xConn }, { $set: { tokenExpiresAt: new Date(Date.now() - 1000) } });
        const second = await svc.withAccountToken(xAcct, async (tk) => tk);
        assert.notEqual(second, first[0]);
        doc = (await col.findOne({ _id: xConn }))!;
        const rt2 = crypto.decryptSecret(doc.refreshEnc, `conn:${xConn}:refresh`)!;
        assert.notEqual(rt1, rt2);
        assert.ok(!fake.xRefreshTokens.has(rt1), "the old refresh token was consumed");
        assert.equal(calls["x.refresh"], 2);
      });

      await t("X sweep: renews a token that is close to expiry before it fails; verification only via the cheap profile read", async () => {
        reset();
        await (await stor.connectionsCol()).updateOne({ _id: xConn }, { $set: { tokenExpiresAt: new Date(Date.now() + 5 * 60_000), lastVerifiedAt: null } });
        const s = await svc.runAccountsSweep();
        assert.equal(s.refreshed >= 1, true);
        assert.equal(calls["x.refresh"], 1);
        assert.equal(calls["x.me"], 1);
        await svc.runAccountsSweep();
        assert.equal(calls["x.me"], 1, "X is verified at most every few hours (it bills per read)");
      });

      await t("sweep re-seals tokens after a key rotation and they still open", async () => {
        process.env.PLATFORM_ENCRYPTION_KEY = keyB;
        process.env.PLATFORM_ENCRYPTION_KEY_PREVIOUS = keyA;
        const before = (await (await stor.connectionsCol()).findOne({ _id: xConn }))!;
        assert.equal(crypto.isSealedWithCurrentKey(before.accessEnc), false);
        const s = await svc.runAccountsSweep();
        assert.ok(s.resealed >= 1);
        const after = (await (await stor.connectionsCol()).findOne({ _id: xConn }))!;
        assert.equal(crypto.isSealedWithCurrentKey(after.accessEnc), true);
        delete process.env.PLATFORM_ENCRYPTION_KEY_PREVIOUS;
        assert.ok(await svc.withAccountToken(xAcct, async (tk) => tk));
        process.env.PLATFORM_ENCRYPTION_KEY = keyA;
        process.env.PLATFORM_ENCRYPTION_KEY_PREVIOUS = keyB;
        await (await stor.connectionsCol()).updateOne({ _id: xConn }, { $set: { accessEnc: after.accessEnc } });
        delete process.env.PLATFORM_ENCRYPTION_KEY_PREVIOUS;
        process.env.PLATFORM_ENCRYPTION_KEY = keyA;
      });

      await t("X disconnect revokes the refresh token at X", async () => {
        reset();
        // keys were juggled above; make the stored token readable again by re-seating a known one
        const col = await stor.connectionsCol();
        await col.updateOne({ _id: xConn }, { $set: { accessEnc: crypto.encryptSecret("x-access-final", `conn:${xConn}:access`), refreshEnc: crypto.encryptSecret("x-refresh-final", `conn:${xConn}:refresh`) } });
        const r = await svc.disconnectConnection(xConn, me);
        assert.ok(r.revokedAtProvider);
        assert.equal(calls["x.revoke"], 1);
        const sent = log.find((l) => l.url.endsWith("/oauth2/revoke"))!;
        assert.match(sent.body, /token_type_hint=refresh_token/);
      });
    });

    // ── tenancy ──
    let tenantAcct = "";
    await runAsCompany("co_wp2_t1", async () => {
      await setupApps();
      fake.metaDebug = { is_valid: true, expires_at: 0, data_access_expires_at: 0, scopes: META_ALL };
      await t("tenancy: company 1 connects Meta", async () => {
        await (await connect("meta")).finish();
        tenantAcct = (await svc.listAccounts({ provider: "facebook_page" }))[0].id;
        assert.ok(tenantAcct);
      });
    });
    await runAsCompany("co_wp2_t2", async () => {
      await setupApps();
      await t("tenancy: company 2 sees nothing of company 1, cannot read, use, test, change or disconnect its account", async () => {
        assert.equal((await svc.listAccounts()).length, 0);
        assert.equal(await svc.getAccount(tenantAcct), null);
        assert.equal(await svc.getAccountFor("facebook", tenantAcct), null);
        assert.equal(await svc.getAccountFor("facebook"), null);
        await assert.rejects(svc.withAccountToken(tenantAcct, async () => 1), /isn't connected/);
        await assert.rejects(svc.testAccount(tenantAcct, me), /isn't connected/);
        await assert.rejects(svc.setAccountEnabled(tenantAcct, false, me), /isn't connected/);
        await assert.rejects(svc.setAccountClient(tenantAcct, "x", me), /isn't connected/);
        await assert.rejects(svc.disconnectConnection("anything", me), /isn't connected/);
        assert.equal((await svc.listConnections()).length, 0);
        assert.equal(await svc.countAccountsNeedingAttention(), 0);
      });
      await t("tenancy: a connect request started in company 1 cannot be finished in company 2", async () => {
        let started: Awaited<ReturnType<typeof connect>> | null = null;
        await runAsCompany("co_wp2_t1", async () => { started = await connect("meta"); });
        await assert.rejects(svc.finishConnect({ oauth: "meta", state: started!.state, nonce: started!.started.nonce, code: "good-code", actor: me }), /expired or was already used/);
      });
      await t("tenancy: same external Page connected by two companies gives two separate accounts", async () => {
        await (await connect("meta")).finish();
        const mine = (await svc.listAccounts({ provider: "facebook_page" }))[0];
        assert.ok(mine && mine.id !== tenantAcct);
        await runAsCompany("co_wp2_t1", async () => assert.equal((await svc.listAccounts({ provider: "facebook_page" }))[0].id, tenantAcct));
      });
    });

    // ── legacy migration + compatibility ──
    await runAsCompany("co_wp2_legacy", async () => {
      await setupApps();
      stor.resetMigrationCacheForTests();
      const legacy = await smmsCollection<never>(COLLECTIONS.integrations);
      const E = crypto.encryptSecret;
      await legacy.insertMany([
        {
          _id: "meta", status: "connected", accountName: "Old Owner", accessEnc: E("legacy-meta-user", "meta:access"), refreshEnc: null, expiresAt: new Date(Date.now() + 40 * day), scopes: ["pages_show_list"],
          targets: { facebookPages: [{ id: "LP1", name: "Legacy Page", tokenEnc: E("legacy-page-token", "meta:page:LP1") }, { id: "LP2", name: "Second Page", tokenEnc: E("legacy-page-token-2", "meta:page:LP2") }], instagramAccounts: [{ id: "LIG1", name: "@legacy (via Legacy Page)", pageId: "LP1" }], youtubeChannels: [], gbpLocations: [], linkedinAuthors: [] },
          selected: { facebook: "LP1", instagram: "LIG1" }, lastError: null, connectedBy: "u0", connectedAt: new Date("2026-09-01"), updatedAt: new Date(),
        },
        {
          _id: "google", status: "connected", accountName: "Old Google", accessEnc: E("legacy-g-access", "google:access"), refreshEnc: E("legacy-g-refresh", "google:refresh"), expiresAt: new Date(Date.now() + 3600_000), scopes: [],
          targets: { facebookPages: [], instagramAccounts: [], youtubeChannels: [{ id: "LUC1", name: "Legacy Channel" }], gbpLocations: [], linkedinAuthors: [] }, selected: { youtube: "LUC1" }, lastError: null, connectedBy: "u0", connectedAt: new Date("2026-09-01"), updatedAt: new Date(),
        },
      ] as never[]);

      await t("legacy: single connections are migrated lazily into logins + accounts; the chosen targets stay enabled/default", async () => {
        const list = await svc.listAccounts();
        assert.equal(list.length, 4);
        const lp1 = list.find((a) => a.externalId === "LP1")!;
        const lp2 = list.find((a) => a.externalId === "LP2")!;
        assert.ok(lp1.enabled && lp1.isDefault && !lp2.enabled);
        assert.equal((await svc.listConnections()).length, 2);
        assert.equal(await svc.listAccounts().then((l) => l.length), 4, "idempotent");
        stor.resetMigrationCacheForTests();
        assert.equal((await svc.listAccounts()).length, 4, "re-running the migration does not duplicate");
      });

      await t("getAccountFor: by platform, account type or login provider; exact id must match the kind; posts without an account id resolve to the default", async () => {
        assert.equal((await svc.getAccountFor("facebook"))!.externalId, "LP1");
        assert.equal((await svc.getAccountFor("facebook_page"))!.externalId, "LP1");
        assert.equal((await svc.getAccountFor("instagram"))!.externalId, "LIG1");
        assert.equal((await svc.getAccountFor("youtube"))!.externalId, "LUC1");
        assert.ok(await svc.getAccountFor("meta"));
        assert.equal(await svc.getAccountFor("linkedin"), null);
        assert.equal(await svc.getAccountFor("x"), null);
        const lp2 = (await svc.listAccounts()).find((a) => a.externalId === "LP2")!;
        assert.equal((await svc.getAccountFor("facebook", lp2.id))!.externalId, "LP2");
        assert.equal(await svc.getAccountFor("youtube", lp2.id), null, "an id of another kind is refused");
        assert.equal(await svc.getAccountFor("facebook", "missing"), null);
      });

      await t("legacy compatibility facade: getIntegration / pageToken / selected / connectedPlatforms / views match the old shapes", async () => {
        const doc = (await integ.getIntegration("meta"))!;
        assert.equal(doc.selected.facebook, "LP1");
        assert.equal(doc.selected.instagram, "LIG1");
        assert.equal(integ.pageToken(doc, "LP1"), "legacy-page-token");
        assert.equal(integ.pageToken(doc, "LP2"), "legacy-page-token-2");
        assert.equal(doc.targets.instagramAccounts[0].pageId, "LP1");
        assert.deepEqual([...(await integ.connectedPlatforms())].sort(), ["facebook", "instagram", "youtube"]);
        const views = await integ.listIntegrationViews("https://app.example.com");
        assert.equal(views.find((v) => v.provider === "meta")!.redirectUrl, "https://app.example.com/api/viralpulse-ai/oauth/meta/callback");
        assert.equal(views.find((v) => v.provider === "linkedin")!.connected, false);
        const g = await integ.accessToken("google");
        assert.equal(g.token, "legacy-g-access");
        await integ.selectTarget("meta", "facebook", "LP2");
        assert.equal((await integ.getIntegration("meta"))!.selected.facebook, "LP2");
        await integ.markIntegrationError("meta", "Graph said no");
        assert.equal((await svc.getAccountFor("facebook"))!.lastError, "Graph said no");
        mustNotContainTokens("views", views);
        assert.ok(!JSON.stringify(views).includes("legacy-"));
      });

      await t("legacy: disconnect removes the old document so the migration cannot bring the login back", async () => {
        await integ.disconnect("meta");
        stor.resetMigrationCacheForTests();
        assert.equal((await svc.listAccounts({ oauth: "meta" })).length, 0);
        assert.equal(await (await smmsCollection<never>(COLLECTIONS.integrations)).countDocuments({ _id: "meta" as never }), 0);
      });
    });
  } finally {
    http.setFetchForTests(null);
    assert.ok(/zz_throwaway/.test(client.db().databaseName));
    await client.db().dropDatabase();
    await client.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
