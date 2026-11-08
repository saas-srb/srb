import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { savePaymentAccount } from "../src/lib/platform/integrations/payments";
import { createPaymentLink, claimLinkAttempt, getPaymentLinkByToken } from "../src/lib/products/cashflow-ai/payments/links";
import { createPaymentIntent, getPaymentIntent, markPaymentIntentSuccessful } from "../src/lib/products/cashflow-ai/payments/intents";
import { processPaymentWebhook } from "../src/lib/products/cashflow-ai/payments/webhooks";
import { listBankAccounts } from "../src/lib/products/cashflow-ai/bank-accounts";
import { receiptForLinkToken } from "../src/lib/products/cashflow-ai/payments/public-receipt";
import { renderPublicReceiptPdf } from "../src/components/products/cashflow-ai/PaymentReceiptPdf";
import { requestRefund, changeRefundStatus, getRefund } from "../src/lib/products/cashflow-ai/refunds";
import { RAZORPAY_COLLECTIONS_ACCOUNT_NAME } from "../src/lib/products/cashflow-ai/payments/payouts";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*) with PLATFORM_ENCRYPTION_KEY set.
// Razorpay is an in-memory stand-in for `fetch`: this checks OUR side of a customer payment, not Razorpay.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const A = "co_cust_a";
const inA = <T>(fn: () => Promise<T>) => runAsCompany(A, fn);
const WEBHOOK_SECRET = "whsecret123";

const orders: Record<string, unknown>[] = [];
const refunds: { payment: string; body: Record<string, unknown> }[] = [];
let orderSeq = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
  const u = new URL(String(url));
  if (u.host !== "api.razorpay.com") return realFetch(url, init);
  const path = u.pathname.replace("/v1", "");
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  if (path === "/orders") { const body = JSON.parse(String(init.body)); orders.push(body); return json({ id: `order_${++orderSeq}`, ...body }); }
  const rf = /^\/payments\/(pay_\w+)\/refund$/.exec(path);
  if (rf && init.method === "POST") { refunds.push({ payment: rf[1], body: JSON.parse(String(init.body)) }); return json({ id: `rfnd_${refunds.length}`, status: "processed" }); }
  const m = /^\/payments\/(pay_\w+)$/.exec(path);
  if (m) return json({ id: m[1], status: "captured", order_id: `order_${orderSeq}`, method: "upi", acquirer_data: { rrn: "RRN123456" } });
  return json({ error: { description: `unexpected ${path}` } }, 400);
}) as typeof fetch;

const balance = async () => (await listBankAccounts()).find((a) => a.accountName === RAZORPAY_COLLECTIONS_ACCOUNT_NAME)?.currentBalance ?? 0;
const intentFor = async (link: { _id: string; amount: number; customerName: string; customerEmail: string; invoiceId: string | null; customerId: string | null }) => {
  assert.ok(await claimLinkAttempt(link._id));
  const r = await createPaymentIntent({ sourceModule: "DIRECT", sourceType: "DIRECT_LINK", sourceId: link._id, customerId: link.customerId, customerName: link.customerName, customerEmail: link.customerEmail, invoiceId: link.invoiceId, amount: link.amount, currency: "INR", paymentProvider: "razorpay" });
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return (r as { ok: true; intent: Awaited<ReturnType<typeof getPaymentIntent>> & object }).intent;
};

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase(); // every run starts clean (only ever a zz_throwaway_ database, checked above)
  assert.ok(process.env.PLATFORM_ENCRYPTION_KEY, "set PLATFORM_ENCRYPTION_KEY (base64, 32 bytes)");
  await (await getPlatformDb()).collection("companies").updateOne({ _id: A as never }, { $set: { slug: "custa", name: "Cust A Co" } }, { upsert: true });

  await inA(async () => {
    const saved = await savePaymentAccount({ keyId: "rzp_test_abcdefgh12345", keySecret: "secretsecret", webhookSecret: WEBHOOK_SECRET, payoutsEnabled: false, accountNumber: "" }, { id: "u1" });
    assert.ok(saved.ok);
    const db = await getDb();
    const now = new Date();
    await db.collection("fms_invoices").insertOne({ _id: "inv_c1", invoiceNumber: "INV-C1", customerId: "c1", customerName: "Acme Ltd", currency: "INR", totalAmount: 10000, amountPaid: 0, amountCredited: 0, status: "sent", dueDate: "2026-12-31", createdAt: now, updatedAt: now, deletedAt: null } as never);

    await t("a customer pays a link with no invoice: the Razorpay order is for the right amount, and the money is booked once even if the webhook and the browser both report it", async () => {
      const l = await createPaymentLink({ title: "AI course fee", amount: 5000, customerName: "Vijay", customerEmail: "v@a.example", expiresInDays: 7 });
      assert.ok(l.ok);
      if (!l.ok) return;
      assert.equal(await receiptForLinkToken(l.paymentLink.token), null, "no receipt before the link is paid");
      const intent = await intentFor(l.paymentLink);
      assert.equal(orders.at(-1)!.amount, 500000, "amount in paise");
      assert.equal(intent.status, "CREATED");
      const before = await balance();
      const [a, b] = await Promise.all([
        markPaymentIntentSuccessful(intent._id, { gatewayPaymentId: "pay_one", utr: "RRN123456" }),
        markPaymentIntentSuccessful(intent._id, { gatewayPaymentId: "pay_one", utr: "RRN123456" }),
      ]);
      assert.ok(a.ok || b.ok, "one of them completes it");
      const done = (await getPaymentIntent(intent._id))!;
      assert.equal(done.status, "SUCCESS");
      assert.ok(done.transactionId, "a ledger entry was made even without an invoice");
      assert.equal(await balance(), before + 5000, "booked exactly once");
      assert.equal(await db.collection("fms_transactions").countDocuments({ sourceRecordId: intent._id }), 1);
      assert.equal((await getPaymentLinkByToken(l.paymentLink.token))!.status, "PAID", "the link is finished");
      assert.equal(await claimLinkAttempt(l.paymentLink._id), false, "a paid link cannot be paid again");
      // The customer's receipt: found by the link's secret token, only once it is paid, with everything a receipt should carry.
      const rcpt = await receiptForLinkToken(l.paymentLink.token);
      assert.ok(rcpt);
      assert.equal(rcpt!.amount, 5000);
      assert.equal(rcpt!.gatewayPaymentId, "pay_one");
      assert.equal(rcpt!.utr, "RRN123456");
      assert.equal(rcpt!.title, "AI course fee");
      assert.equal(rcpt!.number, intent.paymentNumber, "a payment with no invoice is numbered by its payment reference");
      assert.equal(await receiptForLinkToken("0".repeat(32)), null, "a wrong token shows nothing");
      const pdf = await renderPublicReceiptPdf(rcpt!);
      assert.equal(pdf.subarray(0, 4).toString(), "%PDF", "a real PDF is made");
      assert.ok(pdf.length > 1500);
      const again = await markPaymentIntentSuccessful(intent._id, { gatewayPaymentId: "pay_one" });
      assert.ok(again.ok);
      assert.equal(await balance(), before + 5000, "a late repeat changes nothing");
    });

    await t("a link allows only so many attempts and never after it expires or is cancelled", async () => {
      const l = await createPaymentLink({ title: "Limited", amount: 100, customerName: "X", customerEmail: "x@a.example", maxAttempts: 2 });
      assert.ok(l.ok);
      if (!l.ok) return;
      assert.ok(await claimLinkAttempt(l.paymentLink._id));
      assert.ok(await claimLinkAttempt(l.paymentLink._id));
      assert.equal(await claimLinkAttempt(l.paymentLink._id), false, "third attempt refused");
      const e = await createPaymentLink({ title: "Old", amount: 100, customerName: "X", customerEmail: "x@a.example" });
      assert.ok(e.ok);
      if (!e.ok) return;
      await db.collection("fms_payment_links").updateOne({ _id: e.paymentLink._id as never }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      assert.equal(await claimLinkAttempt(e.paymentLink._id), false, "expired");
      assert.equal((await getPaymentLinkByToken(e.paymentLink.token))!.status, "EXPIRED");
    });

    await t("a payment for an invoice makes one receipt and pays the invoice once, however many times it is reported", async () => {
      const l = await createPaymentLink({ title: "Invoice INV-C1", amount: 10000, customerId: "c1", customerName: "Acme Ltd", customerEmail: "a@a.example", invoiceId: "inv_c1" });
      assert.ok(l.ok);
      if (!l.ok) return;
      const intent = await intentFor(l.paymentLink);
      const before = await balance();
      await Promise.all([1, 2, 3].map(() => markPaymentIntentSuccessful(intent._id, { gatewayPaymentId: "pay_two", utr: "RRN999" })));
      const inv = (await db.collection("fms_invoices").findOne({ _id: "inv_c1" as never })) as unknown as { amountPaid: number; status: string };
      assert.equal(inv.amountPaid, 10000, "paid once, not three times");
      assert.equal(inv.status, "paid");
      assert.equal(await db.collection("fms_receipts").countDocuments({ transactionReference: "RRN999" }), 1, "one receipt");
      assert.equal(await balance(), before + 10000);
      assert.ok((await getPaymentIntent(intent._id))!.receiptNumber);
    });

    await t("money that arrives but cannot be booked is kept and flagged for a person, not lost", async () => {
      const l = await createPaymentLink({ title: "Invoice INV-C1 again", amount: 10000, customerId: "c1", customerName: "Acme Ltd", customerEmail: "a@a.example", invoiceId: "inv_c1" });
      assert.ok(l.ok);
      if (!l.ok) return;
      // The invoice was paid in full in the meantime, so the receipt cannot be made.
      const intent = await (async () => { assert.ok(await claimLinkAttempt(l.paymentLink._id)); await db.collection("fms_invoices").updateOne({ _id: "inv_c1" as never }, { $set: { amountPaid: 0, status: "sent" } }); const r = await createPaymentIntent({ sourceModule: "DIRECT", sourceType: "DIRECT_LINK", sourceId: l.paymentLink._id, customerId: "c1", customerName: "Acme Ltd", customerEmail: "a@a.example", invoiceId: "inv_c1", amount: 10000, paymentProvider: "razorpay" }); assert.ok(r.ok); return (r as { ok: true; intent: { _id: string } }).intent; })();
      await db.collection("fms_invoices").updateOne({ _id: "inv_c1" as never }, { $set: { amountPaid: 10000, status: "paid" } });
      const r = await markPaymentIntentSuccessful(intent._id, { gatewayPaymentId: "pay_three", utr: "RRN777" });
      assert.ok(r.ok);
      const done = (await getPaymentIntent(intent._id))!;
      assert.equal(done.status, "SUCCESS", "the customer did pay");
      assert.ok(done.reviewNote?.includes("receipt could not be made"));
    });

    await t("a refund goes back through Razorpay on the original payment, only after approval, and takes the money out of the Razorpay account in the books", async () => {
      const receipt = (await db.collection("fms_receipts").findOne({ transactionReference: "RRN999" })) as unknown as { _id: string; amount: number };
      assert.ok(receipt);
      const req = await requestRefund({ receiptId: receipt._id, amount: 4000, reason: "Duplicate order" }, "u1");
      assert.ok(req.ok, req.ok ? "" : req.reason);
      if (!req.ok) return;
      assert.equal((await requestRefund({ receiptId: receipt._id, amount: 7000, reason: "Too much" }, "u1")).ok, false, "not more than was paid");
      assert.equal((await changeRefundStatus(req.refund._id, "processing", "u1", null)).ok, false, "not before it is approved");
      assert.ok((await changeRefundStatus(req.refund._id, "approved", "u1", null)).ok);
      assert.equal((await changeRefundStatus(req.refund._id, "completed", "u1", null)).ok, false, "completed cannot be typed in: Razorpay must send it");
      assert.equal(refunds.length, 0, "nothing sent to Razorpay yet");
      const before = await balance();
      const r = await changeRefundStatus(req.refund._id, "processing", "u1", null);
      assert.ok(r.ok, r.ok ? "" : r.reason);
      assert.equal(refunds.length, 1);
      assert.equal(refunds[0].payment, "pay_two", "the customer's own payment is refunded");
      assert.equal(refunds[0].body.amount, 400000, "in paise");
      const done = (await getRefund(req.refund._id))!;
      assert.equal(done.status, "completed");
      assert.equal(done.providerRefundId, "rfnd_1");
      assert.equal(await balance(), before - 4000, "the refund comes out of the Razorpay account");
    });

    await t("a webhook with the wrong signature is refused, a right one completes the payment, and a repeat of it is ignored", async () => {
      const l = await createPaymentLink({ title: "Webhook fee", amount: 700, customerName: "Hook", customerEmail: "h@a.example" });
      assert.ok(l.ok);
      if (!l.ok) return;
      const intent = await intentFor(l.paymentLink);
      const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_hook", order_id: intent.gatewayOrderId, method: "upi", acquirer_data: { rrn: "RRNHOOK1" } } } } });
      const sign = (secret: string) => createHmac("sha256", secret).update(body).digest("hex");
      const bad = await processPaymentWebhook("razorpay", body, sign("wrong-secret"), "evt_1");
      assert.equal(bad.status, 400);
      assert.equal((await getPaymentIntent(intent._id))!.status, "CREATED", "nothing happened");
      const before = await balance();
      const good = await processPaymentWebhook("razorpay", body, sign(WEBHOOK_SECRET), "evt_2");
      assert.equal(good.ok, true);
      assert.equal((await getPaymentIntent(intent._id))!.status, "SUCCESS");
      assert.equal(await balance(), before + 700);
      const repeat = await processPaymentWebhook("razorpay", body, sign(WEBHOOK_SECRET), "evt_2");
      assert.ok(repeat.ok && /Duplicate/.test(repeat.message));
      assert.equal(await balance(), before + 700, "a repeated event books nothing");
      assert.equal((await processPaymentWebhook("stripe" as never, body, "x", "evt_3")).status, 404, "no other gateway exists");
    });
  });
  console.log("customer payment tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
