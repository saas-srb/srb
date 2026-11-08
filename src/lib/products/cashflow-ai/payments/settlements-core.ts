/**
 * Razorpay settlement reconciliation, the pure part: turning the rows
 * Razorpay reports for a settlement into gross / refunds / fees / tax / net,
 * and checking they add up. No DB, no network.
 *
 * Razorpay's settlement reconciliation report lists one row per payment,
 * refund or adjustment, amounts in paise. A row's field meaning is checked,
 * not assumed: for every settlement we recompute what the net credit should
 * be from the parts (payments less fee and tax, less refunds, plus
 * adjustments) and compare it with what Razorpay says was credited. Only a
 * settlement where the two agree is "ready" to book; anything else is held
 * for a person to look at.
 */

export type SettlementRowType = "payment" | "refund" | "adjustment" | "other";

export interface SettlementRow {
  entityId: string;
  type: SettlementRowType;
  /** The Razorpay payment this row belongs to (pay_…), when it has one. */
  paymentId: string | null;
  amount: number;
  fee: number;
  tax: number;
  credit: number;
  debit: number;
  settlementId: string;
  utr: string | null;
  /** YYYY-MM-DD in India time. */
  settledOn: string | null;
  method: string | null;
}

export interface SettlementSummary {
  settlementId: string;
  utr: string | null;
  settledOn: string | null;
  gross: number;
  refunds: number;
  fee: number;
  /** GST Razorpay charged on its fee. */
  tax: number;
  /** Adjustments Razorpay made (chargebacks, reversals, penalties …), credit minus debit. */
  adjustments: number;
  /** What Razorpay says it paid out: Σ credit − Σ debit. */
  net: number;
  /** What the parts add up to. */
  expectedNet: number;
  paymentCount: number;
  refundCount: number;
  adjustmentCount: number;
  /** ready = parts agree with the net and there is nothing odd; review = a person must look first. */
  state: "ready" | "review";
  reviewReasons: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Razorpay amounts are whole paise. Returns rupees, or null when the value is not a clean paise amount. */
export function paiseToRupees(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n / 100;
}

const IST_OFFSET_MS = 5.5 * 3600_000;
export function istDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Parses the `items` of Razorpay's combined settlement report. Rows that cannot be read exactly are returned in `rejected`, never guessed at. */
export function parseReconItems(items: unknown[]): { rows: SettlementRow[]; rejected: number } {
  const rows: SettlementRow[] = [];
  let rejected = 0;
  for (const raw of items) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const settlementId = typeof it.settlement_id === "string" ? it.settlement_id : "";
    const entityId = typeof it.entity_id === "string" ? it.entity_id : "";
    const amount = paiseToRupees(it.amount);
    const fee = paiseToRupees(it.fee);
    const tax = paiseToRupees(it.tax);
    const credit = paiseToRupees(it.credit);
    const debit = paiseToRupees(it.debit);
    if (!settlementId || !entityId || amount === null || fee === null || tax === null || credit === null || debit === null) {
      rejected += 1;
      continue;
    }
    const t = String(it.type ?? "");
    const type: SettlementRowType = t === "payment" || t === "refund" || t === "adjustment" ? t : "other";
    rows.push({
      entityId,
      type,
      paymentId: typeof it.payment_id === "string" && it.payment_id ? it.payment_id : type === "payment" ? entityId : null,
      amount,
      fee,
      tax,
      credit,
      debit,
      settlementId,
      utr: typeof it.settlement_utr === "string" && it.settlement_utr ? it.settlement_utr : null,
      settledOn: typeof it.settled_at === "number" && it.settled_at > 0 ? istDate(it.settled_at) : null,
      method: typeof it.method === "string" ? it.method : null,
    });
  }
  return { rows, rejected };
}

/** Groups rows by settlement and checks each one adds up. */
export function summariseSettlements(rows: SettlementRow[]): SettlementSummary[] {
  const by = new Map<string, SettlementRow[]>();
  for (const r of rows) by.set(r.settlementId, [...(by.get(r.settlementId) ?? []), r]);

  return [...by.entries()].map(([settlementId, list]) => {
    const pay = list.filter((r) => r.type === "payment");
    const ref = list.filter((r) => r.type === "refund");
    const adj = list.filter((r) => r.type === "adjustment" || r.type === "other");
    const gross = r2(pay.reduce((n, r) => n + r.amount, 0));
    const refunds = r2(ref.reduce((n, r) => n + r.amount, 0));
    const fee = r2(list.reduce((n, r) => n + r.fee, 0));
    const tax = r2(list.reduce((n, r) => n + r.tax, 0));
    const adjustments = r2(adj.reduce((n, r) => n + r.credit - r.debit, 0));
    const net = r2(list.reduce((n, r) => n + r.credit - r.debit, 0));
    const expectedNet = r2(pay.reduce((n, r) => n + r.amount - r.fee - r.tax, 0) - ref.reduce((n, r) => n + r.amount, 0) + adjustments);

    const reasons: string[] = [];
    if (Math.abs(net - expectedNet) > 0.01) reasons.push(`Razorpay credited ${net.toFixed(2)} but the payments, fees, tax and refunds add up to ${expectedNet.toFixed(2)}.`);
    if (adj.length > 0) reasons.push(`${adj.length} adjustment${adj.length === 1 ? "" : "s"} (chargeback, reversal or other) — check each before booking.`);
    if (net <= 0) reasons.push("Nothing was paid out in this settlement.");
    if (new Set(list.map((r) => r.utr).filter(Boolean)).size > 1) reasons.push("The rows carry different bank references.");
    if (!list.some((r) => r.settledOn)) reasons.push("Razorpay gave no settlement date.");

    return {
      settlementId,
      utr: list.find((r) => r.utr)?.utr ?? null,
      settledOn: list.find((r) => r.settledOn)?.settledOn ?? null,
      gross,
      refunds,
      fee,
      tax,
      adjustments,
      net,
      expectedNet,
      paymentCount: pay.length,
      refundCount: ref.length,
      adjustmentCount: adj.length,
      state: reasons.length === 0 ? "ready" : "review",
      reviewReasons: reasons,
    };
  });
}
