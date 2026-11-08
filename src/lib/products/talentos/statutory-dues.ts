import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, type AuditFields } from "@/lib/products/talentos/db";
import { PAYROLL_RUNS_COLLECTION, PAYSLIPS_COLLECTION, type Payslip } from "@/lib/products/talentos/payroll-run";
import { isDateString, todayDateString } from "@/lib/products/talentos/settings";
import { getBankAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { changeTransactionStatus, postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";
import { DUE_LABELS, buildDues, type Due, type DueKind, type DuePayment, type DueSlip } from "@/lib/products/talentos/payroll/dues";

/**
 * Payments made to the government out of payroll (`hrms_statutory_payments`). The amounts due come from the approved payroll run; HR records
 * each payment here with the challan details, so the books show what is paid, what is late, and the references the returns need.
 * Money itself moves outside this system, on the EPFO, ESIC, income-tax and state portals or through the bank.
 */

export const STATUTORY_PAYMENTS_COLLECTION = "hrms_statutory_payments";

interface PaymentDoc extends AuditFields {
  _id: string;
  month: string;
  kind: DueKind;
  state: string | null;
  amount: number;
  paidOn: string;
  reference: string;
  bsrCode: string | null;
  challanSerial: string | null;
  note: string | null;
  /** The company current account it was paid from, and the ledger entry that records it. */
  accountId: string | null;
  accountLabel: string | null;
  transactionId: string | null;
}

let indexEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<PaymentDoc>(STATUTORY_PAYMENTS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await c.createIndex({ month: 1, kind: 1 }).catch(() => {});
  }
  return c;
}

const toPayment = (d: PaymentDoc): DuePayment => ({ id: d._id, kind: d.kind, state: d.state, amount: d.amount, paidOn: d.paidOn, reference: d.reference, bsrCode: d.bsrCode, challanSerial: d.challanSerial, note: d.note, accountLabel: d.accountLabel ?? null });

export function dueSlipOf(s: Payslip): DueSlip {
  const pf = s.statutory?.pf;
  const sumOf = (rows: { code?: string; name: string; amount: number }[], code: string, name: string) => rows.filter((r) => r.code === code || (!r.code && r.name === name)).reduce((n, r) => n + r.amount, 0);
  return {
    state: s.workState ?? null,
    pfEmployee: pf?.employee ?? sumOf(s.deductions, "PF", "Provident Fund"),
    pfEmployer: pf?.employerTotal ?? sumOf(s.employerContributions, "ER_EPF", "Employer PF") + sumOf(s.employerContributions, "ER_EPS", "Employer EPS"),
    pfEdli: pf?.edli ?? 0,
    pfAdmin: pf?.admin ?? 0,
    esiEmployee: s.statutory?.esi.employee ?? sumOf(s.deductions, "ESI", "ESI"),
    esiEmployer: s.statutory?.esi.employer ?? sumOf(s.employerContributions, "ER_ESI", "Employer ESI"),
    tds: sumOf(s.deductions, "TDS", "TDS"),
    pt: s.statutory?.pt.amount ?? sumOf(s.deductions, "PT", "Professional Tax"),
    lwfEmployee: s.statutory?.lwf.employee ?? 0,
    lwfEmployer: s.statutory?.lwf.employer ?? 0,
  };
}

/** The dues of a month whose run has been approved; `null` when there is no such run. */
export async function duesForMonth(month: string): Promise<{ runId: string; status: string; dues: Due[] } | null> {
  const db = await getDb();
  const run = await db.collection<{ _id: string; month: string; status: string }>(PAYROLL_RUNS_COLLECTION).findOne({ month, status: { $in: ["approved", "paid"] } });
  if (!run) return null;
  const [slips, payments] = await Promise.all([db.collection<Payslip>(PAYSLIPS_COLLECTION).find({ runId: run._id }).toArray(), (await col()).find({ month }).sort({ paidOn: 1 }).toArray()]);
  return { runId: run._id, status: run.status, dues: buildDues(month, slips.map(dueSlipOf), payments.map(toPayment), todayDateString()) };
}

/** Every approved month, newest first, with how many of its dues still need a payment. */
export async function dueOverview(): Promise<{ month: string; open: number; overdue: number; total: number }[]> {
  const db = await getDb();
  const runs = await db.collection<{ month: string }>(PAYROLL_RUNS_COLLECTION).find({ status: { $in: ["approved", "paid"] } }, { projection: { month: 1 } }).sort({ month: -1 }).limit(24).toArray();
  const out: { month: string; open: number; overdue: number; total: number }[] = [];
  for (const r of runs) {
    const d = await duesForMonth(r.month);
    if (!d) continue;
    const real = d.dues.filter((x) => x.status !== "nothing_due");
    out.push({ month: r.month, open: real.filter((x) => x.status !== "paid").length, overdue: real.filter((x) => x.status === "overdue").length, total: real.length });
  }
  return out;
}

export interface PaymentInput {
  month: string;
  kind: DueKind;
  state: string | null;
  amount: number;
  paidOn: string;
  reference: string;
  bsrCode: string | null;
  challanSerial: string | null;
  note: string | null;
  accountId: string;
}

export function validatePayment(input: Record<string, unknown>): { valid: true; data: PaymentInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const kind = String(input.kind ?? "") as DueKind;
  if (!(kind in DUE_LABELS)) errors.kind = "Choose what was paid.";
  const month = String(input.month ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) errors.month = "Choose the payroll month.";
  const amount = Math.round(Number(String(input.amount ?? "").replace(/[, ]/g, "")));
  if (!(amount > 0 && amount <= 1e9)) errors.amount = "Enter the amount paid.";
  const paidOn = String(input.paidOn ?? "");
  if (!isDateString(paidOn)) errors.paidOn = "Enter the date of payment.";
  else if (paidOn > todayDateString()) errors.paidOn = "The payment date cannot be in the future.";
  const reference = String(input.reference ?? "").trim().slice(0, 60);
  if (reference.length < 3) errors.reference = kind === "pf" ? "Enter the TRRN or challan number from EPFO." : kind === "esi" ? "Enter the ESIC challan number." : kind === "tds" ? "Enter the CIN or challan identification." : "Enter the challan or receipt number.";
  const bsrCode = String(input.bsrCode ?? "").trim() || null;
  const challanSerial = String(input.challanSerial ?? "").trim() || null;
  if (kind === "tds") {
    if (!bsrCode || !/^\d{7}$/.test(bsrCode)) errors.bsrCode = "The bank's BSR code is 7 digits.";
    if (!challanSerial || !/^\d{1,5}$/.test(challanSerial)) errors.challanSerial = "Enter the challan serial number.";
  }
  const state = String(input.state ?? "").trim() || null;
  const accountId = String(input.accountId ?? "").trim();
  if (!accountId) errors.accountId = "Choose the company account the payment was made from.";
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { month, kind, state, amount, paidOn, reference, bsrCode, challanSerial, accountId, note: String(input.note ?? "").trim().slice(0, 300) || null } };
}

export async function recordPayment(data: PaymentInput, actorId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const dues = await duesForMonth(data.month);
  if (!dues) return { ok: false, error: "That month has no approved payroll run." };
  const due = dues.dues.find((d) => d.kind === data.kind && (d.state ?? null) === (data.state ?? null));
  if (!due || due.amount === 0) return { ok: false, error: "Nothing is due under that head for the month." };
  if (data.amount > due.balance + 1) return { ok: false, error: `Only ₹${due.balance.toLocaleString("en-IN")} is still unpaid under this head. A larger payment cannot be recorded against it.` };
  const c = await col();
  if (await c.findOne({ kind: data.kind, reference: data.reference })) return { ok: false, error: "A payment with this reference is already recorded." };
  const account = await getBankAccount(data.accountId);
  if (!account || account.status !== "active") return { ok: false, error: "That bank account is not available. Choose another." };
  const id = newId();
  const date = new Date(`${data.paidOn}T00:00:00.000Z`);
  const txn = await postSystemTransaction(
    {
      type: "expense", transactionDate: date, postingDate: date, amount: data.amount, currency: "INR", paymentMethod: "bank_transfer", sourceModule: "hrms", sourceRecordId: id,
      customerId: null, vendorId: null, employeeId: null, projectId: null, department: null, accountId: null, fundAccountId: account._id, fundAccountType: "bank", taxAmount: 0,
      referenceNumber: data.reference, description: `${DUE_LABELS[data.kind]}${data.state ? `, ${data.state}` : ""} for ${data.month}`, attachments: [],
    },
    actorId,
    null,
  );
  if ("ok" in txn) return { ok: false, error: txn.reason };
  const { accountId, ...rest } = data;
  const doc: PaymentDoc = { _id: id, ...rest, accountId, accountLabel: `${account.accountName} (${account.bankName}${account.accountNumberLast4 ? ` ••${account.accountNumberLast4}` : ""})`, transactionId: txn._id, ...createStamp(actorId) };
  await c.insertOne(doc);
  return { ok: true, id };
}

export async function deletePayment(id: string, actorId = "system"): Promise<{ ok: boolean; month?: string; error?: string }> {
  const c = await col();
  const row = await c.findOne({ _id: id });
  if (!row) return { ok: false };
  // The ledger entry goes back too, so the account's balance matches the bank again.
  if (row.transactionId) {
    const r = await changeTransactionStatus(row.transactionId, "reversed", actorId, null);
    if (r && "ok" in r && r.ok === false) return { ok: false, error: r.reason };
  }
  await c.deleteOne({ _id: id });
  return { ok: true, month: row.month };
}
