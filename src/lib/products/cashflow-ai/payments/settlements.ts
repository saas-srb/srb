import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { resolveRazorpayCredentials, NOT_CONNECTED_MESSAGE } from "@/lib/platform/integrations/payments";
import { getAccountByCode, createAccount } from "@/lib/products/cashflow-ai/accounts";
import { getBankAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";
import { recordTransfer } from "@/lib/products/cashflow-ai/fund-transfers";
import { razorpayCollectionsAccountId } from "@/lib/products/cashflow-ai/payments/payouts";
import { PAYMENT_INTENTS_COLLECTION } from "@/lib/products/cashflow-ai/payments/intents";
import { parseReconItems, summariseSettlements, type SettlementRow, type SettlementSummary } from "@/lib/products/cashflow-ai/payments/settlements-core";

/**
 * Razorpay settlements: what Razorpay paid into the bank, the fee and the GST
 * it charged, and which customer payments each settlement covers.
 *
 * Customer payments are booked gross into "Razorpay collections (awaiting
 * settlement)" the moment they succeed. A settlement then does three things,
 * all through the normal ledger paths: the fee is expensed, the GST on the
 * fee is kept as input credit, and the net is transferred to the bank
 * account. Together they clear exactly what was collected less refunds.
 */
export const SETTLEMENTS_COLLECTION = "fms_gateway_settlements";
export const SETTLEMENT_LINES_COLLECTION = "fms_gateway_settlement_lines";

/** Ledger accounts the fee and its GST are booked to. Created the first time a settlement is booked. */
export const GATEWAY_FEE_ACCOUNT = { code: "5600", name: "Payment gateway fees", type: "expense" as const };
export const GST_INPUT_ACCOUNT = { code: "1500", name: "GST input credit (ITC)", type: "asset" as const };

export type SettlementStatus = "ready" | "review" | "booking" | "booked";

export interface GatewaySettlement extends AuditFields {
  _id: string;
  settlementId: string;
  utr: string | null;
  settledOn: string | null;
  gross: number;
  refunds: number;
  fee: number;
  tax: number;
  adjustments: number;
  net: number;
  expectedNet: number;
  paymentCount: number;
  refundCount: number;
  adjustmentCount: number;
  status: SettlementStatus;
  reviewReasons: string[];
  /** Payments in this settlement that no customer payment of ours matches. */
  unmatchedPayments: number;
  bankAccountId: string | null;
  transferId: string | null;
  bookedAt: Date | null;
  bookedBy: string | null;
}

export interface SettlementLine {
  _id: string;
  settlementId: string;
  entityId: string;
  type: string;
  paymentId: string | null;
  amount: number;
  fee: number;
  tax: number;
  matchedIntentId: string | null;
}

let indexesEnsured = false;
async function cols() {
  const db = await getDb();
  const settlements = db.collection<GatewaySettlement>(SETTLEMENTS_COLLECTION);
  const lines = db.collection<SettlementLine>(SETTLEMENT_LINES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      settlements.createIndex({ settlementId: 1 }, { unique: true }).catch(() => {}),
      settlements.createIndex({ settledOn: -1 }).catch(() => {}),
      lines.createIndex({ settlementId: 1, entityId: 1, type: 1 }, { unique: true }).catch(() => {}),
      lines.createIndex({ paymentId: 1 }).catch(() => {}),
    ]);
  }
  return { settlements, lines };
}

export async function listSettlements(): Promise<GatewaySettlement[]> {
  const { settlements } = await cols();
  return settlements.find({ ...notDeleted }).sort({ settledOn: -1, createdAt: -1 }).limit(200).toArray();
}

export async function listSettlementLines(settlementId: string): Promise<SettlementLine[]> {
  const { lines } = await cols();
  return lines.find({ settlementId }).toArray();
}

// ───────────────────────── fetching from Razorpay ─────────────────────────

const MAX_DAYS = 31;

/** Every day from..to (YYYY-MM-DD), at most MAX_DAYS. */
export function daysBetween(from: string, to: string): string[] | null {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) return null;
  const out: string[] = [];
  for (let d = a; d <= b; d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10));
  return out.length > MAX_DAYS ? null : out;
}

async function fetchDay(auth: string, day: string): Promise<{ ok: true; items: unknown[] } | { ok: false; error: string }> {
  const [y, m, d] = day.split("-").map(Number);
  const items: unknown[] = [];
  for (let skip = 0; skip < 20000; skip += 1000) {
    const res = await fetch(`https://api.razorpay.com/v1/settlements/recon/combined?year=${y}&month=${m}&day=${d}&count=1000&skip=${skip}`, { headers: { Authorization: auth }, cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { items?: unknown[]; error?: { description?: string } } | null;
    if (!res.ok || !body) return { ok: false, error: body?.error?.description || `Razorpay did not return the report for ${day}.` };
    const page = Array.isArray(body.items) ? body.items : [];
    items.push(...page);
    if (page.length < 1000) break;
  }
  return { ok: true, items };
}

export type FetchRows = (days: string[]) => Promise<{ ok: true; items: unknown[] } | { ok: false; error: string }>;

async function fetchFromRazorpay(days: string[]): Promise<{ ok: true; items: unknown[] } | { ok: false; error: string }> {
  const creds = await resolveRazorpayCredentials("payments");
  if (!creds) return { ok: false, error: NOT_CONNECTED_MESSAGE };
  const auth = `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`;
  const items: unknown[] = [];
  for (const day of days) {
    const r = await fetchDay(auth, day);
    if (!r.ok) return r;
    items.push(...r.items);
  }
  return { ok: true, items };
}

// ───────────────────────── syncing into the books ─────────────────────────

export interface SyncResult {
  ok: true;
  settlements: number;
  new: number;
  rejectedRows: number;
  ready: number;
  review: number;
  unmatchedPayments: number;
}

/**
 * Pulls Razorpay's settlement report for a date range and stores each
 * settlement with its lines, matched to our customer payments. A settlement
 * that has already been booked is never changed. `fetchRows` is a test seam;
 * production always uses Razorpay.
 */
export async function syncSettlements(
  range: { from: string; to: string },
  actor: { id: string; email: string | null },
  fetchRows: FetchRows = fetchFromRazorpay
): Promise<SyncResult | { ok: false; error: string }> {
  const days = daysBetween(range.from, range.to);
  if (!days) return { ok: false, error: `Choose a valid range of at most ${MAX_DAYS} days.` };
  const fetched = await fetchRows(days);
  if (!fetched.ok) return fetched;

  const { rows, rejected } = parseReconItems(fetched.items);
  const summaries = summariseSettlements(rows);
  const { settlements, lines } = await cols();
  const db = await getDb();

  let created = 0;
  let unmatchedTotal = 0;
  for (const s of summaries) {
    const existing = await settlements.findOne({ settlementId: s.settlementId });
    if (existing && (existing.status === "booked" || existing.status === "booking")) continue;

    const mine = rows.filter((r) => r.settlementId === s.settlementId);
    const payIds = mine.map((r) => r.paymentId).filter((x): x is string => !!x);
    const intents = payIds.length
      ? await db.collection<{ _id: string; gatewayPaymentId: string | null }>(PAYMENT_INTENTS_COLLECTION).find({ gatewayPaymentId: { $in: payIds }, ...notDeleted }, { projection: { gatewayPaymentId: 1 } }).toArray()
      : [];
    const intentByPay = new Map(intents.map((i) => [i.gatewayPaymentId, i._id]));
    let unmatched = 0;
    for (const r of mine) {
      const matched = r.type === "payment" && r.paymentId ? intentByPay.get(r.paymentId) ?? null : null;
      if (r.type === "payment" && !matched) unmatched += 1;
      await lines.updateOne(
        { settlementId: r.settlementId, entityId: r.entityId, type: r.type },
        { $set: { paymentId: r.paymentId, amount: r.amount, fee: r.fee, tax: r.tax, matchedIntentId: matched }, $setOnInsert: { _id: newId() } },
        { upsert: true }
      );
    }
    unmatchedTotal += unmatched;

    const reasons = [...s.reviewReasons];
    if (unmatched > 0) reasons.push(`${unmatched} payment${unmatched === 1 ? "" : "s"} in this settlement ${unmatched === 1 ? "is" : "are"} not in your records (unidentified receipt).`);
    const status: SettlementStatus = reasons.length === 0 ? "ready" : "review";
    const base = { utr: s.utr, settledOn: s.settledOn, gross: s.gross, refunds: s.refunds, fee: s.fee, tax: s.tax, adjustments: s.adjustments, net: s.net, expectedNet: s.expectedNet, paymentCount: s.paymentCount, refundCount: s.refundCount, adjustmentCount: s.adjustmentCount, status, reviewReasons: reasons, unmatchedPayments: unmatched };
    if (existing) {
      await settlements.updateOne({ _id: existing._id }, { $set: { ...base, ...updateStamp(actor.id) } });
    } else {
      const doc: GatewaySettlement = { _id: newId(), settlementId: s.settlementId, ...base, bankAccountId: null, transferId: null, bookedAt: null, bookedBy: null, ...createStamp(actor.id) };
      try {
        await settlements.insertOne(doc);
        created += 1;
      } catch {
        await settlements.updateOne({ settlementId: s.settlementId, status: { $in: ["ready", "review"] } }, { $set: { ...base, ...updateStamp(actor.id) } });
      }
    }
  }

  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "import", entity: "gateway_settlement", entityId: `${range.from}..${range.to}`, entityLabel: "Razorpay settlements", summary: `${summaries.length} settlements read, ${created} new${rejected ? `, ${rejected} unreadable rows skipped` : ""}` });
  const all = await settlements.find({ settlementId: { $in: summaries.map((s) => s.settlementId) } }).toArray();
  return { ok: true, settlements: summaries.length, new: created, rejectedRows: rejected, ready: all.filter((x) => x.status === "ready").length, review: all.filter((x) => x.status === "review").length, unmatchedPayments: unmatchedTotal };
}

// ───────────────────────────── booking ─────────────────────────────

async function ensureAccount(a: { code: string; name: string; type: "expense" | "asset" }, actorId: string): Promise<string> {
  const existing = await getAccountByCode(a.code);
  if (existing) return existing._id;
  const made = await createAccount({ code: a.code, name: a.name, type: a.type, parentId: null, description: null, isActive: true }, actorId);
  return made._id;
}

/**
 * Books a ready settlement: fee and GST on fee out of the collections
 * account, the net across to the chosen bank account. Safe to call twice —
 * a claim on the settlement lets only one call through.
 */
export async function bookSettlement(
  id: string,
  bankAccountId: string,
  actor: { id: string; email: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { settlements } = await cols();
  const s = await settlements.findOne({ _id: id, ...notDeleted });
  if (!s) return { ok: false, error: "Settlement not found." };
  if (s.status === "booked") return { ok: false, error: "This settlement is already booked." };
  if (s.status === "booking") return { ok: false, error: "This settlement is being booked right now." };
  if (s.status !== "ready") return { ok: false, error: "This settlement needs a review before it can be booked." };
  if (!s.settledOn) return { ok: false, error: "Razorpay gave no settlement date." };
  const bank = await getBankAccount(bankAccountId);
  if (!bank || bank.status !== "active") return { ok: false, error: "Choose the active bank account the money arrived in." };
  if (bank.currency !== "INR") return { ok: false, error: "Settlements are paid in rupees; choose a rupee account." };

  const claim = await settlements.updateOne({ _id: id, status: "ready" }, { $set: { status: "booking", ...updateStamp(actor.id) } });
  if (claim.modifiedCount !== 1) return { ok: false, error: "This settlement was just changed by someone else. Reload and try again." };

  const fail = async (error: string) => {
    await settlements.updateOne({ _id: id, status: "booking" }, { $set: { status: "ready", ...updateStamp(actor.id) } });
    return { ok: false as const, error };
  };

  try {
    const collectionsId = await razorpayCollectionsAccountId(actor.id);
    if (collectionsId === bank._id) return await fail("Choose your own bank account, not the Razorpay collections account.");
    const date = new Date(`${s.settledOn}T00:00:00`);
    const common = { transactionDate: date, postingDate: date, currency: "INR", paymentMethod: "payment_gateway" as const, sourceModule: "fms" as const, sourceRecordId: s.settlementId, customerId: null, vendorId: null, employeeId: null, projectId: null, department: null, fundAccountId: collectionsId, fundAccountType: "bank" as const, referenceNumber: s.utr ?? s.settlementId, attachments: [] };

    if (s.fee > 0) {
      const feeAccount = await ensureAccount(GATEWAY_FEE_ACCOUNT, actor.id);
      const r = await postSystemTransaction({ ...common, type: "expense", amount: s.fee, accountId: feeAccount, taxAmount: 0, description: `Razorpay fee, settlement ${s.settlementId}` }, actor.id, actor.email);
      if ("ok" in r) return await fail(r.reason);
    }
    if (s.tax > 0) {
      const gstAccount = await ensureAccount(GST_INPUT_ACCOUNT, actor.id);
      const r = await postSystemTransaction({ ...common, type: "expense", amount: s.tax, accountId: gstAccount, taxAmount: s.tax, description: `GST on Razorpay fee, settlement ${s.settlementId}` }, actor.id, actor.email);
      if ("ok" in r) return await fail(r.reason);
    }
    const t = await recordTransfer({ fromAccountId: collectionsId, fromAccountType: "bank", toAccountId: bank._id, toAccountType: "bank", amount: s.net, transferDate: s.settledOn, referenceNumber: s.utr ?? s.settlementId, notes: `Razorpay settlement ${s.settlementId}` }, actor.id, actor.email);
    if (!t.ok) return await fail(t.reason);

    await settlements.updateOne({ _id: id }, { $set: { status: "booked", bankAccountId: bank._id, transferId: t.transfer._id, bookedAt: new Date(), bookedBy: actor.id, ...updateStamp(actor.id) } });
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "reconcile", entity: "gateway_settlement", entityId: id, entityLabel: s.settlementId, summary: `booked: net ${s.net} to ${bank.accountName}, fee ${s.fee}, GST on fee ${s.tax}` });
    return { ok: true };
  } catch (err) {
    return await fail(err instanceof Error ? err.message : "Could not book the settlement.");
  }
}

// ───────────────────────── what is still waiting ─────────────────────────

export interface UnsettledPayment {
  intentId: string;
  paymentNumber: string;
  gatewayPaymentId: string;
  customerName: string;
  amount: number;
  paidOn: string;
  ageDays: number;
}

/** Customer payments that succeeded and are in no settlement yet, oldest first. */
export async function unsettledPayments(now = new Date()): Promise<{ list: UnsettledPayment[]; total: number }> {
  const db = await getDb();
  const { lines } = await cols();
  const settled = new Set((await lines.find({ type: "payment" }, { projection: { paymentId: 1 } }).toArray()).map((l) => l.paymentId));
  const rows = await db
    .collection<{ _id: string; paymentNumber: string; gatewayPaymentId: string | null; customerName: string; netAmount: number; completedAt: Date | null }>(PAYMENT_INTENTS_COLLECTION)
    .find({ status: { $in: ["SUCCESS", "PARTIALLY_REFUNDED"] }, gatewayPaymentId: { $ne: null }, ...notDeleted })
    .sort({ completedAt: 1 })
    .limit(2000)
    .toArray();
  const list = rows
    .filter((r) => r.gatewayPaymentId && !settled.has(r.gatewayPaymentId))
    .map((r) => ({
      intentId: r._id,
      paymentNumber: r.paymentNumber,
      gatewayPaymentId: r.gatewayPaymentId as string,
      customerName: r.customerName,
      amount: r.netAmount,
      paidOn: (r.completedAt ?? now).toISOString().slice(0, 10),
      ageDays: Math.max(0, Math.floor((now.getTime() - (r.completedAt ?? now).getTime()) / 86400000)),
    }));
  return { list, total: Math.round(list.reduce((n, r) => n + r.amount, 0) * 100) / 100 };
}

export type { SettlementSummary, SettlementRow };
