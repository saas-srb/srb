import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { NOT_CONNECTED, resolveRazorpayCredentials } from "@/lib/platform/integrations/payments";
import { razorpayPayoutProvider, type PayoutProvider } from "@/lib/products/talentos/payout-provider";
import { encryptField, decryptField, isEncryptionConfigured, type EncryptedValue } from "@/lib/products/cashflow-ai/crypto";
import { createBankAccount, listBankAccounts } from "@/lib/products/cashflow-ai/bank-accounts";
import { changeTransactionStatus, postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";
import { getPaymentControls, limitProblem, startOfIstDay } from "@/lib/products/cashflow-ai/payment-controls";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { alertOwners } from "@/lib/products/cashflow-ai/payment-alerts";

/**
 * Every payment the company makes out of CashFlow goes through here, on the company's own RazorpayX account: a vendor bill, a customer
 * refund, an employee reimbursement or advance, a one-off payment. A payout is created at RazorpayX with our own id as the idempotency key (so
 * retrying a request that may or may not have gone through can never pay twice), then followed to its end: RazorpayX's webhook reports it, and
 * `refreshPayout` asks RazorpayX directly when a webhook was missed. When the payout is processed, one expense is posted to the company's
 * "RazorpayX balance" account in the ledger; if it is later reversed, that entry is reversed too. Salaries (TalentOS) use the same provider.
 */

export const FMS_PAYOUTS_COLLECTION = "fms_payouts";
export const RAZORPAYX_ACCOUNT_NAME = "RazorpayX balance";

export type PayoutPurpose = "vendor_bill" | "refund" | "reimbursement" | "advance" | "other";
export type FmsPayoutStatus = "pending_approval" | "rejected" | "queued" | "processing" | "processed" | "failed" | "reversed";

export interface FmsPayout extends AuditFields {
  _id: string;
  purpose: PayoutPurpose;
  /** The record this pays (a vendor payment, a refund, an expense …). */
  sourceModule: "fms" | "prms" | "hrms";
  sourceRecordId: string | null;
  payeeName: string;
  payeeEmail: string | null;
  accountLast4: string | null;
  /** The payee's account number, encrypted, so a payment that never reached RazorpayX can be sent again without asking for it. */
  accountEnc?: EncryptedValue | null;
  ifsc: string | null;
  upiId: string | null;
  amount: number;
  mode: "IMPS" | "NEFT" | "RTGS" | "UPI";
  narration: string;
  referenceId: string;
  status: FmsPayoutStatus;
  providerPayoutId: string | null;
  utr: string | null;
  failureReason: string | null;
  transactionId: string | null;
  settledAt: Date | null;
  /** What the ledger entry should say it was for (links the expense to the vendor, customer or employee). */
  ledger: { vendorId: string | null; customerId: string | null; employeeId: string | null; description: string };
  /** A transaction already in the ledger that this payout pays (an approved payable): it is completed instead of a new one being posted. */
  completeTransactionId: string | null;
  /** A key the caller makes once per submission, so a double click or a retried request cannot start the same payment twice. */
  clientRequestId?: string | null;
  /** A payment above the approval amount waits for a second person; who decided it, and why it was refused. */
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectedReason?: string | null;
}

let indexEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<FmsPayout>(FMS_PAYOUTS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await c.createIndex({ providerPayoutId: 1 }, { sparse: true }).catch(() => {});
    await c.createIndex({ sourceModule: 1, sourceRecordId: 1 }).catch(() => {});
    await c.createIndex({ status: 1, createdAt: -1 }).catch(() => {});
    // Unique only for payments that carry a key (the index is per company: the data layer adds the company to it).
    await c.createIndex({ clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } }).catch(() => {});
  }
  return c;
}

export const RAZORPAY_NOT_CONNECTED = "Connect your Razorpay account (Settings → Payments), turn on RazorpayX payouts and add the RazorpayX account number to make payments.";

export interface PayeeInput {
  name: string;
  email?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  upiId?: string | null;
  kind: "vendor" | "employee" | "customer";
}

export interface StartPayoutInput {
  purpose: PayoutPurpose;
  sourceModule: FmsPayout["sourceModule"];
  sourceRecordId: string | null;
  payee: PayeeInput;
  amount: number;
  narration: string;
  /** An approved payable transaction this payment settles; it is completed (not duplicated) when RazorpayX has paid. */
  completeTransactionId?: string | null;
  /** Made once per submission by the form; a repeat of the same key returns the first payment. */
  clientRequestId?: string | null;
  /** Force a mode (NEFT, RTGS, IMPS or UPI). Default: UPI for a UPI id, IMPS below ₹2 lakh, else RTGS. */
  mode?: FmsPayout["mode"] | null;
  /** For the ledger. */
  vendorId?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  description: string;
}

/** Whether the payee details are enough to pay: a UPI id, or an account number with its IFSC. */
export function validatePayee(p: PayeeInput): string | null {
  if (!p.name.trim()) return "Enter who is being paid.";
  const upi = (p.upiId ?? "").trim();
  if (upi) return /^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/.test(upi) ? null : "That is not a valid UPI id (like name@bank).";
  if (!/^\d{9,18}$/.test((p.accountNumber ?? "").replace(/\s+/g, ""))) return "An account number is 9 to 18 digits.";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test((p.ifsc ?? "").trim().toUpperCase())) return "IFSC is four letters, a zero, then six letters or digits.";
  return null;
}

/** RazorpayX's modes: UPI for a UPI id; IMPS below ₹2 lakh; RTGS from ₹2 lakh. */
export function checkMode(mode: FmsPayout["mode"], amount: number, upi: boolean): string | null {
  if (upi) return mode === "UPI" ? null : "A UPI id can only be paid by UPI.";
  if (mode === "UPI") return "UPI needs a UPI id.";
  if (mode === "RTGS" && amount < 200000) return "RTGS is for ₹2,00,000 or more.";
  if (mode === "IMPS" && amount > 500000) return "IMPS is for up to ₹5,00,000.";
  return null;
}

export function modeFor(amount: number, upi: boolean): FmsPayout["mode"] {
  if (upi) return "UPI";
  return amount >= 200000 ? "RTGS" : "IMPS";
}

async function provider(): Promise<PayoutProvider | null> {
  const creds = await resolveRazorpayCredentials("payouts");
  return creds ? razorpayPayoutProvider(creds) : null;
}

/** The ledger account for money held at RazorpayX. Created the first time it is needed. */
export async function razorpayxAccountId(actorId: string): Promise<string> {
  const existing = (await listBankAccounts()).find((a) => a.accountName === RAZORPAYX_ACCOUNT_NAME);
  if (existing) return existing._id;
  const made = await createBankAccount({ accountName: RAZORPAYX_ACCOUNT_NAME, bankName: "RazorpayX", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 0, status: "active", notes: "Money held at RazorpayX for payouts. Top it up from your current account (a transfer between your own accounts)." }, actorId);
  if (!made.ok) throw new Error(made.reason);
  return made.account._id;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

async function audit(action: "create" | "approve" | "reject" | "status_change" | "reverse", p: FmsPayout, actor: { id: string; email: string | null }, summary: string) {
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action, entity: "payout", entityId: p._id, entityLabel: `${p.payeeName} ${inr(p.amount)}`, summary }).catch(() => {});
}

/** What has been sent (or is on its way, or waits for approval) today, in India time: counted for the daily limit; and to one payee, counted for the approval rule. */
async function sentToday(payee?: { accountLast4: string | null; ifsc: string | null; upiId: string | null }): Promise<{ all: number; payee: number }> {
  const rows = await (await col()).find({ createdAt: { $gte: startOfIstDay() }, status: { $in: ["pending_approval", "queued", "processing", "processed"] }, ...notDeleted }).toArray();
  const same = (r: FmsPayout) => !!payee && (payee.upiId ? r.upiId === payee.upiId : r.accountLast4 === payee.accountLast4 && r.ifsc === payee.ifsc);
  return { all: rows.reduce((n, r) => n + r.amount, 0), payee: rows.filter(same).reduce((n, r) => n + r.amount, 0) };
}

/** The ledger account for what customers have paid through Razorpay and not yet been settled to the bank. Created the first time it is needed. */
export const RAZORPAY_COLLECTIONS_ACCOUNT_NAME = "Razorpay collections (awaiting settlement)";
export async function razorpayCollectionsAccountId(actorId: string): Promise<string> {
  const existing = (await listBankAccounts()).find((a) => a.accountName === RAZORPAY_COLLECTIONS_ACCOUNT_NAME);
  if (existing) return existing._id;
  const made = await createBankAccount({ accountName: RAZORPAY_COLLECTIONS_ACCOUNT_NAME, bankName: "Razorpay", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 0, status: "active", notes: "Payments customers made through Razorpay. Razorpay settles them to your bank a day or two later: record that as a transfer to your current account." }, actorId);
  if (!made.ok) throw new Error(made.reason);
  return made.account._id;
}

export async function startPayout(input: StartPayoutInput, actor: { id: string; email: string | null }): Promise<{ ok: true; payout: FmsPayout } | { ok: false; error: string }> {
  const bad = validatePayee(input.payee);
  if (bad) return { ok: false, error: bad };
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount >= 1 && amount <= 10_000_000)) return { ok: false, error: "Enter an amount from ₹1 to ₹1,00,00,000." };
  if (!(await provider())) return { ok: false, error: RAZORPAY_NOT_CONNECTED };

  const c = await col();
  // The same submission twice returns the first payment.
  if (input.clientRequestId) {
    const first = await c.findOne({ clientRequestId: input.clientRequestId });
    if (first) return { ok: true, payout: first };
  }
  // A payment for the same record that is already on its way (or done) is never started twice.
  if (input.sourceRecordId) {
    const live = await c.findOne({ sourceModule: input.sourceModule, sourceRecordId: input.sourceRecordId, purpose: input.purpose, status: { $in: ["queued", "processing", "processed"] }, ...notDeleted });
    if (live) return { ok: false, error: live.status === "processed" ? "This has already been paid." : "A payment for this is already on its way." };
  }
  const upi = (input.payee.upiId ?? "").trim() || null;
  const controls = await getPaymentControls();
  const account0 = (input.payee.accountNumber ?? "").replace(/\s+/g, "");
  const payeeKey = { accountLast4: upi ? null : account0.slice(-4), ifsc: upi ? null : (input.payee.ifsc ?? "").trim().toUpperCase(), upiId: upi };
  const today = await sentToday(payeeKey);
  const tooMuch = limitProblem(amount, today.all, controls);
  if (tooMuch) return { ok: false, error: tooMuch };
  // A large payment, or several to one payee that add up to a large one in a day, waits for a second person.
  const needsApproval = amount >= controls.approvalThreshold || today.payee + amount >= controls.approvalThreshold;
  if (needsApproval && !upi && !isEncryptionConfigured()) return { ok: false, error: "Secure storage for bank details is not set up on this server, so a payment that needs approval cannot be kept for the approver." };
  const mode = input.mode ?? modeFor(amount, !!upi);
  const modeProblem = checkMode(mode, amount, !!upi);
  if (modeProblem) return { ok: false, error: modeProblem };
  const account = (input.payee.accountNumber ?? "").replace(/\s+/g, "");
  const id = newId();
  const doc: FmsPayout = {
    _id: id,
    purpose: input.purpose,
    sourceModule: input.sourceModule,
    sourceRecordId: input.sourceRecordId,
    payeeName: input.payee.name.trim().slice(0, 120),
    payeeEmail: input.payee.email?.trim() || null,
    accountLast4: upi ? null : account.slice(-4),
    accountEnc: upi || !isEncryptionConfigured() ? null : encryptField(account),
    ifsc: upi ? null : (input.payee.ifsc ?? "").trim().toUpperCase(),
    upiId: upi,
    amount,
    mode,
    narration: input.narration.slice(0, 30),
    referenceId: `${input.purpose.toUpperCase()}-${id.slice(0, 8)}`,
    status: needsApproval ? "pending_approval" : "queued",
    providerPayoutId: null,
    utr: null,
    failureReason: null,
    transactionId: null,
    settledAt: null,
    ledger: { vendorId: input.vendorId ?? null, customerId: input.customerId ?? null, employeeId: input.employeeId ?? null, description: input.description.slice(0, 300) },
    completeTransactionId: input.completeTransactionId ?? null,
    ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    ...createStamp(actor.id),
  };
  try {
    await c.insertOne(doc);
  } catch (e) {
    // Two identical submissions raced: the other one won, and its payment is the answer.
    const dup = input.clientRequestId ? await c.findOne({ clientRequestId: input.clientRequestId }) : null;
    if (dup) return { ok: true, payout: dup };
    throw e;
  }
  await audit("create", doc, actor, `${doc.purpose}, ${doc.mode}${needsApproval ? ", waiting for a second person to approve" : ""}`);
  if (needsApproval) {
    await alertOwners("A payment is waiting for your approval", [`${inr(amount)} to ${doc.payeeName} (${doc.purpose.replace("_", " ")}) was started by ${actor.email ?? actor.id} and needs a second person to approve it before any money moves.`, "Open Payments to approve or refuse it."]);
    return { ok: true, payout: doc };
  }
  return submit(doc, { account, ifsc: doc.ifsc ?? "", holder: input.payee.name, kind: input.payee.kind }, actor);
}

async function submit(doc: FmsPayout, bank: { account: string; ifsc: string; holder: string; kind: PayeeInput["kind"] }, actor: { id: string; email: string | null }): Promise<{ ok: true; payout: FmsPayout } | { ok: false; error: string }> {
  const c = await col();
  const p = await provider();
  if (!p) return { ok: false, error: RAZORPAY_NOT_CONNECTED };
  try {
    const bene = await p.ensureBeneficiary({ contactName: doc.payeeName, contactEmail: doc.payeeEmail ?? "", contactReference: doc._id, accountHolderName: bank.holder, accountNumber: bank.account, ifsc: bank.ifsc, upiId: doc.upiId, contactType: bank.kind });
    const res = await p.createPayout({
      payoutId: doc._id,
      amountPaise: Math.round(doc.amount * 100),
      fundAccountId: bene.providerFundAccountId,
      referenceId: doc.referenceId,
      narration: doc.narration,
      purpose: doc.purpose === "vendor_bill" ? "vendor bill" : doc.purpose === "refund" ? "refund" : doc.purpose === "reimbursement" || doc.purpose === "advance" ? "payout" : "payout",
      mode: doc.mode,
    });
    await c.updateOne({ _id: doc._id }, { $set: { providerPayoutId: res.providerPayoutId, status: "processing", failureReason: null, ...updateStamp(actor.id) } });
    if (res.status === "paid") await settle(doc._id, { status: "paid" }, actor);
    return { ok: true, payout: (await c.findOne({ _id: doc._id }))! };
  } catch (err) {
    // The request may or may not have reached RazorpayX. The payout stays "queued" with the reason, and retrying uses the same idempotency key,
    // so it cannot pay twice.
    const message = err instanceof Error ? err.message : "RazorpayX could not be reached.";
    await c.updateOne({ _id: doc._id }, { $set: { failureReason: message.slice(0, 300), ...updateStamp(actor.id) } });
    return { ok: false, error: message };
  }
}

type Outcome = { status: "paid" | "failed" | "reversed"; utr?: string; failureReason?: string; amountPaise?: number };

/** Applies what RazorpayX says happened to a payout: the ledger entry on success, its reversal when it comes back. */
export async function settle(id: string, outcome: Outcome, actor: { id: string; email: string | null } = { id: "razorpayx", email: null }): Promise<void> {
  const c = await col();
  const p = await c.findOne({ _id: id });
  if (!p) return;
  if (outcome.status === "paid") {
    if (p.status === "processed") return;
    // RazorpayX must say it paid exactly what we asked for. Anything else is held for a person to look at, not booked as paid.
    if (outcome.amountPaise !== undefined && outcome.amountPaise !== Math.round(p.amount * 100)) {
      const why = `RazorpayX reported ${inr(outcome.amountPaise / 100)} for a payment of ${inr(p.amount)}.`;
      await c.updateOne({ _id: id }, { $set: { failureReason: why, ...updateStamp(actor.id) } });
      await audit("status_change", p, actor, `Amount mismatch: ${why}`);
      await alertOwners("A payment did not match", [`${why} Payee: ${p.payeeName}. It has not been marked paid. Check it in the RazorpayX dashboard.`]);
      return;
    }
    const date = new Date();
    const accountId = await razorpayxAccountId(actor.id);
    let transactionId: string | null = null;
    if (p.completeTransactionId) {
      // The payable is already in the ledger: it now has a bank account and a reference, and becomes completed (which moves the balance once).
      const db = await getDb();
      await db.collection("fms_transactions").updateOne({ _id: p.completeTransactionId as never }, { $set: { fundAccountId: accountId, fundAccountType: "bank", referenceNumber: outcome.utr ?? p.providerPayoutId, updatedAt: new Date() } });
      const r = await changeTransactionStatus(p.completeTransactionId, "completed", actor.id, actor.email);
      transactionId = r && !("ok" in r) ? r._id : null;
    } else {
      const txn = await postSystemTransaction(
        {
          type: "expense", accrualRole: p.purpose === "vendor_bill" ? "payable" : null, transactionDate: date, postingDate: date, amount: p.amount, currency: "INR", paymentMethod: p.mode === "UPI" ? "upi" : (p.mode.toLowerCase() as "imps" | "neft" | "rtgs"), sourceModule: p.sourceModule, sourceRecordId: p.sourceRecordId ?? p._id,
          customerId: p.ledger.customerId, vendorId: p.ledger.vendorId, employeeId: p.ledger.employeeId, projectId: null, department: null, accountId: null, fundAccountId: accountId, fundAccountType: "bank", taxAmount: 0,
          referenceNumber: outcome.utr ?? p.providerPayoutId, description: p.ledger.description, attachments: [],
        },
        actor.id,
        actor.email,
      );
      transactionId = "ok" in txn ? null : txn._id;
    }
    await c.updateOne({ _id: id }, { $set: { status: "processed", utr: outcome.utr ?? p.utr, settledAt: new Date(), failureReason: null, transactionId, ...updateStamp(actor.id) } });
    await audit("status_change", p, actor, `Paid, UTR ${outcome.utr ?? "pending"}`);
    await afterSettled(id);
  } else if (outcome.status === "failed") {
    if (p.status === "processed") return;
    await c.updateOne({ _id: id }, { $set: { status: "failed", failureReason: outcome.failureReason ?? "RazorpayX could not make this payment.", ...updateStamp(actor.id) } });
    await audit("status_change", p, actor, `Failed: ${outcome.failureReason ?? "RazorpayX could not make this payment."}`);
    await alertOwners("A payment failed", [`${inr(p.amount)} to ${p.payeeName} could not be paid: ${outcome.failureReason ?? "RazorpayX could not make this payment."}`]);
    await afterSettled(id);
  } else if (outcome.status === "reversed") {
    if (p.status === "reversed") return;
    if (p.transactionId) await changeTransactionStatus(p.transactionId, "reversed", actor.id, actor.email);
    await c.updateOne({ _id: id }, { $set: { status: "reversed", failureReason: outcome.failureReason ?? "The bank returned this payment.", ...updateStamp(actor.id) } });
    await audit("reverse", p, actor, outcome.failureReason ?? "The bank returned this payment.");
    await alertOwners("A payment was returned", [`${inr(p.amount)} paid to ${p.payeeName} came back: ${outcome.failureReason ?? "the bank returned it"}. The books have been put right.`]);
    await afterSettled(id);
  }
}

type Hook = (payout: FmsPayout) => Promise<void>;
const hooks: Hook[] = [];
/** Extra listeners (tests, other modules) for a payout that has ended; the standard follow-up for each purpose is in `payout-handlers.ts`. */
export function onPayoutSettled(hook: Hook) {
  hooks.push(hook);
}
async function afterSettled(id: string) {
  const p = await (await col()).findOne({ _id: id });
  if (!p) return;
  const { handleSettled } = await import("@/lib/products/cashflow-ai/payments/payout-handlers");
  for (const h of [handleSettled, ...hooks]) {
    try {
      await h(p);
    } catch {
      // A module's own follow-up must never undo the payment record.
    }
  }
}

/** Asks RazorpayX where the payout stands (for a missed webhook, or the "Refresh" button). */
export async function refreshPayout(id: string, actor: { id: string; email: string | null }): Promise<{ ok: boolean; status?: FmsPayoutStatus; error?: string }> {
  const c = await col();
  const p = await c.findOne({ _id: id, ...notDeleted });
  if (!p) return { ok: false, error: "Payout not found." };
  if (!p.providerPayoutId) return { ok: false, error: "This payment never reached RazorpayX. Retry it." };
  const prov = await provider();
  if (!prov) return { ok: false, error: RAZORPAY_NOT_CONNECTED };
  try {
    const f = await prov.fetchPayout(p.providerPayoutId);
    if (f.status === "paid" || f.status === "failed" || f.status === "reversed") await settle(id, { status: f.status, utr: f.utr, failureReason: f.failureReason, amountPaise: f.amountPaise }, actor);
    else if (f.status === "queued" && p.status !== "queued") await c.updateOne({ _id: id }, { $set: { status: "queued", ...updateStamp(actor.id) } });
    return { ok: true, status: (await c.findOne({ _id: id }))!.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach RazorpayX." };
  }
}

/**
 * Catches up on payouts whose webhook has not arrived (no webhook secret yet, a tunnel that is down, a missed delivery): asks RazorpayX
 * about the ones still processing after a minute. Best effort and bounded; called when the pages that show payments are opened.
 */
export async function refreshStalePayouts(limit = 10): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 60_000);
    const stale = await (await col()).find({ status: "processing", providerPayoutId: { $ne: null }, updatedAt: { $lt: cutoff }, ...notDeleted }).sort({ updatedAt: 1 }).limit(limit).toArray();
    let changed = 0;
    for (const p of stale) {
      const r = await refreshPayout(p._id, { id: "razorpayx", email: null });
      if (r.ok && r.status !== "processing") changed++;
      else await (await col()).updateOne({ _id: p._id }, { $set: { updatedAt: new Date() } });
    }
    return changed;
  } catch {
    return 0;
  }
}

/** A "queued" payout whose request failed: send it again (same idempotency key, so never twice). A failed one is started anew from its source. */
export async function retryPayout(id: string, actor: { id: string; email: string | null }) {
  const c = await col();
  const p = await c.findOne({ _id: id, ...notDeleted });
  if (!p) return { ok: false as const, error: "Payout not found." };
  if (p.status !== "queued" || p.providerPayoutId) return { ok: false as const, error: "Only a payment that never reached RazorpayX can be retried." };
  const kind: PayeeInput["kind"] = p.ledger.vendorId ? "vendor" : p.ledger.employeeId ? "employee" : "customer";
  const account = p.accountEnc ? decryptField(p.accountEnc) : null;
  if (!p.upiId && !account) return { ok: false as const, error: "The payee's account number was not kept. Start the payment again." };
  return submit(p, { account: account ?? "", ifsc: p.ifsc ?? "", holder: p.payeeName, kind }, actor);
}

/** The webhook: RazorpayX's report on a payout. Returns true when it was one of these payouts. */
export async function applyPayoutEvent(r: { providerPayoutId: string; status: "paid" | "failed" | "reversed"; utr?: string; failureReason?: string; amountPaise?: number }): Promise<boolean> {
  const p = await (await col()).findOne({ providerPayoutId: r.providerPayoutId });
  if (!p) return false;
  await settle(p._id, { status: r.status, utr: r.utr, failureReason: r.failureReason, amountPaise: r.amountPaise });
  return true;
}

/**
 * A second person approves a payment that waits: never the person who started it, never past the limits, and only then does the money move.
 * The caller has already checked that this person may approve payments and has confirmed with a code.
 */
export async function approvePayout(id: string, approver: { id: string; email: string | null }): Promise<{ ok: true; payout: FmsPayout } | { ok: false; error: string }> {
  const c = await col();
  const p = await c.findOne({ _id: id, ...notDeleted });
  if (!p) return { ok: false, error: "Payment not found." };
  if (p.status !== "pending_approval") return { ok: false, error: `This payment is ${p.status.replace("_", " ")}, not waiting for approval.` };
  if (p.createdBy === approver.id) return { ok: false, error: "A payment must be approved by someone other than the person who started it." };
  const controls = await getPaymentControls();
  const today = await sentToday();
  const tooMuch = limitProblem(p.amount, Math.max(0, today.all - p.amount), controls);
  if (tooMuch) return { ok: false, error: tooMuch };
  const account = p.accountEnc ? decryptField(p.accountEnc) : null;
  if (!p.upiId && !account) return { ok: false, error: "The payee's account number was not kept. Refuse this payment and start it again." };
  const won = await c.findOneAndUpdate({ _id: id, status: "pending_approval" }, { $set: { status: "queued", approvedBy: approver.id, approvedAt: new Date(), ...updateStamp(approver.id) } }, { returnDocument: "after" });
  if (!won) return { ok: false, error: "Someone else decided this payment first." };
  await audit("approve", won, approver, `Approved by ${approver.email ?? approver.id}`);
  const kind: PayeeInput["kind"] = won.ledger.vendorId ? "vendor" : won.ledger.employeeId ? "employee" : "customer";
  return submit(won, { account: account ?? "", ifsc: won.ifsc ?? "", holder: won.payeeName, kind }, approver);
}

export async function rejectPayout(id: string, actor: { id: string; email: string | null }, reason: string): Promise<{ ok: boolean; error?: string }> {
  const c = await col();
  const p = await c.findOne({ _id: id, ...notDeleted });
  if (!p) return { ok: false, error: "Payment not found." };
  if (p.status !== "pending_approval") return { ok: false, error: `This payment is ${p.status.replace("_", " ")}, not waiting for approval.` };
  if (!reason.trim()) return { ok: false, error: "Say why it is refused, so the person who asked knows." };
  await c.updateOne({ _id: id, status: "pending_approval" }, { $set: { status: "rejected", rejectedReason: reason.trim().slice(0, 300), accountEnc: null, ...updateStamp(actor.id) } });
  await audit("reject", p, actor, reason.trim().slice(0, 200));
  return { ok: true };
}

export async function listPayouts(opts: { purpose?: PayoutPurpose; status?: FmsPayoutStatus; limit?: number } = {}): Promise<FmsPayout[]> {
  const q: Record<string, unknown> = { ...notDeleted };
  if (opts.purpose) q.purpose = opts.purpose;
  if (opts.status) q.status = opts.status;
  return (await col()).find(q).sort({ createdAt: -1 }).limit(opts.limit ?? 100).toArray();
}

export async function getFmsPayout(id: string): Promise<FmsPayout | null> {
  return (await col()).findOne({ _id: id, ...notDeleted });
}

export { NOT_CONNECTED };
