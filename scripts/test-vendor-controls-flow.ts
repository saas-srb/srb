import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { DEFAULT_CONTROLS, savePaymentControls } from "../src/lib/products/cashflow-ai/payment-controls";
import { saveBeneficiary } from "../src/lib/products/cashflow-ai/beneficiaries";
import { vendorPayee } from "../src/lib/products/cashflow-ai/payments/payees";
import { payableOnBill, recordVendorPayment } from "../src/lib/products/cashflow-ai/vendor-payments";
import {
  adjustAdvance, adjustedAgainstBill, createAdvance, getMsmeDays, listAdvances, listBankReview, listMsmeBills, refundAdvance, saveMsme, saveMsmeDays, syncVendorBank, vendorPayoutProblem, verifyVendorDetails,
} from "../src/lib/products/cashflow-ai/vendor-controls/store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*) with PLATFORM_ENCRYPTION_KEY set.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const U1 = { id: "u1", email: "u1@a.example" };
const U2 = { id: "u2", email: "u2@a.example" };
const TODAY = "2026-10-28";
const bank = (acct: string, ifsc = "HDFC0000001") => ({ entityType: "vendor" as const, entityId: "ven_1", beneficiaryName: "Acme Supplies", bankName: "HDFC", accountNumber: acct, ifsc });
const verify = (token: string, who = U2) => verifyVendorDetails("ven_1", { token, method: "phone_known_number", note: "Called Mr Rao on the number in our contract" }, who);

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_vc", async () => {
    const db = await getDb();
    const now = new Date();
    const vendor = (id: string, name: string) => db.collection("prms_vendors").insertOne({ _id: id, companyName: name, vendorCode: id, status: "active", createdAt: now, updatedAt: now, deletedAt: null } as never);
    const bill = (id: string, vendorId: string, net: number, date: string, paid = 0) => db.collection("prms_invoices").insertOne({ _id: id, invoiceNumber: id.toUpperCase(), vendorId, vendorName: vendorId, currency: "INR", invoiceDate: date, netPayable: net, amountPaid: paid, status: "approved", createdAt: now, updatedAt: now, deletedAt: null } as never);
    await vendor("ven_1", "Acme Supplies");
    await vendor("ven_2", "Bolt Traders");
    await vendor("ven_3", "No Bank Co");

    await t("a vendor's first details are paid as saved (after the usual cooling-off wait) and shown as not independently checked", async () => {
      await saveBeneficiary(bank("50100012345678"), "u1");
      const held = await vendorPayee("ven_1", "Acme Supplies");
      assert.ok(!held.ok && /recently/.test(held.error), "the existing 24 hour wait still applies");
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0 }, "u1");
      const p = await vendorPayee("ven_1", "Acme Supplies");
      assert.ok(p.ok && p.payee.accountNumber === "50100012345678");
      const row = (await listBankReview()).rows.find((r) => r.vendorId === "ven_1")!;
      assert.equal(row.status, "verified");
      assert.ok(row.baseline);
    });

    let token = "";
    await t("changed details wait; the old verified details stay in force", async () => {
      await saveBeneficiary(bank("60200098765432", "ICIC0000002"), "u1");
      const p = await vendorPayee("ven_1", "Acme Supplies");
      assert.ok(p.ok && p.payee.accountNumber === "50100012345678" && p.payee.ifsc === "HDFC0000001", "still paying the old account");
      assert.ok(!(await vendorPayoutProblem("ven_1", { accountNumber: "50100012345678", ifsc: "HDFC0000001" })));
      assert.ok(await vendorPayoutProblem("ven_1", { accountNumber: "60200098765432", ifsc: "ICIC0000002" }), "the new account is refused");
      const row = (await listBankReview()).rows.find((r) => r.vendorId === "ven_1")!;
      assert.equal(row.status, "awaiting");
      assert.equal(row.pending!.last4, "5432");
      assert.equal(row.verifiedLast4, "5678");
      token = row.pending!.token;
    });

    await t("only last-4 is kept in the history, never a full number", async () => {
      const raw = await db.collection("fms_vendor_bank_state").findOne({ _id: "ven_1" as never });
      const text = JSON.stringify(raw);
      assert.ok(!text.includes("50100012345678") && !text.includes("60200098765432"), "no full account number anywhere in the state");
      const hist = (raw!.history as { kind: string; oldLast4: string | null; newLast4: string | null }[]);
      const ch = hist.find((h) => h.kind === "changed")!;
      assert.equal(ch.oldLast4, "5678");
      assert.equal(ch.newLast4, "5432");
    });

    await t("the person who changed the details cannot verify them", async () => {
      const r = await verify(token, U1);
      assert.ok(!r.ok && /yourself/.test(r.error));
      assert.equal((await listBankReview()).rows.find((r) => r.vendorId === "ven_1")!.status, "awaiting");
    });

    await t("a verification needs a method and a note, and the exact details it was shown", async () => {
      assert.ok(!(await verifyVendorDetails("ven_1", { token, method: "phone_known_number", note: "ok" }, U2)).ok);
      assert.ok(!(await verifyVendorDetails("ven_1", { token: "stale", method: "in_writing", note: "Letter received on letterhead" }, U2)).ok);
    });

    await t("if the details change again, a verification of the earlier ones is refused", async () => {
      await saveBeneficiary(bank("70300011112222", "SBIN0000003"), "u1");
      const r = await verify(token);
      assert.ok(!r.ok && /changed again/.test(r.error));
      token = (await listBankReview()).rows.find((r) => r.vendorId === "ven_1")!.pending!.token;
    });

    await t("a second person verifies; the new details are then paid and the old are gone", async () => {
      const r = await verify(token);
      assert.ok(r.ok, !r.ok ? r.error : "");
      const p = await vendorPayee("ven_1", "Acme Supplies");
      assert.ok(p.ok && p.payee.accountNumber === "70300011112222" && p.payee.ifsc === "SBIN0000003");
      const row = (await listBankReview()).rows.find((r) => r.vendorId === "ven_1")!;
      assert.equal(row.status, "verified");
      assert.ok(!row.baseline);
      assert.ok(row.history.some((h) => h.kind === "verified" && h.note));
      assert.ok(!(await verify(token)).ok, "the same verification cannot be applied twice");
    });

    await t("a changed UPI id alone also waits", async () => {
      await db.collection("fms_beneficiaries").updateOne({ entityId: "ven_1" }, { $set: { upiId: "acme@okbank", detailsChangedAt: new Date(), updatedBy: "u1" } });
      const row = (await listBankReview()).rows.find((r) => r.vendorId === "ven_1")!;
      assert.equal(row.status, "awaiting");
      assert.ok(row.pending!.upiSet);
      const p = await vendorPayee("ven_1", "Acme Supplies");
      assert.ok(p.ok && !p.payee.upiId, "payments do not use the unverified UPI id");
    });

    await t("changing back to the verified details drops the wait", async () => {
      await db.collection("fms_beneficiaries").updateOne({ entityId: "ven_1" }, { $set: { upiId: null, updatedBy: "u1" } });
      const row = (await listBankReview()).rows.find((r) => r.vendorId === "ven_1")!;
      assert.equal(row.status, "verified");
      assert.equal(row.pending, null);
    });

    await t("a vendor whose details were changed before they were ever checked has no payable details", async () => {
      await saveBeneficiary({ ...bank("11112222333344"), entityId: "ven_2", beneficiaryName: "Bolt Traders" }, "u1");
      await new Promise((r) => setTimeout(r, 300));
      await saveBeneficiary({ ...bank("99998888777766"), entityId: "ven_2", beneficiaryName: "Bolt Traders" }, "u1");
      // The check normally runs the moment details are saved (which makes the first details the baseline). Forget that, to cover the other
      // path: a change nobody has looked at yet is still caught when the details are next read or paid.
      await db.collection("fms_vendor_bank_state").deleteOne({ _id: "ven_2" as never });
      const p = await vendorPayee("ven_2", "Bolt Traders");
      assert.ok(!p.ok && /not been verified/.test(p.error));
      const review = await listBankReview();
      assert.equal(review.rows.find((r) => r.vendorId === "ven_2")!.verifiedLast4, null);
      assert.ok(review.noDetails.some((v) => v.vendorId === "ven_3"), "a vendor with no details is listed");
      await bill("inv_blocked", "ven_2", 5000, "2026-10-01");
      const pay = await recordVendorPayment({ invoiceId: "inv_blocked", amount: 5000, paymentDate: TODAY, method: "neft", transactionReference: null, tdsDeducted: 0, status: "processed", notes: null } as never, "u1", null);
      assert.ok(!pay.ok && /not been verified/.test(pay.reason ?? ""), "the payment never reaches the payout starter");
      assert.equal(await db.collection("prms_payments").countDocuments({ invoiceId: "inv_blocked", deletedAt: null }), 0, "no half-made payment is left");
      assert.ok(await vendorPayoutProblem("ven_2", { accountNumber: "99998888777766", ifsc: "HDFC0000001" }));
      const first = await syncVendorBank("ven_2");
      assert.equal(first.state!.pending!.last4, "7766");
    });

    await t("saving details checks them at once: the first details stay payable and a later change waits, with its editor on record", async () => {
      await saveBeneficiary({ ...bank("55556666777788"), entityId: "ven_5", beneficiaryName: "Crest Metals" }, "u1");
      await saveBeneficiary({ ...bank("12121212121212"), entityId: "ven_5", beneficiaryName: "Crest Metals" }, "u2");
      const p = await vendorPayee("ven_5", "Crest Metals");
      assert.ok(p.ok && p.payee.accountNumber === "55556666777788", "the earlier details stay in force");
      const row = (await listBankReview()).rows.find((r) => r.vendorId === "ven_5")!;
      assert.equal(row.status, "awaiting");
      assert.equal(row.pending!.last4, "1212");
      assert.equal(row.pending!.changedById, "u2", "the editor is recorded straight away");
    });

    await t("the editor cannot verify a vendor that never had verified details, but a colleague can", async () => {
      const tok = (await listBankReview()).rows.find((r) => r.vendorId === "ven_2")!.pending!.token;
      assert.ok(!(await verifyVendorDetails("ven_2", { token: tok, method: "in_writing", note: "Letter on letterhead received" }, U1)).ok);
      assert.ok((await verifyVendorDetails("ven_2", { token: tok, method: "in_writing", note: "Letter on letterhead received" }, U2)).ok);
      const p = await vendorPayee("ven_2", "Bolt Traders");
      assert.ok(p.ok && p.payee.accountNumber === "99998888777766");
    });

    await t("MSME: unconfirmed until the company sets days; then due dates, month ends and lateness", async () => {
      assert.ok(!(await saveMsme("ven_1", { category: "micro", udyam: "bad" }, U1)).ok);
      assert.ok((await saveMsme("ven_1", { category: "micro", udyam: "udyam-mh-01-1234567" }, U1)).ok);
      assert.ok(!(await saveMsme("nope", { category: "micro", udyam: "UDYAM-MH-01-1234567" }, U1)).ok);
      assert.ok((await saveMsme("ven_2", { category: "none", udyam: "" }, U1)).ok);
      await bill("inv_m1", "ven_1", 10000, "2026-01-31");
      await bill("inv_m2", "ven_1", 20000, "2026-10-20");
      await bill("inv_m3", "ven_2", 99999, "2026-01-01");
      assert.equal(await getMsmeDays(), null);
      const before = await listMsmeBills(TODAY);
      assert.equal(before.days, null);
      assert.ok(before.bills.length === 2 && before.bills.every((b) => b.state === "unconfirmed" && b.dueBy === null), "nothing is judged without confirmed days");
      assert.ok(!(await saveMsmeDays("0", U1)).ok);
      assert.ok((await saveMsmeDays("30", U1)).ok);
      const r = await listMsmeBills(TODAY);
      const m1 = r.bills.find((b) => b.billNumber === "INV_M1")!;
      assert.equal(m1.dueBy, "2026-03-02", "31 Jan + 30 days crosses February");
      assert.equal(m1.state, "overdue");
      assert.equal(r.bills.find((b) => b.billNumber === "INV_M2")!.dueBy, "2026-11-19");
      assert.ok(!r.bills.some((b) => b.vendorId === "ven_2"), "a non-MSME vendor's bills are not listed");
      assert.equal(r.bills[0].billNumber, "INV_M1", "the latest first");
      await db.collection("prms_invoices").updateOne({ _id: "inv_m1" as never }, { $set: { amountPaid: 10000, status: "paid" } });
      assert.ok(!(await listMsmeBills(TODAY)).bills.some((b) => b.billNumber === "INV_M1"), "a paid bill drops off");
      assert.ok((await saveMsmeDays("", U1)).ok);
      assert.equal(await getMsmeDays(), null, "emptying it goes back to not confirmed");
    });

    await t("advances: recorded, validated, adjusted within limits, bill payable reduced, refunded", async () => {
      assert.ok(!(await createAdvance("ven_1", { kind: "advance", amount: "0", paidOn: "2026-10-01", purpose: "Advance" }, TODAY, U1)).ok);
      assert.ok(!(await createAdvance("nope", { kind: "advance", amount: "10000", paidOn: "2026-10-01", purpose: "Advance" }, TODAY, U1)).ok);
      const a = await createAdvance("ven_1", { kind: "advance", amount: "10000", paidOn: "2026-10-01", purpose: "Advance for the order" }, TODAY, U1);
      assert.ok(a.ok);
      if (!a.ok) return;
      await bill("inv_a1", "ven_1", 6000, "2026-10-10");
      await bill("inv_other", "ven_2", 6000, "2026-10-10");
      assert.ok(!(await adjustAdvance(a.id, "inv_a1", "6000.01", U1)).ok, "more than the bill owes");
      assert.ok(!(await adjustAdvance(a.id, "inv_other", "100", U1)).ok, "another vendor's bill");
      assert.ok(!(await adjustAdvance(a.id, "inv_a1", "abc", U1)).ok);
      assert.ok((await adjustAdvance(a.id, "inv_a1", "4000", U1)).ok);
      assert.equal(await adjustedAgainstBill("inv_a1"), 4000);
      const room = await payableOnBill("inv_a1");
      assert.ok(room.ok && room.remaining === 2000, "only the rest of the bill can be paid in cash");
      assert.ok(!(await adjustAdvance(a.id, "inv_a1", "2500", U1)).ok, "more than the bill still owes after the first adjustment");
      assert.ok((await adjustAdvance(a.id, "inv_a1", "2000", U1)).ok);
      const row = (await listAdvances()).find((x) => x.id === a.id)!;
      assert.equal(row.remaining, 4000);
      assert.equal(row.status, "open");
      assert.ok(!(await refundAdvance(a.id, { on: "2026-12-01", note: null }, TODAY, U1)).ok, "future date");
      assert.ok((await refundAdvance(a.id, { on: "2026-10-27", note: "Vendor returned it" }, TODAY, U1)).ok);
      const done = (await listAdvances()).find((x) => x.id === a.id)!;
      assert.equal(done.status, "refunded");
      assert.equal(done.remaining, 0);
      assert.equal(done.refund!.amount, 4000);
      assert.ok(!(await adjustAdvance(a.id, "inv_a1", "1", U1)).ok, "a refunded advance cannot be adjusted");
      assert.ok(!(await refundAdvance(a.id, { on: "2026-10-27", note: null }, TODAY, U1)).ok, "nor refunded twice");
    });

    await t("an advance fully used becomes adjusted", async () => {
      const a = await createAdvance("ven_1", { kind: "deposit", amount: "1500", paidOn: "2026-10-02", purpose: "Security deposit" }, TODAY, U1);
      assert.ok(a.ok);
      if (!a.ok) return;
      await bill("inv_a2", "ven_1", 3000, "2026-10-11");
      assert.ok((await adjustAdvance(a.id, "inv_a2", "1500", U1)).ok);
      const row = (await listAdvances()).find((x) => x.id === a.id)!;
      assert.equal(row.status, "adjusted");
      assert.equal(row.remaining, 0);
    });

    await t("two adjustments at once cannot exceed the open amount", async () => {
      const a = await createAdvance("ven_1", { kind: "advance", amount: "1000", paidOn: "2026-10-03", purpose: "Concurrent advance" }, TODAY, U1);
      assert.ok(a.ok);
      if (!a.ok) return;
      await bill("inv_c1", "ven_1", 5000, "2026-10-12");
      await bill("inv_c2", "ven_1", 5000, "2026-10-12");
      const rs = await Promise.all([adjustAdvance(a.id, "inv_c1", "600", U1), adjustAdvance(a.id, "inv_c2", "600", U2), adjustAdvance(a.id, "inv_c1", "600", U2)]);
      assert.equal(rs.filter((r) => r.ok).length, 1, "only one of three 600s fits in 1000");
      const row = (await listAdvances()).find((x) => x.id === a.id)!;
      assert.equal(row.remaining, 400);
      assert.equal(row.adjustments.length, 1);
    });

    await t("two advances adjusted at once against one bill cannot cover more than it owes", async () => {
      const a = await createAdvance("ven_1", { kind: "advance", amount: "5000", paidOn: "2026-10-03", purpose: "Advance one" }, TODAY, U1);
      const b = await createAdvance("ven_1", { kind: "advance", amount: "5000", paidOn: "2026-10-03", purpose: "Advance two" }, TODAY, U1);
      assert.ok(a.ok && b.ok);
      if (!a.ok || !b.ok) return;
      await bill("inv_c3", "ven_1", 1000, "2026-10-12");
      await Promise.all([adjustAdvance(a.id, "inv_c3", "800", U1), adjustAdvance(b.id, "inv_c3", "800", U2)]);
      assert.ok((await adjustedAgainstBill("inv_c3")) <= 1000, "never more than the bill owes");
      const rows = await listAdvances();
      for (const id of [a.id, b.id]) { const r = rows.find((x) => x.id === id)!; assert.equal(r.remaining, 5000 - r.adjustments.reduce((n, j) => n + j.amount, 0), "an undone adjustment gives the money back to the advance"); }
    });
  });

  await runAsCompany("co_vc_other", async () => {
    await t("another company sees none of this", async () => {
      assert.equal((await listAdvances()).length, 0);
      assert.equal((await listBankReview()).rows.length, 0);
      assert.equal(await getMsmeDays(), null);
      assert.equal((await listMsmeBills(TODAY)).bills.length, 0);
      assert.equal((await syncVendorBank("ven_1")).state, null);
      const p = await vendorPayee("ven_1", "Acme Supplies");
      assert.ok(!p.ok && /no bank details/.test(p.error));
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log("vendor controls (database): all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
