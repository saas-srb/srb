import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { CONFIRMATIONS_COLLECTION, WRITE_OFFS_COLLECTION, analysePartyById, approveWriteOff, listConfirmations, listPartyOverview, listWriteOffs, previewConfirmation, proposeWriteOff, saveConfirmation, withdrawWriteOff, defaultFrom, parseAmount } from "../src/lib/products/cashflow-ai/party-recon/store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*). Documents are inserted the way the real modules store them.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const alice = { id: "u_alice", email: "alice@example.com" };
const bob = { id: "u_bob", email: "bob@example.com" };
const inA = <T>(fn: () => Promise<T>) => runAsCompany("co_pr_a", fn);
const inB = <T>(fn: () => Promise<T>) => runAsCompany("co_pr_b", fn);
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const stamp = { createdAt: D("2026-01-01"), updatedAt: D("2026-01-01"), createdBy: "seed", updatedBy: "seed", deletedAt: null };
const RANGE = { from: "2026-01-01", to: "2026-12-31" };

async function seed() {
  const db = await getDb();
  const ins = (c: string, rows: Record<string, unknown>[]) => db.collection(c).insertMany(rows.map((r) => ({ ...stamp, ...r })) as never[]);
  await ins("pms_clients", [
    { _id: "cu1", clientCode: "CL-1", companyName: "Acme Traders", status: "active" },
    { _id: "cu_empty", clientCode: "CL-2", companyName: "Blank Co", status: "active" },
  ]);
  await ins("prms_vendors", [
    { _id: "ve1", vendorCode: "VEN-1", companyName: "Steel Supplies", status: "active" },
    { _id: "ve2", vendorCode: "VEN-2", companyName: "Paper Mart", status: "active" },
  ]);
  const inv = (o: Record<string, unknown>) => ({ customerId: "cu1", customerName: "Acme Traders", currency: "INR", amountPaid: 0, amountCredited: 0, ...o });
  await ins("fms_invoices", [
    inv({ _id: "i1", invoiceNumber: "INV-1", invoiceDate: "2026-01-10", dueDate: "2026-02-09", totalAmount: 10000, amountPaid: 4000, amountCredited: 1000, status: "partially_paid" }),
    inv({ _id: "i2", invoiceNumber: "INV-2", invoiceDate: "2026-01-12", dueDate: "2026-02-11", totalAmount: 7777, status: "cancelled" }),
    inv({ _id: "i3", invoiceNumber: "INV-3", invoiceDate: "2026-01-13", dueDate: "2026-02-12", totalAmount: 888, status: "draft" }),
    inv({ _id: "i4", invoiceNumber: "INV-4", invoiceDate: "2026-01-14", dueDate: "2026-02-13", totalAmount: 500, currency: "USD", status: "sent" }),
  ]);
  const rec = (o: Record<string, unknown>) => ({ customerId: "cu1", customerName: "Acme Traders", currency: "INR", allocations: [], advanceAmount: 0, ...o });
  await ins("fms_receipts", [
    rec({ _id: "r1", receiptNumber: "REC-1", receiptDate: D("2026-02-15"), amount: 4000, status: "completed", allocations: [{ invoiceId: "i1", invoiceNumber: "INV-1", amount: 4000 }] }),
    rec({ _id: "r2", receiptNumber: "REC-2", receiptDate: D("2026-02-16"), amount: 9999, status: "voided", allocations: [{ invoiceId: "i1", invoiceNumber: "INV-1", amount: 9999 }] }),
    rec({ _id: "r3", receiptNumber: "REC-3", receiptDate: D("2026-03-01"), amount: 700, status: "pending_clearance" }),
    rec({ _id: "r4", receiptNumber: "REC-4", receiptDate: D("2026-03-10"), amount: 1000, status: "completed", advanceAmount: 1000 }),
  ]);
  await ins("fms_credit_notes", [
    { _id: "c1", creditNoteNumber: "CRN-1", invoiceId: "i1", invoiceNumber: "INV-1", customerId: "cu1", customerName: "Acme Traders", amount: 1000, reason: "discount", status: "issued", issuedAt: D("2026-02-20") },
    { _id: "c2", creditNoteNumber: "CRN-2", invoiceId: "i1", invoiceNumber: "INV-1", customerId: "cu1", customerName: "Acme Traders", amount: 300, reason: "draft", status: "draft", issuedAt: null },
  ]);
  await ins("fms_refunds", [
    { _id: "f1", refundNumber: "RFD-1", receiptId: "r4", receiptNumber: "REC-4", customerId: "cu1", customerName: "Acme Traders", amount: 200, reason: "x", status: "completed", updatedAt: D("2026-04-01") },
    { _id: "f2", refundNumber: "RFD-2", receiptId: "r4", receiptNumber: "REC-4", customerId: "cu1", customerName: "Acme Traders", amount: 150, reason: "x", status: "requested" },
  ]);
  const bill = (o: Record<string, unknown>) => ({ currency: "INR", amountPaid: 0, ...o });
  await ins("prms_invoices", [
    bill({ _id: "b1", invoiceNumber: "INV-0001", vendorInvoiceNumber: "V-100", vendorId: "ve1", vendorName: "Steel Supplies", invoiceDate: "2026-01-05", dueDate: "2026-02-04", netPayable: 8000, amountPaid: 3000, status: "partially_paid" }),
    bill({ _id: "b2", invoiceNumber: "INV-0002", vendorInvoiceNumber: "V-101", vendorId: "ve1", vendorName: "Steel Supplies", invoiceDate: "2026-01-06", dueDate: "2026-02-05", netPayable: 4321, status: "cancelled" }),
    bill({ _id: "b3", invoiceNumber: "INV-0003", vendorInvoiceNumber: "A/1", vendorId: "ve2", vendorName: "Paper Mart", invoiceDate: "2026-02-01", dueDate: "2026-03-01", netPayable: 1000, amountPaid: 2500, status: "paid" }),
    bill({ _id: "b4", invoiceNumber: "INV-0004", vendorInvoiceNumber: "a 1", vendorId: "ve2", vendorName: "Paper Mart", invoiceDate: "2026-02-02", dueDate: "2026-03-02", netPayable: 1000, status: "pending" }),
  ]);
  const pay = (o: Record<string, unknown>) => ({ method: "neft", transactionReference: null, tdsDeducted: 0, ...o });
  await ins("prms_payments", [
    pay({ _id: "p1", paymentCode: "PAY-1", invoiceId: "b1", invoiceNumber: "INV-0001", vendorId: "ve1", vendorName: "Steel Supplies", amount: 3000, paymentDate: D("2026-02-10"), status: "processed", transactionReference: "UTR1" }),
    pay({ _id: "p2", paymentCode: "PAY-2", invoiceId: "b1", invoiceNumber: "INV-0001", vendorId: "ve1", vendorName: "Steel Supplies", amount: 500, paymentDate: D("2026-02-11"), status: "failed" }),
    pay({ _id: "p3", paymentCode: "PAY-3", invoiceId: "b1", invoiceNumber: "INV-0001", vendorId: "ve1", vendorName: "Steel Supplies", amount: 1000, paymentDate: D("2026-02-12"), status: "scheduled" }),
    pay({ _id: "p4", paymentCode: "PAY-4", invoiceId: "b3", invoiceNumber: "INV-0003", vendorId: "ve2", vendorName: "Paper Mart", amount: 2500, paymentDate: D("2026-03-05"), status: "processed", transactionReference: "UTR2" }),
  ]);
  await ins("fms_debit_notes", [
    { _id: "d1", debitNoteNumber: "DBN-1", billId: "b1", billNumber: "INV-0001", vendorId: "ve1", vendorName: "Steel Supplies", amount: 200, reason: "freight", status: "issued", issuedAt: D("2026-02-20") },
    { _id: "d2", debitNoteNumber: "DBN-2", billId: "b1", billNumber: "INV-0001", vendorId: "ve1", vendorName: "Steel Supplies", amount: 999, reason: "draft", status: "draft", issuedAt: null },
  ]);
}

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await inA(seed);

  await t("customer statement counts only live documents: cancelled, draft, voided, uncleared and other-currency are out", async () => {
    await inA(async () => {
      const a = (await analysePartyById("customer", "cu1", RANGE))!;
      assert.deepEqual(a.statement.lines.map((l) => l.number), ["INV-1", "REC-1", "CRN-1", "REC-4", "RFD-1"]);
      assert.equal(a.statement.closing, 4200, "10000 - 4000 - 1000 - 1000 + 200");
      assert.equal(a.balance, 4200);
      assert.deepEqual(a.statement.lines.map((l) => l.balance), [10000, 6000, 5000, 4000, 4200]);
      assert.deepEqual(a.held.map((h) => [h.number, h.amount, h.reason]), [["REC-3", 700, "cheque not yet cleared"]]);
      assert.deepEqual(a.statement.otherCurrency, [{ currency: "USD", count: 1 }], "INV-4 is in dollars: reported, never added in");
      assert.ok(a.flags.some((f) => f.code === "held"));
      assert.ok(a.flags.some((f) => f.code === "unallocated" && f.message.includes("1,000.00")), "REC-4 is an unapplied advance");
      assert.equal(a.flags.some((f) => f.code === "record_mismatch"), false, "INV-1 says 5000 settled and documents agree");
      assert.equal(a.ageing.items.length, 1);
      assert.equal(a.ageing.items[0].outstanding, 5000);
      assert.equal(a.ageing.onAccount, 800);
      assert.equal(a.ageing.totalOpen - a.ageing.onAccount, a.balance);
    });
  });

  await t("a dollar invoice is loaded but kept out of every rupee figure", async () => {
    await inA(async () => {
      const a = (await analysePartyById("customer", "cu1", RANGE))!;
      assert.ok(!a.statement.lines.some((l) => l.number === "INV-4"));
      assert.ok(a.flags.some((f) => f.code === "other_currency" && f.message.includes("USD")));
      assert.ok(a.docs.some((d) => d.number === "INV-4" && d.currency === "USD"));
    });
  });

  await t("range: opening balance carries what came before the start date", async () => {
    await inA(async () => {
      const a = (await analysePartyById("customer", "cu1", { from: "2026-03-01", to: "2026-12-31" }))!;
      assert.equal(a.statement.opening, 5000);
      assert.deepEqual(a.statement.lines.map((l) => l.number), ["REC-4", "RFD-1"]);
      assert.equal(a.statement.closing, 4200);
      assert.equal((await analysePartyById("customer", "cu1", { from: "2026-12-31", to: "2026-01-31" }))!.statement.from, "2026-01-31", "a reversed range is folded to the end date");
    });
  });

  await t("vendor statement: bills, processed payments and issued debit notes only", async () => {
    await inA(async () => {
      const a = (await analysePartyById("vendor", "ve1", RANGE))!;
      assert.deepEqual(a.statement.lines.map((l) => l.number), ["INV-0001", "PAY-1", "DBN-1"]);
      assert.equal(a.statement.closing, 5200, "8000 + 200 debit note - 3000 paid");
      assert.deepEqual(a.held.map((h) => h.number), ["PAY-3"]);
      assert.equal(a.ageing.items.length, 1);
      assert.equal(a.ageing.items[0].outstanding, 5200);
      assert.equal(a.flags.some((f) => f.code === "record_mismatch"), false);
    });
  });

  await t("vendor with a duplicate bill and an over-payment is flagged on both counts", async () => {
    await inA(async () => {
      const a = (await analysePartyById("vendor", "ve2", RANGE))!;
      assert.equal(a.balance, -500);
      assert.ok(a.flags.some((f) => f.code === "duplicate" && f.docIds.length === 2));
      assert.ok(a.flags.some((f) => f.code === "unusual_balance" && f.message.includes("debit balance")));
    });
  });

  await t("an unknown or empty party gives an empty statement; a missing party cannot be confirmed", async () => {
    await inA(async () => {
      const a = (await analysePartyById("customer", "cu_empty", RANGE))!;
      assert.equal(a.balance, 0);
      assert.deepEqual(a.statement.lines, []);
      assert.deepEqual(a.flags, []);
      const r = await saveConfirmation({ kind: "customer", partyId: "nobody", asOf: "2026-03-31", theirBalance: null, status: "requested", note: "" }, alice);
      assert.equal(r.ok, false);
    });
  });

  await t("the overview is paged, searchable and carries balance, overdue and the unusual flag", async () => {
    await inA(async () => {
      const c = await listPartyOverview("customer", { pageSize: 1, page: 1 });
      assert.equal(c.total, 2);
      assert.equal(c.rows.length, 1);
      assert.equal(c.totalPages, 2);
      const all = await listPartyOverview("customer", { pageSize: 500 });
      assert.equal(all.pageSize, 50, "page size is capped");
      const acme = all.rows.find((r) => r.id === "cu1")!;
      assert.equal(acme.balance, 4200);
      assert.ok(acme.overdue > 0, "INV-1 fell due months ago");
      assert.equal(acme.unusual, false);
      const v = await listPartyOverview("vendor", {});
      assert.equal(v.rows.find((r) => r.id === "ve2")!.unusual, true);
      assert.equal(v.rows.find((r) => r.id === "ve1")!.balance, 5200);
      assert.deepEqual((await listPartyOverview("vendor", { search: "paper" })).rows.map((r) => r.id), ["ve2"]);
    });
  });

  await t("confirmations: the rules for each status", async () => {
    await inA(async () => {
      const base = { kind: "customer" as const, partyId: "cu1", asOf: "2026-03-31", note: "" };
      assert.equal((await saveConfirmation({ ...base, theirBalance: 4000, status: "requested" }, alice)).ok, false, "no figure until they reply");
      assert.equal((await saveConfirmation({ ...base, theirBalance: null, status: "agreed" }, alice)).ok, false);
      const wrong = await saveConfirmation({ ...base, theirBalance: 3500, status: "agreed" }, alice);
      assert.equal(wrong.ok, false, "cannot call it agreed when the figures differ");
      assert.equal((await saveConfirmation({ ...base, theirBalance: 3500, status: "written_off" }, alice)).ok, false, "needs a reason");
      assert.equal((await saveConfirmation({ ...base, asOf: "2999-01-01", theirBalance: null, status: "requested" }, alice)).ok, false, "future date");
      assert.equal((await saveConfirmation({ ...base, asOf: "2026-02-30", theirBalance: null, status: "requested" }, alice)).ok, false, "impossible date");
      assert.equal((await saveConfirmation({ ...base, theirBalance: 5000, status: "bogus" as never }, alice)).ok, false);
      assert.equal((await saveConfirmation({ ...base, theirBalance: Number.NaN, status: "disputed", note: "check it" }, alice)).ok, false);
      assert.equal((await listConfirmations("customer", "cu1")).length, 0, "nothing refused was saved");

      const asked = await saveConfirmation({ ...base, theirBalance: null, status: "requested" }, alice);
      assert.ok(asked.ok && asked.confirmation.ourBalance === 4000 && asked.confirmation.difference === null);
      const same = await saveConfirmation({ ...base, theirBalance: 4000, status: "disputed", note: "no difference really" }, alice);
      assert.equal(same.ok, false, "equal balances cannot be disputed");
      const agreed = await saveConfirmation({ ...base, theirBalance: 4000, status: "agreed" }, alice);
      assert.ok(agreed.ok && agreed.confirmation.status === "agreed" && agreed.confirmation.difference === 0);
      assert.equal((await listConfirmations("customer", "cu1")).length, 1, "same party and date: updated, not duplicated");
    });
  });

  await t("a disputed confirmation stores the difference and the likely cause the data points to", async () => {
    await inA(async () => {
      // they never saw our 4000 receipt of 15 Feb, so they say 9000 instead of 5000
      const r = await saveConfirmation({ kind: "customer", partyId: "cu1", asOf: "2026-03-01", theirBalance: 9000, status: "disputed", note: "They say no receipt" }, alice);
      assert.ok(r.ok);
      if (!r.ok) return;
      assert.equal(r.confirmation.ourBalance, 5000);
      assert.equal(r.confirmation.difference, -4000);
      assert.ok(r.confirmation.explanations.some((e) => e.includes("REC-1")), "the 4,000 receipt is named");
      const row = (await listPartyOverview("customer", {})).rows.find((x) => x.id === "cu1")!;
      assert.equal(row.confirmation!.asOf, "2026-03-31", "the overview shows the most recent date's status");
      const vend = await saveConfirmation({ kind: "vendor", partyId: "ve1", asOf: "2026-03-31", theirBalance: 5200, status: "agreed" }, bob);
      assert.ok(vend.ok);
    });
  });

  await t("preview compares today's balance with theirs and finds a timing difference", async () => {
    await inA(async () => {
      const p = await previewConfirmation({ kind: "customer", partyId: "cu1", theirBalance: 4000, theirAsOf: "2026-03-09" });
      assert.ok(p.ok);
      if (!p.ok) return;
      assert.equal(p.comparison.ourBalance, 4200);
      assert.equal(p.comparison.difference, 200, "ours is 4200, theirs 4000");
      assert.equal(p.comparison.explanations.find((e) => e.code === "timing")!.confidence, "possible");
      assert.equal((await previewConfirmation({ kind: "customer", partyId: "cu1", theirBalance: 1, theirAsOf: "2026-03-09", ourAsOf: "2026-03-01" })).ok, false);
      assert.equal((await previewConfirmation({ kind: "customer", partyId: "cu1", theirBalance: 1, theirAsOf: "nope" })).ok, false);
    });
  });

  await t("two people confirming the same party and date at the same moment leave one record and no error", async () => {
    await inA(async () => {
      const key = { kind: "vendor" as const, partyId: "ve2", asOf: "2026-04-30" };
      const results = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => saveConfirmation({ ...key, theirBalance: -500 + n * 0, status: "agreed", note: `p${n}` }, n % 2 ? alice : bob)));
      assert.ok(results.every((r) => r.ok), JSON.stringify(results.filter((r) => !r.ok)));
      const db = await getDb();
      assert.equal(await db.collection(CONFIRMATIONS_COLLECTION).countDocuments(key), 1);
      const idx = await db.collection(CONFIRMATIONS_COLLECTION).indexes();
      assert.ok(idx.some((i) => i.unique && ["kind", "partyId", "asOf"].every((k) => k in i.key)), "uniqueness is enforced by an index, not by luck");
    });
  });

  await t("write-off register: amount and reason rules, and the party must own the document", async () => {
    await inA(async () => {
      const ok = { kind: "customer" as const, partyId: "cu1", docId: "i1", reason: "Customer closed down" };
      assert.equal((await proposeWriteOff({ ...ok, amount: 0 }, alice)).ok, false);
      assert.equal((await proposeWriteOff({ ...ok, amount: -5 }, alice)).ok, false);
      assert.equal((await proposeWriteOff({ ...ok, amount: Number.NaN }, alice)).ok, false);
      assert.equal((await proposeWriteOff({ ...ok, amount: 100, reason: "no" }, alice)).ok, false);
      assert.equal((await proposeWriteOff({ ...ok, amount: 5000.01 }, alice)).ok, false, "more than the 5,000.00 outstanding");
      assert.equal((await proposeWriteOff({ ...ok, docId: "b1", amount: 100 }, alice)).ok, false, "a vendor bill is not this customer's invoice");
      assert.equal((await proposeWriteOff({ ...ok, docId: "i2", amount: 100 }, alice)).ok, false, "a cancelled invoice has nothing outstanding");
      assert.equal((await listWriteOffs("customer", "cu1")).length, 0);
      const first = await proposeWriteOff({ ...ok, amount: 3000 }, alice);
      assert.ok(first.ok);
      const over = await proposeWriteOff({ ...ok, amount: 2500 }, alice);
      assert.equal(over.ok, false, "3,000 already proposed, only 2,000 left");
      assert.ok(!over.ok && over.error.includes("2000.00"));
    });
  });

  await t("two proposals at once cannot together exceed what is outstanding", async () => {
    await inA(async () => {
      const ok = { kind: "customer" as const, partyId: "cu1", docId: "i1", reason: "Disputed and aged", amount: 1500 };
      const res = await Promise.all([proposeWriteOff(ok, alice), proposeWriteOff(ok, bob)]);
      assert.equal(res.filter((r) => r.ok).length, 1, "only one fits in the 2,000 left");
      const total = (await listWriteOffs("customer", "cu1")).reduce((n, w) => n + w.amount, 0);
      assert.equal(total, 4500);
    });
  });

  await t("approval needs a different person, works once, and a proposal alone can be withdrawn", async () => {
    await inA(async () => {
      const p = await proposeWriteOff({ kind: "vendor", partyId: "ve1", docId: "b1", amount: 100, reason: "Vendor credit agreed by email" }, alice);
      assert.ok(p.ok);
      if (!p.ok) return;
      const id = p.writeOff._id;
      const self = await approveWriteOff(id, alice);
      assert.equal(self.ok, false);
      assert.ok(!self.ok && self.error.includes("different person"));
      assert.equal((await listWriteOffs("vendor", "ve1"))[0].status, "proposed");
      const both = await Promise.all([approveWriteOff(id, bob), approveWriteOff(id, { id: "u_carol", email: null })]);
      assert.equal(both.filter((r) => r.ok).length, 1, "approved exactly once");
      const w = (await listWriteOffs("vendor", "ve1"))[0];
      assert.equal(w.status, "approved");
      assert.ok(w.approvedBy === "u_bob" || w.approvedBy === "u_carol");
      assert.notEqual(w.approvedBy, w.proposedBy);
      assert.equal((await approveWriteOff(id, bob)).ok, false, "already approved");
      assert.equal((await withdrawWriteOff(id, alice)).ok, false, "an approved decision stays on record");
      assert.equal((await approveWriteOff("nope", bob)).ok, false);
      const q = await proposeWriteOff({ kind: "vendor", partyId: "ve1", docId: "b1", amount: 50, reason: "Second small item" }, alice);
      assert.ok(q.ok);
      if (!q.ok) return;
      assert.ok((await withdrawWriteOff(q.writeOff._id, alice)).ok);
      assert.equal((await listWriteOffs("vendor", "ve1")).length, 1, "withdrawn one is gone from the register");
    });
  });

  await t("the register and confirmations post nothing to the ledger and change no source document", async () => {
    await inA(async () => {
      const db = await getDb();
      for (const c of ["fms_transactions", "fms_journal_entries", "fms_bank_accounts"]) assert.equal(await db.collection(c).countDocuments({}), 0, c);
      assert.equal((await db.collection("fms_invoices").findOne({ _id: "i1" }))!.amountCredited, 1000);
      assert.equal((await db.collection("prms_invoices").findOne({ _id: "b1" }))!.amountPaid, 3000);
      const audit = await db.collection("fms_activity_logs").find({ entity: { $in: ["customer", "vendor"] } }).toArray();
      assert.ok(audit.some((a) => a.action === "approve") && audit.some((a) => a.action === "record") && audit.some((a) => a.action === "create"));
    });
  });

  await t("another company sees none of it", async () => {
    await inB(async () => {
      assert.equal((await listPartyOverview("customer", {})).total, 0);
      assert.equal(await analysePartyById("customer", "cu1", RANGE).then((a) => a!.balance), 0, "no documents for that id here");
      assert.equal((await listConfirmations("customer", "cu1")).length, 0);
      assert.equal((await listWriteOffs("vendor", "ve1")).length, 0);
      assert.equal((await saveConfirmation({ kind: "customer", partyId: "cu1", asOf: "2026-03-31", theirBalance: null, status: "requested", note: "" }, alice)).ok, false, "the party does not exist in this company");
      assert.equal((await (await getDb()).collection(WRITE_OFFS_COLLECTION).countDocuments({})), 0);
    });
  });

  await t("helpers: financial-year start and amount parsing", async () => {
    assert.equal(defaultFrom("2026-03-31"), "2025-04-01");
    assert.equal(defaultFrom("2026-04-01"), "2026-04-01");
    assert.equal(defaultFrom("2026-12-31"), "2026-04-01");
    assert.equal(parseAmount("1,23,456.789"), 123456.79);
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount("abc"), null);
    assert.equal(parseAmount("1e30"), null);
    assert.equal(parseAmount(-50), -50);
  });

  console.log("party reconciliation flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
