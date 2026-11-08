import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { listItemStates, saveItemState } from "../src/lib/products/cashflow-ai/compliance/tracker";
import { generateYearFilings, createFiling, deleteFiling, listFilings, markFiled, setFilingStatus, updateFiling } from "../src/lib/products/cashflow-ai/compliance/filings";
import { EMPTY_PROFILE } from "../src/lib/products/cashflow-ai/compliance/filings-core";
import { gatherFacts, previousMonth } from "../src/lib/products/cashflow-ai/compliance/facts";
import { evaluateSignals } from "../src/lib/products/cashflow-ai/compliance/auto-core";
import { listOwners, saveOwner } from "../src/lib/products/cashflow-ai/compliance/owners";
import { cleanupReport, findExistingBill } from "../src/lib/products/cashflow-ai/hygiene";
import { addReceiptDocument, MAX_RECEIPT_DOCUMENTS } from "../src/lib/products/cashflow-ai/receipts";
import { payableOnBill, recordVendorPayment } from "../src/lib/products/cashflow-ai/vendor-payments";
import { runHealthChecks } from "../src/lib/products/cashflow-ai/compliance/health";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const inA = <T>(fn: () => Promise<T>) => runAsCompany("co_comp_a", fn);
const inB = <T>(fn: () => Promise<T>) => runAsCompany("co_comp_b", fn);
const today = new Date().toISOString().slice(0, 10);

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase(); // start clean every run (only ever a zz_throwaway_ database, checked above)

  await t("checklist progress is saved per item, rejects unknown items and statuses", async () => {
    await inA(async () => {
      assert.equal((await saveItemState({ itemKey: "nope.1", status: "done" }, "u1", null)).ok, false);
      assert.equal((await saveItemState({ itemKey: "bookkeeping.1", status: "finished" }, "u1", null)).ok, false);
      assert.ok((await saveItemState({ itemKey: "bookkeeping.1", status: "done", owner: " Priya " }, "u1", null)).ok);
      assert.ok((await saveItemState({ itemKey: "bookkeeping.1", note: "bill folder 2026" }, "u1", null)).ok);
      const s = (await listItemStates()).get("bookkeeping.1")!;
      assert.equal(s.status, "done");
      assert.equal(s.owner, "Priya");
      assert.equal(s.note, "bill folder 2026");
      assert.ok(s.doneAt, "done time kept when only the note changes");
      await saveItemState({ itemKey: "bookkeeping.1", status: "todo" }, "u1", null);
      assert.equal((await listItemStates()).get("bookkeeping.1")!.doneAt, null);
      assert.equal((await listItemStates()).size, 1, "one row per item");
    });
    await inB(async () => assert.equal((await listItemStates()).size, 0, "another company sees none of it"));
  });

  await t("two people saving the same new item at once leave one row", async () => {
    await inA(async () => {
      await Promise.all([1, 2, 3].map((n) => saveItemState({ itemKey: "gst.1", status: "in_progress", owner: `p${n}` }, "u1", null)));
      assert.equal([...(await listItemStates()).keys()].filter((k) => k === "gst.1").length, 1);
    });
  });

  await t("filings: dates are validated, never assumed, and confirmed only when a date exists", async () => {
    await inA(async () => {
      assert.equal((await createFiling({ name: "", category: "gst" }, "u1", null)).ok, false);
      assert.equal((await createFiling({ name: "x", category: "bogus" }, "u1", null)).ok, false);
      assert.equal((await createFiling({ name: "x", category: "gst", dueDate: "2026-02-30" }, "u1", null)).ok, false);
      const a = await createFiling({ name: "GST Sep", form: "GSTR-3B", category: "gst", dueDate: "2026-10-20", dueDateConfirmed: true }, "u1", null);
      const b = await createFiling({ name: "No date", category: "roc", dueDateConfirmed: true }, "u1", null);
      assert.ok(a.ok && b.ok);
      if (!a.ok || !b.ok) return;
      const rows = await listFilings();
      assert.equal(rows.find((r) => r._id === b.id)!.dueDateConfirmed, false, "cannot be confirmed without a date");
      assert.equal(rows[rows.length - 1]._id, b.id, "undated filings sit last");
      await updateFiling(a.id, { dueDate: null }, "u1", null);
      assert.equal((await listFilings()).find((r) => r._id === a.id)!.dueDateConfirmed, false, "removing the date removes the confirmation");
    });
  });

  await t("marking filed needs a real, non-future date and keeps the acknowledgement", async () => {
    await inA(async () => {
      const f = (await listFilings())[0];
      assert.equal((await markFiled(f._id, { filedOn: "tomorrow" }, "u1", null)).ok, false);
      assert.equal((await markFiled(f._id, { filedOn: "2999-01-01" }, "u1", null)).ok, false);
      assert.ok((await markFiled(f._id, { filedOn: today, ackNumber: "ARN123" }, "u1", null)).ok);
      const g = (await listFilings()).find((r) => r._id === f._id)!;
      assert.equal(g.status, "filed");
      assert.equal(g.ackNumber, "ARN123");
      await setFilingStatus(f._id, "pending", "u1", null);
      const h = (await listFilings()).find((r) => r._id === f._id)!;
      assert.equal(h.status, "pending");
      assert.equal(h.filedOn, null);
    });
  });

  await t("the year's filings are copied from the rulebook once, with dates", async () => {
    // company C, so company B stays empty for the "empty company" checks below
    await runAsCompany("co_comp_c", async () => {
      const first = await generateYearFilings("2026-27", EMPTY_PROFILE, { id: "u1", email: null });
      assert.ok(first.ok && first.added > 0);
      if (!first.ok) return;
      const again = await generateYearFilings("2026-27", EMPTY_PROFILE, { id: "u1", email: null });
      assert.ok(again.ok && again.added === 0, "no duplicates on a second click");
      const rows = await listFilings();
      assert.equal(rows.length, first.added);
      assert.ok(rows.every((r) => r.dueDate !== null));
      await deleteFiling(rows[0]._id, "u1", null);
      assert.equal((await listFilings()).length, first.added - 1);
    });
    await inA(async () => assert.ok((await listFilings()).length < 5, "company A is untouched"));
  });

  await t("health checks run on an empty company and say so instead of passing", async () => {
    await inB(async () => {
      const checks = await runHealthChecks(today);
      assert.ok(checks.length >= 9);
      assert.equal(checks.find((c) => c.key === "coa")!.level, "bad", "no chart of accounts is a failure");
      assert.ok(checks.every((c) => c.detail.length > 0));
    });
  });

  await t("who-does-what: names are saved per workstream, trimmed, per company", async () => {
    await inA(async () => {
      assert.equal((await saveOwner({ workstreamKey: "nope", primary: "x" }, "u1", null)).ok, false);
      assert.ok((await saveOwner({ workstreamKey: "gst-tds", primary: "  CA Mehta & Co " }, "u1", null)).ok);
      assert.ok((await saveOwner({ workstreamKey: "gst-tds", reviewer: "Priya" }, "u1", null)).ok);
      await Promise.all([1, 2, 3].map((n) => saveOwner({ workstreamKey: "audit", primary: `a${n}` }, "u1", null)));
      const o = await listOwners();
      assert.equal(o.get("gst-tds")!.primary, "CA Mehta & Co");
      assert.equal(o.get("gst-tds")!.reviewer, "Priya", "saving one field keeps the other");
      assert.equal(o.size, 2, "one row per workstream, even when saved at once");
    });
    await inB(async () => assert.equal((await listOwners()).size, 0));
  });

  await t("facts from an empty company give no false 'verified'", async () => {
    await inB(async () => {
      assert.equal(previousMonth("2026-01-15"), "2025-12");
      assert.equal(previousMonth("2026-10-28"), "2026-09");
      const facts = await gatherFacts(today);
      const sig = evaluateSignals(facts);
      // "no invoice is overdue" and "every entry has an account" are simply true with no invoices; everything that needs data to prove a point must stay silent
      for (const [, v] of sig) if (v.state === "verified") assert.ok(["No invoice is overdue.", "Every income and expense entry has an account."].includes(v.detail), `unexpected verified: ${v.detail}`);
    });
  });

  await t("facts see real problems: an open bank line, a duplicate invoice number, an overdue filing", async () => {
    await inA(async () => {
      const { getDb } = await import("../src/lib/mongodb");
      const db = await getDb();
      const now = new Date();
      await db.collection("fms_bank_statement_lines").insertOne({ _id: "l1", bankAccountId: "b1", statementDate: now, description: "x", amount: 10, status: "unmatched", matchedTransactionId: null, notes: null, createdAt: now, updatedAt: now, deletedAt: null } as never);
      for (const id of ["i1", "i2"]) await db.collection("fms_invoices").insertOne({ _id: id, invoiceNumber: "INV-1", customerId: "c", customerName: "C", currency: "INR", totalAmount: 1, amountPaid: 0, status: "draft", dueDate: today, createdAt: now, updatedAt: now, deletedAt: null } as never);
      await createFiling({ name: "Late one", category: "gst", dueDate: "2020-01-01" }, "u1", null);
      const facts = await gatherFacts(today);
      assert.equal(facts.bankLinesOpen, 1);
      assert.equal(facts.duplicateInvoiceNumbers, 1);
      assert.equal(facts.filingsTotal, (await listFilings()).length);
      const sig = evaluateSignals(facts);
      assert.ok([...sig.values()].some((v) => v.state === "issue" && v.detail.includes("bank line")));
      assert.ok([...sig.values()].some((v) => v.state === "issue" && v.detail.includes("invoice number")));
    });
  });

  await t("clean-up report: duplicate bills, missing documents and entries without an account", async () => {
    await inA(async () => {
      const { getDb } = await import("../src/lib/mongodb");
      const db = await getDb();
      const now = new Date();
      const bill = (id: string, o: Record<string, unknown> = {}) => ({ _id: id, invoiceNumber: `BILL-${id}`, vendorId: "v1", vendorName: "Acme", vendorInvoiceNumber: "INV-7", invoiceDate: "2026-10-01", totalAmount: 500, status: "pending", storageKey: null, createdAt: now, updatedAt: now, deletedAt: null, ...o });
      await db.collection("prms_invoices").insertMany([bill("b1"), bill("b2", { vendorInvoiceNumber: "inv 7", storageKey: "k.pdf" }), bill("b3", { vendorInvoiceNumber: "X", totalAmount: 1, status: "cancelled" })] as never);
      const txn = (id: string, o: Record<string, unknown> = {}) => ({ _id: id, transactionNumber: `T-${id}`, type: "expense", transactionDate: now, amount: 10, status: "completed", accountId: null, transferId: null, description: null, createdAt: now, updatedAt: now, deletedAt: null, ...o });
      await db.collection("fms_transactions").insertMany([txn("t1"), txn("t2", { accountId: "a1" }), txn("t3", { transferId: "tr1" }), txn("t4", { status: "draft" })] as never);
      const r = await cleanupReport();
      assert.equal(r.duplicates.length, 1);
      assert.equal(r.duplicates[0].kind, "exact");
      assert.deepEqual(r.billsWithoutDocument.map((b) => b.id), ["b1"], "the cancelled bill and the one with a file are not listed");
      assert.deepEqual(r.unclassified.map((x) => x.id), ["t1"], "only completed income/expense without an account and not a transfer");
      assert.ok(await findExistingBill("v1", "INV/7"));
      assert.equal(await findExistingBill("v1", "INV/7", "b1") !== null, true, "b2 is still a match when editing b1");
      assert.equal(await findExistingBill("v2", "INV/7"), null, "another vendor");
      assert.equal(await findExistingBill("v1", "X"), null, "a cancelled bill does not block re-entering");
      assert.equal(await findExistingBill("v1", null), null);
    });
  });

  await t("receipts: hand-recorded ones without proof are listed; Razorpay ones, and ones with proof, are not", async () => {
    await inB(async () => {
      const { getDb } = await import("../src/lib/mongodb");
      const db = await getDb();
      const now = new Date();
      const rec = (id: string, o: Record<string, unknown> = {}) => ({ _id: id, receiptNumber: `REC-${id}`, customerId: "c", customerName: "Acme", receiptDate: now, amount: 100, method: "cash", status: "completed", notes: null, createdAt: now, updatedAt: now, deletedAt: null, ...o });
      await db.collection("fms_receipts").insertMany([rec("r1"), rec("r2", { viaGateway: true }), rec("r3", { notes: "Automated payment for PAY-1 (fms)" }), rec("r4", { documents: [{ storageKey: "k", filename: "f.pdf", contentType: "application/pdf", size: 1 }] }), rec("r5", { status: "voided" })] as never);
      await db.collection("prms_expenses").insertMany([
        { _id: "e1", expenseCode: "EXP-1", category: "Travel", expenseDate: now, totalAmount: 50, invoiceStorageKey: null, status: "approved", createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "e2", expenseCode: "EXP-2", category: "Travel", expenseDate: now, totalAmount: 50, invoiceStorageKey: "k.pdf", status: "approved", createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "e3", expenseCode: "EXP-3", category: "Travel", expenseDate: now, totalAmount: 50, invoiceStorageKey: null, status: "rejected", createdAt: now, updatedAt: now, deletedAt: null },
      ] as never);
      const r = await cleanupReport();
      assert.deepEqual(r.receiptsWithoutProof.map((x) => x.id), ["r1"]);
      assert.deepEqual(r.expensesWithoutBill.map((x) => x.id), ["e1"]);
    });
  });

  await t("a receipt takes proof documents up to a limit, even when uploads arrive together", async () => {
    await inB(async () => {
      const doc = (n: number) => ({ storageKey: `k${n}`, filename: `f${n}.pdf`, contentType: "application/pdf", size: 10 });
      assert.equal((await addReceiptDocument("missing", doc(0), "u1", null)).ok, false);
      const results = await Promise.all(Array.from({ length: MAX_RECEIPT_DOCUMENTS + 4 }, (_, i) => addReceiptDocument("r1", doc(i), "u1", null)));
      assert.equal(results.filter((x) => x.ok).length, MAX_RECEIPT_DOCUMENTS);
      const { getDb } = await import("../src/lib/mongodb");
      const saved = await (await getDb()).collection("fms_receipts").findOne({ _id: "r1" as never }) as unknown as { documents: unknown[] };
      assert.equal(saved.documents.length, MAX_RECEIPT_DOCUMENTS);
      assert.deepEqual((await cleanupReport()).receiptsWithoutProof, [], "with proof it leaves the list");
    });
  });

  await t("a vendor bill cannot be paid more than once: scheduled payments count against what is owed", async () => {
    await inA(async () => {
      const { getDb } = await import("../src/lib/mongodb");
      const db = await getDb();
      const now = new Date();
      await db.collection("prms_invoices").insertOne({ _id: "pb1", invoiceNumber: "BILL-PB1", vendorId: "v9", vendorName: "Beta", vendorInvoiceNumber: "B-1", invoiceDate: "2026-10-01", dueDate: "2026-10-31", subtotal: 1000, gstAmount: 0, tdsRate: 0, tdsAmount: 0, totalAmount: 1000, netPayable: 1000, amountPaid: 0, currency: "INR", status: "approved", storageKey: null, filename: null, createdAt: now, updatedAt: now, deletedAt: null } as never);
      const pay = (amount: number) => recordVendorPayment({ invoiceId: "pb1", amount, paymentDate: today, method: "neft", transactionReference: null, tdsDeducted: 0, status: "scheduled", notes: null } as never, "u1", null);
      assert.ok((await pay(600)).ok);
      const over = await pay(500);
      assert.equal(over.ok, false, "600 is already scheduled, only 400 is left");
      assert.ok(over.reason?.includes("400"));
      assert.ok((await pay(400)).ok);
      const none = await pay(1);
      assert.equal(none.ok, false);
      const room = await payableOnBill("pb1");
      assert.ok(room.ok && room.remaining === 0);
      // a failed payment frees its amount again
      await db.collection("prms_payments").updateOne({ amount: 400 }, { $set: { status: "failed" } });
      const again = await payableOnBill("pb1");
      assert.ok(again.ok && again.remaining === 400);
      assert.equal((await payableOnBill("nope")).ok, false);
      await db.collection("prms_invoices").updateOne({ _id: "pb1" as never }, { $set: { status: "cancelled" } });
      assert.equal((await payableOnBill("pb1")).ok, false, "a cancelled bill cannot be paid");
    });
  });

  console.log("compliance flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
