/**
 * "My work", the pure part: from the catalog, the company's facts, the day it started and what has been ticked, which pieces of work exist today,
 * when each opens and falls due, and what state each is in. No DB, no clock (today is passed in).
 *
 * The rule that makes nothing get missed: a piece of work never goes away on its own. Every period since the company started has its own
 * piece of work, and it stays open — and turns "overdue" — until it is done or skipped with a reason.
 */
import { WORK_TASKS, type Frequency, type Need, type WorkTask } from "@/lib/products/cashflow-ai/work/catalog";
import type { CalendarItem } from "@/lib/products/cashflow-ai/rulebook/rules";
import type { Instalment } from "@/lib/products/cashflow-ai/income-tax/core";

export interface CompanyFacts {
  gstRegistered: boolean | null;
  hasEmployees: boolean | null;
  deductsTds: boolean | null;
  isPrivateLimited: boolean | null;
  hasCashAccounts: boolean;
}

/** A need is met only by a yes. A company that has not answered a question sees the work that does not depend on it, and is asked the question. */
export function needMet(need: Need, f: CompanyFacts): boolean {
  switch (need) {
    case "gst": return f.gstRegistered === true;
    case "employees": return f.hasEmployees === true;
    case "tds": return f.deductsTds === true;
    case "company": return f.isPrivateLimited !== false;
    case "cash": return f.hasCashAccounts;
  }
}
export const appliesTo = (t: WorkTask, f: CompanyFacts) => (t.needs ?? []).every((n) => needMet(n, f));

// ───────────────────────────── dates and periods ─────────────────────────────

const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fmt(ms(d) + n * DAY);
const mondayOf = (d: string) => addDays(d, -((new Date(ms(d)).getUTCDay() + 6) % 7));
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

export function financialYearOf(d: string): string {
  const y = Number(d.slice(0, 4));
  const start = Number(d.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${pad((start + 1) % 100)}`;
}
const fyStartYear = (fy: string) => Number(fy.slice(0, 4));

export interface Period {
  key: string;
  label: string;
  start: string;
  end: string;
  /** The financial year the period falls in (for finding the rulebook). */
  fy: string;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;

export function periodOf(freq: Frequency, anchor: string): Period {
  if (freq === "daily") return { key: anchor, label: `${nice(anchor)} ${anchor.slice(0, 4)}`, start: anchor, end: anchor, fy: financialYearOf(anchor) };
  if (freq === "weekly") {
    const start = mondayOf(anchor);
    const end = addDays(start, 6);
    return { key: start, label: `Week of ${nice(start)}`, start, end, fy: financialYearOf(start) };
  }
  if (freq === "monthly") {
    const y = Number(anchor.slice(0, 4));
    const m = Number(anchor.slice(5, 7));
    return { key: `${y}-${pad(m)}`, label: `${MON[m - 1]} ${y}`, start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDayOf(y, m))}`, fy: financialYearOf(anchor) };
  }
  if (freq === "quarterly") {
    const fy = financialYearOf(anchor);
    const y0 = fyStartYear(fy);
    const m = Number(anchor.slice(5, 7));
    const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
    const startMonth = [4, 7, 10, 1][q - 1];
    const sy = q === 4 ? y0 + 1 : y0;
    const endMonth = startMonth + 2;
    return { key: `${fy}-Q${q}`, label: `Quarter ${q} of FY ${fy}`, start: `${sy}-${pad(startMonth)}-01`, end: `${sy}-${pad(endMonth)}-${pad(lastDayOf(sy, endMonth))}`, fy };
  }
  const fy = financialYearOf(anchor);
  const y0 = fyStartYear(fy);
  return { key: fy, label: `FY ${fy}`, start: `${y0}-04-01`, end: `${y0 + 1}-03-31`, fy };
}

/** The period that follows the one given. */
export function nextPeriod(freq: Frequency, p: Period): Period {
  return periodOf(freq, addDays(p.end, 1));
}

// ───────────────────────────── due dates ─────────────────────────────

export interface Rulebooks {
  /** The calendar of dated items for a financial year and its advance-tax instalments. */
  forFy(fy: string): { calendar: CalendarItem[]; advanceTax: Instalment[] };
}

export interface Due {
  date: string;
  /** "rulebook" = the law's date as published; "suggested" = our own working deadline. */
  source: "rulebook" | "suggested";
}

const monthLabel = (key: string) => `${MON[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

export function dueFor(task: WorkTask, p: Period, books: Rulebooks): Due {
  if (task.dueRule) {
    const { calendar, advanceTax } = books.forFy(p.fy);
    if (task.dueRule === "advance-tax") {
      const q = Number(p.key.slice(-1));
      const inst = advanceTax[q - 1];
      if (inst) return { date: inst.dueDate, source: "rulebook" };
    } else if (task.frequency === "monthly") {
      const hit = calendar.find((c) => c.ruleId === task.dueRule && c.period === monthLabel(p.key));
      if (hit) return { date: hit.dueDate, source: "rulebook" };
    } else if (task.frequency === "quarterly") {
      const items = calendar.filter((c) => c.ruleId === task.dueRule);
      const q = Number(p.key.slice(-1));
      const hit = items.length === 4 ? items[q - 1] : items.find((c) => c.period === `Q${q}`);
      if (hit) return { date: hit.dueDate, source: "rulebook" };
    } else if (task.frequency === "yearly") {
      const hit = calendar.find((c) => c.ruleId === task.dueRule);
      if (hit) return { date: hit.dueDate, source: "rulebook" };
    }
    // the rulebook has no such date: fall back to our own working deadline rather than showing no deadline
  }
  return { date: addDays(p.end, task.dueOffset ?? 7), source: "suggested" };
}

// ───────────────────────────── instances ─────────────────────────────

export interface LogEntry {
  taskId: string;
  periodKey: string;
  status: "open" | "done" | "skipped";
  /** One flag per step, in catalog order. */
  steps: boolean[];
  skipReason?: string | null;
  doneAt?: string | null;
}

export type WorkState = "upcoming" | "todo" | "due_today" | "overdue" | "done" | "skipped";

export interface WorkInstance {
  task: WorkTask;
  period: Period;
  availableFrom: string;
  due: Due;
  state: WorkState;
  steps: boolean[];
  stepsDone: number;
  /** Days past the due date when overdue. */
  daysLate: number;
  log: LogEntry | null;
}

export interface BuildInput {
  today: string;
  /** The day the company switched its work plan on: nothing earlier is demanded. */
  startDate: string;
  facts: CompanyFacts;
  logs: LogEntry[];
  books: Rulebooks;
  /** Show work that opens within this many days ahead as "upcoming". */
  lookaheadDays?: number;
  /** How far back to look for daily work. */
  maxDailyBackDays?: number;
}

export const logKey = (taskId: string, periodKey: string) => `${taskId}|${periodKey}`;

export function stateOf(args: { today: string; availableFrom: string; due: string; log: LogEntry | null }): WorkState {
  const { today, availableFrom, due, log } = args;
  if (log?.status === "done") return "done";
  if (log?.status === "skipped") return "skipped";
  if (availableFrom > today) return "upcoming";
  if (due < today) return "overdue";
  return due === today ? "due_today" : "todo";
}

export function buildInstances(input: BuildInput): WorkInstance[] {
  const look = input.lookaheadDays ?? 14;
  const logs = new Map(input.logs.map((l) => [logKey(l.taskId, l.periodKey), l]));
  const out: WorkInstance[] = [];
  const horizonFor = (f: Frequency) => (f === "daily" || f === "weekly" ? input.today : addDays(input.today, look));

  for (const task of WORK_TASKS) {
    if (!appliesTo(task, input.facts)) continue;
    // today's and this week's work is shown when it opens; only the longer rounds are announced ahead of time
    const horizon = horizonFor(task.frequency);
    let p: Period;
    if (task.frequency === "daily") {
      const from = addDays(input.today, -(input.maxDailyBackDays ?? 3650));
      p = periodOf("daily", from < input.startDate ? input.startDate : from);
    } else {
      // from the period BEFORE the one the company started in: its work (GST for last month) can still fall due after the start
      p = periodOf(task.frequency, addDays(periodOf(task.frequency, input.startDate).start, -1));
    }
    for (let guard = 0; guard < 2000 && p.start <= horizon; guard++, p = nextPeriod(task.frequency, p)) {
      const due = dueFor(task, p, input.books);
      const availableFrom = task.availableBeforeDue !== undefined && task.dueRule ? addDays(due.date, -task.availableBeforeDue) : addDays(p.end, task.availableOffset);
      if (availableFrom > horizon) continue;
      // not demanded: both the period and its due date are before the company started
      if (p.end < input.startDate && due.date < input.startDate) continue;
      const log = logs.get(logKey(task.id, p.key)) ?? null;
      const state = stateOf({ today: input.today, availableFrom, due: due.date, log });
      const steps = task.steps.map((_, i) => log?.steps?.[i] === true);
      out.push({
        task,
        period: p,
        availableFrom,
        due,
        state,
        steps,
        stepsDone: steps.filter(Boolean).length,
        daysLate: state === "overdue" ? Math.round((ms(input.today) - ms(due.date)) / DAY) : 0,
        log,
      });
    }
  }
  return out;
}

const RANK: Record<WorkState, number> = { overdue: 0, due_today: 1, todo: 2, upcoming: 3, done: 4, skipped: 5 };
export function sortInstances(list: WorkInstance[]): WorkInstance[] {
  return [...list].sort((a, b) => RANK[a.state] - RANK[b.state] || a.due.date.localeCompare(b.due.date) || a.task.id.localeCompare(b.task.id));
}

export interface Summary {
  overdue: number;
  dueToday: number;
  todo: number;
  upcoming: number;
  done: number;
  skipped: number;
}
export function summarise(list: WorkInstance[]): Summary {
  const s: Summary = { overdue: 0, dueToday: 0, todo: 0, upcoming: 0, done: 0, skipped: 0 };
  for (const i of list) {
    if (i.state === "overdue") s.overdue++;
    else if (i.state === "due_today") s.dueToday++;
    else if (i.state === "todo") s.todo++;
    else if (i.state === "upcoming") s.upcoming++;
    else if (i.state === "done") s.done++;
    else s.skipped++;
  }
  return s;
}

/** Rules for ticking: a piece of work can be marked done only when every step is ticked; skipping needs a reason. */
export function canComplete(steps: boolean[]): boolean {
  return steps.length > 0 && steps.every(Boolean);
}
export function skipProblem(reason: string): string | null {
  const r = reason.trim();
  if (r.length < 5) return "Say why this is being skipped (at least a few words).";
  if (r.length > 300) return "Keep the reason under 300 characters.";
  return null;
}
