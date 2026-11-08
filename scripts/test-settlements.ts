import assert from "node:assert/strict";
import { istDate, paiseToRupees, parseReconItems, summariseSettlements } from "../src/lib/products/cashflow-ai/payments/settlements-core";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const pay = (id: string, amountPaise: number, feePaise: number, taxPaise: number, extra: Record<string, unknown> = {}) => ({
  entity_id: id, type: "payment", amount: amountPaise, fee: feePaise, tax: taxPaise, credit: amountPaise - feePaise - taxPaise, debit: 0,
  settlement_id: "setl_1", settlement_utr: "UTR1", settled_at: 1_790_000_000, payment_id: id, ...extra,
});

t("paise convert to rupees only when they are whole paise", () => {
  assert.equal(paiseToRupees(11800), 118);
  assert.equal(paiseToRupees("2500"), 25);
  assert.equal(paiseToRupees(null), 0);
  assert.equal(paiseToRupees(10.5), null);
  assert.equal(paiseToRupees("abc"), null);
});

t("settlement dates are India dates (a late-evening UTC time is already the next day)", () => {
  assert.equal(istDate(Date.UTC(2026, 9, 27, 19, 0, 0) / 1000), "2026-10-28");
  assert.equal(istDate(Date.UTC(2026, 9, 27, 18, 0, 0) / 1000), "2026-10-27");
});

t("rows that cannot be read exactly are rejected, not guessed", () => {
  const { rows, rejected } = parseReconItems([pay("pay_1", 100000, 2000, 360), { entity_id: "x" }, { ...pay("pay_2", 1, 0, 0), amount: 10.5 }, null]);
  assert.equal(rows.length, 1);
  assert.equal(rejected, 3);
});

t("a clean settlement: gross, fee, GST on fee and net add up and it is ready", () => {
  const { rows } = parseReconItems([pay("pay_1", 100000, 2000, 360), pay("pay_2", 50000, 1000, 180)]);
  const [s] = summariseSettlements(rows);
  assert.equal(s.gross, 1500);
  assert.equal(s.fee, 30);
  assert.equal(s.tax, 5.4);
  assert.equal(s.net, 1464.6);
  assert.equal(s.expectedNet, 1464.6);
  assert.equal(s.state, "ready");
  assert.equal(s.utr, "UTR1");
  assert.equal(s.paymentCount, 2);
});

t("refunds reduce the payout and are not counted as fees", () => {
  const refund = { entity_id: "rfnd_1", type: "refund", amount: 20000, fee: 0, tax: 0, credit: 0, debit: 20000, settlement_id: "setl_1", settlement_utr: "UTR1", settled_at: 1_790_000_000, payment_id: "pay_1" };
  const { rows } = parseReconItems([pay("pay_1", 100000, 2000, 360), refund]);
  const [s] = summariseSettlements(rows);
  assert.equal(s.refunds, 200);
  assert.equal(s.net, 1000 - 20 - 3.6 - 200);
  assert.equal(s.state, "ready");
});

t("a settlement whose parts do not add up to what was credited is held for review", () => {
  const { rows } = parseReconItems([{ ...pay("pay_1", 100000, 2000, 360), credit: 90000 }]);
  const [s] = summariseSettlements(rows);
  assert.equal(s.state, "review");
  assert.ok(s.reviewReasons[0].includes("add up"));
});

t("adjustments (chargebacks etc.) always need a person", () => {
  const adj = { entity_id: "adj_1", type: "adjustment", amount: 5000, fee: 0, tax: 0, credit: 0, debit: 5000, settlement_id: "setl_1", settlement_utr: "UTR1", settled_at: 1_790_000_000 };
  const { rows } = parseReconItems([pay("pay_1", 100000, 2000, 360), adj]);
  const [s] = summariseSettlements(rows);
  assert.equal(s.adjustments, -50);
  assert.equal(s.state, "review");
});

t("rows are grouped per settlement", () => {
  const { rows } = parseReconItems([pay("pay_1", 100000, 0, 0), { ...pay("pay_2", 20000, 0, 0), settlement_id: "setl_2", settlement_utr: "UTR2" }]);
  const s = summariseSettlements(rows);
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.settlementId).sort(), ["setl_1", "setl_2"]);
});

console.log("settlement core tests passed");
