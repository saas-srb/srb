import "server-only";
import { getDb } from "@/lib/mongodb";
import { updateStamp, notDeleted } from "@/lib/products/sprintos/db";
import { DEFAULT_CURRENCY } from "@/lib/products/sprintos/constants";
import { getProject, PROJECTS_COLLECTION, type Project } from "@/lib/products/sprintos/projects";
import { listProjectMembers } from "@/lib/products/sprintos/project-members";
import { projectLoggedHours } from "@/lib/products/sprintos/timesheets";
import { TASKS_COLLECTION } from "@/lib/products/sprintos/tasks";

/**
 * Cost calculation engine. `pms_project_costing` stores only the editable
 * inputs; every financial figure is derived live from timesheets + members.
 */

export const PROJECT_COSTING_COLLECTION = "pms_project_costing";

export interface ProjectCostingConfig {
  _id: string; // projectId
  /** Total contract value billed to the client. Defaults to the project's estimatedBudget. */
  contractValue: number | null;
  /** Fixed non-labour costs (licenses, infra, travel…). */
  otherCosts: number;
  /** Fallback hourly cost when a member has no `costRate`. */
  defaultCostRate: number;
  /** Fallback hourly billing rate when a member has no `billableRate`. */
  defaultBillRate: number;
  updatedAt: Date;
  updatedBy: string | null;
}

const DEFAULTS: Omit<ProjectCostingConfig, "_id" | "updatedAt" | "updatedBy"> = {
  contractValue: null,
  otherCosts: 0,
  defaultCostRate: 0,
  defaultBillRate: 0,
};

export async function getCostingConfig(projectId: string): Promise<ProjectCostingConfig> {
  const db = await getDb();
  const collection = db.collection<ProjectCostingConfig>(PROJECT_COSTING_COLLECTION);
  const existing = await collection.findOne({ _id: projectId });
  return existing ? { ...DEFAULTS, ...existing } : { _id: projectId, ...DEFAULTS, updatedAt: new Date(), updatedBy: null };
}

export interface CostingConfigInput {
  contractValue: number | null;
  otherCosts: number;
  defaultCostRate: number;
  defaultBillRate: number;
}

export async function updateCostingConfig(
  projectId: string,
  data: CostingConfigInput,
  actorId: string
): Promise<ProjectCostingConfig> {
  const db = await getDb();
  const collection = db.collection<ProjectCostingConfig>(PROJECT_COSTING_COLLECTION);
  const result = await collection.findOneAndUpdate(
    { _id: projectId },
    { $set: { ...data, ...updateStamp(actorId) } },
    { upsert: true, returnDocument: "after" }
  );
  return { ...DEFAULTS, ...(result as ProjectCostingConfig) };
}

// ---------------------------------------------------------------------------
// Financials
// ---------------------------------------------------------------------------

export interface ProjectFinancials {
  projectId: string;
  projectCode: string;
  projectName: string;
  currency: string;

  // Estimated
  contractValue: number;
  estimatedBudget: number;
  estimatedHours: number;
  avgBillRate: number;
  avgCostRate: number;
  estimatedCost: number;

  // Actual
  actualHours: number;
  costedHours: number;
  billableHours: number;
  nonBillableHours: number;
  resourceCost: number;
  otherCosts: number;
  actualCost: number;
  revenue: number;

  // Derived
  profit: number;
  loss: number;
  profitMargin: number; // %
  remainingBudget: number;
  remainingHours: number;
  costVariance: number; // estimated - actual
}

async function sumTaskEstimateHours(projectId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .collection(TASKS_COLLECTION)
    .aggregate<{ _id: null; hours: number }>([
      { $match: { projectId, deletedAt: null, estimateHours: { $ne: null } } },
      { $group: { _id: null, hours: { $sum: "$estimateHours" } } },
    ])
    .toArray();
  return rows[0]?.hours ?? 0;
}

export async function computeProjectFinancials(
  projectId: string,
  range?: { dateFrom?: string; dateTo?: string }
): Promise<ProjectFinancials | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  const [config, members, hours, taskEstimate] = await Promise.all([
    getCostingConfig(projectId),
    listProjectMembers(projectId),
    projectLoggedHours(projectId, range),
    sumTaskEstimateHours(projectId),
  ]);

  const costRateFor = (employeeId: string): number => {
    const m = members.find((x) => x.employeeId === employeeId);
    return m?.costRate ?? config.defaultCostRate;
  };
  const billRateFor = (employeeId: string): number => {
    const m = members.find((x) => x.employeeId === employeeId);
    return m?.billableRate ?? config.defaultBillRate;
  };

  // Per-employee resource cost + revenue from actual logged hours.
  let resourceCost = 0;
  let revenue = 0;
  for (const row of hours.byEmployee) {
    resourceCost += row.hours * costRateFor(row.employeeId);
    revenue += row.billableHours * billRateFor(row.employeeId);
  }

  const activeMembers = members.filter((m) => m.active);
  const rateList = activeMembers.map((m) => m.billableRate ?? config.defaultBillRate).filter((n) => n > 0);
  const costList = activeMembers.map((m) => m.costRate ?? config.defaultCostRate).filter((n) => n > 0);
  const avgBillRate = rateList.length ? rateList.reduce((a, b) => a + b, 0) / rateList.length : config.defaultBillRate;
  const avgCostRate = costList.length ? costList.reduce((a, b) => a + b, 0) / costList.length : config.defaultCostRate;

  const estimatedBudget = project.estimatedBudget ?? 0;
  const contractValue = config.contractValue ?? estimatedBudget;
  const estimatedHours = project.estimatedHours ?? taskEstimate;
  const estimatedCost = round(estimatedHours * avgCostRate);

  const actualCost = round(resourceCost + config.otherCosts);
  const profitRaw = round(contractValue - actualCost);

  return {
    projectId,
    projectCode: project.projectCode,
    projectName: project.name,
    currency: project.currency || DEFAULT_CURRENCY,

    contractValue: round(contractValue),
    estimatedBudget: round(estimatedBudget),
    estimatedHours: round1(estimatedHours),
    avgBillRate: round(avgBillRate),
    avgCostRate: round(avgCostRate),
    estimatedCost,

    actualHours: hours.totalHours,
    costedHours: hours.costedHours,
    billableHours: hours.billableHours,
    nonBillableHours: hours.nonBillableHours,
    resourceCost: round(resourceCost),
    otherCosts: round(config.otherCosts),
    actualCost,
    revenue: round(revenue),

    profit: profitRaw > 0 ? profitRaw : 0,
    loss: profitRaw < 0 ? -profitRaw : 0,
    profitMargin: contractValue > 0 ? round1((profitRaw / contractValue) * 100) : 0,
    remainingBudget: round(contractValue - actualCost),
    remainingHours: round1(estimatedHours - hours.totalHours),
    costVariance: round(estimatedCost - actualCost),
  };
}

export interface PortfolioCosting {
  totalContractValue: number;
  totalEstimatedCost: number;
  totalActualCost: number;
  totalEstimatedHours: number;
  totalActualHours: number;
  totalBillableHours: number;
  totalNonBillableHours: number;
  totalProfit: number;
  totalLoss: number;
  profitMargin: number;
  projects: ProjectFinancials[];
}

export async function getPortfolioCosting(range?: { dateFrom?: string; dateTo?: string }): Promise<PortfolioCosting> {
  const db = await getDb();
  const projectIds = (await db
    .collection<Project>(PROJECTS_COLLECTION)
    .distinct("_id", { ...notDeleted, status: { $ne: "cancelled" } })) as string[];

  const financials = (await Promise.all(projectIds.map((id) => computeProjectFinancials(id, range)))).filter(
    (f): f is ProjectFinancials => f !== null
  );

  const sum = (pick: (f: ProjectFinancials) => number) => financials.reduce((s, f) => s + pick(f), 0);
  const totalContractValue = round(sum((f) => f.contractValue));
  const totalActualCost = round(sum((f) => f.actualCost));
  const netProfit = totalContractValue - totalActualCost;

  return {
    totalContractValue,
    totalEstimatedCost: round(sum((f) => f.estimatedCost)),
    totalActualCost,
    totalEstimatedHours: round1(sum((f) => f.estimatedHours)),
    totalActualHours: round1(sum((f) => f.actualHours)),
    totalBillableHours: round1(sum((f) => f.billableHours)),
    totalNonBillableHours: round1(sum((f) => f.nonBillableHours)),
    totalProfit: round(sum((f) => f.profit)),
    totalLoss: round(sum((f) => f.loss)),
    profitMargin: totalContractValue > 0 ? round1((netProfit / totalContractValue) * 100) : 0,
    projects: financials.sort((a, b) => b.contractValue - a.contractValue),
  };
}

function round(n: number): number {
  return Math.round(n);
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
