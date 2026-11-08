import assert from "node:assert/strict";
import { WORK_TASKS, FREQUENCIES } from "../src/lib/products/cashflow-ai/work/catalog";
import { appliesTo, buildInstances, canComplete, dueFor, periodOf, skipProblem, sortInstances, summarise, type CompanyFacts, type LogEntry, type Rulebooks } from "../src/lib/products/cashflow-ai/work/engine";
import { builtinRulebook, calendarFor } from "../src/lib/products/cashflow-ai/rulebook/rules";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const books: Rulebooks = { forFy: (fy) => { const rb = builtinRulebook(fy); return { calendar: calendarFor(rb), advanceTax: rb.advanceTax }; } };
const all: CompanyFacts = { gstRegistered: true, hasEmployees: true, deductsTds: true, isPrivateLimited: true, hasCashAccounts: true };
const none: CompanyFacts = { gstRegistered: null, hasEmployees: null, deductsTds: null, isPrivateLimited: null, hasCashAccounts: false };
const build = (today: string, startDate: string, facts = all, logs: LogEntry[] = []) => buildInstances({ today, startDate, facts, logs, books });
const find = (list: ReturnType<typeof build>, id: string, key?: string) => list.filter((i) => i.task.id === id && (!key || i.period.key === key));

t("the catalog has unique ids, steps for every task, and every frequency is used", () => {
  assert.equal(new Set(WORK_TASKS.map((x) => x.id)).size, WORK_TASKS.length);
  for (const x of WORK_TASKS) { assert.ok(x.steps.length > 0, x.id); assert.ok(x.why.length > 10, x.id); assert.ok(x.id.startsWith(x.frequency[0] + "-"), x.id); for (const s of x.steps) assert.ok(s.text.length > 5); }
  for (const f of FREQUENCIES) assert.ok(WORK_TASKS.some((x) => x.frequency === f), f);
  for (const x of WORK_TASKS) for (const s of x.steps) if (s.built) assert.ok(s.href, `${x.id}: a built step must open a screen: ${s.text}`);
});

t("periods: weeks start on Monday, quarters follow April-March, the year is the financial year", () => {
  assert.deepEqual(periodOf("weekly", "2026-10-29"), { key: "2026-10-26", label: "Week of 26 Oct", start: "2026-10-26", end: "2026-11-01", fy: "2026-27" });
  assert.deepEqual([periodOf("quarterly", "2026-04-01").key, periodOf("quarterly", "2026-06-30").key, periodOf("quarterly", "2026-07-01").key, periodOf("quarterly", "2027-01-01").key, periodOf("quarterly", "2027-03-31").key], ["2026-27-Q1", "2026-27-Q1", "2026-27-Q2", "2026-27-Q4", "2026-27-Q4"]);
  assert.deepEqual(periodOf("quarterly", "2027-02-10"), { key: "2026-27-Q4", label: "Quarter 4 of FY 2026-27", start: "2027-01-01", end: "2027-03-31", fy: "2026-27" });
  assert.equal(periodOf("monthly", "2028-02-10").end, "2028-02-29");
  assert.deepEqual([periodOf("yearly", "2027-03-31").key, periodOf("yearly", "2027-04-01").key], ["2026-27", "2027-04".slice(0, 4) + "-28"]);
});

t("work that depends on a fact the company has not confirmed is not shown; work for everyone is", () => {
  const list = build("2026-10-29", "2026-10-01", none);
  assert.equal(find(list, "m-gst").length, 0);
  assert.equal(find(list, "m-payroll").length, 0);
  assert.ok(find(list, "d-record").length > 0);
  assert.ok(find(list, "m-close").length > 0, "company work applies unless the company says it is not one");
  assert.equal(appliesTo(WORK_TASKS.find((x) => x.id === "m-close")!, { ...none, isPrivateLimited: false }), false);
});

t("due dates come from the rulebook where there is a rule, and are marked as suggested otherwise", () => {
  const gst = WORK_TASKS.find((x) => x.id === "m-gst")!;
  assert.deepEqual(dueFor(gst, periodOf("monthly", "2026-09-10"), books), { date: "2026-10-20", source: "rulebook" });
  assert.deepEqual(dueFor(gst, periodOf("monthly", "2027-03-10"), books), { date: "2027-04-20", source: "rulebook" });
  const close = WORK_TASKS.find((x) => x.id === "m-close")!;
  assert.deepEqual(dueFor(close, periodOf("monthly", "2026-09-10"), books), { date: "2026-10-07", source: "suggested" });
  const adv = WORK_TASKS.find((x) => x.id === "q-advtax")!;
  assert.deepEqual(dueFor(adv, periodOf("quarterly", "2026-08-01"), books), { date: "2026-09-15", source: "rulebook" });
  assert.deepEqual(dueFor(adv, periodOf("quarterly", "2027-02-01"), books), { date: "2027-03-15", source: "rulebook" });
  const tdsr = WORK_TASKS.find((x) => x.id === "q-tdsreturn")!;
  assert.equal(dueFor(tdsr, periodOf("quarterly", "2026-08-01"), books).date, "2026-10-31");
  const itr = WORK_TASKS.find((x) => x.id === "y-tax")!;
  assert.equal(dueFor(itr, periodOf("yearly", "2026-08-01"), books).date, "2027-10-31");
});

t("a day's work is open that day, due that day, and overdue the day after until done", () => {
  const today = find(build("2026-10-29", "2026-10-29"), "d-record");
  assert.equal(today.length, 1);
  assert.equal(today[0].state, "due_today");
  const later = find(build("2026-10-31", "2026-10-29"), "d-record");
  assert.deepEqual(later.map((i) => [i.period.key, i.state]), [["2026-10-29", "overdue"], ["2026-10-30", "overdue"], ["2026-10-31", "due_today"]]);
  assert.equal(later[0].daysLate, 2);
});

t("nothing is demanded from before the company started", () => {
  const list = build("2026-10-29", "2026-10-25");
  assert.equal(Math.min(...find(list, "d-record").map((i) => Number(i.period.key.slice(8)))), 25);
  assert.ok(find(list, "q-advtax", "2026-27-Q1").length === 0, "the June instalment was before the start");
});

t("last month's work that falls due after the start is demanded, and one that fell due before it is not", () => {
  const list = build("2026-10-17", "2026-10-15");
  assert.equal(find(list, "m-gst", "2026-09").length, 1, "GST for September is due 20 October, after the start");
  assert.equal(find(list, "m-gst", "2026-08").length, 0, "GST for August was due 20 September, before the start");
  assert.equal(find(list, "m-gst", "2026-09")[0].state, "todo");
});

t("work that opens soon is shown as upcoming; work that opens later is not shown", () => {
  const list = build("2026-10-10", "2026-10-01");
  assert.equal(find(list, "m-payroll", "2026-10")[0].state, "upcoming", "payroll opens 7 days before month end");
  assert.equal(find(list, "m-gst", "2026-10").length, 0, "October's GST opens in November");
});

t("a piece of work stays overdue until done or skipped; done and skipped need a log", () => {
  const key = "2026-09";
  const open = find(build("2026-11-03", "2026-09-01"), "m-gst", key)[0];
  assert.equal(open.state, "overdue");
  assert.equal(open.daysLate, 14);
  const done = find(build("2026-11-03", "2026-09-01", all, [{ taskId: "m-gst", periodKey: key, status: "done", steps: [] }]), "m-gst", key)[0];
  assert.equal(done.state, "done");
  const skipped = find(build("2026-11-03", "2026-09-01", all, [{ taskId: "m-gst", periodKey: key, status: "skipped", steps: [], skipReason: "Not registered yet" }]), "m-gst", key)[0];
  assert.equal(skipped.state, "skipped");
  const part = find(build("2026-11-03", "2026-09-01", all, [{ taskId: "m-gst", periodKey: key, status: "open", steps: [true, true, false, true] }]), "m-gst", key)[0];
  assert.deepEqual([part.state, part.stepsDone, part.steps.length], ["overdue", 3, 7]);
});

t("sorting puts overdue first, then due today, then to do; summary counts each", () => {
  const list = sortInstances(build("2026-10-29", "2026-10-01"));
  assert.equal(list[0].state, "overdue");
  const s = summarise(list);
  assert.equal(s.overdue + s.dueToday + s.todo + s.upcoming + s.done + s.skipped, list.length);
  assert.ok(s.overdue > 0 && s.dueToday > 0);
});

t("completing needs every step ticked; skipping needs a real reason", () => {
  assert.equal(canComplete([true, true]), true);
  assert.equal(canComplete([true, false]), false);
  assert.equal(canComplete([]), false);
  assert.ok(skipProblem("no"));
  assert.ok(skipProblem("x".repeat(301)));
  assert.equal(skipProblem("We had no employees this month"), null);
});

t("every period in a long run has exactly one piece of work per task (nothing doubled, nothing dropped)", () => {
  const list = build("2027-06-30", "2026-04-01");
  const seen = new Set<string>();
  for (const i of list) { const k = `${i.task.id}|${i.period.key}`; assert.ok(!seen.has(k), k); seen.add(k); }
  const months = find(list, "m-close").map((i) => i.period.key);
  assert.equal(months.length, 16, "March 2026 (its books close in April, after the start) and April 2026 to June 2027");
  assert.equal(find(list, "q-advtax").length, 5);
  assert.ok(find(list, "y-tax", "2026-27").length === 1, "this year's return");
  assert.ok(find(list, "y-tax", "2025-26").length === 1, "last year's return is still due in October 2026, after the start");
});

console.log("work engine tests passed");
