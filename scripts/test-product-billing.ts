/**
 * Paying per product: the price of a selection, the free plan's one product, and a paid company adding and removing
 * products. Throwaway database; Razorpay is mocked, nothing touches the network.
 */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { saveRazorpayConfig } from "@/lib/platform/billing/razorpay-config";
import { getCompanySubscription, startTrial, updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { __setInvoiceIssuerForTests, confirmCheckout, handleWebhook, priceSubscription, repriceSubscription, saveBillingDetails, startCheckout, type RazorpayWebhookPayload } from "@/lib/platform/billing/subscriptions";
import { changeCompanyProducts, previewProducts, productState } from "@/lib/platform/billing/products";
import { getPlan, savePlan } from "@/lib/platform/billing/plans";
import { productPrice } from "@/lib/platform/billing/pricing";
import { billableCount, type ProductSelection } from "@/lib/platform/products/selection";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { entitlementsFor } from "@/lib/platform/billing/entitlements";
import type { IssueSaasInvoiceInput } from "@/lib/platform/billing/invoices";

// ── Mock Razorpay ──────────────────────────────────────────────────────────────
type Json = Record<string, unknown>;
const calls: { method: string; path: string; body: Json | null; auth: string | null }[] = [];
const remoteSubs = new Map<string, Json>();
let seq = 0;
let rejectAuth = false;
let failSubscriptions = false;
let failInvoices = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "api.razorpay.com") throw new Error(`unexpected network call to ${url.hostname}`);
  const method = init?.method ?? "GET";
  const path = url.pathname.replace(/^\/v1/, "");
  const body = init?.body ? (JSON.parse(String(init.body)) as Json) : null;
  const auth = new Headers(init?.headers).get("authorization");
  calls.push({ method, path, body, auth });
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  if (rejectAuth) return json(401, { error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } });
  let m: RegExpMatchArray | null;
  if (method === "GET" && path === "/plans") return json(200, { count: 0, items: [] });
  if (method === "POST" && path === "/customers") return json(200, { id: "cust_1" });
  if (method === "POST" && path === "/plans") return json(200, { id: `plan_${++seq}` });
  if (method === "POST" && path === "/subscriptions" && failSubscriptions) return json(500, { error: { description: "boom" } });
  if (method === "POST" && path === "/subscriptions") {
    const id = `sub_${++seq}`;
    const sub = { id, plan_id: body!.plan_id, customer_id: body!.customer_id ?? null, status: "created", current_start: null, current_end: null, start_at: body!.start_at ?? null, notes: body!.notes };
    remoteSubs.set(id, sub);
    return json(200, sub);
  }
  if ((m = path.match(/^\/subscriptions\/([^/]+)$/))) {
    const sub = remoteSubs.get(m[1]);
    if (!sub) return json(404, { error: { description: "not found" } });
    if (method === "PATCH") Object.assign(sub, { plan_id: body!.plan_id });
    return json(200, sub);
  }
  if ((m = path.match(/^\/subscriptions\/([^/]+)\/cancel$/))) {
    const sub = remoteSubs.get(m[1])!;
    if (!body!.cancel_at_cycle_end) sub.status = "cancelled";
    return json(200, sub);
  }
  if ((m = path.match(/^\/subscriptions\/([^/]+)\/cancel_scheduled_changes$/))) return json(200, remoteSubs.get(m[1]));
  if ((m = path.match(/^\/payments\/([^/]+)\/refund$/))) return json(200, { id: `rfnd_${++seq}`, amount: body!.amount });
  return json(404, { error: { description: `no mock for ${method} ${path}` } });
}) as typeof fetch;

const KEY_ID = "rzp_test_AbCdEf123456";
const KEY_SECRET = "secretSECRET1234wxyz";
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const sel = (...keys: string[]) => ({ mode: "selected", keys }) as ProductSelection;

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  process.env.EMAIL_PROVIDER = "console";
  process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  const invoices: IssueSaasInvoiceInput[] = [];
  __setInvoiceIssuerForTests(async (input) => {
    invoices.push(input);
    return { id: `inv_${invoices.length}`, number: `SAAS/${invoices.length}`, total: 0 };
  });
  let checks = 0;
  const ok = (c: unknown, m: string) => {
    assert.ok(c, m);
    checks++;
  };
  const eq = <T>(a: T, b: T, m: string) => {
    assert.deepEqual(a, b, m);
    checks++;
  };

  // --- how many products are charged for -------------------------------------------------
  eq(billableCount(undefined), null, "everything");
  eq(billableCount({ mode: "all" }), null, "all");
  eq(billableCount(sel("hrms")), 1, "one");
  eq(billableCount(sel("messenger")), 1, "Huddle alone is the product bought");
  eq(billableCount(sel("hrms", "messenger")), 1, "Huddle comes free beside another");
  eq(billableCount(sel("lpms")), 1, "ContractFlow");
  eq(billableCount(sel("lpms", "sop")), 1, "its Playbook is free");
  eq(billableCount(sel("hrms", "fms", "intelligence")), 3, "companions count");

  // --- plan prices ------------------------------------------------------------------------
  const g = (await getPlan("growth"))!;
  const base = { _id: g._id, name: g.name, description: g.description, currency: g.currency, intervals: ["monthly", "yearly"] as ("monthly" | "yearly")[], prices: { monthly: 100_000, yearly: 1_000_000 }, modules: g.modules, highlights: g.highlights ?? [], flags: g.flags ?? [], limits: g.limits, trialDays: 14, active: true, isDefault: false };
  const dear = await savePlan({ ...base, singlePrices: { monthly: 200_000 } }, "update", "t");
  ok(!dear.ok && "singlePrice.monthly" in (dear.fieldErrors ?? {}), "one product can't cost more than all");
  ok((await savePlan({ ...base, singlePrices: { monthly: 40_000, yearly: 400_000 } }, "update", "t")).ok, "both prices saved");
  const plan = (await getPlan("growth"))!;
  eq([productPrice(plan, "monthly", undefined), productPrice(plan, "monthly", sel("hrms")), productPrice(plan, "monthly", sel("hrms", "fms")), productPrice(plan, "monthly", sel("hrms", "fms", "pms"))], [100_000, 40_000, 80_000, 100_000], "single × count, capped at all");
  ok((await savePlan(base, "update", "t")).ok, "a save that says nothing about single prices");
  eq((await getPlan("growth"))!.singlePrices, { monthly: 40_000, yearly: 400_000 }, "keeps them");
  eq((await getPlan("free"))!.maxProducts, 1, "a new catalogue's Free plan holds one product");

  // --- companies ---------------------------------------------------------------------------
  await saveRazorpayConfig({ keyId: KEY_ID, keySecret: KEY_SECRET, mode: "test" }, "admin1");
  const company = async (slug: string, planId: string, products?: string[]) => {
    const id = randomUUID();
    await db.collection("companies").insertOne({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: new Date(), updatedAt: new Date() });
    await startTrial(id, planId);
    if (products) assert.ok((await setCompanyProducts(id, { products }, { id: "t" })).ok);
    await saveBillingDetails(id, { legalName: `${slug} Pvt Ltd`, gstin: "", address: "1 Main Road, Chennai", state: "Tamil Nadu", email: `b@${slug}.test` });
    return id;
  };
  const owned = async (id: string) => {
    const p = (await getCompany(id))!.products;
    return !p || p.mode === "all" ? "all" : [...p.keys].sort().join(",");
  };

  const free = await company("freeco", "free", ["hrms"]);
  await updateCompanySubscription(free, { status: "active", trialEndsAt: null });
  const two = await changeCompanyProducts(free, ["hrms", "fms"], "u");
  ok(!two.ok && /one product/.test(two.error), "Free: one product");
  ok(!(await changeCompanyProducts(free, "all", "u")).ok, "Free: not All");
  ok((await changeCompanyProducts(free, "fms", "u")).ok, "Free: swap at once");
  eq(await owned(free), "fms", "swapped");

  const trial = await company("trialco", "growth", ["hrms"]);
  ok((await changeCompanyProducts(trial, ["hrms", "pms"], "u")).ok, "trial: add at once");
  eq(await owned(trial), "hrms,pms", "open");

  // --- a paying company ------------------------------------------------------------------
  const co = await company("paidco", "growth", ["hrms"]);
  const quote = await priceSubscription({ companyId: co, planId: "growth", interval: "monthly" });
  ok(quote.ok && quote.pricing.net === 40_000 && /1 product/.test(quote.pricing.lines![0].label), "priced for its one product");
  const started = await startCheckout(co, { planId: "growth", interval: "monthly" }, "u");
  ok(started.ok && started.checkout.amount === 47_200, "checkout for one product + GST");
  if (!started.ok) return;
  const subId = started.checkout.subscriptionId;
  remoteSubs.get(subId)!.status = "authenticated";
  ok((await confirmCheckout(co, { razorpay_payment_id: "pay_auth", razorpay_subscription_id: subId, razorpay_signature: createHmac("sha256", KEY_SECRET).update(`pay_auth|${subId}`).digest("hex") })).ok, "confirmed");
  let cycle = 0;
  const charge = async () => {
    const n = ++cycle;
    const remote = remoteSubs.get(subId)!;
    const amount = (await db.collection("billing_plans").findOne({ "razorpayPlans.id": remote.plan_id }))!.razorpayPlans.find((r: Json) => r.id === remote.plan_id).amount as number;
    Object.assign(remote, { status: "active", current_start: unix(new Date(Date.now() + n * 30 * 86_400_000)), current_end: unix(new Date(Date.now() + (n + 1) * 30 * 86_400_000)) });
    const event: RazorpayWebhookPayload = { event: "subscription.charged", payload: { subscription: { entity: { ...remote } as never }, payment: { entity: { id: `pay_${n}`, amount, currency: "INR", status: "captured", subscription_id: subId } as never } } };
    await handleWebhook(`evt_${n}`, event);
    return amount;
  };
  eq(await charge(), 47_200, "first charge");

  const preview = await previewProducts(co, ["hrms", "fms"]);
  ok(preview.ok && preview.summary?.total === 94_400 && preview.when === "renewal", "preview: two products from the renewal");
  eq(await owned(co), "hrms", "a preview changes nothing");
  ok((await changeCompanyProducts(co, ["hrms", "fms"], "u")).ok, "add CashFlow");
  eq(await owned(co), "fms,hrms", "open at once");
  ok((await entitlementsFor(co)).modules!.has("fms"), "and usable");
  let sub = (await getCompanySubscription(co))!;
  eq([sub.pricing?.total, sub.pendingChange?.pricing?.total, sub.productHold?.keys], [47_200, 94_400, ["fms"]], "billed from the next renewal, held until then");
  const early = await changeCompanyProducts(co, "hrms", "u");
  ok(!early.ok && /billed once/.test(early.error), "can't drop it before it is billed");
  eq(await charge(), 94_400, "renewal charges two products");
  sub = (await getCompanySubscription(co))!;
  eq([sub.pricing?.total, sub.pendingChange ?? null, sub.productHold ?? null], [94_400, null, null], "the new price is current, the hold is over");
  eq(invoices.at(-1)!.lines!.map((l) => [l.kind, l.amount]), [["plan", 80_000]], "invoice shows it");

  ok((await changeCompanyProducts(co, "hrms", "u")).ok, "remove CashFlow");
  eq(await owned(co), "fms,hrms", "still there until the period ends");
  const state = await productState(co);
  ok(state.next && state.next.products.mode === "selected" && state.next.products.keys.join() === "hrms", "the change is shown as waiting");
  ok((await changeCompanyProducts(co, ["hrms", "fms"], "u")).ok, "change of mind");
  sub = (await getCompanySubscription(co))!;
  eq([sub.pendingChange ?? null, await owned(co)], [null, "fms,hrms"], "waiting change dropped");
  ok((await changeCompanyProducts(co, "hrms", "u")).ok, "remove again");
  // a daily re-price keeps the waiting choice
  await repriceSubscription(co, "system");
  eq((await getCompanySubscription(co))!.pendingChange?.pricing?.total, 47_200, "re-pricing doesn't undo it");
  eq(await charge(), 47_200, "renewal charges one product");
  eq(await owned(co), "hrms", "and the product is gone, at the end of what was paid");

  ok((await changeCompanyProducts(co, "pms", "u")).ok, "swap one for one");
  sub = (await getCompanySubscription(co))!;
  eq([await owned(co), sub.pendingChange ?? null, sub.pricing?.total], ["pms", null, 47_200], "same price: at once");

  // --- the platform team changes a company -------------------------------------------------
  ok((await setCompanyProducts(co, { products: "all" }, { id: "admin", reason: "gift" })).ok, "set from the Console");
  ok((await repriceSubscription(co, "admin", { products: { mode: "all" } })).ok, "re-priced");
  eq([await owned(co), (await getCompanySubscription(co))!.pendingChange?.pricing?.total], ["all", 118_000], "access now, All price from the renewal");
  eq(await charge(), 118_000, "charged");

  // --- an old subscriber keeps what they bought ----------------------------------------------
  ok((await savePlan({ ...base, prices: { monthly: 300_000, yearly: 3_000_000 }, singlePrices: { monthly: 90_000 } }, "update", "t")).ok, "prices raised");
  const kept = await priceSubscription({ companyId: co, planId: "growth", interval: "monthly", priceVersion: sub.priceVersion });
  ok(kept.ok && kept.pricing.net === 100_000, "their All price is unchanged");

  console.log(`product billing: all ${checks} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    await c.db().dropDatabase();
    await c.close();
    process.exit(process.exitCode ?? 0);
  });
