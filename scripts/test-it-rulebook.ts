import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { seedDefaultAccounts, getAccountByCode } from "../src/lib/products/cashflow-ai/accounts";
import { createBankAccount } from "../src/lib/products/cashflow-ai/bank-accounts";
import { postSystemTransaction } from "../src/lib/products/cashflow-ai/transactions";
import { postProvision, provisionState } from "../src/lib/products/cashflow-ai/income-tax/provision";
import { addAdjustment, loadYearComputation, saveRates, setRegime } from "../src/lib/products/cashflow-ai/income-tax/store";
import { effectiveSchedule, saveSchedule } from "../src/lib/products/cashflow-ai/income-tax/payments-store";
import { loadRulebook, saveRulebook } from "../src/lib/products/cashflow-ai/rulebook/rules-store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const admin = { id: "admin1", email: "admin@example.com" };
const FY = "2026-27";

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_itrb_a", async () => {
    const db = await getDb();
    await seedDefaultAccounts("u1");
    const bank = await createBankAccount({ accountName: "B", bankName: "B", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 0, status: "active", notes: null }, "u1");
    assert.ok(bank.ok);
    if (!bank.ok) return;
    const rev = (await getAccountByCode("4000"))!, exp = (await getAccountByCode("5900"))!;
    const d = new Date("2026-08-10T00:00:00");
    const post = (type: "income" | "expense", amount: number, accountId: string) => postSystemTransaction({ type, transactionDate: d, postingDate: d, amount, currency: "INR", paymentMethod: "bank_transfer", sourceModule: "fms", sourceRecordId: null, customerId: null, vendorId: null, employeeId: null, projectId: null, department: null, accountId, fundAccountId: bank.account._id, fundAccountType: "bank", taxAmount: 0, referenceNumber: null, description: null, attachments: [] }, "u1", null);
    await post("income", 1000000, rev._id);
    await post("expense", 400000, exp._id); // book profit 600,000

    await t("no basis chosen and no old rates: nothing is picked for the company", async () => {
      const c = await loadYearComputation(FY);
      assert.equal(c.ratesFrom, "none");
      assert.equal(c.regime, null);
      assert.equal(c.result.normal, null);
      assert.ok(c.result.notes.includes("rates_not_entered"));
      assert.ok(c.regimes.length >= 2);
    });

    await t("a basis is validated against the year's rulebook, then stored", async () => {
      assert.equal((await setRegime(FY, "no-such-basis", actor)).ok, false);
      assert.equal((await setRegime("2026-28", "normal-30", actor)).ok, false);
      assert.ok((await setRegime(FY, "normal-30", actor)).ok);
    });

    await t("rates come from the chosen basis; MAT follows from the basis; an unchecked rulebook is flagged", async () => {
      const c = await loadYearComputation(FY);
      assert.equal(c.ratesFrom, "rulebook");
      assert.equal(c.rates.baseRate, 30);
      assert.equal(c.rates.matApplicable, true);
      assert.equal(c.rates.confirmed, false);
      assert.equal(c.rulebook.confirmed, false);
      assert.equal(c.rulebook.origin, "built-in");
      assert.equal(c.result.normal!.tax, 180000);
      assert.equal(c.result.normal!.surcharge, 0);
      assert.equal(c.result.normal!.cess, 7200);
      assert.equal(c.result.mat!.tax, 90000, "15% of book profit");
      assert.equal(c.result.taxForYear!.total, 187200, "normal tax is higher than MAT");
      assert.ok(c.result.notes.includes("rates_unconfirmed"));
    });

    await t("MAT higher than normal tax becomes the tax for the year", async () => {
      assert.ok((await addAdjustment(FY, { kind: "less", head: "Depreciation as per income-tax rules", amount: 500000, scope: "normal", basis: null }, actor)).ok);
      const c = await loadYearComputation(FY);
      assert.equal(c.result.normal!.total, 31200);
      assert.equal(c.result.taxForYear!.total, 93600);
      assert.equal(c.result.matExcess, 62400);
    });

    await t("a basis without MAT works no MAT, and a slab from 0 gives its surcharge", async () => {
      assert.ok((await setRegime(FY, "concessional-22", actor)).ok);
      const c = await loadYearComputation(FY);
      assert.equal(c.rates.matApplicable, false);
      assert.equal(c.result.mat, null);
      assert.equal(c.result.normal!.tax, 22000, "22% of the 100,000 left after the deduction");
      assert.equal(c.result.normal!.surcharge, 2200);
    });

    await t("tax cannot be posted to the books while the rulebook is unchecked", async () => {
      const r = await postProvision(FY, actor);
      assert.equal(r.ok, false);
      assert.equal((await provisionState(FY)).ratesConfirmed, false);
    });

    await t("when the platform confirms the year, every company's figures turn confirmed and the tax can be posted", async () => {
      const rb = await loadRulebook(FY);
      const { confirmed, confirmedAt, confirmedBy, origin, ...data } = rb;
      void confirmed; void confirmedAt; void confirmedBy; void origin;
      assert.ok((await saveRulebook(FY, data, true, admin)).ok);
      const c = await loadYearComputation(FY);
      assert.equal(c.rates.confirmed, true);
      assert.equal(c.rulebook.confirmed, true);
      assert.equal(c.rulebook.confirmedBy, admin.email);
      assert.equal(c.rulebook.origin, "published");
      assert.ok(!c.result.notes.includes("rates_unconfirmed"));
      const r = await postProvision(FY, actor);
      assert.ok(r.ok);
    });

    await t("a year with old typed rates and no basis keeps using them exactly as before", async () => {
      const now = new Date();
      await db.collection("fms_it_years").insertOne({ _id: "old1", fy: "2025-26", rates: { regimeLabel: "CA said", baseRate: 25, surchargeRate: 0, cessRate: 4, matRate: null, matApplicable: false, confirmed: true }, adjustments: [], setOffs: [], note: null, agreedWithCa: null, createdAt: now, updatedAt: now, deletedAt: null } as never);
      const c = await loadYearComputation("2025-26");
      assert.equal(c.ratesFrom, "company");
      assert.equal(c.rates.baseRate, 25);
      assert.equal(c.rates.confirmed, true);
      // choosing a basis moves the year onto the rulebook
      assert.ok((await setRegime("2025-26", "normal-30", actor)).ok);
      const c2 = await loadYearComputation("2025-26");
      assert.equal(c2.ratesFrom, "rulebook");
      assert.equal(c2.rates.baseRate, 30);
    });

    await t("the company's own rates win only when saved as an override, and choosing a basis ends the override", async () => {
      assert.ok((await saveRates(FY, { regimeLabel: "mine", baseRate: 20, surchargeRate: 0, cessRate: 0, matRate: null, matApplicable: false, confirmed: true }, actor)).ok);
      const o = await loadYearComputation(FY);
      assert.equal(o.ratesFrom, "override");
      assert.equal(o.rates.baseRate, 20);
      assert.equal(o.result.normal!.tax, 20000);
      assert.ok((await setRegime(FY, "normal-30", actor)).ok);
      const back = await loadYearComputation(FY);
      assert.equal(back.ratesFrom, "rulebook");
      assert.equal(back.rates.baseRate, 30);
    });

    await t("the advance-tax schedule is the rulebook's until the company saves its own", async () => {
      const a = await effectiveSchedule(FY);
      assert.equal(a.source, "rulebook");
      assert.deepEqual(a.instalments, (await loadRulebook(FY)).advanceTax);
      assert.equal(a.rulebook.confirmed, true);
      const own = [{ dueDate: "2026-06-20", cumulativePercent: 25 }, { dueDate: "2026-12-20", cumulativePercent: 100 }];
      assert.ok((await saveSchedule(FY, { instalments: own, confirmed: false }, actor)).ok);
      const b = await effectiveSchedule(FY);
      assert.equal(b.source, "company");
      assert.deepEqual(b.instalments, own);
      assert.ok((await saveSchedule(FY, { instalments: [], estimate: 1000, confirmed: false }, actor)).ok);
      assert.equal((await effectiveSchedule(FY)).source, "rulebook", "an emptied schedule falls back to the law's");
    });
  });

  await runAsCompany("co_itrb_b", async () => {
    await t("another company chose nothing", async () => {
      assert.equal((await loadYearComputation(FY)).ratesFrom, "none");
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log("income-tax rulebook tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
