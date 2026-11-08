import "server-only";
import { loadWork } from "@/lib/products/cashflow-ai/work/store";
import { sortInstances, summarise } from "@/lib/products/cashflow-ai/work/engine";

/** What the Home page shows about "My work": not started, or the overdue count and what is due today. Fail-soft: a read failure gives `null`. */
export interface TodayWorkItem {
  taskId: string;
  periodKey: string;
  title: string;
  periodLabel: string;
  state: "overdue" | "due_today";
  stepsDone: number;
  stepsTotal: number;
}
export type TodayWork =
  | { started: false }
  | { started: true; overdue: number; dueToday: number; items: TodayWorkItem[]; summary: string };

const n = (count: number) => `${count}`;

/** "3 overdue, 2 due today", "1 overdue", "2 due today" or "Nothing due today". */
export function workSummaryText(overdue: number, dueToday: number): string {
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${n(overdue)} overdue`);
  if (dueToday > 0) parts.push(`${n(dueToday)} due today`);
  return parts.length ? parts.join(", ") : "Nothing due today";
}

export async function loadTodayWork(today: string, maxItems = 5): Promise<TodayWork | null> {
  try {
    const { plan, instances } = await loadWork(today);
    if (!plan) return { started: false };
    const sum = summarise(instances);
    const items = sortInstances(instances)
      .filter((i) => i.state === "overdue" || i.state === "due_today")
      .slice(0, maxItems)
      .map((i): TodayWorkItem => ({
        taskId: i.task.id,
        periodKey: i.period.key,
        title: i.task.title,
        periodLabel: i.period.label,
        state: i.state as "overdue" | "due_today",
        stepsDone: i.stepsDone,
        stepsTotal: i.steps.length,
      }));
    return { started: true, overdue: sum.overdue, dueToday: sum.dueToday, items, summary: workSummaryText(sum.overdue, sum.dueToday) };
  } catch {
    return null;
  }
}
