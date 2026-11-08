import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getAccountByCode } from "@/lib/products/cashflow-ai/accounts";
import { getBankAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { changeTransactionStatus, postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { ENGINE_ACCOUNTS, istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { RAZORPAY_COLLECTIONS_ACCOUNT_NAME } from "@/lib/products/cashflow-ai/payments/payouts";
import { challanProblem, fyRange, isFinancialYear, type ChallanLike } from "@/lib/products/cashflow-ai/tds/core";
import { duesForMonth } from "@/lib/products/talentos/statutory-dues";

/**
 * TDS challans: the tax the company actually deposited with the government for tax it deducted from vendors.
 * With accrual books on, a deposit also clears the "TDS payable" liability the vendor bills built up (Dr TDS payable / Cr bank).
 * With them off the challan is only recorded: there is no TDS payable in the ledger to clear.
 */
export const TDS_CHALLANS_COLLECTION = "fms_tds_challans";

/** "posting" is a short hold while the ledger entry is made; it is never shown and never counted. */
export type ChallanStatus = "deposited" | "cancelled" | "posting";

export interface TdsChallanDoc extends AuditFields {
  _id: string;
  /** YYYY-MM the tax belongs to (the month it was deducted). */
  forMonth: string;
  amount: number;
  paidOn: string;
  bsrCode: string;
  serial: string;
  cin: string | null;
  note: string | null;
  section: string | null;
  bankAccountId: string;
  bankAccountLabel: string;
  status: ChallanStatus;
  /** True while the challan holds its BSR+serial+date: what the unique index is on, so a cancelled challan can be entered again. */
  live: boolean;
  ledgerTransactionId: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface ChallanInput {
  forMonth: string;
  amount: number;
  paidOn: string;
  bsrCode: string;
  serial: string;
  cin?: string | null;
  note?: string | null;
  section?: string | null;
  bankAccountId: string;
}

type Actor = { id: string; email: string | null };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

let indexesEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<TdsChallanDoc>(TDS_CHALLANS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      // the same deposit cannot be entered twice, even by two requests at once
      c.createIndex({ bsrCode: 1, serial: 1, paidOn: 1 }, { unique: true, partialFilterExpression: { live: true } }).catch(() => {}),
      c.createIndex({ forMonth: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

const shown = { status: { $in: ["deposited", "cancelled"] as ChallanStatus[] } };

export async function listChallans(fy: string): Promise<TdsChallanDoc[]> {
  if (!isFinancialYear(fy)) throw new Error("Financial year must look like 2026-27.");
  const { from, to } = fyRange(fy);
  await healStalePosting();
  return (await col()).find({ ...notDeleted, ...shown, forMonth: { $gte: from.slice(0, 7), $lte: to.slice(0, 7) } }).sort({ paidOn: -1, createdAt: -1 }).toArray();
}

/** The challans that count towards the deposit position. */
export const countedChallans = (rows: TdsChallanDoc[]): ChallanLike[] => rows.filter((r) => r.status === "deposited").map((r) => ({ forMonth: r.forMonth, amount: r.amount, status: r.status }));

/** Bank accounts a deposit can be paid from: active rupee accounts of the company itself, not the Razorpay ones. */
export const isOwnBank = (b: { accountName: string }) => b.accountName !== RAZORPAY_COLLECTIONS_ACCOUNT_NAME && b.accountName !== "RazorpayX balance";

/**
 * A challan is held as "posting" while its ledger entry is made. If the server stopped in that window the hold would block the same BSR + serial + date for
 * ever, so a hold older than two minutes is settled here: when its ledger entry exists the challan is completed with it, otherwise the hold is released.
 */
export async function healStalePosting(): Promise<number> {
  const c = await col();
  const stale = await c.find({ status: "posting", createdAt: { $lt: new Date(Date.now() - 2 * 60_000) } }).limit(50).toArray();
  if (stale.length === 0) return 0;
  const db = await getDb();
  let n = 0;
  for (const row of stale) {
    const txn = (await db.collection("fms_transactions").findOne({ sourceRecordId: row._id, sourceModule: "fms", status: "completed", ...notDeleted })) as unknown as { _id: string } | null;
    if (txn) await c.updateOne({ _id: row._id, status: "posting" }, { $set: { status: "deposited", ledgerTransactionId: txn._id, ...updateStamp("system") } });
    else await c.deleteOne({ _id: row._id, status: "posting" });
    n += 1;
  }
  return n;
}

export async function createChallan(input: ChallanInput, actor: Actor): Promise<Result<{ id: string; ledgerPosted: boolean }>> {
  const data = {
    forMonth: input.forMonth,
    amount: Math.round((Number(input.amount) + Number.EPSILON) * 100) / 100,
    paidOn: input.paidOn,
    bsrCode: String(input.bsrCode ?? "").trim(),
    serial: String(input.serial ?? "").trim(),
  };
  const bad = challanProblem(data);
  if (bad) return { ok: false, error: bad };
  if (data.paidOn > istToday()) return { ok: false, error: "The deposit date cannot be in the future." };
  const cin = input.cin?.trim().slice(0, 40) || null;
  const note = input.note?.trim().slice(0, 300) || null;
  const section = input.section?.trim().toUpperCase().slice(0, 10) || null;
  if (section && !/^[A-Z0-9]{2,10}$/.test(section)) return { ok: false, error: "The section looks wrong. Leave it empty or use something like 194J." };

  const bank = await getBankAccount(input.bankAccountId);
  if (!bank || bank.status !== "active" || !isOwnBank(bank)) return { ok: false, error: "Choose the active bank account the tax was paid from." };
  if (bank.currency !== "INR") return { ok: false, error: "Tax is paid in rupees; choose a rupee account." };

  const accrual = await getAccrualSettings();
  let tdsPayableId: string | null = null;
  if (accrual) {
    const acct = await getAccountByCode(ENGINE_ACCOUNTS.tdsPayable.code);
    if (!acct) return { ok: false, error: "The TDS payable account is missing from your chart of accounts. Switch accrual books on from the accounting settings first, then record the deposit." };
    tdsPayableId = acct._id;
  }

  await healStalePosting();
  // Claim the BSR+serial+date first: of two identical submissions only one gets past here.
  const c = await col();
  const id = newId();
  try {
    await c.insertOne({ _id: id, ...data, cin, note, section, bankAccountId: bank._id, bankAccountLabel: `${bank.accountName} — ${bank.bankName}`, status: "posting", live: true, ledgerTransactionId: null, cancelledAt: null, cancelReason: null, ...createStamp(actor.id) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { ok: false, error: "A challan with this BSR code, serial number and date is already recorded." };
    throw err;
  }
  const release = () => c.deleteOne({ _id: id, status: "posting" });

  let txnId: string | null = null;
  if (tdsPayableId) {
    try {
      const date = new Date(`${data.paidOn}T00:00:00`);
      const txn = await postSystemTransaction(
        {
          type: "expense", transactionDate: date, postingDate: date, amount: data.amount, currency: "INR", paymentMethod: "bank_transfer", sourceModule: "fms", sourceRecordId: id,
          customerId: null, vendorId: null, employeeId: null, projectId: null, department: null, accountId: tdsPayableId,
          fundAccountId: bank._id, fundAccountType: "bank", taxAmount: 0, referenceNumber: `BSR ${data.bsrCode} / ${data.serial}`,
          description: `TDS deposited for ${data.forMonth}${section ? ` (${section})` : ""}`, attachments: [],
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
      return { ok: false, error: err instanceof Error ? err.message : "Could not post the deposit to the books." };
    }
  }

  try {
    await c.updateOne({ _id: id }, { $set: { status: "deposited", ledgerTransactionId: txnId, ...updateStamp(actor.id) } });
  } catch {
    // the deposit is in the ledger but the record could not be completed: it is completed from the ledger entry the next time challans are read
    return { ok: false, error: "The deposit was posted but could not be saved just now. Reload: it will appear in a moment." };
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: "tds_challan", entityId: `tds_challan:${id}`, entityLabel: `TDS challan ${data.bsrCode}/${data.serial}`, summary: `deposited ${data.amount} for ${data.forMonth} from ${bank.accountName}${txnId ? "" : " (recorded only: accrual books are off)"}` });
  return { ok: true, id, ledgerPosted: txnId !== null };
}

export async function cancelChallan(id: string, reason: string, actor: Actor): Promise<Result> {
  const why = reason.trim().slice(0, 300);
  if (why.length < 3) return { ok: false, error: "Say why the challan is being cancelled." };
  const c = await col();
  // claiming the cancel first means a double click cannot reverse the ledger entry twice
  const claimed = await c.findOneAndUpdate({ _id: id, status: "deposited", ...notDeleted }, { $set: { status: "cancelled", live: false, cancelledAt: new Date(), cancelReason: why, ...updateStamp(actor.id) } }, { returnDocument: "before" });
  if (!claimed) {
    const existing = await c.findOne({ _id: id, ...notDeleted });
    return { ok: false, error: existing?.status === "cancelled" ? "This challan is already cancelled." : "Challan not found." };
  }
  if (claimed.ledgerTransactionId) {
    let failure: string | null = null;
    try {
      const r = await changeTransactionStatus(claimed.ledgerTransactionId, "reversed", actor.id, actor.email);
      if (!r) failure = "The ledger entry for this deposit could not be found.";
      else if ("ok" in r) failure = r.reason;
    } catch (err) {
      failure = err instanceof Error ? err.message : "Could not reverse the ledger entry.";
    }
    if (failure) {
      await c.updateOne({ _id: id, status: "cancelled" }, { $set: { status: "deposited", live: true, cancelledAt: null, cancelReason: null, ...updateStamp(actor.id) } });
      return { ok: false, error: failure };
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "cancel", entity: "tds_challan", entityId: `tds_challan:${id}`, entityLabel: `TDS challan ${claimed.bsrCode}/${claimed.serial}`, summary: `cancelled: ${why}${claimed.ledgerTransactionId ? "; ledger entry reversed" : ""}` });
  return { ok: true };
}

// ───────────────────────── salary TDS (read only) ─────────────────────────

export interface SalaryTdsMonth {
  month: string;
  due: number;
  paid: number;
  balance: number;
}

/**
 * Tax deducted from salaries, per month of the financial year, as payroll recorded it. A separate stream (return 24Q) from vendor TDS:
 * shown for reference only, never added to the vendor deposit position. Months without an approved payroll run are left out.
 */
export async function salaryTdsByMonth(fy: string): Promise<SalaryTdsMonth[]> {
  const { from } = fyRange(fy);
  const y = Number(from.slice(0, 4));
  const months = Array.from({ length: 12 }, (_, i) => (i < 9 ? `${y}-${String(i + 4).padStart(2, "0")}` : `${y + 1}-${String(i - 8).padStart(2, "0")}`));
  const out: SalaryTdsMonth[] = [];
  for (const month of months) {
    const d = await duesForMonth(month);
    const tds = d?.dues.find((x) => x.kind === "tds");
    if (tds && tds.amount > 0) out.push({ month, due: tds.amount, paid: tds.paid, balance: tds.balance });
  }
  return out;
}
