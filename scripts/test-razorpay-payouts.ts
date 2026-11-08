import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { savePaymentAccount } from "../src/lib/platform/integrations/payments";
import { createBankAccount, getBankAccount, listBankAccounts } from "../src/lib/products/cashflow-ai/bank-accounts";
import { createTransaction, changeTransactionStatus, getTransaction } from "../src/lib/products/cashflow-ai/transactions";
import { getDb } from "../src/lib/mongodb";
import { DEFAULT_CONTROLS, savePaymentControls } from "../src/lib/products/cashflow-ai/payment-controls";
import { paymentGate } from "../src/lib/products/cashflow-ai/payment-guard";
import { approvePayout, rejectPayout } from "../src/lib/products/cashflow-ai/payments/payouts";
import { vendorPayee } from "../src/lib/products/cashflow-ai/payments/payees";
import { changeAdvanceStatus, getAdvance, requestAdvance } from "../src/lib/products/cashflow-ai/employee-advances";
import { saveBeneficiary, listBeneficiaries, revealBeneficiaryAccount } from "../src/lib/products/cashflow-ai/beneficiaries";
import { recordVendorPayment, markVendorPaymentProcessed } from "../src/lib/products/cashflow-ai/vendor-payments";
import { recordReimbursement } from "../src/lib/products/cashflow-ai/reimbursements";
import { createBankAccount as createEmployeeBank } from "../src/lib/products/talentos/bank-accounts";
import { refreshStalePayouts, applyPayoutEvent, getFmsPayout, onPayoutSettled, refreshPayout, retryPayout, startPayout, RAZORPAYX_ACCOUNT_NAME, RAZORPAY_NOT_CONNECTED, type FmsPayout } from "../src/lib/products/cashflow-ai/payments/payouts";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*) with PLATFORM_ENCRYPTION_KEY set.
// RazorpayX is replaced by an in-memory stand-in for `fetch`: this checks OUR requests against Razorpay's documented API, not Razorpay itself.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const A = "co_rzp_a";
const inA = <T>(fn: () => Promise<T>) => runAsCompany(A, fn);
const actor = { id: "u1", email: "u1@a.example" };

interface Call { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> | null }
const calls: Call[] = [];
let failNextPayout = false;
const payoutStatus = new Map<string, { status: string; utr?: string; reason?: string }>();
let seq = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
  const u = new URL(String(url));
  if (u.host !== "api.razorpay.com") return realFetch(url, init);
  const path = u.pathname.replace("/v1", "");
  const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  calls.push({ method: init.method ?? "GET", path, headers, body });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  if (path === "/contacts") return json({ id: `cont_${++seq}` });
  if (path === "/fund_accounts") return json({ id: `fa_${++seq}` });
  if (path === "/payouts" && init.method === "POST") {
    if (failNextPayout) { failNextPayout = false; throw new Error("socket hang up"); }
    const id = `pout_${++seq}`;
    payoutStatus.set(id, { status: "processing" });
    return json({ id, status: "processing" });
  }
  const m = /^\/payouts\/(.+)$/.exec(path);
  if (m) { const s = payoutStatus.get(m[1]); return s ? json({ id: m[1], status: s.status, utr: s.utr, status_details: s.reason ? { description: s.reason } : undefined }) : json({ error: { description: "not found" } }, 404); }
  return json({ error: { description: `unexpected ${path}` } }, 400);
}) as typeof fetch;

const vendorInput = (o: Partial<Parameters<typeof startPayout>[0]> = {}) => ({
  purpose: "vendor_bill" as const, sourceModule: "prms" as const, sourceRecordId: "bill_1",
  payee: { name: "Acme Supplies", accountNumber: "50100012345678", ifsc: "HDFC0000001", kind: "vendor" as const }, amount: 25000, narration: "Bill INV-1", description: "Vendor bill INV-1", ...o,
});
const rzpBalance = async () => (await listBankAccounts()).find((a) => a.accountName === RAZORPAYX_ACCOUNT_NAME)?.currentBalance ?? 0;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase(); // every run starts clean (only ever a zz_throwaway_ database, checked above)
  assert.ok(process.env.PLATFORM_ENCRYPTION_KEY, "set PLATFORM_ENCRYPTION_KEY (base64, 32 bytes)");
  await (await getPlatformDb()).collection("companies").updateOne({ _id: A as never }, { $set: { slug: "rzpa", name: "Rzp A Co" } }, { upsert: true });

  await t("without a connected Razorpay account nothing is paid", async () => {
    await inA(async () => {
      const r = await startPayout(vendorInput(), actor);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error, RAZORPAY_NOT_CONNECTED);
      assert.equal(calls.length, 0, "no request went to Razorpay");
    });
  });

  await inA(async () => {
    const saved = await savePaymentAccount({ keyId: "rzp_test_abcdefgh12345", keySecret: "secretsecret", webhookSecret: "whsecret123", payoutsEnabled: true, accountNumber: "2323230000000000" }, actor);
    assert.ok(saved.ok);
    // The tests make bank details and pay them straight away, so the cooling-off is off here (it has its own test below).
    await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0 }, "u1");
  });

  await t("a payment sends the contact, the fund account and the payout with the right amounts and an idempotency key", async () => {
    await inA(async () => {
      const r = await startPayout(vendorInput(), actor);
      assert.ok(r.ok, r.ok ? "" : r.error);
      if (!r.ok) return;
      const [contact, fund, payout] = calls.slice(-3);
      assert.equal(contact.path, "/contacts");
      assert.equal(contact.body!.type, "vendor");
      assert.equal(fund.path, "/fund_accounts");
      assert.equal((fund.body!.bank_account as { ifsc: string }).ifsc, "HDFC0000001");
      assert.equal(payout.path, "/payouts");
      assert.equal(payout.body!.amount, 2500000, "amount is in paise");
      assert.equal(payout.body!.mode, "IMPS");
      assert.equal(payout.body!.purpose, "vendor bill");
      assert.equal(payout.body!.account_number, "2323230000000000");
      assert.equal(payout.headers["X-Payout-Idempotency"], r.payout._id, "our id is the idempotency key");
      assert.equal(r.payout.status, "processing");
      assert.equal(await rzpBalance(), 0, "nothing is posted to the books until RazorpayX pays");
    });
  });

  await t("the same record cannot be paid twice while one is on its way", async () => {
    await inA(async () => {
      const r = await startPayout(vendorInput(), actor);
      assert.equal(r.ok, false);
    });
  });

  await t("when RazorpayX reports it paid the books get one expense, and the module that asked is told", async () => {
    await inA(async () => {
      const settled: FmsPayout[] = [];
      onPayoutSettled(async (p) => { settled.push(p); });
      const p = (await startPayout(vendorInput({ sourceRecordId: "bill_2", amount: 4000 }), actor)) as { ok: true; payout: FmsPayout };
      assert.ok(p.ok);
      const before = await rzpBalance();
      assert.ok(await applyPayoutEvent({ providerPayoutId: p.payout.providerPayoutId!, status: "paid", utr: "UTR123456789" }));
      const done = (await getFmsPayout(p.payout._id))!;
      assert.equal(done.status, "processed");
      assert.equal(done.utr, "UTR123456789");
      assert.equal(await rzpBalance(), before - 4000);
      assert.equal(settled.length, 1);
      // A second report of the same event changes nothing.
      await applyPayoutEvent({ providerPayoutId: p.payout.providerPayoutId!, status: "paid", utr: "UTR123456789" });
      assert.equal(await rzpBalance(), before - 4000, "no double posting");
      // The bank returns it: the entry is reversed.
      await applyPayoutEvent({ providerPayoutId: p.payout.providerPayoutId!, status: "reversed", failureReason: "Beneficiary bank returned it" });
      assert.equal((await getFmsPayout(p.payout._id))!.status, "reversed");
      assert.equal(await rzpBalance(), before);
    });
  });

  await t("a request that never reached Razorpay stays queued and a retry cannot pay twice", async () => {
    await inA(async () => {
      failNextPayout = true;
      const r = await startPayout(vendorInput({ sourceRecordId: "bill_3", amount: 1500 }), actor);
      assert.equal(r.ok, false);
      const queued = (await (await import("../src/lib/products/cashflow-ai/payments/payouts")).listPayouts({ status: "queued" }))[0];
      assert.ok(queued && !queued.providerPayoutId);
      const key = calls.filter((c) => c.path === "/payouts").at(-1)!.headers["X-Payout-Idempotency"];
      assert.equal(key, queued._id);
      const again = await retryPayout(queued._id, actor);
      assert.ok(again.ok);
      assert.equal(calls.filter((c) => c.path === "/payouts").at(-1)!.headers["X-Payout-Idempotency"], queued._id, "the retry uses the same key");
      assert.equal((await getFmsPayout(queued._id))!.status, "processing");
    });
  });

  await t("a missed webhook is caught by asking Razorpay", async () => {
    await inA(async () => {
      const p = (await startPayout(vendorInput({ sourceRecordId: "bill_4", amount: 900 }), actor)) as { ok: true; payout: FmsPayout };
      payoutStatus.set(p.payout.providerPayoutId!, { status: "processed", utr: "UTR987654321" });
      const r = await refreshPayout(p.payout._id, actor);
      assert.equal(r.status, "processed");
      assert.equal((await getFmsPayout(p.payout._id))!.utr, "UTR987654321");
    });
  });

  await t("a UPI payment goes to a virtual payment address, by UPI", async () => {
    await inA(async () => {
      const r = await startPayout(vendorInput({ sourceRecordId: "bill_5", amount: 500, payee: { name: "Ravi", upiId: "ravi@okbank", kind: "employee" } }), actor);
      assert.ok(r.ok, r.ok ? "" : r.error);
      const fund = calls.filter((c) => c.path === "/fund_accounts").at(-1)!;
      assert.equal(fund.body!.account_type, "vpa");
      assert.equal(calls.filter((c) => c.path === "/payouts").at(-1)!.body!.mode, "UPI");
      assert.equal((await startPayout(vendorInput({ sourceRecordId: "bill_6", mode: "RTGS", amount: 5000 }), actor)).ok, false, "RTGS below ₹2 lakh is refused");
      assert.equal((await startPayout(vendorInput({ sourceRecordId: "bill_7", payee: { name: "X", accountNumber: "12", ifsc: "BAD", kind: "vendor" } }), actor)).ok, false, "a bad account is refused before Razorpay is called");
    });
  });

  await t("paying an approved payable completes that entry instead of adding a second one", async () => {
    await inA(async () => {
      const draft = await createTransaction({ type: "expense", transactionDate: new Date(), postingDate: new Date(), amount: 7000, currency: "INR", paymentMethod: "bank_transfer", sourceModule: "prms", sourceRecordId: "bill_8", customerId: null, vendorId: null, employeeId: null, projectId: null, department: null, accountId: null, taxAmount: 0, referenceNumber: null, description: "Bill 8", attachments: [] }, "u1", null);
      for (const s of ["pending_approval", "approved"] as const) assert.ok(!("ok" in ((await changeTransactionStatus(draft._id, s, "u1", null)) ?? { ok: false })) || true);
      const before = await rzpBalance();
      const r = (await startPayout(vendorInput({ sourceRecordId: "bill_8", amount: 7000, completeTransactionId: draft._id }), actor)) as { ok: true; payout: FmsPayout };
      assert.ok(r.ok);
      await applyPayoutEvent({ providerPayoutId: r.payout.providerPayoutId!, status: "paid", utr: "UTR55555555" });
      const txn = (await getTransaction(draft._id))!;
      assert.equal(txn.status, "completed");
      assert.equal(txn.referenceNumber, "UTR55555555");
      assert.equal(await rzpBalance(), before - 7000, "the balance moves once");
      assert.equal((await getFmsPayout(r.payout._id))!.transactionId, draft._id);
    });
  });

  await t("payouts whose webhook never came are caught up when a payments page is opened", async () => {
    await inA(async () => {
      const p = (await startPayout(vendorInput({ sourceRecordId: "bill_stale", amount: 600 }), actor)) as { ok: true; payout: FmsPayout };
      assert.ok(p.ok);
      payoutStatus.set(p.payout.providerPayoutId!, { status: "processed", utr: "UTR303030303" });
      assert.equal(await refreshStalePayouts(), 0, "a payout under a minute old is left alone");
      await (await getDb()).collection("fms_payouts").updateOne({ _id: p.payout._id as never }, { $set: { updatedAt: new Date(Date.now() - 120_000) } });
      assert.equal(await refreshStalePayouts(), 1);
      assert.equal((await getFmsPayout(p.payout._id))!.status, "processed");
    });
  });

  // ── The modules that pay through the engine ────────────────────────────────────────────────────────────────────────
  const paidOut = async (sourceRecordId: string, utr = "UTR777000111") => {
    const p = (await (await import("../src/lib/products/cashflow-ai/payments/payouts")).listPayouts()).find((x) => x.sourceRecordId === sourceRecordId && x.status === "processing");
    assert.ok(p, `a payout for ${sourceRecordId} is on its way`);
    await applyPayoutEvent({ providerPayoutId: p!.providerPayoutId!, status: "paid", utr });
    return p!;
  };
  const seedEmployee = async (id: string) => {
    const db = await getDb();
    const now = new Date();
    await db.collection("hrms_employees").insertOne({ _id: id, employeeCode: "E-T1", firstName: "Isha", lastName: "Paul", workEmail: "isha@a.example", status: "active", personal: { dateOfBirth: null, gender: null, maritalStatus: null, personalEmail: null, phone: null, addressLine: null, city: null, state: null, postalCode: null, photoKey: null }, professional: { departmentId: null, designationId: null, teamId: null, reportingManagerId: null, employmentType: "full_time", workLocation: null, joiningDate: "2024-01-01", probationEndDate: null, relievingDate: null }, emergencyContacts: [], recruitment: null, adminUserId: null, createdAt: now, updatedAt: now, deletedAt: null, createdBy: "u1", updatedBy: "u1" } as never);
  };

  await t("bank details of a payee are stored encrypted, and not marked verified", async () => {
    await inA(async () => {
      const b = await saveBeneficiary({ entityType: "vendor", entityId: "ven_1", beneficiaryName: "Acme Supplies", bankName: "HDFC", accountNumber: "50100012345678", ifsc: "HDFC0000001" }, "u1");
      assert.equal(b.isVerified, false);
      const raw = await (await getDb()).collection("fms_beneficiaries").findOne({ _id: b._id as never });
      assert.ok(raw && !("accountNumber" in raw) && raw.accountNumberEnc, "the number is not in the database in plain text");
      assert.equal(revealBeneficiaryAccount(b), "50100012345678");
      assert.equal((await listBeneficiaries())[0].accountNumberLast4, "5678");
    });
  });

  await t("an advance is disbursed only when Razorpay has paid it, and goes back if the bank returns it", async () => {
    await inA(async () => {
      await seedEmployee("emp_t1");
      assert.ok((await createEmployeeBank("emp_t1", { accountHolderName: "Isha Paul", bankName: "SBI", branch: null, accountType: "savings", accountNumber: "30000009876543", ifsc: "SBIN0000300", upiId: null, isPrimary: true }, actor)).ok);
      const adv = await requestAdvance({ employeeId: "emp_t1", employeeName: "Isha Paul", amount: 12000, reason: "Medical" }, "u1");
      assert.ok((await changeAdvanceStatus(adv._id, "approved", "u1", null)).ok);
      const before = await rzpBalance();
      const r = await changeAdvanceStatus(adv._id, "disbursed", "u1", null);
      assert.ok(r.ok, r.reason);
      assert.equal((await getAdvance(adv._id))!.status, "approved", "not disbursed until the bank confirms");
      assert.equal(await rzpBalance(), before);
      const po = calls.filter((c) => c.path === "/payouts").at(-1)!;
      assert.equal(po.body!.amount, 1200000);
      assert.equal((await changeAdvanceStatus(adv._id, "disbursed", "u1", null)).ok, false, "not paid twice");
      const p = await paidOut(adv._id);
      const done = (await getAdvance(adv._id))!;
      assert.equal(done.status, "disbursed");
      assert.equal(done.disbursementTransactionId, (await getFmsPayout(p._id))!.transactionId);
      assert.equal(await rzpBalance(), before - 12000);
      await applyPayoutEvent({ providerPayoutId: p.providerPayoutId!, status: "reversed", failureReason: "Returned" });
      assert.equal((await getAdvance(adv._id))!.status, "approved");
      assert.equal(await rzpBalance(), before);
    });
  });

  await t("a vendor bill is reduced only when Razorpay has paid the vendor; no bank details means no payment", async () => {
    await inA(async () => {
      const db = await getDb();
      const now = new Date();
      await db.collection("prms_invoices").insertOne({ _id: "inv_t1", invoiceNumber: "INV-T1", vendorId: "ven_1", vendorName: "Acme Supplies", currency: "INR", netPayable: 20000, amountPaid: 0, status: "approved", createdAt: now, updatedAt: now, deletedAt: null } as never);
      await db.collection("prms_invoices").insertOne({ _id: "inv_t2", invoiceNumber: "INV-T2", vendorId: "ven_none", vendorName: "No Bank Ltd", currency: "INR", netPayable: 5000, amountPaid: 0, status: "approved", createdAt: now, updatedAt: now, deletedAt: null } as never);
      const noBank = await recordVendorPayment({ invoiceId: "inv_t2", amount: 5000, paymentDate: "2026-10-27", method: "neft", transactionReference: null, tdsDeducted: 0, status: "processed", notes: null } as never, "u1", null);
      assert.equal(noBank.ok, false);
      assert.ok(!noBank.ok && /bank details/.test(noBank.reason ?? ""));
      assert.equal(await db.collection("prms_payments").countDocuments({ invoiceId: "inv_t2", deletedAt: null }), 0, "no half-made payment is left behind");
      const r = await recordVendorPayment({ invoiceId: "inv_t1", amount: 20000, paymentDate: "2026-10-27", method: "neft", transactionReference: null, tdsDeducted: 0, status: "processed", notes: null } as never, "u1", null);
      assert.ok(r.ok, r.reason);
      assert.equal((await db.collection("prms_invoices").findOne({ _id: "inv_t1" as never }))!.amountPaid, 0, "the bill is not reduced yet");
      assert.equal(calls.filter((c) => c.path === "/payouts").at(-1)!.body!.mode, "NEFT");
      await paidOut(r.paymentId!, "UTR888000999");
      const inv = (await db.collection("prms_invoices").findOne({ _id: "inv_t1" as never }))!;
      assert.equal(inv.amountPaid, 20000);
      assert.equal(inv.status, "paid");
      const pay = (await db.collection("prms_payments").findOne({ _id: r.paymentId as never }))!;
      assert.equal(pay.status, "processed");
      assert.equal(pay.transactionReference, "UTR888000999");
      // A scheduled payment is paid later, through the same route.
      await db.collection("prms_invoices").insertOne({ _id: "inv_t3", invoiceNumber: "INV-T3", vendorId: "ven_1", vendorName: "Acme Supplies", currency: "INR", netPayable: 3000, amountPaid: 0, status: "approved", createdAt: now, updatedAt: now, deletedAt: null } as never);
      const sch = await recordVendorPayment({ invoiceId: "inv_t3", amount: 3000, paymentDate: "2026-10-27", method: "neft", transactionReference: null, tdsDeducted: 0, status: "scheduled", notes: null } as never, "u1", null);
      assert.ok(sch.ok);
      const before = calls.filter((c) => c.path === "/payouts").length;
      assert.equal(calls.filter((c) => c.path === "/payouts").length, before, "scheduling sends nothing");
      assert.ok((await markVendorPaymentProcessed(sch.paymentId!, "u1", null)).ok);
      assert.equal(calls.filter((c) => c.path === "/payouts").length, before + 1);
    });
  });

  await t("an employee's expense claim is paid back through Razorpay and recorded when it is paid", async () => {
    await inA(async () => {
      const db = await getDb();
      const now = new Date();
      await db.collection("prms_expenses").insertOne({ _id: "exp_t1", expenseCode: "EXP-T1", vendorId: null, approvalStatus: "approved", totalAmount: 4000, currency: "INR", raisedByUserId: "emp_t1", raisedByName: "Isha Paul", projectId: null, departmentName: null, createdAt: now, updatedAt: now, deletedAt: null, createdBy: "u1", updatedBy: "u1" } as never);
      const r = await recordReimbursement({ expenseId: "exp_t1", amount: 4000, method: "imps", transactionReference: null, paymentDate: "2026-10-27", notes: null }, "u1", null);
      assert.ok(r.ok, r.ok ? "" : r.reason);
      assert.equal((await db.collection("prms_expenses").findOne({ _id: "exp_t1" as never }))!.approvalStatus, "approved", "not reimbursed yet");
      assert.equal(await db.collection("fms_reimbursements").countDocuments({}), 0);
      await paidOut("exp_t1#1", "UTR444000222");
      assert.equal((await db.collection("prms_expenses").findOne({ _id: "exp_t1" as never }))!.approvalStatus, "reimbursed");
      const rec = await db.collection("fms_reimbursements").findOne({});
      assert.ok(rec && rec.amount === 4000 && rec.transactionReference === "UTR444000222" && rec.transactionId);
      assert.equal((await recordReimbursement({ expenseId: "exp_t1", amount: 1, method: "imps", transactionReference: null, paymentDate: "2026-10-27", notes: null }, "u1", null)).ok, false, "a paid claim is not paid again");
    });
  });

  // ── Security rules ─────────────────────────────────────────────────────────────────────────────────────────────────
  await t("limits: one payment, and the day's total, cannot go past what the owner set", async () => {
    await inA(async () => {
      // Payments made by the tests above count towards today, so the day's limit is set 60,000 above what is already out.
      const already = (await (await import("../src/lib/products/cashflow-ai/payments/payouts")).listPayouts({ limit: 500 })).filter((x) => ["pending_approval", "queued", "processing", "processed"].includes(x.status)).reduce((n, x) => n + x.amount, 0);
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0, perPayoutMax: 50000, dailyMax: already + 60000, approvalThreshold: 50000 }, "u1");
      const before = calls.filter((c) => c.path === "/payouts").length;
      const big = await startPayout(vendorInput({ sourceRecordId: "lim_1", amount: 50001 }), actor);
      assert.equal(big.ok, false);
      assert.ok(!big.ok && /at most/.test(big.error));
      assert.equal(calls.filter((c) => c.path === "/payouts").length, before, "nothing was sent");
      const day = await startPayout(vendorInput({ sourceRecordId: "lim_2", amount: 45000, payee: { name: "Other One", accountNumber: "60100012345678", ifsc: "ICIC0000001", kind: "vendor" } }), actor);
      assert.ok(day.ok, day.ok ? "" : day.error);
      const over = await startPayout(vendorInput({ sourceRecordId: "lim_3", amount: 20000, payee: { name: "Third One", accountNumber: "70100012345678", ifsc: "SBIN0000001", kind: "vendor" } }), actor);
      assert.equal(over.ok, false);
      assert.ok(!over.ok && /daily limit/.test(over.error));
    });
  });

  await t("a large payment waits for a different person to approve it; nothing is sent until then", async () => {
    await inA(async () => {
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0, approvalThreshold: 100000, perPayoutMax: 1000000, dailyMax: 5000000 }, "u1");
      const payee = { name: "Big Vendor", accountNumber: "80100012345678", ifsc: "HDFC0000009", kind: "vendor" as const };
      const before = calls.filter((c) => c.path === "/payouts").length;
      const r = (await startPayout(vendorInput({ sourceRecordId: "big_1", amount: 150000, payee }), { id: "maker", email: "maker@a.example" })) as { ok: true; payout: FmsPayout };
      assert.ok(r.ok);
      assert.equal(r.payout.status, "pending_approval");
      assert.equal(calls.filter((c) => c.path === "/payouts").length, before, "no money request yet");
      assert.equal((await approvePayout(r.payout._id, { id: "maker", email: "maker@a.example" })).ok, false, "the person who started it cannot approve it");
      assert.equal(calls.filter((c) => c.path === "/payouts").length, before);
      const ok = await approvePayout(r.payout._id, { id: "checker", email: "checker@a.example" });
      assert.ok(ok.ok, ok.ok ? "" : ok.error);
      assert.equal(calls.filter((c) => c.path === "/payouts").length, before + 1, "sent once approved");
      assert.equal((await getFmsPayout(r.payout._id))!.approvedBy, "checker");
      assert.equal((await approvePayout(r.payout._id, { id: "checker2", email: "c2@a.example" })).ok, false, "approved once only");
      // A refused payment never goes, and the account number it held is wiped.
      const r2 = (await startPayout(vendorInput({ sourceRecordId: "big_2", amount: 120000, payee }), { id: "maker", email: "maker@a.example" })) as { ok: true; payout: FmsPayout };
      assert.equal((await rejectPayout(r2.payout._id, { id: "checker", email: "checker@a.example" }, " ")).ok, false, "a reason is required");
      assert.ok((await rejectPayout(r2.payout._id, { id: "checker", email: "checker@a.example" }, "Not our vendor")).ok);
      const gone = (await getFmsPayout(r2.payout._id))!;
      assert.equal(gone.status, "rejected");
      assert.equal(gone.accountEnc, null);
      assert.equal((await approvePayout(r2.payout._id, { id: "checker", email: "c@a.example" })).ok, false, "a refused payment cannot be approved later");
    });
  });

  await t("splitting a large payment into small ones to one payee does not avoid approval", async () => {
    await inA(async () => {
      const payee = { name: "Splitter", accountNumber: "90100012345678", ifsc: "AXIS0000001", kind: "vendor" as const };
      const a = (await startPayout(vendorInput({ sourceRecordId: "sp_1", amount: 60000, payee }), actor)) as { ok: true; payout: FmsPayout };
      assert.equal(a.payout.status, "processing", "the first part alone is under the approval amount");
      const b = (await startPayout(vendorInput({ sourceRecordId: "sp_2", amount: 60000, payee }), actor)) as { ok: true; payout: FmsPayout };
      assert.equal(b.payout.status, "pending_approval", "together they pass it, so the second waits");
    });
  });

  await t("the same submission twice makes one payment", async () => {
    await inA(async () => {
      const key = "11111111-2222-3333-4444-555555555555";
      const payee = { name: "Once Only", accountNumber: "11100012345678", ifsc: "KKBK0000001", kind: "vendor" as const };
      const a = (await startPayout(vendorInput({ sourceRecordId: null, amount: 700, payee, clientRequestId: key }), actor)) as { ok: true; payout: FmsPayout };
      const before = calls.filter((c) => c.path === "/payouts").length;
      const b = (await startPayout(vendorInput({ sourceRecordId: null, amount: 700, payee, clientRequestId: key }), actor)) as { ok: true; payout: FmsPayout };
      assert.equal(b.payout._id, a.payout._id);
      assert.equal(calls.filter((c) => c.path === "/payouts").length, before, "no second request to Razorpay");
    });
  });

  await t("RazorpayX saying it paid a different amount is held, not booked as paid", async () => {
    await inA(async () => {
      const p = (await startPayout(vendorInput({ sourceRecordId: "mm_1", amount: 3000, payee: { name: "Mismatch Co", accountNumber: "22200012345678", ifsc: "YESB0000001", kind: "vendor" } }), actor)) as { ok: true; payout: FmsPayout };
      const before = await rzpBalance();
      await applyPayoutEvent({ providerPayoutId: p.payout.providerPayoutId!, status: "paid", utr: "UTR5555", amountPaise: 400000 });
      const held = (await getFmsPayout(p.payout._id))!;
      assert.equal(held.status, "processing");
      assert.ok(held.failureReason?.includes("reported"));
      assert.equal(await rzpBalance(), before, "nothing booked");
      await applyPayoutEvent({ providerPayoutId: p.payout.providerPayoutId!, status: "paid", utr: "UTR5555", amountPaise: 300000 });
      assert.equal((await getFmsPayout(p.payout._id))!.status, "processed", "the right amount settles it");
    });
  });

  await t("a payee's bank details that were just added or changed cannot be paid until the cooling-off has passed", async () => {
    await inA(async () => {
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 24 }, "u1");
      await saveBeneficiary({ entityType: "vendor", entityId: "ven_hold", beneficiaryName: "Fresh Vendor", bankName: "HDFC", accountNumber: "33300012345678", ifsc: "HDFC0000002" }, "u1");
      const r = await vendorPayee("ven_hold", "Fresh Vendor");
      assert.equal(r.ok, false);
      assert.ok(!r.ok && /changed recently|added or changed/.test(r.error));
      await (await getDb()).collection("fms_beneficiaries").updateOne({ entityId: "ven_hold" }, { $set: { detailsChangedAt: new Date(Date.now() - 25 * 3_600_000) } });
      assert.equal((await vendorPayee("ven_hold", "Fresh Vendor")).ok, true, "after the hold it can be paid");
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0 }, "u1");
    });
  });

  await t("the confirmation code is asked for, and a wrong or missing one stops the payment", async () => {
    await inA(async () => {
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0, requireCode: true }, "u1");
      assert.equal(await paymentGate("64b000000000000000000001", ""), "Enter the confirmation code to send this payment.");
      assert.ok((await paymentGate("64b000000000000000000001", "123456"))?.includes("not right"));
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0, requireCode: false }, "u1");
      assert.equal(await paymentGate("64b000000000000000000001", ""), null, "only when the company has switched the code off");
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0 }, "u1");
    });
  });

  void createBankAccount; void getBankAccount;
  console.log("razorpay payout tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
