import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { seedDefaultAccounts, getAccountByCode } from "../src/lib/products/cashflow-ai/accounts";
import { createBankAccount } from "../src/lib/products/cashflow-ai/bank-accounts";
import { createInvoice, setInvoiceStatus, updateInvoice, deleteInvoice, getInvoice } from "../src/lib/products/cashflow-ai/invoices";
import { recordReceipt, voidReceipt } from "../src/lib/products/cashflow-ai/receipts";
import { createCreditNote, issueCreditNote, cancelCreditNote } from "../src/lib/products/cashflow-ai/credit-notes";
import { createDebitNote, issueDebitNote } from "../src/lib/products/cashflow-ai/debit-notes";
import { createInvoice as createBill, setInvoiceStatus as setBillStatus, applyPaymentToInvoice, updateInvoice as updateBill } from "../src/lib/products/spendiq/invoices";
import { postSystemTransaction } from "../src/lib/products/cashflow-ai/transactions";
import { createFiscalPeriod, closePeriod, reopenPeriod } from "../src/lib/products/cashflow-ai/fiscal-periods";
import { getBalanceSheet } from "../src/lib/products/cashflow-ai/reports/balance-sheet";
import { getProfitAndLoss } from "../src/lib/products/cashflow-ai/reports/profit-and-loss";
import { getTrialBalance } from "../src/lib/products/cashflow-ai/reports/trial-balance";
import { activateAccrual, accrualTieOut, countMissingAccruals, postMissingAccruals, istToday } from "../src/lib/products/cashflow-ai/accrual/engine";
import { syncInvoiceAccrual } from "../src/lib/products/cashflow-ai/accrual/posting";
import { liveDocumentEntry, liveDocumentIds } from "../src/lib/products/cashflow-ai/journal";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const today = istToday();
const inA = <T>(fn: () => Promise<T>) => runAsCompany("co_accr_a", fn);
const inB = <T>(fn: () => Promise<T>) => runAsCompany("co_accr_b", fn);

async function balance(code: string): Promise<{ debit: number; credit: number; net: number }> {
  const tb = await getTrialBalance();
  const r = tb.rows.find((x) => x.accountCode === code);
  return { debit: r?.totalDebit ?? 0, credit: r?.totalCredit ?? 0, net: Math.round(((r?.totalDebit ?? 0) - (r?.totalCredit ?? 0)) * 100) / 100 };
}
async function balanced() {
  const tb = await getTrialBalance();
  assert.ok(tb.balanced, `trial balance out of balance: Dr ${tb.totalDebits} Cr ${tb.totalCredits}`);
}

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await inA(async () => {
    const db = await getDb();
    await seedDefaultAccounts("u1");
    const revenue = (await getAccountByCode("4000"))!;
    const expense = (await getAccountByCode("5900"))!;
    const bank = await createBankAccount({ accountName: "HDFC current", bankName: "HDFC", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 0, status: "active", notes: null }, "u1");
    assert.ok(bank.ok);
    if (!bank.ok) return;
    const fund = { fundAccountId: bank.account._id, fundAccountType: "bank" as const };
    const item = (price: number, taxRate = 18) => ({ description: "Service", quantity: 1, unitPrice: price, taxRate });
    const invData = (price: number, o: Record<string, unknown> = {}) => ({ customerId: "c1", customerName: "Acme Ltd", projectId: null, invoiceDate: today, dueDate: today, items: [item(price)], discount: 0, currency: "INR", paymentTerms: null, poNumber: null, notes: null, ...o });
    const billData = (subtotal: number, o: Record<string, unknown> = {}) => ({ vendorId: "v1", vendorName: "Beta Supplies", vendorInvoiceNumber: `B-${Math.random().toString(36).slice(2, 7)}`, poId: null, poNumber: null, invoiceDate: today, dueDate: today, subtotal, gstAmount: subtotal * 0.18, tdsRate: 10, currency: "INR", notes: null, ...o });

    // history that exists before accrual books are switched on
    const oldInv = await createInvoice(invData(1000), "u1");
    assert.ok((await setInvoiceStatus(oldInv._id, "sent", "u1")).ok);
    const draftInv = await createInvoice(invData(500), "u1");
    const oldBill = await createBill(billData(2000), "u1"); // total 2360, TDS 200, net 2160
    await t("before it is switched on nothing is posted for documents and the ledger is untouched", async () => {
      assert.equal((await getTrialBalance()).rows.filter((r) => r.totalDebit || r.totalCredit).length, 0);
      assert.equal(await countMissingAccruals(), null);
      assert.equal(await accrualTieOut(), null);
    });

    await t("it cannot be switched on with the wrong kind of account", async () => {
      assert.equal((await activateAccrual({ revenueAccountId: expense._id, expenseAccountId: expense._id }, actor)).ok, false);
      assert.equal((await activateAccrual({ revenueAccountId: revenue._id, expenseAccountId: revenue._id }, actor)).ok, false);
      assert.equal((await activateAccrual({ revenueAccountId: "nope", expenseAccountId: expense._id }, actor)).ok, false);
    });

    await t("switching on brings in what is owed to and by the company, once, and the books agree with the records", async () => {
      const r = await activateAccrual({ revenueAccountId: revenue._id, expenseAccountId: expense._id }, actor);
      assert.ok(r.ok, r.ok ? "" : r.error);
      if (!r.ok) return;
      assert.equal(r.startDate, today);
      assert.equal(r.openingReceivable, 1180, "the sent invoice only; the draft is not owed yet");
      assert.equal(r.openingPayable, 2160, "net of TDS");
      assert.equal((await balance("1100")).net, 1180);
      assert.equal((await balance("2000")).net, -2160);
      assert.equal((await balance("3100")).net, 2160 - 1180);
      await balanced();
      const tie = (await accrualTieOut())!;
      assert.equal(tie.receivable.difference, 0);
      assert.equal(tie.payable.difference, 0);
      assert.equal((await activateAccrual({ revenueAccountId: revenue._id, expenseAccountId: expense._id }, actor)).ok, false, "only once");
      const flagged = await db.collection("fms_invoices").findOne({ _id: oldInv._id as never });
      assert.equal(flagged?.openingAccrued, true);
      assert.equal((await db.collection("fms_invoices").findOne({ _id: draftInv._id as never }))?.openingAccrued, undefined, "a draft is posted when it is issued");
    });

    await t("a document that was in the opening balances is not posted again", async () => {
      assert.deepEqual([...(await liveDocumentIds("invoice"))], []);
      assert.deepEqual([...(await liveDocumentIds("bill"))], []);
      assert.equal((await syncInvoiceAccrual(oldInv._id, actor)).ok, true);
      assert.equal((await balance("1100")).net, 1180);
    });

    await t("issuing an invoice posts receivable, revenue and GST output; saving it again changes nothing", async () => {
      const inv = await createInvoice(invData(2000), "u1"); // 2360 incl. 360 GST
      assert.equal((await balance("1100")).net, 1180, "a draft posts nothing");
      assert.ok((await setInvoiceStatus(inv._id, "sent", "u1")).ok);
      assert.equal((await balance("1100")).net, 1180 + 2360);
      assert.equal((await balance("4000")).credit, 2000);
      assert.equal((await balance("2210")).credit, 360);
      assert.equal((await syncInvoiceAccrual(inv._id, actor).then((r) => r.ok && r.changed)), false, "unchanged = no new entry");
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);

      // editing an issued, unpaid invoice re-posts it
      assert.ok((await updateInvoice(inv._id, invData(3000) as never, "u1")).ok);
      assert.equal((await balance("4000")).net, -3000, "the old posting is reversed and the new one stands");
      assert.equal((await balance("2210")).net, -540);
      assert.equal((await balance("1100")).net, 1180 + 3540);
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);

      // cancelling takes it back out
      assert.ok((await setInvoiceStatus(inv._id, "cancelled", "u1")).ok);
      assert.equal((await balance("4000")).net, 0);
      assert.equal((await balance("1100")).net, 1180);
      await balanced();
    });

    await t("a receipt settles the receivable instead of booking income again", async () => {
      const inv = await createInvoice(invData(1000), "u1"); // 1180
      assert.ok((await setInvoiceStatus(inv._id, "sent", "u1")).ok);
      const rec = await recordReceipt({ customerId: "c1", customerName: "Acme Ltd", receiptDate: today, amount: 1180, method: "bank_transfer", transactionReference: "UTR998877665", allocations: [{ invoiceId: inv._id, amount: 1180 }], currency: "INR", notes: null, ...fund }, "u1", null);
      assert.ok(rec.ok, rec.ok ? "" : rec.reason);
      if (!rec.ok) return;
      assert.equal((await balance("1100")).net, 1180, "the new invoice is settled; only the opening one remains");
      assert.equal((await balance("4900")).credit, 0, "nothing went to Other income");
      assert.equal((await getInvoice(inv._id))!.status, "paid");
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
      assert.ok((await voidReceipt(rec.receipt._id, "u1")).ok);
      assert.equal((await balance("1100")).net, 1180 + 1180, "voiding puts the receivable back");
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
    });

    await t("a receipt for a draft invoice issues it and settles it", async () => {
      const before = (await balance("1100")).net;
      const rec = await recordReceipt({ customerId: "c1", customerName: "Acme Ltd", receiptDate: today, amount: 590, method: "bank_transfer", transactionReference: "UTR112233445", allocations: [{ invoiceId: draftInv._id, amount: 590 }], currency: "INR", notes: null, ...fund }, "u1", null);
      assert.ok(rec.ok, rec.ok ? "" : rec.reason);
      assert.equal((await balance("1100")).net, before + 590 - 590 + 0, "billed 590 then settled 590");
      assert.equal((await balance("4000")).credit >= 500, true);
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
    });

    await t("a customer that deducts TDS settles the invoice with the bank money plus the tax credit", async () => {
      const inv = await createInvoice(invData(1000, { items: [item(1000, 0)] }), "u1"); // 1000, no GST
      assert.ok((await setInvoiceStatus(inv._id, "sent", "u1")).ok);
      const ar = (await balance("1100")).net;
      const bad = await recordReceipt({ customerId: "c1", customerName: "Acme Ltd", receiptDate: today, amount: 900, tdsDeducted: -5, method: "bank_transfer", transactionReference: "UTR000111222", allocations: [], currency: "INR", notes: null, ...fund }, "u1", null);
      assert.equal(bad.ok, false);
      const tooMuch = await recordReceipt({ customerId: "c1", customerName: "Acme Ltd", receiptDate: today, amount: 900, tdsDeducted: 50, method: "bank_transfer", transactionReference: "UTR000111223", allocations: [{ invoiceId: inv._id, amount: 1000 }], currency: "INR", notes: null, ...fund }, "u1", null);
      assert.equal(tooMuch.ok, false, "900 + 50 does not cover 1000, but it is the allocation (1000) that cannot exceed 950");
      const rec = await recordReceipt({ customerId: "c1", customerName: "Acme Ltd", receiptDate: today, amount: 900, tdsDeducted: 100, tdsSection: "194J", method: "bank_transfer", transactionReference: "UTR000111224", allocations: [{ invoiceId: inv._id, amount: 1000 }], currency: "INR", notes: null, ...fund }, "u1", null);
      assert.ok(rec.ok, rec.ok ? "" : rec.reason);
      if (!rec.ok) return;
      assert.equal((await getInvoice(inv._id))!.status, "paid", "the invoice is fully settled");
      assert.equal((await balance("1510")).net, 100, "the tax credit is an asset");
      assert.equal((await balance("1100")).net, ar - 1000, "the 1000 invoice is settled: 900 in the bank plus 100 of tax credit");
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
      assert.ok((await voidReceipt(rec.receipt._id, "u1")).ok);
      assert.equal((await balance("1510")).net, 0, "voiding takes the tax credit back too");
      assert.equal((await balance("1100")).net, ar, "voiding puts the 1000 back");
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
    });

    await t("a credit note takes back revenue and GST; cancelling it puts them back", async () => {
      const inv = await createInvoice(invData(1000), "u1");
      await setInvoiceStatus(inv._id, "sent", "u1");
      const start = (await balance("1100")).net;
      const cn = await createCreditNote({ invoiceId: inv._id, amount: 590, reason: "Discount" }, "u1");
      assert.ok(cn.ok);
      if (!cn.ok) return;
      assert.equal((await balance("1100")).net, start, "a draft credit note posts nothing");
      assert.ok((await issueCreditNote(cn.note._id, "u1")).ok);
      assert.equal((await balance("1100")).net, start - 590);
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
      assert.ok((await cancelCreditNote(cn.note._id, "u1")).ok);
      assert.equal((await balance("1100")).net, start);
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
    });

    await t("a vendor bill posts cost, GST input, payable and TDS; a payment settles the payable", async () => {
      const bill = await createBill(billData(1000), "u1"); // 1180, TDS 100, net 1080
      assert.equal((await balance("5900")).debit, 1000);
      assert.equal((await balance("1500")).debit, 180);
      assert.equal((await balance("2220")).credit, 100);
      assert.equal((await balance("2000")).net, -(2160 + 1080));
      await balanced();
      assert.equal((await accrualTieOut())!.payable.difference, 0);

      // a vendor payment recorded the way the payout engine records it
      const pay = await postSystemTransaction({ type: "expense", accrualRole: "payable", transactionDate: new Date(), postingDate: new Date(), amount: 1080, currency: "INR", paymentMethod: "neft", sourceModule: "prms", sourceRecordId: "pay1", customerId: null, vendorId: "v1", employeeId: null, projectId: null, department: null, accountId: null, ...fund, taxAmount: 0, referenceNumber: "UTR5", description: "Bill", attachments: [] }, "u1", null);
      assert.ok(!("ok" in pay));
      await applyPaymentToInvoice(bill._id, 1080, "u1");
      assert.equal((await balance("2000")).net, -2160, "the new bill is settled; the opening payable remains");
      assert.equal((await balance("5900")).debit, 1000, "no second cost");
      await balanced();
      assert.equal((await accrualTieOut())!.payable.difference, 0);
    });

    await t("a debit note (an extra charge) increases the payable; cancelling a bill takes it out", async () => {
      const bill = await createBill(billData(1000, { gstAmount: 0, tdsRate: 0 }), "u1"); // 1000
      const before = (await balance("2000")).net;
      const cost = (await balance("5900")).debit;
      const dn = await createDebitNote({ billId: bill._id, amount: 400, reason: "Late fee charged by the vendor" }, "u1");
      assert.ok(dn.ok);
      if (!dn.ok) return;
      assert.equal((await balance("2000")).net, before, "a draft posts nothing");
      assert.ok((await issueDebitNote(dn.note._id, "u1")).ok);
      assert.equal((await balance("2000")).net, before - 400, "we owe the vendor 400 more");
      assert.equal((await balance("5900")).debit, cost + 400);
      await balanced();
      assert.equal((await accrualTieOut())!.payable.difference, 0);
      assert.ok((await setBillStatus(bill._id, "cancelled", "u1")).ok);
      await balanced();
    });

    await t("an invoice or bill that was in the opening balances cannot change amount, and cancelling takes it out", async () => {
      const r = await updateInvoice(oldInv._id, invData(5000) as never, "u1");
      assert.equal(r.ok, false);
      assert.equal((await updateBill(oldBill._id, billData(9000) as never, "u1")).ok, false);
      const before = (await balance("1100")).net;
      assert.ok((await setInvoiceStatus(oldInv._id, "cancelled", "u1")).ok);
      assert.equal((await balance("1100")).net, before - 1180);
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
    });

    await t("a cancelled invoice stays cancelled when a payment against it is taken back", async () => {
      const inv = await createInvoice(invData(1000, { items: [item(1000, 0)] }), "u1");
      await setInvoiceStatus(inv._id, "sent", "u1");
      const rec = await recordReceipt({ customerId: "c1", customerName: "Acme Ltd", receiptDate: today, amount: 400, method: "bank_transfer", transactionReference: "UTR55500011", allocations: [{ invoiceId: inv._id, amount: 400 }], currency: "INR", notes: null, ...fund }, "u1", null);
      assert.ok(rec.ok);
      if (!rec.ok) return;
      assert.ok((await setInvoiceStatus(inv._id, "cancelled", "u1")).ok);
      const afterCancel = (await balance("1100")).net;
      assert.ok((await voidReceipt(rec.receipt._id, "u1")).ok);
      assert.equal((await getInvoice(inv._id))!.status, "cancelled", "voiding the payment must not bring the invoice back to life");
      assert.equal((await balance("1100")).net, afterCancel + 400, "only the receipt's own effect is undone");
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
      const late = await recordReceipt({ customerId: "c1", customerName: "Acme Ltd", receiptDate: today, amount: 50, method: "bank_transfer", transactionReference: "UTR55500012", allocations: [{ invoiceId: inv._id, amount: 50 }], currency: "INR", notes: null, ...fund }, "u1", null);
      assert.equal(late.ok, false, "no payment can be applied to a cancelled invoice");
    });

    await t("an invoice with credit notes cannot be cancelled until they are cancelled", async () => {
      const inv = await createInvoice(invData(1000, { items: [item(1000, 0)] }), "u1");
      await setInvoiceStatus(inv._id, "sent", "u1");
      const cn = await createCreditNote({ invoiceId: inv._id, amount: 200, reason: "Discount" }, "u1");
      assert.ok(cn.ok);
      if (!cn.ok) return;
      assert.ok((await issueCreditNote(cn.note._id, "u1")).ok);
      const r = await setInvoiceStatus(inv._id, "cancelled", "u1");
      assert.equal(r.ok, false);
      assert.ok(r.reason?.includes("credit notes"));
      assert.ok((await cancelCreditNote(cn.note._id, "u1")).ok);
      assert.ok((await setInvoiceStatus(inv._id, "cancelled", "u1")).ok);
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
    });

    await t("a cancelled bill that was partly paid still ties out", async () => {
      const bill = await createBill(billData(1000, { gstAmount: 0, tdsRate: 0 }), "u1");
      await postSystemTransaction({ type: "expense", accrualRole: "payable", transactionDate: new Date(), postingDate: new Date(), amount: 400, currency: "INR", paymentMethod: "neft", sourceModule: "prms", sourceRecordId: "payX", customerId: null, vendorId: "v1", employeeId: null, projectId: null, department: null, accountId: null, ...fund, taxAmount: 0, referenceNumber: "UTRX", description: "Part payment", attachments: [] }, "u1", null);
      await applyPaymentToInvoice(bill._id, 400, "u1");
      assert.ok((await setBillStatus(bill._id, "cancelled", "u1")).ok);
      await balanced();
      assert.equal((await accrualTieOut())!.payable.difference, 0);
      await applyPaymentToInvoice(bill._id, -400, "u1"); // the payment comes back
      const doc = await db.collection("prms_invoices").findOne({ _id: bill._id as never });
      assert.equal(doc?.status, "cancelled", "a returned payment does not revive a cancelled bill");
    });

    await t("a receipt recorded before accrual books started cannot be voided afterwards", async () => {
      const old = await db.collection("fms_receipts").insertOne({ _id: "old_rec" as never, receiptNumber: "REC-OLD-1", customerId: "c1", customerName: "Acme Ltd", receiptDate: new Date(), amount: 10, method: "cash", status: "completed", allocations: [], advanceAmount: 10, currency: "INR", transactionId: null, notes: null, createdAt: new Date(Date.now() - 10 * 86400000), updatedAt: new Date(), deletedAt: null } as never);
      assert.ok(old.acknowledged);
      const r = await voidReceipt("old_rec", "u1");
      assert.equal(r.ok, false);
      assert.ok(r.reason?.includes("before accrual books"));
    });

    await t("a payment that would issue a draft invoice dated inside a closed period is refused", async () => {
      const period = await createFiscalPeriod({ name: "Closed for draft test", startDate: new Date(`${today}T00:00:00`), endDate: new Date(`${today}T23:59:59`) }, "u1");
      assert.ok(period.ok);
      if (!period.ok) return;
      const draft = await createInvoice(invData(200, { items: [item(200, 0)] }), "u1");
      assert.ok((await closePeriod(period.period._id, "u1", null)).ok);
      const r = await recordReceipt({ customerId: "c1", customerName: "Acme Ltd", receiptDate: today, amount: 200, method: "bank_transfer", transactionReference: "UTR66600011", allocations: [{ invoiceId: draft._id, amount: 200 }], currency: "INR", notes: null, ...fund }, "u1", null);
      assert.equal(r.ok, false);
      assert.equal((await getInvoice(draft._id))!.status, "draft");
      await reopenPeriod(period.period._id, "u1", null);
    });

    await t("two changes to one invoice at the same moment: the latest state wins and one live entry remains", async () => {
      const inv = await createInvoice(invData(500, { items: [item(500, 0)] }), "u1");
      await setInvoiceStatus(inv._id, "sent", "u1");
      await Promise.all([updateInvoice(inv._id, invData(900, { items: [item(900, 0)] }) as never, "u1"), updateInvoice(inv._id, invData(700, { items: [item(700, 0)] }) as never, "u1"), syncInvoiceAccrual(inv._id, actor)]);
      const final = (await getInvoice(inv._id))!.totalAmount;
      const live = await db.collection("fms_journal_entries").find({ sourceType: "invoice", sourceId: inv._id, docKey: { $type: "string" } }).toArray();
      assert.equal(live.length, 1);
      const lines = await db.collection("fms_journal_lines").find({ entryId: live[0]._id, accountCode: "1100" }).toArray();
      assert.equal(lines[0].amount, final, "the ledger carries the amount the invoice ended with");
      await balanced();
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
    });

    await t("an entry with no lines (the server stopped midway) is healed and the document is posted again", async () => {
      const inv = await createInvoice(invData(300, { items: [item(300, 0)] }), "u1");
      await db.collection("fms_journal_entries").insertOne({ _id: "ghost" as never, entryNumber: "JE-GHOST", transactionId: null, transactionNumber: null, periodId: null, entryDate: new Date(), description: "ghost", reversalOfEntryId: null, sourceType: "invoice", sourceId: inv._id, signature: "x", docKey: `invoice:${inv._id}`, createdAt: new Date(Date.now() - 120_000), createdBy: "u1" } as never);
      await db.collection("fms_invoices").updateOne({ _id: inv._id as never }, { $set: { status: "sent" } });
      assert.ok((await syncInvoiceAccrual(inv._id, actor)).ok);
      const live = await liveDocumentEntry("invoice", inv._id);
      assert.ok(live && live._id !== "ghost");
      await balanced();
    });

    await t("a missing opening entry is found and written", async () => {
      const opening = await liveDocumentEntry("accrual_opening", "main");
      assert.ok(opening);
      const tbBefore = (await balance("3100")).net;
      await db.collection("fms_journal_lines").deleteMany({ entryId: opening!._id });
      await db.collection("fms_journal_entries").deleteOne({ _id: opening!._id as never });
      assert.ok(((await countMissingAccruals()) ?? 0) >= 1);
      const r = await postMissingAccruals(actor);
      assert.ok(r.posted >= 1);
      assert.equal((await balance("3100")).net, tbBefore);
      await balanced();
    });

    await t("a closed period stops postings into it and the change is put back", async () => {
      await db.collection("fms_fiscal_periods").deleteMany({}); // the earlier test's period is not wanted here
      const period = await createFiscalPeriod({ name: "Test period", startDate: new Date(`${today}T00:00:00`), endDate: new Date(`${today}T23:59:59`) }, "u1");
      assert.ok(period.ok);
      if (!period.ok) return;
      const inv = await createInvoice(invData(100), "u1");
      assert.ok((await closePeriod(period.period._id, "u1", null)).ok);
      const r = await setInvoiceStatus(inv._id, "sent", "u1");
      assert.equal(r.ok, false);
      assert.equal((await getInvoice(inv._id))!.status, "draft", "the status was put back");
      assert.ok((await reopenPeriod(period.period._id, "u1", null)).ok);
      assert.ok((await setInvoiceStatus(inv._id, "sent", "u1")).ok);
      await balanced();
    });

    await t("the profit and loss of a closed period is still its profit (the closing entry is not income or cost)", async () => {
      await db.collection("fms_fiscal_periods").deleteMany({});
      const range = { dateFrom: new Date(`${today}T00:00:00`), dateTo: new Date(`${today}T23:59:59`) };
      const before = (await getProfitAndLoss(range)).netProfit;
      const sheetBefore = await getBalanceSheet(range.dateTo);
      assert.ok(sheetBefore.balanced, "the balance sheet balances before the close");
      const p = await createFiscalPeriod({ name: "PL check", startDate: range.dateFrom, endDate: range.dateTo }, "u1");
      assert.ok(p.ok);
      if (!p.ok) return;
      assert.ok((await closePeriod(p.period._id, "u1", null)).ok);
      assert.equal((await getProfitAndLoss(range)).netProfit, before, "closing the period must not change its reported profit");
      const sheetAfter = await getBalanceSheet(range.dateTo);
      assert.ok(sheetAfter.balanced, "the balance sheet still balances after the close");
      assert.equal(sheetAfter.retainedEarnings, sheetBefore.retainedEarnings, "closed profit is counted once in Retained Earnings, not twice");
      assert.notEqual(before, 0, "the test needs some profit to mean anything");
      await reopenPeriod(p.period._id, "u1", null);
      assert.equal((await getProfitAndLoss(range)).netProfit, before, "nor does reopening it");
      assert.equal((await getBalanceSheet(range.dateTo)).retainedEarnings, sheetBefore.retainedEarnings);
      await db.collection("fms_fiscal_periods").deleteMany({});
    });

    await t("posting the same document many times at once leaves one entry", async () => {
      const inv = await createInvoice(invData(700), "u1");
      await db.collection("fms_invoices").updateOne({ _id: inv._id as never }, { $set: { status: "sent" } });
      const rs = await Promise.all(Array.from({ length: 6 }, () => syncInvoiceAccrual(inv._id, actor)));
      assert.ok(rs.every((x) => x.ok));
      const entries = await db.collection("fms_journal_entries").find({ sourceType: "invoice", sourceId: inv._id, docKey: { $type: "string" } }).toArray();
      assert.equal(entries.length, 1);
      const lines = await db.collection("fms_journal_lines").find({ entryId: entries[0]._id }).toArray();
      assert.equal(lines.length, 3);
      await balanced();
    });

    await t("a document the ledger missed is found and posted", async () => {
      const inv = await createInvoice(invData(300), "u1");
      await db.collection("fms_invoices").updateOne({ _id: inv._id as never }, { $set: { status: "sent" } }); // as if a path skipped the hook
      assert.equal(await countMissingAccruals(), 1);
      assert.ok((await accrualTieOut())!.receivable.difference !== 0, "the records and the ledger now disagree, and it shows");
      const r = await postMissingAccruals(actor);
      assert.equal(r.posted, 1);
      assert.deepEqual(r.failed, []);
      assert.equal(await countMissingAccruals(), 0);
      assert.equal((await accrualTieOut())!.receivable.difference, 0);
      await balanced();
    });

    await t("a deleted draft or invoice leaves no trace; deleting an issued one reverses it", async () => {
      const inv = await createInvoice(invData(100), "u1");
      await setInvoiceStatus(inv._id, "sent", "u1");
      const before = (await balance("1100")).net;
      assert.ok((await deleteInvoice(inv._id, "u1")).ok);
      assert.equal((await balance("1100")).net, before - 118);
      await balanced();
    });
  });

  await t("TDS deducted by a customer needs accrual books", async () => {
    await inB(async () => {
      const r = await recordReceipt({ customerId: "c", customerName: "X", receiptDate: today, amount: 900, tdsDeducted: 100, method: "bank_transfer", transactionReference: "UTR777888999", allocations: [], currency: "INR", notes: null }, "u1", null);
      assert.equal(r.ok, false);
      assert.ok(!r.ok && r.reason.includes("accrual books"));
    });
  });

  await t("another company is not affected: no switch, no opening balances, nothing posted", async () => {
    await inB(async () => {
      await seedDefaultAccounts("u1");
      assert.equal(await accrualTieOut(), null);
      assert.equal((await getTrialBalance()).rows.filter((r) => r.totalDebit || r.totalCredit).length, 0);
      const inv = await createInvoice({ customerId: "c", customerName: "X", projectId: null, invoiceDate: today, dueDate: today, items: [{ description: "s", quantity: 1, unitPrice: 100, taxRate: 18 }], discount: 0, currency: "INR", paymentTerms: null, poNumber: null, notes: null }, "u1");
      assert.ok((await setInvoiceStatus(inv._id, "sent", "u1")).ok);
      assert.equal((await getTrialBalance()).rows.filter((r) => r.totalDebit || r.totalCredit).length, 0, "cash-basis company: an invoice still posts nothing");
    });
  });

  console.log("accrual flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
