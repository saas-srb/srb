import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { seedDefaultAccounts, getAccountByCode } from "../src/lib/products/cashflow-ai/accounts";
import { createBankAccount, getBankAccount } from "../src/lib/products/cashflow-ai/bank-accounts";
import { createFiscalPeriod, closePeriod } from "../src/lib/products/cashflow-ai/fiscal-periods";
import { getTrialBalance } from "../src/lib/products/cashflow-ai/reports/trial-balance";
import { activateAccrual, istToday } from "../src/lib/products/cashflow-ai/accrual/engine";
import { financialYearOf } from "../src/lib/products/cashflow-ai/tds/core";
import { cancelPayment, createPayment, getSchedule, listPayments, saveSchedule, taxPaidForYear, type ItPaymentInput } from "../src/lib/products/cashflow-ai/income-tax/payments-store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const today = istToday();
const fy = financialYearOf(today);
const daysAgo = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);

async function net(code: string) {
  const r = (await getTrialBalance()).rows.find((x) => x.accountCode === code);
  return Math.round(((r?.totalDebit ?? 0) - (r?.totalCredit ?? 0)) * 100) / 100;
}

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_itpay_a", async () => {
    const db = await getDb();
    await seedDefaultAccounts("u1");
    const made = await createBankAccount({ accountName: "HDFC current", bankName: "HDFC", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 10000, status: "active", notes: null }, "u1");
    assert.ok(made.ok);
    if (!made.ok) return;
    const bank = made.account._id;
    const bankBal = async () => (await getBankAccount(bank))!.currentBalance;
    const input = (o: Partial<ItPaymentInput> = {}): ItPaymentInput => ({ fy, kind: "advance", amount: 100, paidOn: daysAgo(2), bsrCode: "0510308", serial: "00001", bankAccountId: bank, ...o });

    await t("bad input is refused and nothing is saved", async () => {
      for (const bad of [input({ bsrCode: "12" }), input({ serial: "abc" }), input({ amount: 0 }), input({ fy: "2026-28" }), input({ paidOn: daysAgo(-3) }), input({ bankAccountId: "nope" }), input({ kind: "x" as never })]) {
        assert.equal((await createPayment(bad, actor)).ok, false);
      }
      assert.equal((await listPayments(fy)).length, 0);
    });

    await t("accrual off: recorded only, the bank is untouched", async () => {
      const r = await createPayment(input(), actor);
      assert.ok(r.ok && !r.ledgerPosted);
      assert.equal(await bankBal(), 10000);
      assert.equal((await listPayments(fy))[0].ledgerTransactionId, null);
    });

    await t("a live duplicate is refused; the same serial on another date is another payment", async () => {
      const dup = await createPayment(input(), actor);
      assert.ok(!dup.ok && /already recorded/.test(dup.error));
      assert.ok((await createPayment(input({ paidOn: daysAgo(1) }), actor)).ok);
      assert.equal((await listPayments(fy)).length, 2);
    });

    await t("accrual on: Dr Advance tax paid / Cr bank, the books balance", async () => {
      assert.ok((await activateAccrual({ revenueAccountId: (await getAccountByCode("4000"))!._id, expenseAccountId: (await getAccountByCode("5900"))!._id }, actor)).ok);
      const bankBefore = await bankBal();
      const before = await net("1520");
      const r = await createPayment(input({ amount: 150, serial: "00002", kind: "self_assessment" }), actor);
      assert.ok(r.ok && r.ledgerPosted);
      assert.equal(await bankBal(), bankBefore - 150);
      assert.equal(await net("1520"), before + 150, "Advance tax paid is debited");
      assert.ok((await getTrialBalance()).balanced);
      assert.ok((await listPayments(fy)).find((p) => p.serial === "00002")!.ledgerTransactionId);
    });

    await t("a closed fiscal period refuses and saves nothing", async () => {
      const d = daysAgo(40);
      const p = await createFiscalPeriod({ name: "Closed test", startDate: new Date(`${d}T00:00:00`), endDate: new Date(`${d}T23:59:59`) }, "u1");
      assert.ok(p.ok);
      if (!p.ok) return;
      assert.ok((await closePeriod(p.period._id, "u1", null)).ok);
      const bankBefore = await bankBal();
      const r = await createPayment(input({ serial: "00009", paidOn: d, fy: financialYearOf(d) }), actor);
      assert.ok(!r.ok && /closed fiscal period/.test(r.error));
      assert.equal(await db.collection("fms_it_payments").countDocuments({ serial: "00009" }), 0);
      assert.equal(await bankBal(), bankBefore);
    });

    await t("taxPaidForYear sums only paid payments, by kind", async () => {
      await createPayment(input({ amount: 25, serial: "00003", kind: "regular_assessment" }), actor);
      const x = await createPayment(input({ amount: 999, serial: "00004" }), actor);
      assert.ok(x.ok);
      assert.deepEqual(await taxPaidForYear(fy), { advance: 100 + 100 + 999, selfAssessment: 150, regular: 25, total: 1374 });
    });

    await t("cancelling reverses the ledger entry, once, and drops out of the total", async () => {
      const row = (await listPayments(fy)).find((p) => p.serial === "00002")!;
      const bankBefore = await bankBal();
      const before = await net("1520");
      assert.equal((await cancelPayment(row._id, "", actor)).ok, false, "a reason is needed");
      assert.ok((await cancelPayment(row._id, "wrong bank", actor)).ok);
      assert.equal(await bankBal(), bankBefore + 150);
      assert.equal(await net("1520"), before - 150);
      assert.ok((await getTrialBalance()).balanced);
      assert.equal((await cancelPayment(row._id, "again", actor)).ok, false);
      assert.equal(await bankBal(), bankBefore + 150);
      assert.equal((await taxPaidForYear(fy)).selfAssessment, 0);
      assert.ok((await createPayment(input({ amount: 150, serial: "00002", kind: "self_assessment" }), actor)).ok, "a cancelled payment can be entered again");
    });

    await t("a stale 'posting' hold is healed: completed from its ledger entry, or released", async () => {
      const old = new Date(Date.now() - 10 * 60_000);
      const base = { fy, kind: "advance", amount: 11, paidOn: today, bsrCode: "0510308", bankAccountId: "x", bankAccountLabel: "x", note: null, status: "posting", live: true, ledgerTransactionId: null, cancelledAt: null, cancelReason: null, createdAt: old, updatedAt: old, createdBy: "u1", updatedBy: "u1", deletedAt: null };
      await db.collection("fms_it_payments").insertMany([{ _id: "stale_no_txn", serial: "90001", ...base }, { _id: "stale_with_txn", serial: "90002", ...base }] as never);
      await db.collection("fms_transactions").insertOne({ _id: "t_stale", sourceRecordId: "stale_with_txn", sourceModule: "fms", status: "completed", deletedAt: null } as never);
      const before = (await taxPaidForYear(fy)).advance;
      assert.equal(before, 100 + 100 + 999 + 11, "the completed one now counts");
      assert.equal(await db.collection("fms_it_payments").countDocuments({ _id: "stale_no_txn" as never }), 0);
      const row = (await listPayments(fy)).find((p) => p._id === ("stale_with_txn" as never));
      assert.ok(row && row.status === "paid" && row.ledgerTransactionId === "t_stale");
      await db.collection("fms_it_payments").insertOne({ _id: "young", serial: "90003", ...base, createdAt: new Date(), updatedAt: new Date() } as never);
      await listPayments(fy);
      assert.equal(await db.collection("fms_it_payments").countDocuments({ _id: "young" as never }), 1, "a young hold is left alone");
      assert.equal((await taxPaidForYear(fy)).advance, before, "a held payment is never counted");
    });

    await t("two identical submissions at once make one payment and one ledger entry", async () => {
      const bankBefore = await bankBal();
      const rs = await Promise.all([1, 2, 3].map(() => createPayment(input({ amount: 40, serial: "00077" }), actor)));
      assert.equal(rs.filter((r) => r.ok).length, 1);
      assert.equal(await db.collection("fms_it_payments").countDocuments({ serial: "00077" }), 1);
      assert.equal(await db.collection("fms_transactions").countDocuments({ referenceNumber: "BSR 0510308 / 00077" }), 1);
      assert.equal(await bankBal(), bankBefore - 40);
    });

    await t("the schedule is validated, saved as typed, and one per year", async () => {
      assert.equal(await getSchedule(fy), null);
      const sched = [{ dueDate: "2026-06-15", cumulativePercent: 20 }, { dueDate: "2026-09-15", cumulativePercent: 50 }];
      for (const bad of [[{ dueDate: "2026-06-31", cumulativePercent: 20 }], [{ dueDate: "2026-06-15", cumulativePercent: 50 }, { dueDate: "2026-09-15", cumulativePercent: 40 }], [{ dueDate: "2026-09-15", cumulativePercent: 20 }, { dueDate: "2026-06-15", cumulativePercent: 40 }], [{ dueDate: "2026-06-15", cumulativePercent: 0 }]]) {
        assert.equal((await saveSchedule(fy, { instalments: bad, confirmed: false }, actor)).ok, false);
      }
      assert.equal((await saveSchedule("2026-28", { instalments: sched, confirmed: false }, actor)).ok, false);
      assert.equal(await getSchedule(fy), null, "nothing saved by the bad ones");
      assert.ok((await saveSchedule(fy, { instalments: sched, note: "per CA", estimate: 5000, confirmed: true }, actor)).ok);
      const s1 = (await getSchedule(fy))!;
      assert.deepEqual(s1.instalments, sched);
      assert.ok(s1.confirmed && s1.confirmedBy === "u1" && s1.confirmedAt && s1.estimate === 5000);
      assert.ok((await saveSchedule(fy, { instalments: [sched[0]], estimate: null, confirmed: false }, actor)).ok);
      const s2 = (await getSchedule(fy))!;
      assert.equal(s2._id, s1._id);
      assert.equal(s2.instalments.length, 1);
      assert.ok(!s2.confirmed && s2.confirmedBy === null && s2.estimate === null);
      await Promise.all([1, 2, 3].map(() => saveSchedule("2025-26", { instalments: sched, confirmed: false }, actor)));
      assert.equal(await db.collection("fms_it_schedules").countDocuments({ fy: "2025-26" }), 1);
    });
  });

  await t("another company sees none of this", async () => {
    await runAsCompany("co_itpay_b", async () => {
      assert.equal((await listPayments(fy)).length, 0);
      assert.equal((await taxPaidForYear(fy)).total, 0);
      assert.equal(await getSchedule(fy), null);
      assert.equal((await createPayment({ fy, kind: "advance", amount: 10, paidOn: today, bsrCode: "0510308", serial: "00001", bankAccountId: "nope" }, actor)).ok, false);
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log("income-tax payments tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
