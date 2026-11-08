import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { seedDefaultAccounts } from "../src/lib/products/cashflow-ai/accounts";
import { createBankAccount, getBankAccount } from "../src/lib/products/cashflow-ai/bank-accounts";
import { RAZORPAY_COLLECTIONS_ACCOUNT_NAME } from "../src/lib/products/cashflow-ai/payments/payouts";
import { bookSettlement, daysBetween, listSettlementLines, listSettlements, syncSettlements, unsettledPayments } from "../src/lib/products/cashflow-ai/payments/settlements";
import { getTrialBalance } from "../src/lib/products/cashflow-ai/reports/trial-balance";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*). The Razorpay report is a stand-in; no network.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const settledAt = Math.floor(Date.UTC(2026, 9, 26, 6, 0, 0) / 1000);
const row = (id: string, amount: number, fee: number, tax: number, sid = "setl_A") => ({ entity_id: id, type: "payment", amount, fee, tax, credit: amount - fee - tax, debit: 0, settlement_id: sid, settlement_utr: `UTR_${sid}`, settled_at: settledAt, payment_id: id });

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_setl", async () => {
    const db = await getDb();
    await seedDefaultAccounts("u1");
    const hdfc = await createBankAccount({ accountName: "HDFC current", bankName: "HDFC", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 0, status: "active", notes: null }, "u1");
    const coll = await createBankAccount({ accountName: RAZORPAY_COLLECTIONS_ACCOUNT_NAME, bankName: "Razorpay", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 3000, status: "active", notes: null }, "u1");
    assert.ok(hdfc.ok && coll.ok);
    if (!hdfc.ok || !coll.ok) return;
    const now = new Date();
    for (const [i, id, amt] of [[1, "pay_1", 1000], [2, "pay_2", 500], [3, "pay_3", 1500]] as const) {
      await db.collection("fms_payment_intents").insertOne({ _id: `in${i}`, paymentNumber: `PAY-${i}`, gatewayPaymentId: id, customerName: "Acme", netAmount: amt, status: "SUCCESS", completedAt: new Date(Date.now() - 5 * 86400000), createdAt: now, updatedAt: now, deletedAt: null } as never);
    }
    const feed = (items: unknown[]) => async () => ({ ok: true as const, items });

    await t("the date range is limited and must be real", async () => {
      assert.equal(daysBetween("2026-10-01", "2026-10-31")!.length, 31);
      assert.equal(daysBetween("2026-10-01", "2026-11-05"), null);
      assert.equal(daysBetween("2026-10-05", "2026-10-01"), null);
      assert.equal(daysBetween("x", "2026-10-01"), null);
      assert.equal((await syncSettlements({ from: "2026-10-05", to: "2026-10-01" }, actor, feed([]))).ok, false);
    });

    await t("a failure fetching from Razorpay is reported and stores nothing", async () => {
      const r = await syncSettlements({ from: "2026-10-26", to: "2026-10-26" }, actor, async () => ({ ok: false, error: "Razorpay is not connected." }));
      assert.equal(r.ok, false);
      assert.equal((await listSettlements()).length, 0);
    });

    await t("sync stores a settlement, matches the payments we know and flags the one we don't", async () => {
      const r = await syncSettlements({ from: "2026-10-26", to: "2026-10-26" }, actor, feed([row("pay_1", 100000, 2000, 360), row("pay_2", 50000, 1000, 180), row("pay_unknown", 10000, 200, 36)]));
      assert.ok(r.ok);
      const [s] = await listSettlements();
      assert.equal(s.settlementId, "setl_A");
      assert.equal(s.unmatchedPayments, 1);
      assert.equal(s.status, "review", "an unidentified receipt holds the settlement for a person");
      assert.ok(s.reviewReasons.some((x) => x.includes("not in your records")));
      assert.equal((await listSettlementLines("setl_A")).filter((l) => l.matchedIntentId).length, 2);
    });

    await t("syncing again changes nothing and does not duplicate lines", async () => {
      await syncSettlements({ from: "2026-10-26", to: "2026-10-26" }, actor, feed([row("pay_1", 100000, 2000, 360), row("pay_2", 50000, 1000, 180), row("pay_unknown", 10000, 200, 36)]));
      assert.equal((await listSettlements()).length, 1);
      assert.equal((await listSettlementLines("setl_A")).length, 3);
    });

    await t("a settlement held for review cannot be booked", async () => {
      const [s] = await listSettlements();
      const r = await bookSettlement(s._id, hdfc.account._id, actor);
      assert.equal(r.ok, false);
    });

    await t("a clean settlement books the fee, the GST on the fee and the net, and clears the collections account", async () => {
      const r = await syncSettlements({ from: "2026-10-26", to: "2026-10-26" }, actor, feed([row("pay_1", 100000, 2000, 360, "setl_B"), row("pay_2", 50000, 1000, 180, "setl_B")]));
      assert.ok(r.ok);
      const s = (await listSettlements()).find((x) => x.settlementId === "setl_B")!;
      assert.equal(s.status, "ready");
      assert.equal(s.net, 1464.6);
      assert.equal((await bookSettlement(s._id, "nope", actor)).ok, false, "unknown bank account");
      assert.equal((await bookSettlement(s._id, coll.account._id, actor)).ok, false, "not into the collections account itself");
      assert.equal((await listSettlements()).find((x) => x._id === s._id)!.status, "ready", "a refused booking leaves it ready");

      const res = await bookSettlement(s._id, hdfc.account._id, actor);
      assert.ok(res.ok, res.ok ? "" : res.error);
      assert.equal((await getBankAccount(hdfc.account._id))!.currentBalance, 1464.6, "the net reached the bank");
      assert.equal((await getBankAccount(coll.account._id))!.currentBalance, 3000 - 1500, "collections cleared by gross less nothing else: fee, GST and net");
      const tb = await getTrialBalance();
      assert.ok(tb.balanced, "the books still balance");
      const row5600 = tb.rows.find((x) => x.accountCode === "5600")!;
      const row1500 = tb.rows.find((x) => x.accountCode === "1500")!;
      assert.equal(row5600.totalDebit, 30);
      assert.equal(row1500.totalDebit, 5.4);
      const after = (await listSettlements()).find((x) => x._id === s._id)!;
      assert.equal(after.status, "booked");
      assert.ok(after.transferId);
    });

    await t("booking twice, even at the same moment, books once", async () => {
      await syncSettlements({ from: "2026-10-26", to: "2026-10-26" }, actor, feed([row("pay_3", 150000, 3000, 540, "setl_C")]));
      const s = (await listSettlements()).find((x) => x.settlementId === "setl_C")!;
      const results = await Promise.all([1, 2, 3].map(() => bookSettlement(s._id, hdfc.account._id, actor)));
      assert.equal(results.filter((r) => r.ok).length, 1);
      assert.equal((await getBankAccount(hdfc.account._id))!.currentBalance, 2929.2, "the second settlement arrived once, not three times");
      assert.equal((await getBankAccount(coll.account._id))!.currentBalance, 0, "everything collected has now been settled");
    });

    await t("a booked settlement is not changed by a later sync", async () => {
      const before = (await listSettlements()).find((x) => x.settlementId === "setl_B")!;
      await syncSettlements({ from: "2026-10-26", to: "2026-10-26" }, actor, feed([row("pay_1", 999999, 0, 0, "setl_B")]));
      const after = (await listSettlements()).find((x) => x.settlementId === "setl_B")!;
      assert.equal(after.net, before.net);
      assert.equal(after.status, "booked");
    });

    await t("payments in a settlement are no longer 'waiting'", async () => {
      const w = await unsettledPayments();
      assert.deepEqual(w.list.map((x) => x.gatewayPaymentId), []);
    });

    await t("a payment the customer made that no settlement has covered shows as waiting with its age", async () => {
      await db.collection("fms_payment_intents").insertOne({ _id: "in9", paymentNumber: "PAY-9", gatewayPaymentId: "pay_9", customerName: "Beta", netAmount: 250, status: "SUCCESS", completedAt: new Date(Date.now() - 3 * 86400000), createdAt: now, updatedAt: now, deletedAt: null } as never);
      const w = await unsettledPayments();
      assert.equal(w.list.length, 1);
      assert.equal(w.total, 250);
      assert.equal(w.list[0].ageDays, 3);
    });
  });

  console.log("settlement flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
