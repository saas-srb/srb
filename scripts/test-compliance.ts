import assert from "node:assert/strict";
import { COMPLIANCE_ITEMS, COMPLIANCE_SECTIONS, computeProgress, isKnownItemKey, itemKey, type ItemStatus } from "../src/lib/products/cashflow-ai/compliance/catalog";
import { FILING_TEMPLATES, filingState, isDateString } from "../src/lib/products/cashflow-ai/compliance/filings-core";
import { overallLevel } from "../src/lib/products/cashflow-ai/compliance/health-core";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };

t("every checklist section has items and unique keys", () => {
  assert.ok(COMPLIANCE_SECTIONS.length >= 18);
  const keys = COMPLIANCE_ITEMS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(COMPLIANCE_SECTIONS.map((s) => s.key)).size, COMPLIANCE_SECTIONS.length);
  for (const s of COMPLIANCE_SECTIONS) assert.ok(s.items.length > 0, s.key);
  assert.ok(isKnownItemKey("bookkeeping.1") && !isKnownItemKey("bookkeeping.9999") && !isKnownItemKey("nope.1"));
});

t("the catalog states no due dates, rates or thresholds", () => {
  for (const i of COMPLIANCE_ITEMS) assert.ok(!/\b\d{1,2}(st|nd|rd|th)\b|₹|\d+\s?%/.test(i.title), i.title);
  for (const f of FILING_TEMPLATES) assert.ok(!/\d{1,2}(st|th)/.test(f.frequency), f.name);
});

t("progress counts done of the applicable items only", () => {
  const s = COMPLIANCE_SECTIONS[0];
  const m = new Map<string, ItemStatus>();
  m.set(itemKey(s.key, 0), "done");
  m.set(itemKey(s.key, 1), "not_applicable");
  m.set(itemKey(s.key, 2), "in_progress");
  const p = computeProgress(m)[0];
  assert.equal(p.total, s.items.length);
  assert.equal(p.done, 1);
  assert.equal(p.notApplicable, 1);
  assert.equal(p.applicable, s.items.length - 1);
  assert.equal(p.percent, Math.round((1 / (s.items.length - 1)) * 100));
  const all = new Map<string, ItemStatus>(s.items.map((_, i) => [itemKey(s.key, i), "not_applicable"]));
  assert.equal(computeProgress(all)[0].percent, 100, "nothing applies = nothing left to do");
});

t("a filing's state comes from its date and status", () => {
  const today = "2026-10-28";
  assert.equal(filingState({ status: "pending", dueDate: null }, today), "no_date");
  assert.equal(filingState({ status: "pending", dueDate: "2026-10-27" }, today), "overdue");
  assert.equal(filingState({ status: "pending", dueDate: "2026-10-28" }, today), "due_soon");
  assert.equal(filingState({ status: "pending", dueDate: "2026-11-04" }, today), "due_soon");
  assert.equal(filingState({ status: "pending", dueDate: "2026-11-05" }, today), "upcoming");
  assert.equal(filingState({ status: "filed", dueDate: "2020-01-01" }, today), "filed");
  assert.equal(filingState({ status: "not_applicable", dueDate: null }, today), "not_applicable");
});

t("dates must be real calendar dates", () => {
  assert.ok(isDateString("2026-02-28") && !isDateString("2026-02-30") && !isDateString("28-02-2026") && !isDateString(""));
});

t("the overall health is the worst check, and unchecked is never 'ok'", () => {
  const c = (level: "ok" | "warn" | "bad" | "unknown") => ({ key: "k", label: "l", detail: "d", level });
  assert.equal(overallLevel([c("ok"), c("ok")]), "ok");
  assert.equal(overallLevel([c("ok"), c("unknown")]), "unknown");
  assert.equal(overallLevel([c("unknown"), c("warn")]), "warn");
  assert.equal(overallLevel([c("warn"), c("bad")]), "bad");
});

import { AUTO_RULES, doneButIssue, evaluateSignals, type ComplianceFacts } from "../src/lib/products/cashflow-ai/compliance/auto-core";
import { WORKSTREAMS, isWorkstreamKey } from "../src/lib/products/cashflow-ai/compliance/owners-core";

const clean: ComplianceFacts = {
  bankLinesTotal: 10, bankLinesOpen: 0, periodsDefined: 2, periodsOpenButFinished: 0, overdueInvoices: 0, overdueBills: 0, duplicateInvoiceNumbers: 0,
  trialBalanceBalanced: true, payrollMonths: 3, payrollDuesOverdue: 0, previousMonthPayrollApproved: true, filingsTotal: 4, filingsWithoutDate: 0, billsWithoutDocument: 0, receiptsWithoutProof: 0, expensesWithoutBill: 0, duplicateBillGroups: 0, unclassifiedEntries: 0,
};
const keyOf = (title: string) => COMPLIANCE_ITEMS.find((i) => i.title === title)!.key;

t("every auto rule points at a real checklist item", () => {
  for (const r of AUTO_RULES) assert.ok(COMPLIANCE_ITEMS.some((i) => i.title === r.title), r.title);
  assert.equal(new Set(AUTO_RULES.map((r) => r.title)).size, AUTO_RULES.length);
});

t("clean books verify what they can prove and say nothing about the rest", () => {
  const sig = evaluateSignals(clean);
  assert.equal(sig.get(keyOf("Reconcile every bank account to its statement each month"))?.state, "verified");
  assert.equal(sig.get(keyOf("Lock the period after review"))?.state, "verified");
  assert.equal(sig.get(keyOf("Statutory payments are made by their due dates"))?.state, "verified");
  assert.equal(sig.has(keyOf("Review the trial balance")), false, "a balanced trial balance does not prove it was reviewed");
  assert.equal(sig.has(keyOf("Invoice numbering has no gaps or duplicates")), false, "no duplicates does not prove no gaps");
  assert.ok(sig.size < COMPLIANCE_ITEMS.length / 4, "most items have no signal");
});

t("problems in the books show as issues", () => {
  const sig = evaluateSignals({ ...clean, bankLinesOpen: 3, periodsOpenButFinished: 1, overdueInvoices: 2, overdueBills: 1, duplicateInvoiceNumbers: 1, trialBalanceBalanced: false, payrollDuesOverdue: 2, filingsWithoutDate: 1, billsWithoutDocument: 2, receiptsWithoutProof: 1, expensesWithoutBill: 1, duplicateBillGroups: 1, unclassifiedEntries: 3 });
  for (const title of ["Reconcile every bank account to its statement each month", "Lock the period after review", "Overdue receivables are followed up", "Payment terms, overdue bills and disputes are monitored", "Invoice numbering has no gaps or duplicates", "Review the trial balance", "Statutory payments are made by their due dates", "Compliance calendar with upcoming deadlines", "Supporting documents are attached to entries", "Check for duplicate invoices, bills and payments", "Duplicate invoice and duplicate payment risks are checked", "Suspense and unclassified entries are reviewed and cleared"]) {
    assert.equal(sig.get(keyOf(title))?.state, "issue", title);
  }
});

t("a fact that could not be read never becomes 'verified'", () => {
  assert.equal(evaluateSignals({}).size, 0);
  const { bankLinesOpen: _omit, ...rest } = clean;
  void _omit;
  assert.equal(evaluateSignals(rest).has(keyOf("Reconcile every bank account to its statement each month")), false);
  const empty = evaluateSignals({ ...clean, bankLinesTotal: 0, periodsDefined: 0, payrollMonths: 0, filingsTotal: 0 });
  for (const title of ["Reconcile every bank account to its statement each month", "Lock the period after review", "Statutory payments are made by their due dates", "Compliance calendar with upcoming deadlines"]) {
    assert.equal(empty.has(keyOf(title)), false, `${title}: no data, no signal`);
  }
});

t("items marked Done while the books show a problem are listed", () => {
  const sig = evaluateSignals({ ...clean, overdueInvoices: 1 });
  const k = keyOf("Overdue receivables are followed up");
  assert.deepEqual(doneButIssue(sig, new Map([[k, "done"]])), [k]);
  assert.deepEqual(doneButIssue(sig, new Map([[k, "todo"]])), []);
});

t("workstreams are unique", () => {
  assert.equal(new Set(WORKSTREAMS.map((w) => w.key)).size, WORKSTREAMS.length);
  assert.ok(isWorkstreamKey("gst-tds") && !isWorkstreamKey("x"));
});

console.log("compliance catalog tests passed");
