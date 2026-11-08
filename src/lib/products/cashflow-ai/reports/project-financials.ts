import "server-only";
import { getDb } from "@/lib/mongodb";
import { round2 } from "@/lib/products/cashflow-ai/constants";
import { getProject } from "@/lib/products/sprintos/projects";

/**
 * Real per-project profitability (§51 Phase 6) — filling the gap
 * `fms/dashboard.ts` has flagged since Phase 1 ("Depends on PMS project-cost
 * integration"). PMS's own `computeProjectFinancials` (`@/lib/products/sprintos/costing`)
 * is a *simulated* figure from timesheets × rates; this is the real
 * counterpart, computed from settled `fms_transactions` that actually
 * carry a `projectId` — never touching PMS's own collections, only its
 * `getProject()` read for the label.
 */

const TRANSACTIONS_COLLECTION = "fms_transactions";
const SETTLED_STATUSES = ["completed", "reconciled"];

interface Doc {
  _id: string;
}

interface TypeTotal {
  _id: { projectId: string; type: "income" | "expense" };
  total: number;
}

async function projectTypeTotals(): Promise<TypeTotal[]> {
  try {
    const db = await getDb();
    return await db
      .collection<Doc>(TRANSACTIONS_COLLECTION)
      .aggregate<TypeTotal>([
        {
          $match: {
            deletedAt: null,
            projectId: { $ne: null },
            status: { $in: SETTLED_STATUSES },
            type: { $in: ["income", "expense"] },
          },
        },
        { $group: { _id: { projectId: "$projectId", type: "$type" }, total: { $sum: "$amount" } } },
      ])
      .toArray();
  } catch {
    return [];
  }
}

export interface ProjectFinancialSummary {
  projectId: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  transactionCount: number;
}

/** Real revenue/expenses/net-profit for one project, from booked transactions only. */
export async function projectFinancialSummary(projectId: string): Promise<ProjectFinancialSummary | null> {
  try {
    const db = await getDb();
    const [totals, transactionCount] = await Promise.all([
      db
        .collection<Doc>(TRANSACTIONS_COLLECTION)
        .aggregate<{ _id: "income" | "expense"; total: number }>([
          { $match: { deletedAt: null, projectId, status: { $in: SETTLED_STATUSES }, type: { $in: ["income", "expense"] } } },
          { $group: { _id: "$type", total: { $sum: "$amount" } } },
        ])
        .toArray(),
      db.collection<Doc>(TRANSACTIONS_COLLECTION).countDocuments({ deletedAt: null, projectId }),
    ]);
    const revenue = round2(totals.find((t) => t._id === "income")?.total ?? 0);
    const expenses = round2(totals.find((t) => t._id === "expense")?.total ?? 0);
    return { projectId, revenue, expenses, netProfit: round2(revenue - expenses), transactionCount };
  } catch {
    return { projectId, revenue: 0, expenses: 0, netProfit: 0, transactionCount: 0 };
  }
}

export interface LabelledValue {
  label: string;
  value: number;
}

async function byProjectTotals(): Promise<Map<string, { income: number; expense: number }>> {
  const rows = await projectTypeTotals();
  const byProject = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const entry = byProject.get(row._id.projectId) ?? { income: 0, expense: 0 };
    if (row._id.type === "income") entry.income += row.total;
    else entry.expense += row.total;
    byProject.set(row._id.projectId, entry);
  }
  return byProject;
}

/** Portfolio-wide net profit per project, real money only — for the FMS dashboard's "Project Profitability" chart. */
export async function projectProfitabilitySummary(limit = 10): Promise<LabelledValue[]> {
  const byProject = await byProjectTotals();
  if (byProject.size === 0) return [];

  const projectIds = Array.from(byProject.keys());
  const projects = await Promise.all(projectIds.map((id) => getProject(id).catch(() => null)));
  const nameById = new Map(projectIds.map((id, i) => [id, projects[i]?.name ?? "Unknown Project"]));

  return Array.from(byProject.entries())
    .map(([projectId, { income, expense }]) => ({ label: nameById.get(projectId) ?? projectId, value: round2(income - expense) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit);
}

export interface ProjectProfitabilityRow {
  projectId: string;
  projectName: string;
  projectCode: string;
  revenue: number;
  expenses: number;
  netProfit: number;
}

/** Full per-project revenue/expenses/net-profit table — for the `/cashflow-ai/reports/project-profitability` page (unlike the dashboard chart, not limited/summarized to net-only). */
export async function projectProfitabilityReport(): Promise<ProjectProfitabilityRow[]> {
  const byProject = await byProjectTotals();
  if (byProject.size === 0) return [];

  const projectIds = Array.from(byProject.keys());
  const projects = await Promise.all(projectIds.map((id) => getProject(id).catch(() => null)));

  return projectIds
    .map((projectId, i) => {
      const { income, expense } = byProject.get(projectId)!;
      const project = projects[i];
      return {
        projectId,
        projectName: project?.name ?? "Unknown Project",
        projectCode: project?.projectCode ?? "—",
        revenue: round2(income),
        expenses: round2(expense),
        netProfit: round2(income - expense),
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit);
}
