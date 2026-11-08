import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { seedDefaultAccounts, getAccountByCode } from "../src/lib/products/cashflow-ai/accounts";
import { createBankAccount } from "../src/lib/products/cashflow-ai/bank-accounts";
import { postSystemTransaction } from "../src/lib/products/cashflow-ai/transactions";
import { createFiscalPeriod, closePeriod } from "../src/lib/products/cashflow-ai/fiscal-periods";
import { postProvision, provisionState, removeProvision } from "../src/lib/products/cashflow-ai/income-tax/provision";
import { getTrialBalance } from "../src/lib/products/cashflow-ai/reports/trial-balance";
import { addAdjustment, getYear, loadYearComputation, removeAdjustment, saveNote, saveRates, saveSetOffs } from "../src/lib/products/cashflow-ai/income-tax/store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const rates = { regimeLabel: "As told by CA", baseRate: 25, surchargeRate: 0, cessRate: 4, matRate: null, matApplicable: false, confirmed: true };

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_it_a", async () => {
    const db = await getDb();
    const now = new Date();
    await seedDefaultAccounts("u1");
    const bank = await createBankAccount({ accountName: "B", bankName: "B", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 0, status: "active", notes: null }, "u1");
    assert.ok(bank.ok);
    if (!bank.ok) return;
    const rev = (await getAccountByCode("4000"))!, exp = (await getAccountByCode("5900"))!;
    const d = new Date("2026-08-10T00:00:00");
    const post = (type: "income" | "expense", amount: number, accountId: string, date = d) => postSystemTransaction({ type, transactionDate: date, postingDate: date, amount, currency: "INR", paymentMethod: "bank_transfer", sourceModule: "fms", sourceRecordId: null, customerId: null, vendorId: null, employeeId: null, projectId: null, department: null, accountId, fundAccountId: bank.account._id, fundAccountType: "bank", taxAmount: 0, referenceNumber: null, description: null, attachments: [] }, "u1", null);
    await post("income", 1000000, rev._id);
    await post("expense", 400000, exp._id);
    await post("income", 5000, rev._id, new Date("2026-03-31T00:00:00")); // previous financial year

    await t("the book profit is the year's profit only, and with nothing entered no tax is invented", async () => {
      const c = await loadYearComputation("2026-27");
      assert.equal(c.book.profit, 600000);
      assert.equal(c.result.normal, null);
      assert.equal(c.result.balance, null);
      assert.ok(c.result.notes.includes("rates_not_entered"));
      assert.equal((await loadYearComputation("2025-26")).book.profit, 5000);
      await assert.rejects(() => loadYearComputation("2026-28"));
    });

    await t("rates are validated; confirming needs a rate; MAT needs its rate", async () => {
      assert.equal((await saveRates("2026-27", { ...rates, baseRate: 150 }, actor)).ok, false);
      assert.equal((await saveRates("2026-27", { ...rates, baseRate: null, confirmed: true }, actor)).ok, false);
      assert.equal((await saveRates("2026-27", { ...rates, matApplicable: true, matRate: null }, actor)).ok, false);
      assert.equal((await saveRates("2026-28", rates, actor)).ok, false);
      assert.ok((await saveRates("2026-27", rates, actor)).ok);
    });

    await t("adjustments are validated, added without overwriting each other, and removed", async () => {
      assert.equal((await addAdjustment("2026-27", { kind: "add", head: "x", amount: 0, scope: "both", basis: null }, actor)).ok, false);
      assert.equal((await addAdjustment("2026-27", { kind: "add", head: " ", amount: 5, scope: "both", basis: null }, actor)).ok, false);
      await Promise.all([1, 2, 3, 4].map((n) => addAdjustment("2026-27", { kind: "add", head: `Penalty ${n}`, amount: 1000, scope: "both", basis: "CA workings" }, actor)));
      assert.equal((await getYear("2026-27"))!.adjustments.length, 4, "four people adding at once keep all four lines");
      assert.ok((await addAdjustment("2026-27", { kind: "less", head: "Depreciation as per income-tax rules", amount: 54000, scope: "normal", basis: null }, actor)).ok);
      const y = (await getYear("2026-27"))!;
      assert.ok((await removeAdjustment("2026-27", y.adjustments[0].id, actor)).ok);
      assert.equal((await removeAdjustment("2026-27", y.adjustments[0].id, actor)).ok, false, "removing twice");
      assert.equal((await getYear("2026-27"))!.adjustments.length, 4);
    });

    await t("a year with an adjustment before any rate was saved still works (first write creates the year)", async () => {
      assert.ok((await addAdjustment("2027-28", { kind: "add", head: "Other addition", amount: 10, scope: "both", basis: null }, actor)).ok);
      assert.equal((await getYear("2027-28"))!.adjustments.length, 1);
      assert.equal((await getYear("2027-28"))!.rates.baseRate, null);
      await Promise.all([1, 2, 3].map((n) => addAdjustment("2028-29", { kind: "add", head: `First ${n}`, amount: 5, scope: "both", basis: null }, actor)));
      assert.equal((await getYear("2028-29"))!.adjustments.length, 3, "three first writes at once keep all three");
    });

    await t("losses are set off as chosen; payments and customers' TDS reduce the balance", async () => {
      await db.collection("fms_it_losses").insertOne({ _id: "loss1", fy: "2024-25", kind: "business", amount: 100000, available: 100000, validUntilFy: null, createdAt: now, updatedAt: now, deletedAt: null } as never);
      assert.equal((await saveSetOffs("2026-27", [{ lossId: "loss1", amount: -5 }], actor)).ok, false);
      assert.ok((await saveSetOffs("2026-27", [{ lossId: "loss1", amount: 100000 }], actor)).ok);
      await db.collection("fms_it_payments").insertMany([
        { _id: "p1", fy: "2026-27", kind: "advance", amount: 20000, status: "paid", deletedAt: null },
        { _id: "p2", fy: "2026-27", kind: "advance", amount: 9999, status: "cancelled", deletedAt: null },
        { _id: "p3", fy: "2026-27", kind: "self_assessment", amount: 1000, status: "paid", deletedAt: null },
        { _id: "p4", fy: "2025-26", kind: "advance", amount: 7777, status: "paid", deletedAt: null },
      ] as never);
      await db.collection("fms_receipts").insertMany([
        { _id: "r1", status: "completed", tdsDeducted: 5000, receiptDate: new Date("2026-09-05T00:00:00"), deletedAt: null },
        { _id: "r2", status: "voided", tdsDeducted: 999, receiptDate: new Date("2026-09-06T00:00:00"), deletedAt: null },
        { _id: "r3", status: "completed", tdsDeducted: 300, receiptDate: new Date("2027-03-30T00:00:00"), clearedAt: new Date("2027-04-02T00:00:00"), deletedAt: null }, // cheque cleared next year
      ] as never);
      const c = await loadYearComputation("2026-27");
      // 600,000 + 3,000 added − 54,000 deducted = 549,000; less 100,000 loss = 449,000
      assert.equal(c.result.incomeBeforeLosses, 549000);
      assert.equal(c.result.taxableIncome, 449000);
      assert.deepEqual(c.result.normal, { tax: 112250, surcharge: 0, cess: 4490, total: 116740 });
      assert.deepEqual(c.credits, { advanceTax: 20000, selfAssessment: 1000, regularAssessment: 0, tdsCredit: 5000 });
      assert.equal(c.result.balance, 116740 - 26000);
    });

    await t("a loss cannot be set off twice across years, nor before it arose, nor after its last usable year", async () => {
      await db.collection("fms_it_losses").insertMany([
        { _id: "L_a", fy: "2024-25", kind: "business", amount: 100000, available: 100000, validUntilFy: null, createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "L_b", fy: "2027-28", kind: "business", amount: 50000, available: 50000, validUntilFy: null, createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "L_c", fy: "2020-21", kind: "business", amount: 50000, available: 50000, validUntilFy: "2025-26", createdAt: now, updatedAt: now, deletedAt: null },
      ] as never);
      assert.ok((await saveRates("2027-28", rates, actor)).ok);
      assert.ok((await saveSetOffs("2027-28", [{ lossId: "loss1", amount: 100000 }, { lossId: "L_a", amount: 60000 }, { lossId: "L_b", amount: 10 }, { lossId: "L_c", amount: 10 }], actor)).ok);
      const next = await loadYearComputation("2027-28");
      const avail = new Map(next.losses.map((l) => [l.id, l.available]));
      assert.equal(avail.get("loss1"), 0, "the 100,000 loss was set off in 2026-27 already");
      assert.equal(avail.get("L_a"), 100000, "an untouched earlier loss is fully available");
      assert.equal(avail.get("L_c"), 0, "past its last usable year");
      const early = await loadYearComputation("2026-27");
      assert.equal(new Map(early.losses.map((l) => [l.id, l.available])).get("L_b"), 0, "a loss of a later year is not available to an earlier one");
      assert.ok(next.result.notes.includes("set_off_more_than_available"));
      assert.equal(next.result.setOffUsed.find((s) => s.lossId === "loss1"), undefined);
    });

    await t("the note and who agreed it are saved", async () => {
      assert.ok((await saveNote("2026-27", "  working agreed  ", " CA Mehta, 12 Oct ", actor)).ok);
      const y = (await getYear("2026-27"))!;
      assert.equal(y.note, "working agreed");
      assert.equal(y.agreedWithCa, "CA Mehta, 12 Oct");
    });

    await t("the tax is put into the books as a provision, re-posted in place when the working changes, and does not change the profit the tax starts from", async () => {
      const profit = (await loadYearComputation("2026-27")).book.profit;
      assert.equal((await postProvision("2026-28", actor)).ok, false);
      assert.equal((await postProvision("2026-27", actor)).ok, true);
      const posted = await provisionState("2026-27");
      assert.equal(posted.posted, 116740);
      assert.equal(posted.computed, 116740);
      const tb = await getTrialBalance();
      assert.ok(tb.balanced);
      assert.equal(tb.rows.find((r) => r.accountCode === "5950")!.totalDebit, 116740);
      assert.equal(tb.rows.find((r) => r.accountCode === "2230")!.totalCredit, 116740);
      assert.equal((await loadYearComputation("2026-27")).book.profit, profit, "profit before tax is the same with the provision posted");
      assert.equal((await loadYearComputation("2026-27")).result.balance, 116740 - 26000, "and so is the tax");
      await addAdjustment("2026-27", { kind: "add", head: "Other addition", amount: 100000, scope: "both", basis: null }, actor);
      assert.equal((await provisionState("2026-27")).posted, 116740, "nothing changes in the books until it is posted again");
      assert.ok((await postProvision("2026-27", actor)).ok);
      const after = await provisionState("2026-27");
      assert.equal(after.posted, after.computed);
      assert.ok((await getTrialBalance()).balanced);
      assert.ok((await removeProvision("2026-27", actor)).ok);
      assert.equal((await provisionState("2026-27")).posted, 0);
      assert.ok((await getTrialBalance()).balanced);
      const live = await db.collection("fms_journal_entries").countDocuments({ sourceType: "income_tax_provision", docKey: { $type: "string" } });
      assert.equal(live, 0);
    });

    await t("rates that are not confirmed cannot be posted", async () => {
      assert.ok((await saveRates("2026-27", { ...rates, confirmed: false }, actor)).ok);
      assert.equal((await postProvision("2026-27", actor)).ok, false);
      assert.ok((await saveRates("2026-27", rates, actor)).ok);
    });

    await t("closing the period does not change the year's profit", async () => {
      const before = (await loadYearComputation("2026-27")).book.profit;
      const p = await createFiscalPeriod({ name: "FY 2026-27", startDate: new Date("2026-04-01T00:00:00"), endDate: new Date("2027-03-31T23:59:59") }, "u1");
      assert.ok(p.ok);
      if (!p.ok) return;
      assert.ok((await closePeriod(p.period._id, "u1", null)).ok);
      assert.equal((await loadYearComputation("2026-27")).book.profit, before);
    });
  });

  await t("another company sees none of this", async () => {
    await runAsCompany("co_it_b", async () => {
      assert.equal(await getYear("2026-27"), null);
      assert.equal((await loadYearComputation("2026-27")).book.profit, 0);
    });
  });

  console.log("income-tax store tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
