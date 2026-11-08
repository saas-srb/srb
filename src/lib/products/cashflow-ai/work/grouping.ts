/**
 * "My work" page layout, the pure part: which piece of work goes in which section of the page. No DB, no clock.
 *
 * Rules: overdue work of any kind is pulled out first (daily overdue kept apart so a long gap is one line, not a wall of cards); anything
 * due today of any kind sits in Today; the rest of the open work sits in the section of its own frequency; work that has not opened yet is
 * "coming up"; done and skipped work is "finished". Each piece of work appears exactly once.
 */
import type { Frequency } from "@/lib/products/cashflow-ai/work/catalog";
import { periodOf, type Period, type WorkInstance } from "@/lib/products/cashflow-ai/work/engine";

export type WorkView = "today" | "week" | "month" | "quarter" | "year";
export const WORK_VIEWS: { key: WorkView; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
];

const VIEW_OF: Record<Frequency, WorkView> = { daily: "today", weekly: "week", monthly: "month", quarterly: "quarter", yearly: "year" };

export interface WorkGroups {
  /** Daily work not done, oldest first. */
  overdueDaily: WorkInstance[];
  /** Every other overdue piece, most late first. */
  overdueOther: WorkInstance[];
  sections: Record<WorkView, WorkInstance[]>;
  upcoming: WorkInstance[];
  finished: WorkInstance[];
}

const byDue = (a: WorkInstance, b: WorkInstance) => a.due.date.localeCompare(b.due.date) || a.task.id.localeCompare(b.task.id) || a.period.key.localeCompare(b.period.key);

export function groupWork(list: WorkInstance[]): WorkGroups {
  const g: WorkGroups = { overdueDaily: [], overdueOther: [], sections: { today: [], week: [], month: [], quarter: [], year: [] }, upcoming: [], finished: [] };
  for (const i of list) {
    switch (i.state) {
      case "overdue":
        (i.task.frequency === "daily" ? g.overdueDaily : g.overdueOther).push(i);
        break;
      case "due_today":
        g.sections.today.push(i);
        break;
      case "todo":
        g.sections[VIEW_OF[i.task.frequency]].push(i);
        break;
      case "upcoming":
        g.upcoming.push(i);
        break;
      default:
        g.finished.push(i);
    }
  }
  g.overdueDaily.sort((a, b) => a.period.key.localeCompare(b.period.key) || a.task.id.localeCompare(b.task.id));
  g.overdueOther.sort(byDue);
  for (const v of Object.keys(g.sections) as WorkView[]) g.sections[v].sort(byDue);
  g.upcoming.sort(byDue);
  // newest finished first
  g.finished.sort((a, b) => (b.log?.doneAt ?? "").localeCompare(a.log?.doneAt ?? "") || byDue(b, a));
  return g;
}

/** The overdue daily work as days: how many different days, and the oldest and newest of them. */
export function dailyBacklogDays(overdueDaily: WorkInstance[]): { days: number; oldest: string | null; newest: string | null } {
  const keys = [...new Set(overdueDaily.map((i) => i.period.key))].sort();
  return { days: keys.length, oldest: keys[0] ?? null, newest: keys[keys.length - 1] ?? null };
}

/**
 * The period a key names, or null if the key is not a real period of that frequency. A stored tick for a made-up period must never be accepted,
 * so a key is valid only if it is exactly what the engine itself would produce.
 */
export function canonicalPeriod(freq: Frequency, key: string): Period | null {
  let anchor: string | null = null;
  if (freq === "daily" || freq === "weekly") {
    anchor = /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
    if (anchor && new Date(`${anchor}T00:00:00Z`).toISOString().slice(0, 10) !== anchor) anchor = null;
  } else if (freq === "monthly") {
    anchor = /^\d{4}-(0[1-9]|1[0-2])$/.test(key) ? `${key}-01` : null;
  } else if (freq === "quarterly") {
    const m = /^(\d{4})-\d{2}-Q([1-4])$/.exec(key);
    if (m) {
      const y = Number(m[1]);
      const q = Number(m[2]);
      anchor = `${q === 4 ? y + 1 : y}-${String([4, 7, 10, 1][q - 1]).padStart(2, "0")}-01`;
    }
  } else {
    const m = /^(\d{4})-\d{2}$/.exec(key);
    if (m) anchor = `${m[1]}-04-01`;
  }
  if (!anchor) return null;
  const p = periodOf(freq, anchor);
  return p.key === key ? p : null;
}
