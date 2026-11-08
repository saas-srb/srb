import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { seedDefaultAccounts, getAccountByCode } from "../src/lib/products/cashflow-ai/accounts";
import { createBankAccount, getBankAccount } from "../src/lib/products/cashflow-ai/bank-accounts";
import { createFiscalPeriod, closePeriod } from "../src/lib/products/cashflow-ai/fiscal-periods";
import { getTrialBalance } from "../src/lib/products/cashflow-ai/reports/trial-balance";
import { activateAccrual, istToday } from "../src/lib/products/cashflow-ai/accrual/engine";
import { depositPosition, deductedByMonth, financialYearOf } from "../src/lib/products/cashflow-ai/tds/core";
import { loadDeductions } from "../src/lib/products/cashflow-ai/tds/store";
import { cancelChallan, countedChallans, createChallan, listChallans, type ChallanInput } from "../src/lib/products/cashflow-ai/tds/challans-store";

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

  await runAsCompany("co_challan_a", async () => {
    const db = await getDb();
    const now = new Date();
    await seedDefaultAccounts("u1");
    const made = await createBankAccount({ accountName: "HDFC current", bankName: "HDFC", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 10000, status: "active", notes: null }, "u1");
    assert.ok(made.ok);
    if (!made.ok) return;
    const bank = made.account._id;
    const bankBal = async () => (await getBankAccount(bank))!.currentBalance;
    const input = (o: Partial<ChallanInput> = {}): ChallanInput => ({ forMonth: today.slice(0, 7), amount: 100, paidOn: today, bsrCode: "0510308", serial: "00001", bankAccountId: bank, ...o });

    // a vendor bill with TDS on it in the current month
    await db.collection("prms_invoices").insertOne({ _id: "b1", invoiceNumber: "BILL-1", vendorId: "v1", vendorName: "Beta", invoiceDate: today, subtotal: 3000, gstAmount: 0, tdsRate: 10, tdsAmount: 300, tdsSection: "194J", status: "pending", createdAt: now, updatedAt: now, deletedAt: null } as never);

    await t("bad input is refused and nothing is saved", async () => {
      for (const bad of [input({ bsrCode: "12" }), input({ serial: "abc" }), input({ amount: 0 }), input({ forMonth: "2026-13" }), input({ paidOn: daysAgo(-3) }), input({ bankAccountId: "nope" }), input({ section: "no way!" })]) {
        assert.equal((await createChallan(bad, actor)).ok, false);
      }
      assert.equal((await listChallans(fy)).length, 0);
    });

    await t("accrual off: the challan is recorded only and the bank is untouched", async () => {
      const r = await createChallan(input({ amount: 100, serial: "00001", paidOn: daysAgo(2) }), actor);
      assert.ok(r.ok && !r.ledgerPosted);
      assert.equal(await bankBal(), 10000);
      assert.equal((await listChallans(fy))[0].ledgerTransactionId, null);
      assert.ok((await cancelChallan((r as { id: string }).id, "entered by mistake", actor)).ok);
      assert.equal(await bankBal(), 10000);
    });

    await t("a cancelled challan can be entered again, a live one cannot be entered twice", async () => {
      assert.ok((await createChallan(input({ amount: 100, serial: "00001", paidOn: daysAgo(2) }), actor)).ok);
      const dup = await createChallan(input({ amount: 100, serial: "00001", paidOn: daysAgo(2) }), actor);
      assert.ok(!dup.ok && /already recorded/.test(dup.error));
      assert.equal((await createChallan(input({ amount: 100, serial: "00001", paidOn: daysAgo(1) }), actor)).ok, true, "same serial on another date is another challan");
    });

    await t("accrual on: Dr TDS payable / Cr bank, the books balance, the bank drops", async () => {
      const revenue = (await getAccountByCode("4000"))!;
      const expense = (await getAccountByCode("5900"))!;
      assert.ok((await activateAccrual({ revenueAccountId: revenue._id, expenseAccountId: expense._id }, actor)).ok);
      const bankBefore = await bankBal();
      const payableBefore = await net("2220");
      const r = await createChallan(input({ amount: 150, serial: "00002", section: "194j" }), actor);
      assert.ok(r.ok && r.ledgerPosted);
      assert.equal(await bankBal(), bankBefore - 150);
      assert.equal(await net("2220"), payableBefore + 150, "TDS payable is debited");
      assert.ok((await getTrialBalance()).balanced);
      const row = (await listChallans(fy)).find((c) => c.serial === "00002")!;
      assert.ok(row.ledgerTransactionId);
      assert.equal(row.section, "194J");
      assert.equal(row.status, "deposited");
    });

    await t("a date inside a closed fiscal period is refused and nothing is saved", async () => {
      const d = daysAgo(40);
      const p = await createFiscalPeriod({ name: "Closed test", startDate: new Date(`${d}T00:00:00`), endDate: new Date(`${d}T23:59:59`) }, "u1");
      assert.ok(p.ok);
      if (!p.ok) return;
      assert.ok((await closePeriod(p.period._id, "u1", null)).ok);
      const before = (await listChallans(fy)).length;
      const bankBefore = await bankBal();
      const r = await createChallan(input({ serial: "00009", paidOn: d, forMonth: d.slice(0, 7) }), actor);
      assert.ok(!r.ok && /closed fiscal period/.test(r.error));
      assert.equal(await db.collection("fms_tds_challans").countDocuments({ serial: "00009" }), 0, "not even a held row is left behind");
      assert.equal((await listChallans(fy)).length, before);
      assert.equal(await bankBal(), bankBefore);
    });

    await t("cancelling reverses the ledger entry", async () => {
      const row = (await listChallans(fy)).find((c) => c.serial === "00002")!;
      const bankBefore = await bankBal();
      const payableBefore = await net("2220");
      assert.equal((await cancelChallan(row._id, "", actor)).ok, false, "a reason is needed");
      assert.ok((await cancelChallan(row._id, "wrong bank", actor)).ok);
      assert.equal(await bankBal(), bankBefore + 150);
      assert.equal(await net("2220"), payableBefore - 150);
      assert.ok((await getTrialBalance()).balanced);
      assert.equal((await cancelChallan(row._id, "again", actor)).ok, false, "only once");
      assert.equal(await bankBal(), bankBefore + 150);
    });

    await t("the deposit position compares deducted with deposited (cancelled ones do not count)", async () => {
      const rows = await listChallans(fy);
      const pos = depositPosition(deductedByMonth((await loadDeductions(fy)).all), countedChallans(rows));
      const cur = pos.find((p) => p.month === today.slice(0, 7))!;
      assert.equal(cur.deducted, 300);
      assert.equal(cur.deposited, 200, "two live 100 challans; the 150 and the first 100 are cancelled");
      assert.equal(cur.difference, 100);
      await createChallan(input({ amount: 150, serial: "00003" }), actor);
      const again = depositPosition(deductedByMonth((await loadDeductions(fy)).all), countedChallans(await listChallans(fy)));
      assert.equal(again.find((p) => p.month === today.slice(0, 7))!.difference, -50, "deposited more than deducted");
    });

    await t("two identical submissions at once make one challan and one ledger entry", async () => {
      const bankBefore = await bankBal();
      const txnsBefore = await db.collection("fms_transactions").countDocuments({ sourceModule: "fms", referenceNumber: "BSR 0510308 / 00077" });
      const rs = await Promise.all([1, 2, 3].map(() => createChallan(input({ amount: 40, serial: "00077" }), actor)));
      assert.equal(rs.filter((r) => r.ok).length, 1);
      assert.equal((await listChallans(fy)).filter((c) => c.serial === "00077").length, 1);
      assert.equal(await db.collection("fms_transactions").countDocuments({ referenceNumber: "BSR 0510308 / 00077" }), txnsBefore + 1);
      assert.equal(await bankBal(), bankBefore - 40);
    });

    await t("a challan left half-made by a stopped server is settled: completed from its ledger entry, or released", async () => {
      const old = new Date(Date.now() - 10 * 60_000);
      const base = { forMonth: today.slice(0, 7), amount: 11, paidOn: today, bsrCode: "0510308", cin: null, note: null, section: null, bankAccountId: "x", bankAccountLabel: "x", status: "posting", live: true, ledgerTransactionId: null, cancelledAt: null, cancelReason: null, createdAt: old, updatedAt: old, createdBy: "u1", updatedBy: "u1", deletedAt: null };
      await db.collection("fms_tds_challans").insertMany([{ _id: "stale_no_txn", serial: "90001", ...base }, { _id: "stale_with_txn", serial: "90002", ...base }] as never);
      await db.collection("fms_transactions").insertOne({ _id: "t_stale", sourceRecordId: "stale_with_txn", sourceModule: "fms", status: "completed", deletedAt: null } as never);
      const list = await listChallans(fy);
      assert.equal(list.some((c) => c._id === "stale_no_txn"), false);
      assert.equal(await db.collection("fms_tds_challans").countDocuments({ _id: "stale_no_txn" as never }), 0, "the hold is released so the challan can be entered again");
      const done = list.find((c) => c._id === "stale_with_txn");
      assert.ok(done && done.status === "deposited" && done.ledgerTransactionId === "t_stale");
      // a young hold (a request still in progress) is left alone
      await db.collection("fms_tds_challans").insertOne({ _id: "young", serial: "90003", ...base, createdAt: new Date(), updatedAt: new Date() } as never);
      await listChallans(fy);
      assert.equal(await db.collection("fms_tds_challans").countDocuments({ _id: "young" as never }), 1);
    });
  });

  await t("another company sees none of this", async () => {
    await runAsCompany("co_challan_b", async () => {
      assert.equal((await listChallans(fy)).length, 0);
      assert.equal((await createChallan({ forMonth: today.slice(0, 7), amount: 10, paidOn: today, bsrCode: "0510308", serial: "00001", bankAccountId: "nope" }, actor)).ok, false);
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log("tds challans tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
