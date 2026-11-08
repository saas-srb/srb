import assert from "node:assert/strict";
import { buildInstances, type CompanyFacts, type LogEntry, type Rulebooks, type WorkInstance } from "../src/lib/products/cashflow-ai/work/engine";
import { builtinRulebook, calendarFor } from "../src/lib/products/cashflow-ai/rulebook/rules";
import { canonicalPeriod, dailyBacklogDays, groupWork } from "../src/lib/products/cashflow-ai/work/grouping";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const books: Rulebooks = { forFy: (fy) => { const rb = builtinRulebook(fy); return { calendar: calendarFor(rb), advanceTax: rb.advanceTax }; } };
const all: CompanyFacts = { gstRegistered: true, hasEmployees: true, deductsTds: true, isPrivateLimited: true, hasCashAccounts: true };
const build = (today: string, startDate: string, logs: LogEntry[] = []) => buildInstances({ today, startDate, facts: all, logs, books });
const key = (i: WorkInstance) => `${i.task.id}|${i.period.key}`;

t("every instance lands in exactly one place", () => {
  const list = build("2026-10-29", "2026-09-01");
  const g = groupWork(list);
  const placed = [...g.overdueDaily, ...g.overdueOther, ...Object.values(g.sections).flat(), ...g.upcoming, ...g.finished].map(key);
  assert.equal(placed.length, list.length);
  assert.equal(new Set(placed).size, list.length);
});

t("daily overdue is kept apart, oldest first; other overdue is separate", () => {
  const g = groupWork(build("2026-10-29", "2026-10-01"));
  assert.ok(g.overdueDaily.length > 0);
  assert.ok(g.overdueDaily.every((i) => i.task.frequency === "daily" && i.state === "overdue"));
  assert.ok(g.overdueOther.every((i) => i.task.frequency !== "daily" && i.state === "overdue"));
  const keys = g.overdueDaily.map((i) => i.period.key);
  assert.deepEqual(keys, [...keys].sort());
  const b = dailyBacklogDays(g.overdueDaily);
  assert.equal(b.days, new Set(keys).size);
  assert.equal(b.oldest, keys[0]);
  assert.equal(b.newest, keys[keys.length - 1]);
});

t("sections hold open work by frequency; due-today work of any kind sits in Today", () => {
  const list = build("2026-10-29", "2026-10-01");
  const g = groupWork(list);
  for (const i of g.sections.today) assert.ok(i.state === "due_today" || (i.task.frequency === "daily" && i.state === "todo"));
  for (const i of g.sections.week) assert.ok(i.task.frequency === "weekly" && i.state === "todo");
  for (const i of g.sections.month) assert.ok(i.task.frequency === "monthly" && i.state === "todo");
  for (const i of g.sections.quarter) assert.ok(i.task.frequency === "quarterly" && i.state === "todo");
  for (const i of g.sections.year) assert.ok(i.task.frequency === "yearly" && i.state === "todo");
  for (const i of g.upcoming) assert.equal(i.state, "upcoming");
  // the day's own work is not hidden among the finished
  assert.ok(list.filter((i) => i.state === "due_today").every((i) => g.sections.today.includes(i)));
});

t("done and skipped work is finished, and leaves the open sections", () => {
  const first = build("2026-10-29", "2026-10-01").find((i) => i.state === "overdue" && i.task.frequency === "daily")!;
  const logs: LogEntry[] = [{ taskId: first.task.id, periodKey: first.period.key, status: "done", steps: first.task.steps.map(() => true), doneAt: "2026-10-29T05:00:00.000Z" }];
  const g = groupWork(build("2026-10-29", "2026-10-01", logs));
  assert.equal(g.finished.length, 1);
  assert.equal(g.overdueDaily.some((i) => key(i) === key(first)), false);
});

t("canonicalPeriod accepts exactly the keys the engine makes and refuses made-up ones", () => {
  for (const i of build("2027-02-15", "2026-04-01")) assert.ok(canonicalPeriod(i.task.frequency, i.period.key), key(i));
  assert.equal(canonicalPeriod("daily", "2026-02-30"), null);
  assert.equal(canonicalPeriod("daily", "garbage"), null);
  assert.equal(canonicalPeriod("weekly", "2026-10-28"), null); // a Wednesday
  assert.ok(canonicalPeriod("weekly", "2026-10-26"));
  assert.equal(canonicalPeriod("monthly", "2026-13"), null);
  assert.equal(canonicalPeriod("monthly", "2026-00"), null);
  assert.equal(canonicalPeriod("quarterly", "2026-27-Q5"), null);
  assert.equal(canonicalPeriod("quarterly", "2026-28-Q1"), null);
  assert.equal(canonicalPeriod("yearly", "2026-28"), null);
  assert.ok(canonicalPeriod("yearly", "2026-27"));
  assert.equal(canonicalPeriod("yearly", "2026-27-Q1"), null);
});

console.log("work grouping tests passed");
