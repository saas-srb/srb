/**
 * Per-company payment accounts (`src/lib/platform/integrations/payments.ts`)
 * and the FMS / HRMS money paths wired to them, against a throwaway MongoDB
 * database that is dropped at the end. Razorpay's HTTP API is mocked (a
 * stubbed `fetch`), so nothing touches the network.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/payacct_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-payment-accounts.ts
 *
 * Never point MONGODB_URI at a real database: the script drops it.
 */

import assert from "node:assert/strict";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";

// Env first: modules read it lazily, but set it before anything is imported.
process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.PLATFORM_ROOT_DOMAIN = "demo.test";
delete process.env.PLATFORM_HOSTS;
// The platform owner's legacy env account.
process.env.RAZORPAY_KEY_ID = "rzp_test_ENVOWNER0001";
process.env.RAZORPAY_KEY_SECRET = "env-key-secret-0001";
process.env.RAZORPAY_WEBHOOK_SECRET = "env-webhook-secret-0001";
process.env.RAZORPAY_ACCOUNT_NUMBER = "9999000011112222";
process.env.HRMS_PAYOUT_PROVIDER = "razorpay";

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  }
}

const OWNER = "company-owner";
const A = "company-a";
const B = "company-b";
const SUSPENDED = "company-suspended";

const ACCT_A = { keyId: "rzp_test_ALPHA000001", keySecret: "alpha-key-secret-01", webhookSecret: "alpha-webhook-sec-01", accountNumber: "1111222233334444" };
const ACCT_B = { keyId: "rzp_live_BETA0000001", keySecret: "beta-key-secret-001", webhookSecret: "beta-webhook-sec-001", accountNumber: "5555666677778888" };
const ACCT_OWNER = { keyId: "rzp_live_OWNER000001", keySecret: "owner-key-secret-01", webhookSecret: "owner-webhook-sec-1" };

// ---------------------------------------------------------------------------
// Mocked Razorpay HTTP layer
// ---------------------------------------------------------------------------

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
}
const calls: Call[] = [];
/** key id → secret Razorpay accepts. */
const validKeys = new Map<string, string>();
/** key id → RazorpayX account numbers valid for it. */
const validAccounts = new Map<string, string>();

function basicAuthOf(keyId: string, secret: string) {
  return `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`;
}
function keyIdFromAuth(auth: string | null): string | null {
  if (!auth?.startsWith("Basic ")) return null;
  const [id, secret] = Buffer.from(auth.slice(6), "base64").toString().split(":");
  return validKeys.get(id) === secret ? id : null;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith("https://api.razorpay.com/")) return realFetch(input, init);
  const hdrs = new Headers(init?.headers);
  const auth = hdrs.get("authorization");
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  calls.push({ url, method, auth, body });
  const keyId = keyIdFromAuth(auth);
  if (!keyId) return json(401, { error: { description: "Authentication failed" } });
  const u = new URL(url);
  if (u.pathname === "/v1/payments" && method === "GET") return json(200, { items: [] });
  if (u.pathname === "/v1/transactions") {
    return u.searchParams.get("account_number") === validAccounts.get(keyId) ? json(200, { items: [] }) : json(400, { error: { description: "bad account" } });
  }
  if (u.pathname === "/v1/orders") return json(200, { id: `order_${keyId}_${calls.length}` });
  if (u.pathname === "/v1/contacts") return json(200, { id: `cont_${keyId}` });
  if (u.pathname === "/v1/fund_accounts") return json(200, { id: `fa_${keyId}_${calls.length}` });
  if (u.pathname === "/v1/payouts") return json(200, { id: `pout_${keyId}_${calls.length}`, status: "processing" });
  return json(404, { error: { description: "not mocked" } });
}) as typeof fetch;

const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

// ---------------------------------------------------------------------------

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  const dbName = new URL(uri.replace(/^mongodb(\+srv)?:/, "http:")).pathname.slice(1);
  if (!/test/.test(dbName)) throw new Error(`Refusing to run: MONGODB_URI must name a throwaway *test* database (got "${dbName || "(none)"}")`);

  const { getPlatformDb, clientPromise } = await import("@/lib/platform/tenancy/platform-db");
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  try {
    await run(db);
  } finally {
    await db.dropDatabase();
    await (await clientPromise).close();
  }
  console.log(`\npayment accounts: ${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
}

async function run(db: import("mongodb").Db) {
  const now = new Date();
  await db.collection<{ _id: string }>("companies").insertMany([
    { _id: OWNER, slug: "owner", name: "Owner", status: "active", isPlatformOwner: true, createdAt: now, updatedAt: now },
    { _id: A, slug: "alpha", name: "Alpha", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
    { _id: B, slug: "beta", name: "Beta", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
    { _id: SUSPENDED, slug: "gone", name: "Gone", status: "suspended", isPlatformOwner: false, createdAt: now, updatedAt: now },
  ] as never[]);
  validKeys.set(ACCT_A.keyId, ACCT_A.keySecret);
  validKeys.set(ACCT_B.keyId, ACCT_B.keySecret);
  validKeys.set(ACCT_OWNER.keyId, ACCT_OWNER.keySecret);
  validKeys.set(process.env.RAZORPAY_KEY_ID!, process.env.RAZORPAY_KEY_SECRET!);
  validAccounts.set(ACCT_A.keyId, ACCT_A.accountNumber);
  validAccounts.set(ACCT_B.keyId, ACCT_B.accountNumber);

  const { runAsCompany } = await import("@/lib/platform/tenancy/context");
  const { encryptPlatformSecret, decryptPlatformSecret } = await import("@/lib/platform/crypto");
  const pay = await import("@/lib/platform/integrations/payments");
  const { createPaymentIntent, getPaymentIntent } = await import("@/lib/products/cashflow-ai/payments/intents");
  const { processPaymentWebhook } = await import("@/lib/products/cashflow-ai/payments/webhooks");
  const { getPayoutProvider } = await import("@/lib/products/talentos/payout-provider");
  const fmsRoute = await import("@/app/api/cashflow-ai/webhooks/[provider]/[companyId]/route");
  const hrmsRoute = await import("@/app/api/talentos/payroll/webhook/[companyId]/route");

  const as = <T>(id: string, fn: () => Promise<T>) => runAsCompany(id, fn);
  const raw = db.collection<{ _id: string; companyId?: string } & Record<string, unknown>>(pay.PAYMENT_ACCOUNTS_COLLECTION);
  const save = (id: string, input: Partial<import("@/lib/platform/integrations/payments").PaymentAccountInput>) =>
    as(id, () => pay.savePaymentAccount({ keyId: "", keySecret: "", webhookSecret: "", payoutsEnabled: false, accountNumber: "", ...input }, { id: `admin-${id}`, email: `admin@${id}.test` }));

  console.log("encryption");
  await check("round-trip through the shared platform crypto", () => {
    const ctx = pay.paymentSecretContext(A, "keySecret");
    assert.equal(ctx, `payments:razorpay:${A}:keySecret`, "AAD context string unchanged");
    const enc = encryptPlatformSecret("s3cret-value", ctx);
    assert.ok(!JSON.stringify(enc).includes("s3cret-value"));
    assert.equal(decryptPlatformSecret(enc, ctx), "s3cret-value");
  });
  await check("AAD binds company and field", () => {
    const enc = encryptPlatformSecret("s3cret-value", pay.paymentSecretContext(A, "keySecret"));
    assert.equal(decryptPlatformSecret(enc, pay.paymentSecretContext(B, "keySecret")), null, "other company");
    assert.equal(decryptPlatformSecret(enc, pay.paymentSecretContext(A, "webhookSecret")), null, "other field");
    const tampered = { ...enc, c: Buffer.from("x" + Buffer.from(enc.c, "base64").toString("binary"), "binary").toString("base64") };
    assert.equal(decryptPlatformSecret(tampered, pay.paymentSecretContext(A, "keySecret")), null, "tampered");
  });
  await check("values written by the first (private) implementation still decrypt", () => {
    // The WIP module's own AES-256-GCM encrypt, verbatim: same key, same AAD string, same {c,iv,t} shape.
    const key = Buffer.from(process.env.PLATFORM_ENCRYPTION_KEY!, "base64");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(`payments:razorpay:${A}:webhookSecret`, "utf8"));
    const c = Buffer.concat([cipher.update("legacy-value", "utf8"), cipher.final()]);
    const legacy = { c: c.toString("base64"), iv: iv.toString("base64"), t: cipher.getAuthTag().toString("base64") };
    assert.equal(decryptPlatformSecret(legacy, pay.paymentSecretContext(A, "webhookSecret")), "legacy-value");
  });

  console.log("connect / view");
  await check("validation: bad key id, missing secret, payouts without account", async () => {
    const r = await save(A, { keyId: "rzp_nope", payoutsEnabled: true });
    assert.ok(!r.ok && r.errors?.keyId && r.errors.keySecret && r.errors.accountNumber);
  });
  await check("company A connects; secrets stored encrypted, view shows last4 only", async () => {
    const r = await save(A, { ...ACCT_A, payoutsEnabled: true });
    assert.ok(r.ok, JSON.stringify(r));
    const view = r.account;
    assert.equal(view.status, "connected");
    assert.equal(view.mode, "test");
    assert.equal(view.keySecretLast4, "t-01");
    assert.equal(view.webhookSecretLast4, "c-01");
    assert.equal(view.accountNumberLast4, "4444");
    const serialized = JSON.stringify(view);
    for (const s of [ACCT_A.keySecret, ACCT_A.webhookSecret, ACCT_A.accountNumber]) assert.ok(!serialized.includes(s), "no secret in view");
    const doc = await raw.findOne({ _id: `${A}::razorpay` });
    assert.ok(doc && doc.companyId === A, "stored scoped to A");
    const rawJson = JSON.stringify(doc);
    for (const s of [ACCT_A.keySecret, ACCT_A.webhookSecret, ACCT_A.accountNumber]) assert.ok(!rawJson.includes(s), "no plaintext at rest");
  });
  await check("webhook URLs carry the company id on its automatic subdomain", async () => {
    const view = await as(A, () => pay.getPaymentAccountView());
    assert.equal(view.webhookUrls.payments, `https://alpha.demo.test/api/cashflow-ai/webhooks/razorpay/${A}`);
    assert.equal(view.webhookUrls.payouts, `https://alpha.demo.test/api/talentos/payroll/webhook/${A}`);
  });
  await check("blank secret on save keeps the stored one; new key id requires a new secret", async () => {
    const keep = await save(A, { keyId: ACCT_A.keyId, payoutsEnabled: true });
    assert.ok(keep.ok);
    assert.equal((await as(A, () => pay.resolveRazorpayCredentials("payments")))?.keySecret, ACCT_A.keySecret);
    const other = await save(A, { keyId: "rzp_test_OTHER0000001", payoutsEnabled: true });
    assert.ok(!other.ok && other.errors?.keySecret);
  });
  await check("connect / update are in the company's FMS audit trail, without secrets", async () => {
    const logs = await db.collection("fms_activity_logs").find({ companyId: A, entityId: "payment_account:razorpay" }).toArray();
    assert.deepEqual(logs.map((l) => l.action).sort(), ["create", "update"]);
    assert.equal(logs.find((l) => l.action === "create")?.actorEmail, `admin@${A}.test`);
    const text = JSON.stringify(logs);
    for (const s of [ACCT_A.keySecret, ACCT_A.webhookSecret, ACCT_A.accountNumber]) assert.ok(!text.includes(s));
  });

  console.log("isolation");
  await check("A resolves its own credentials; B (not connected, non-owner) gets null — no env fallback", async () => {
    const a = await as(A, () => pay.resolveRazorpayCredentials("payments"));
    assert.equal(a?.source, "company");
    assert.equal(a?.keyId, ACCT_A.keyId);
    assert.equal(await as(B, () => pay.resolveRazorpayCredentials("payments")), null);
    assert.equal(await as(B, () => pay.resolveRazorpayCredentials("payouts")), null);
    const vb = await as(B, () => pay.getPaymentAccountView());
    assert.deepEqual(vb.usingPlatformEnv, { payments: false, payouts: false });
  });
  await check("A's ciphertext copied into B's record can't be used by B", async () => {
    const a = await raw.findOne({ _id: `${A}::razorpay` });
    const { _id, companyId, ...rest } = a!;
    void _id;
    void companyId;
    await raw.insertOne({ ...rest, _id: `${B}::razorpay`, companyId: B });
    assert.equal(await as(B, () => pay.resolveRazorpayCredentials("payments")), null, "payments");
    assert.equal(await as(B, () => pay.resolveRazorpayCredentials("payouts")), null, "payouts");
    assert.equal((await as(B, () => pay.getPaymentAccountView())).status, "unreadable");
    const t = await as(B, () => pay.testPaymentAccount());
    assert.ok(!t.ok);
    await raw.deleteOne({ _id: `${B}::razorpay` });
  });
  await check("B connects its own account; each company only ever sees its own", async () => {
    assert.ok((await save(B, { ...ACCT_B, payoutsEnabled: true })).ok);
    assert.equal((await as(B, () => pay.resolveRazorpayCredentials("payments")))?.keyId, ACCT_B.keyId);
    assert.equal((await as(A, () => pay.resolveRazorpayCredentials("payments")))?.keyId, ACCT_A.keyId);
    assert.equal((await as(B, () => pay.resolveRazorpayCredentials("payouts")))?.accountNumber, ACCT_B.accountNumber);
  });

  console.log("owner env fallback");
  await check("owner without an account uses the env credentials (payments and payouts)", async () => {
    const p = await as(OWNER, () => pay.resolveRazorpayCredentials("payments"));
    assert.equal(p?.source, "platform_env");
    assert.equal(p?.keyId, process.env.RAZORPAY_KEY_ID);
    assert.equal(p?.webhookSecret, process.env.RAZORPAY_WEBHOOK_SECRET);
    const x = await as(OWNER, () => pay.resolveRazorpayCredentials("payouts"));
    assert.equal(x?.accountNumber, process.env.RAZORPAY_ACCOUNT_NUMBER);
    const view = await as(OWNER, () => pay.getPaymentAccountView());
    assert.deepEqual(view.usingPlatformEnv, { payments: true, payouts: true });
    assert.equal(view.webhookUrls.payments.endsWith(`/api/cashflow-ai/webhooks/razorpay/${OWNER}`), true);
  });
  await check("owner webhook secret falls back to the key secret, as before", async () => {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      assert.equal((await as(OWNER, () => pay.resolveRazorpayCredentials("payments")))?.webhookSecret, process.env.RAZORPAY_KEY_SECRET);
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = saved;
    }
  });
  await check("env payouts need HRMS_PAYOUT_PROVIDER=razorpay, as before", async () => {
    process.env.HRMS_PAYOUT_PROVIDER = "manual";
    try {
      assert.equal(await as(OWNER, () => pay.resolveRazorpayCredentials("payouts")), null);
      assert.equal((await as(OWNER, () => getPayoutProvider())).key, "manual");
    } finally {
      process.env.HRMS_PAYOUT_PROVIDER = "razorpay";
    }
  });
  await check("owner connects payments only: payments use its account, payouts keep the env account", async () => {
    assert.ok((await save(OWNER, { ...ACCT_OWNER, payoutsEnabled: false })).ok);
    assert.equal((await as(OWNER, () => pay.resolveRazorpayCredentials("payments")))?.keyId, ACCT_OWNER.keyId);
    const x = await as(OWNER, () => pay.resolveRazorpayCredentials("payouts"));
    assert.equal(x?.source, "platform_env");
    const view = await as(OWNER, () => pay.getPaymentAccountView());
    assert.deepEqual(view.usingPlatformEnv, { payments: false, payouts: true });
  });

  console.log("test connection (mocked Razorpay)");
  await check("A's test hits Razorpay with A's keys and verifies RazorpayX", async () => {
    calls.length = 0;
    const r = await as(A, () => pay.testPaymentAccount());
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(calls.length === 2 && calls.every((c) => c.auth === basicAuthOf(ACCT_A.keyId, ACCT_A.keySecret)));
    assert.equal(r.account.lastTest?.ok, true);
  });
  await check("wrong secret → test fails with a clear message and is recorded", async () => {
    assert.ok((await save(A, { keyId: ACCT_A.keyId, keySecret: "wrong-secret-123", payoutsEnabled: true })).ok);
    const r = await as(A, () => pay.testPaymentAccount());
    assert.ok(!r.ok && /rejected these keys/.test(r.error));
    assert.equal(r.account?.lastTest?.ok, false);
    assert.ok((await save(A, { keyId: ACCT_A.keyId, keySecret: ACCT_A.keySecret, payoutsEnabled: true })).ok);
  });

  console.log("FMS payment intents");
  const intentInput = { sourceModule: "FMS", sourceType: "manual", sourceId: "src-1", customerName: "Cust", customerEmail: "c@example.test", amount: 1500, paymentProvider: "razorpay" } as Parameters<typeof createPaymentIntent>[0];
  let intentA = "";
  let orderA = "";
  await check("company without an account: NOT_CONNECTED, no call to Razorpay", async () => {
    await as(B, () => pay.disconnectPaymentAccount({ id: "admin-b" }));
    calls.length = 0;
    const r = await as(B, () => createPaymentIntent(intentInput));
    assert.ok(!r.ok && r.code === pay.NOT_CONNECTED && r.reason === pay.NOT_CONNECTED_MESSAGE);
    assert.equal(calls.length, 0);
  });
  await check("A's intent creates the order on A's own account", async () => {
    calls.length = 0;
    const r = await as(A, () => createPaymentIntent(intentInput));
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].auth, basicAuthOf(ACCT_A.keyId, ACCT_A.keySecret));
    assert.equal((calls[0].body as { amount: number }).amount, 150000, "paise");
    intentA = r.intent._id;
    orderA = r.intent.gatewayOrderId!;
    assert.ok(orderA.startsWith(`order_${ACCT_A.keyId}`));
  });
  await check("owner (env fallback) still creates intents on the env account", async () => {
    await as(OWNER, () => pay.disconnectPaymentAccount({ id: "admin-owner" }));
    calls.length = 0;
    const r = await as(OWNER, () => createPaymentIntent({ ...intentInput, sourceId: "src-owner" }));
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(calls[0].auth, basicAuthOf(process.env.RAZORPAY_KEY_ID!, process.env.RAZORPAY_KEY_SECRET!));
  });

  console.log("FMS webhooks");
  const capturedBody = () => JSON.stringify({ entity: "event", event: "payment.captured", payload: { payment: { entity: { id: `pay_${Date.now()}`, order_id: orderA, method: "upi", acquirer_data: { rrn: "RRN1" } } } } });
  await check("signed with another company's / the env secret → 400, intent untouched", async () => {
    const body = capturedBody();
    for (const secret of [ACCT_B.webhookSecret, process.env.RAZORPAY_WEBHOOK_SECRET!, ACCT_A.keySecret]) {
      const r = await as(A, () => processPaymentWebhook("razorpay", body, sign(secret, body), "evt_bad"));
      assert.equal(r.status, 400);
    }
    assert.equal((await as(A, () => getPaymentIntent(intentA)))?.status, "CREATED");
  });
  await check("company without webhook secret / account rejects every webhook", async () => {
    const body = capturedBody();
    const r = await as(B, () => processPaymentWebhook("razorpay", body, sign(ACCT_B.webhookSecret, body)));
    assert.equal(r.status, 400);
  });
  await check("per-company route: A's secret on A's URL marks A's intent paid; duplicate event ignored", async () => {
    const body = capturedBody();
    const req = () => new Request(`https://alpha.demo.test/api/cashflow-ai/webhooks/razorpay/${A}`, { method: "POST", body, headers: { "x-razorpay-signature": sign(ACCT_A.webhookSecret, body), "x-razorpay-event-id": "evt_A_1" } });
    const res = await fmsRoute.POST(req(), { params: Promise.resolve({ provider: "razorpay", companyId: A }) });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal((await as(A, () => getPaymentIntent(intentA)))?.status, "SUCCESS");
    const again = await fmsRoute.POST(req(), { params: Promise.resolve({ provider: "razorpay", companyId: A }) });
    assert.match(await again.text(), /Duplicate/);
  });
  await check("per-company route: A's signed body sent to B's URL is rejected", async () => {
    const body = capturedBody();
    const res = await fmsRoute.POST(new Request("https://x.test/", { method: "POST", body, headers: { "x-razorpay-signature": sign(ACCT_A.webhookSecret, body) } }), { params: Promise.resolve({ provider: "razorpay", companyId: B }) });
    assert.equal(res.status, 400);
  });
  await check("per-company route: unknown, malformed or suspended company → 404", async () => {
    for (const id of ["nope", "../etc", SUSPENDED]) {
      const res = await fmsRoute.POST(new Request("https://x.test/", { method: "POST", body: "{}" }), { params: Promise.resolve({ provider: "razorpay", companyId: id }) });
      assert.equal(res.status, 404, id);
    }
    assert.equal(await pay.resolveWebhookCompany(A), A);
  });
  await check("unsigned mock webhook can't complete a real-gateway intent", async () => {
    const r2 = await as(A, () => createPaymentIntent({ ...intentInput, sourceId: "src-2" }));
    assert.ok(r2.ok);
    await as(A, () => processPaymentWebhook("mock", JSON.stringify({ intentId: r2.intent._id }), ""));
    assert.equal((await as(A, () => getPaymentIntent(r2.intent._id)))?.status, "CREATED");
  });

  console.log("HRMS payouts");
  await check("payout provider per company: A razorpay on A's account, B manual, owner env", async () => {
    const pa = await as(A, () => getPayoutProvider());
    assert.equal(pa.key, "razorpay");
    assert.equal(pa.accountRef, ACCT_A.keyId);
    assert.equal(pa.usesPlatformEnv, false);
    assert.equal((await as(B, () => getPayoutProvider())).key, "manual");
    const po = await as(OWNER, () => getPayoutProvider());
    assert.equal(po.accountRef, process.env.RAZORPAY_KEY_ID);
    assert.equal(po.usesPlatformEnv, true);
  });
  await check("A's payouts go out from A's RazorpayX account with A's keys", async () => {
    const pa = await as(A, () => getPayoutProvider());
    calls.length = 0;
    await pa.createPayout({ payoutId: "p1", amountPaise: 5_000_00, fundAccountId: "fa_1", referenceId: "SAL-1", narration: "Salary" });
    assert.equal(calls[0].auth, basicAuthOf(ACCT_A.keyId, ACCT_A.keySecret));
    assert.equal((calls[0].body as { account_number: string }).account_number, ACCT_A.accountNumber);
  });
  await check("payout webhook verified with the company's own secret only", async () => {
    const body = JSON.stringify({ event: "payout.processed", payload: { payout: { entity: { id: "pout_x", utr: "U1" } } } });
    const pa = await as(A, () => getPayoutProvider());
    assert.equal(pa.verifyWebhook(body, sign(ACCT_A.webhookSecret, body)), true);
    assert.equal(pa.verifyWebhook(body, sign(process.env.RAZORPAY_WEBHOOK_SECRET!, body)), false);
    const po = await as(OWNER, () => getPayoutProvider());
    assert.equal(po.verifyWebhook(body, sign(process.env.RAZORPAY_WEBHOOK_SECRET!, body)), true);
    assert.equal(po.verifyWebhook(body, sign(ACCT_A.webhookSecret, body)), false);
  });
  await check("per-company payout route: 200 for A signed by A, 400 wrong secret, 404 for B (manual) and unknown", async () => {
    const body = JSON.stringify({ event: "payout.processed", payload: { payout: { entity: { id: "pout_unknown", utr: "U1" } } } });
    const mk = (secret: string) => new Request("https://x.test/", { method: "POST", body, headers: { "x-razorpay-signature": sign(secret, body) } }) as never;
    assert.equal((await hrmsRoute.POST(mk(ACCT_A.webhookSecret), { params: Promise.resolve({ companyId: A }) })).status, 200);
    assert.equal((await hrmsRoute.POST(mk(ACCT_B.webhookSecret), { params: Promise.resolve({ companyId: A }) })).status, 400);
    assert.equal((await hrmsRoute.POST(mk(ACCT_A.webhookSecret), { params: Promise.resolve({ companyId: B }) })).status, 404);
    assert.equal((await hrmsRoute.POST(mk(ACCT_A.webhookSecret), { params: Promise.resolve({ companyId: "nope" }) })).status, 404);
  });

  console.log("disconnect");
  await check("disconnect deletes the keys, is audited, and A falls back to nothing", async () => {
    const r = await as(A, () => pay.disconnectPaymentAccount({ id: "admin-a", email: "admin@a.test" }));
    assert.ok(r.ok && r.account.status === "not_connected");
    assert.equal(await raw.countDocuments({ companyId: A }), 0);
    assert.equal(await as(A, () => pay.resolveRazorpayCredentials("payments")), null);
    assert.equal((await as(A, () => getPayoutProvider())).key, "manual");
    const del = await db.collection("fms_activity_logs").findOne({ companyId: A, entityId: "payment_account:razorpay", action: "delete" });
    assert.ok(del);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
