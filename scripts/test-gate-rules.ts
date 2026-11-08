import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// The front door, as production runs it (SECURITY_STRICT on): which payment routes it lets through and which it stops. No database is read.
process.env.SECURITY_STRICT = "1";
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const HOST = "demo.localhost:3000";
const browser = { origin: `http://${HOST}`, "sec-fetch-site": "same-origin", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "content-type": "application/json" };

(async () => {
  const { classify, gateApi } = await import("../src/lib/security/gate");
  const req = (path: string, headers: Record<string, string>, method = "POST") => new NextRequest(`http://${HOST}${path}`, { method, headers });
  const door = async (path: string, headers: Record<string, string>, method = "POST") => (await gateApi(req(path, headers, method), HOST, "co_x", false))?.status ?? 200;

  await t("Razorpay's webhooks are machine routes: they carry a signature, not a login", () => {
    assert.equal(classify("/api/cashflow-ai/webhooks/razorpay", "POST"), "machine");
    assert.equal(classify("/api/cashflow-ai/webhooks/razorpay/c916b066-0dd9-475d-a2c3-c039673bba32", "POST"), "machine");
    assert.equal(classify("/api/talentos/payroll/webhook", "POST"), "machine");
    assert.equal(classify("/api/talentos/payroll/webhook/c916b066-0dd9-475d-a2c3-c039673bba32", "POST"), "machine");
  });

  await t("a customer on a payment link can start and confirm a payment without signing in", () => {
    assert.equal(classify("/api/cashflow-ai/payments/create-intent", "POST"), "public");
    assert.equal(classify("/api/cashflow-ai/payments/verify", "POST"), "public");
  });

  await t("the customer's receipt PDF opens with the link's token and nothing else, and only by GET", async () => {
    const token = "a".repeat(32);
    assert.equal(classify(`/api/cashflow-ai/payments/receipt/${token}`, "GET"), "public");
    assert.equal(classify("/api/cashflow-ai/payments/receipt/short", "GET"), "session", "not a token: needs a login");
    assert.equal(classify(`/api/cashflow-ai/payments/receipt/${token}`, "POST"), "session");
    assert.equal(await door(`/api/cashflow-ai/payments/receipt/${token}`, browser, "GET"), 200);
  });

  await t("everything that moves or creates money for the company still needs a signed-in person", () => {
    for (const p of ["/api/cashflow-ai/payments/payout", "/api/cashflow-ai/payments/link", "/api/talentos/payroll/runs/abc/export/register", "/api/cashflow-ai/receipts/REC-0001"]) assert.equal(classify(p, "POST"), "session", p);
    assert.equal(classify("/api/cashflow-ai/payments/create-intent", "GET"), "session", "only POST is public");
  });

  await t("production front door: a customer's browser (no login) reaches the payment endpoints", async () => {
    assert.equal(await door("/api/cashflow-ai/payments/create-intent", browser), 200);
    assert.equal(await door("/api/cashflow-ai/payments/verify", browser), 200);
  });

  await t("production front door: Razorpay reaches the webhooks with its signature, and nobody without one", async () => {
    const razorpay = { "user-agent": "Razorpay-Webhook/v1", "content-type": "application/json", "x-razorpay-signature": "abc123", "x-razorpay-event-id": "evt_1" };
    for (const p of ["/api/cashflow-ai/webhooks/razorpay", "/api/cashflow-ai/webhooks/razorpay/co_x", "/api/talentos/payroll/webhook", "/api/talentos/payroll/webhook/co_x"]) {
      assert.equal(await door(p, razorpay), 200, `${p} with a signature`);
      assert.equal(await door(p, { "user-agent": razorpay["user-agent"], "content-type": "application/json" }), 403, `${p} without one`);
    }
  });

  await t("production front door: money-moving endpoints need a session, a script cannot call them, and another website cannot", async () => {
    for (const p of ["/api/cashflow-ai/payments/payout", "/api/cashflow-ai/payments/link"]) {
      assert.equal(await door(p, browser), 401, `${p} signed out`);
      assert.equal(await door(p, { ...browser, cookie: "hub_session=abc" }), 200, `${p} signed in`);
      assert.equal(await door(p, { ...browser, cookie: "hub_session=abc", "user-agent": "curl/8.0" }), 403, `${p} from a script`);
      assert.equal(await door(p, { ...browser, cookie: "hub_session=abc", origin: "https://evil.example", "sec-fetch-site": "cross-site" }), 403, `${p} from another site`);
    }
    assert.equal(await door("/api/cashflow-ai/payments/create-intent", { ...browser, origin: "https://evil.example", "sec-fetch-site": "cross-site" }), 403, "a customer endpoint from another site");
  });

  console.log("gate rule tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
