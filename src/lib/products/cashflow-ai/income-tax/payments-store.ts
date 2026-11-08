import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { createAccount, getAccountByCode } from "@/lib/products/cashflow-ai/accounts";
import { getBankAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { changeTransactionStatus, postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { ENGINE_ACCOUNTS, istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { isOwnBank } from "@/lib/products/cashflow-ai/tds/challans-store";
import { isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { loadRulebook } from "@/lib/products/cashflow-ai/rulebook/rules-store";
import { scheduleProblem, taxPaymentProblem, TAX_PAYMENT_LABEL, type Instalment, type TaxPaymentKind } from "@/lib/products/cashflow-ai/income-tax/core";

/**
 * Income tax the company itself paid (advance tax, self-assessment tax, tax on regular assessment), and the instalment schedule it
 * enters from its CA. With accrual books on a payment is posted as Dr "Advance tax paid" / Cr bank; with them off it is only recorded.
 * The year's tax computation reads `taxPaidForYear`.
 */
export const IT_PAYMENTS_COLLECTION = "fms_it_payments";
export const IT_SCHEDULES_COLLECTION = "fms_it_schedules";

/** "posting" is a short hold while the ledger entry is made; it is never shown and never counted. */
export type ItPaymentStatus = "paid" | "cancelled" | "posting";

export interface ItPaymentDoc extends AuditFields {
  _id: string;
  fy: string;
  kind: TaxPaymentKind;
  amount: number;
  paidOn: string;
  bsrCode: string;
  serial: string;
  bankAccountId: string;
  bankAccountLabel: string;
  note: string | null;
  status: ItPaymentStatus;
  /** True while the payment holds its BSR+serial+date: what the unique index is on, so a cancelled payment can be entered again. */
  live: boolean;
  ledgerTransactionId: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface ItPaymentInput {
  fy: string;
  kind: TaxPaymentKind;
  amount: number;
  paidOn: string;
  bsrCode: string;
  serial: string;
  bankAccountId: string;
  note?: string | null;
}

export interface ItScheduleDoc extends AuditFields {
  _id: string;
  fy: string;
  /** Exactly as the company typed them in from its CA; nothing is assumed. */
  instalments: Instalment[];
  note: string | null;
  /** The year's tax (less credits) the company plans against, typed in; null = use the computation. */
  estimate: number | null;
  confirmed: boolean;
  confirmedBy: string | null;
  confirmedAt: Date | null;
}

type Actor = { id: string; email: string | null };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

let indexesEnsured = false;
async function cols() {
  const db = await getDb();
  const payments = db.collection<ItPaymentDoc>(IT_PAYMENTS_COLLECTION);
  const schedules = db.collection<ItScheduleDoc>(IT_SCHEDULES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      // the same challan cannot be entered twice, even by two requests at once
      payments.createIndex({ bsrCode: 1, serial: 1, paidOn: 1 }, { unique: true, partialFilterExpression: { live: true } }).catch(() => {}),
      payments.createIndex({ fy: 1, status: 1 }).catch(() => {}),
      schedules.createIndex({ fy: 1 }, { unique: true }).catch(() => {}),
    ]);
  }
  return { payments, schedules };
}

const shown = { status: { $in: ["paid", "cancelled"] as ItPaymentStatus[] } };

export async function listPayments(fy: string): Promise<ItPaymentDoc[]> {
  if (!isFinancialYear(fy)) throw new Error("Financial year must look like 2026-27.");
  await healStalePosting();
  const { payments } = await cols();
  return payments.find({ fy, ...notDeleted, ...shown }).sort({ paidOn: -1, createdAt: -1 }).toArray();
}

/** What was paid for the year, by kind. Only payments that stand ("paid") count: cancelled ones and held ones do not. */
export async function taxPaidForYear(fy: string): Promise<{ advance: number; selfAssessment: number; regular: number; total: number }> {
  if (!isFinancialYear(fy)) throw new Error("Financial year must look like 2026-27.");
  await healStalePosting();
  const { payments } = await cols();
  const rows = await payments.find({ fy, status: "paid", ...notDeleted }).project<{ kind: string; amount: number }>({ kind: 1, amount: 1 }).toArray();
  const sum = (k: string) => r2(rows.filter((r) => r.kind === k).reduce((n, r) => n + Number(r.amount), 0));
  const advance = sum("advance");
  const selfAssessment = sum("self_assessment");
  const regular = sum("regular_assessment");
  return { advance, selfAssessment, regular, total: r2(advance + selfAssessment + regular) };
}

/**
 * A payment is held as "posting" while its ledger entry is made. If the server stopped in that window the hold would block the same BSR + serial + date for
 * ever, so a hold older than two minutes is settled here: when its ledger entry exists the payment is completed with it, otherwise the hold is released.
 */
export async function healStalePosting(): Promise<number> {
  const { payments } = await cols();
  const stale = await payments.find({ status: "posting", createdAt: { $lt: new Date(Date.now() - 2 * 60_000) } }).limit(50).toArray();
  if (stale.length === 0) return 0;
  const db = await getDb();
  let n = 0;
  for (const row of stale) {
    const txn = (await db.collection("fms_transactions").findOne({ sourceRecordId: row._id, sourceModule: "fms", status: "completed", ...notDeleted })) as unknown as { _id: string } | null;
    if (txn) await payments.updateOne({ _id: row._id, status: "posting" }, { $set: { status: "paid", ledgerTransactionId: txn._id, ...updateStamp("system") } });
    else await payments.deleteOne({ _id: row._id, status: "posting" });
    n += 1;
  }
  return n;
}

/** The "Advance tax paid" asset account, created on first use (it is part of the standard engine accounts). */
async function advanceTaxAccountId(actorId: string): Promise<string> {
  const a = ENGINE_ACCOUNTS.advanceTax;
  const existing = await getAccountByCode(a.code);
  if (existing) return existing._id;
  const made = await createAccount({ code: a.code, name: a.name, type: a.type, parentId: null, description: null, isActive: true }, actorId);
  return made._id;
}

export async function createPayment(input: ItPaymentInput, actor: Actor): Promise<Result<{ id: string; ledgerPosted: boolean }>> {
  const data = {
    fy: String(input.fy ?? ""),
    kind: input.kind,
    amount: r2(Number(input.amount)),
    paidOn: String(input.paidOn ?? ""),
    bsrCode: String(input.bsrCode ?? "").trim(),
    serial: String(input.serial ?? "").trim(),
  };
  const bad = taxPaymentProblem(data);
  if (bad) return { ok: false, error: bad };
  if (!isFinancialYear(data.fy)) return { ok: false, error: "Choose the financial year the tax is for." };
  if (data.paidOn > istToday()) return { ok: false, error: "The payment date cannot be in the future." };
  const note = input.note?.trim().slice(0, 300) || null;

  const bank = await getBankAccount(input.bankAccountId);
  if (!bank || bank.status !== "active" || !isOwnBank(bank)) return { ok: false, error: "Choose the active bank account the tax was paid from." };
  if (bank.currency !== "INR") return { ok: false, error: "Tax is paid in rupees; choose a rupee account." };

  const accrual = await getAccrualSettings();

  await healStalePosting();
  // Claim the BSR+serial+date first: of two identical submissions only one gets past here.
  const { payments } = await cols();
  const id = newId();
  try {
    await payments.insertOne({ _id: id, ...data, bankAccountId: bank._id, bankAccountLabel: `${bank.accountName} — ${bank.bankName}`, note, status: "posting", live: true, ledgerTransactionId: null, cancelledAt: null, cancelReason: null, ...createStamp(actor.id) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { ok: false, error: "A tax payment with this BSR code, serial number and date is already recorded." };
    throw err;
  }
  const release = () => payments.deleteOne({ _id: id, status: "posting" });

  let txnId: string | null = null;
  if (accrual) {
    try {
      const accountId = await advanceTaxAccountId(actor.id);
      const date = new Date(`${data.paidOn}T00:00:00`);
      const txn = await postSystemTransaction(
        {
          type: "expense", transactionDate: date, postingDate: date, amount: data.amount, currency: "INR", paymentMethod: "bank_transfer", sourceModule: "fms", sourceRecordId: id,
          customerId: null, vendorId: null, employeeId: null, projectId: null, department: null, accountId,
          fundAccountId: bank._id, fundAccountType: "bank", taxAmount: 0, referenceNumber: `BSR ${data.bsrCode} / ${data.serial}`,
          description: `${TAX_PAYMENT_LABEL[data.kind]} paid for FY ${data.fy}`, attachments: [],
        },
        actor.id,
        actor.email,
      );
      if ("ok" in txn) {
        await release();
        return { ok: false, error: txn.reason };
      }
      txnId = txn._id;
    } catch (err) {
      await release();
      return { ok: false, error: err instanceof Error ? err.message : "Could not post the payment to the books." };
    }
  }

  try {
    await payments.updateOne({ _id: id }, { $set: { status: "paid", ledgerTransactionId: txnId, ...updateStamp(actor.id) } });
  } catch {
    // the payment is in the ledger but the record could not be completed: it is completed from the ledger entry the next time payments are read
    return { ok: false, error: "The payment was posted but could not be saved just now. Reload: it will appear in a moment." };
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: "it_payment", entityId: `it_payment:${id}`, entityLabel: `${TAX_PAYMENT_LABEL[data.kind]} ${data.bsrCode}/${data.serial}`, summary: `paid ${data.amount} for FY ${data.fy} from ${bank.accountName}${txnId ? "" : " (recorded only: accrual books are off)"}` });
  return { ok: true, id, ledgerPosted: txnId !== null };
}

export async function cancelPayment(id: string, reason: string, actor: Actor): Promise<Result> {
  const why = reason.trim().slice(0, 300);
  if (why.length < 3) return { ok: false, error: "Say why the payment is being cancelled." };
  const { payments } = await cols();
  // claiming the cancel first means a double click cannot reverse the ledger entry twice
  const claimed = await payments.findOneAndUpdate({ _id: id, status: "paid", ...notDeleted }, { $set: { status: "cancelled", live: false, cancelledAt: new Date(), cancelReason: why, ...updateStamp(actor.id) } }, { returnDocument: "before" });
  if (!claimed) {
    const existing = await payments.findOne({ _id: id, ...notDeleted });
    return { ok: false, error: existing?.status === "cancelled" ? "This payment is already cancelled." : "Payment not found." };
  }
  if (claimed.ledgerTransactionId) {
    let failure: string | null = null;
    try {
      const r = await changeTransactionStatus(claimed.ledgerTransactionId, "reversed", actor.id, actor.email);
      if (!r) failure = "The ledger entry for this payment could not be found.";
      else if ("ok" in r) failure = r.reason;
    } catch (err) {
      failure = err instanceof Error ? err.message : "Could not reverse the ledger entry.";
    }
    if (failure) {
      await payments.updateOne({ _id: id, status: "cancelled" }, { $set: { status: "paid", live: true, cancelledAt: null, cancelReason: null, ...updateStamp(actor.id) } });
      return { ok: false, error: failure };
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "cancel", entity: "it_payment", entityId: `it_payment:${id}`, entityLabel: `${TAX_PAYMENT_LABEL[claimed.kind]} ${claimed.bsrCode}/${claimed.serial}`, summary: `cancelled: ${why}${claimed.ledgerTransactionId ? "; ledger entry reversed" : ""}` });
  return { ok: true };
}

// ───────────────────────────── instalment schedule ─────────────────────────────

export async function getSchedule(fy: string): Promise<ItScheduleDoc | null> {
  if (!isFinancialYear(fy)) throw new Error("Financial year must look like 2026-27.");
  const { schedules } = await cols();
  return schedules.findOne({ fy, ...notDeleted });
}

export interface EffectiveSchedule {
  instalments: Instalment[];
  /** "rulebook" = the law's schedule as the platform publishes it; "company" = dates the company saved itself (the advanced option). */
  source: "rulebook" | "company";
  /** Rulebook only: whether the platform has checked the year's figures, and when. */
  rulebook: { confirmed: boolean; confirmedAt: string | null; confirmedBy: string | null; origin: "built-in" | "published" };
}

/** The schedule to plan against: the company's own if it saved one, otherwise the rulebook's, so a company never has to enter a date. */
export async function effectiveSchedule(fy: string): Promise<EffectiveSchedule> {
  const [own, rb] = await Promise.all([getSchedule(fy), loadRulebook(fy)]);
  const rulebook = { confirmed: rb.confirmed, confirmedAt: rb.confirmedAt, confirmedBy: rb.confirmedBy, origin: rb.origin };
  if (own && own.instalments.length > 0) return { instalments: own.instalments, source: "company", rulebook };
  return { instalments: rb.advanceTax, source: "rulebook", rulebook };
}

export interface ScheduleInput {
  instalments: Instalment[];
  note?: string | null;
  estimate?: number | null;
  confirmed: boolean;
}

/** Saves the year's schedule exactly as typed. Saving it again replaces it, and the "confirmed with CA" mark is kept only if the box stays ticked. */
export async function saveSchedule(fy: string, input: ScheduleInput, actor: Actor): Promise<Result> {
  if (!isFinancialYear(fy)) return { ok: false, error: "Financial year must look like 2026-27." };
  const instalments = (input.instalments ?? []).map((i) => ({ dueDate: String(i.dueDate ?? ""), cumulativePercent: r2(Number(i.cumulativePercent)) }));
  const bad = scheduleProblem(instalments);
  if (bad) return { ok: false, error: bad };
  let estimate: number | null = null;
  if (input.estimate !== null && input.estimate !== undefined) {
    estimate = r2(Number(input.estimate));
    if (!Number.isFinite(estimate) || estimate < 0 || estimate > 1e11) return { ok: false, error: "The estimate must be zero or more." };
  }
  const note = input.note?.trim().slice(0, 500) || null;
  const { schedules } = await cols();
  const existing = await schedules.findOne({ fy, ...notDeleted });
  const keepConfirm = input.confirmed && existing?.confirmed;
  const confirm = input.confirmed ? { confirmed: true, confirmedBy: keepConfirm ? existing!.confirmedBy : actor.id, confirmedAt: keepConfirm ? existing!.confirmedAt : new Date() } : { confirmed: false, confirmedBy: null, confirmedAt: null };
  try {
    // the unique index on fy makes two first saves at once end as one document
    await schedules.updateOne({ fy }, { $set: { instalments, note, estimate, ...confirm, ...updateStamp(actor.id) }, $setOnInsert: { _id: newId(), createdAt: new Date(), createdBy: actor.id, deletedAt: null } }, { upsert: true });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    await schedules.updateOne({ fy }, { $set: { instalments, note, estimate, ...confirm, ...updateStamp(actor.id) } });
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "it_schedule", entityId: `it_schedule:${fy}`, entityLabel: `Advance-tax schedule FY ${fy}`, summary: `${instalments.length} instalment(s)${confirm.confirmed ? ", marked as confirmed with the CA" : ""}` });
  return { ok: true };
}
