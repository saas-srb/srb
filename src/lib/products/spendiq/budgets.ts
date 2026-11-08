import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextSequence,
  formatCode,
  type AuditFields,
} from "@/lib/products/spendiq/db";
import { DEFAULT_CURRENCY, round2, type BudgetLevel, type BudgetPeriod } from "@/lib/products/spendiq/constants";

export const BUDGETS_COLLECTION = "prms_budgets";
const BUDGET_CODE_PREFIX = "BUD";

export interface Budget extends AuditFields {
  _id: string;
  budgetCode: string;
  name: string;
  level: BudgetLevel;
  scopeId: string | null;
  scopeName: string | null;
  period: BudgetPeriod;
  periodStart: Date;
  periodEnd: Date;
  allocatedAmount: number;
  consumedAmount: number;
  currency: string;
  notes: string | null;
}

export interface SerializedBudget extends Omit<Budget, "createdAt" | "updatedAt" | "deletedAt" | "periodStart" | "periodEnd"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  periodStart: string;
  periodEnd: string;
  remaining: number;
  utilisation: number;
}

/** An ISO string for a stored date; empty when an older or differently-shaped record has none (so one odd record cannot break the whole list). */
const iso = (d: Date | undefined | null): string => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : "");

export function serializeBudget(b: Budget): SerializedBudget {
  const allocated = Number(b.allocatedAmount) || 0;
  const consumed = Number(b.consumedAmount) || 0;
  // Only the declared fields, as plain values: a differently-shaped record (for example one with an ObjectId _id or extra fields) must
  // not carry anything a Client Component cannot receive.
  return {
    _id: String(b._id),
    budgetCode: String(b.budgetCode ?? ""),
    name: String(b.name ?? ""),
    level: b.level,
    scopeId: b.scopeId == null ? null : String(b.scopeId),
    scopeName: b.scopeName == null ? null : String(b.scopeName),
    period: b.period,
    allocatedAmount: allocated,
    consumedAmount: consumed,
    currency: String(b.currency ?? DEFAULT_CURRENCY),
    notes: b.notes == null ? null : String(b.notes),
    createdBy: b.createdBy == null ? null : String(b.createdBy),
    updatedBy: b.updatedBy == null ? null : String(b.updatedBy),
    createdAt: iso(b.createdAt),
    updatedAt: iso(b.updatedAt),
    deletedAt: b.deletedAt ? iso(b.deletedAt) || null : null,
    periodStart: iso(b.periodStart).slice(0, 10),
    periodEnd: iso(b.periodEnd).slice(0, 10),
    remaining: round2(allocated - consumed),
    utilisation: allocated > 0 ? Math.round((consumed / allocated) * 100) : 0,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Budget>(BUDGETS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ budgetCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ level: 1 }).catch(() => {}),
      collection.createIndex({ periodStart: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateBudgetCode(): Promise<string> {
  return formatCode(BUDGET_CODE_PREFIX, await nextSequence("budget_code"));
}

export async function getBudget(id: string): Promise<Budget | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface BudgetFilter {
  search?: string;
  level?: BudgetLevel;
  period?: BudgetPeriod;
}

function buildFilter(opts: BudgetFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ budgetCode: rx }, { name: rx }, { scopeName: rx }];
  }
  if (opts.level) filter.level = opts.level;
  if (opts.period) filter.period = opts.period;
  return filter;
}

export async function searchBudgets(
  opts: BudgetFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy || "periodStart";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countBudgets(filter: BudgetFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

export async function budgetTotals(): Promise<{ allocated: number; consumed: number }> {
  const collection = await getCollection();
  const res = await collection
    .aggregate<{ allocated: number; consumed: number }>([
      { $match: { ...notDeleted } },
      { $group: { _id: null, allocated: { $sum: "$allocatedAmount" }, consumed: { $sum: "$consumedAmount" } } },
    ])
    .toArray();
  return { allocated: round2(res[0]?.allocated ?? 0), consumed: round2(res[0]?.consumed ?? 0) };
}

export interface BudgetWriteData {
  name: string;
  level: BudgetLevel;
  scopeId: string | null;
  scopeName: string | null;
  period: BudgetPeriod;
  periodStart: string;
  periodEnd: string;
  allocatedAmount: number;
  currency: string;
  notes: string | null;
}

/** Rolls up spend for a budget's scope + period from expenses and POs. */
export async function computeConsumption(budget: Pick<Budget, "level" | "scopeId" | "periodStart" | "periodEnd">): Promise<number> {
  const db = await getDb();
  const range = { $gte: budget.periodStart, $lte: budget.periodEnd };

  const expenseMatch: Record<string, unknown> = {
    deletedAt: null,
    approvalStatus: { $in: ["approved", "reimbursed"] },
    expenseDate: range,
  };
  const poMatch: Record<string, unknown> = {
    deletedAt: null,
    status: { $in: ["issued", "partially_received", "received", "closed"] },
    createdAt: range,
  };
  if (budget.level === "department" && budget.scopeId) {
    expenseMatch.departmentId = budget.scopeId;
    poMatch.departmentId = budget.scopeId;
  } else if (budget.level === "project" && budget.scopeId) {
    expenseMatch.projectId = budget.scopeId;
    poMatch.projectId = budget.scopeId;
  } else if (budget.level === "category" && budget.scopeId) {
    expenseMatch.category = budget.scopeId;
  }

  const [expAgg, poAgg] = await Promise.all([
    db.collection("prms_expenses").aggregate<{ total: number }>([{ $match: expenseMatch }, { $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
    budget.level === "category"
      ? Promise.resolve([{ total: 0 }])
      : db.collection("prms_purchase_orders").aggregate<{ total: number }>([{ $match: poMatch }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]).toArray(),
  ]);

  return round2((expAgg[0]?.total ?? 0) + (poAgg[0]?.total ?? 0));
}

export async function createBudget(data: BudgetWriteData, actorId: string): Promise<Budget> {
  const collection = await getCollection();
  const periodStart = new Date(`${data.periodStart}T00:00:00`);
  const periodEnd = new Date(`${data.periodEnd}T23:59:59`);
  const consumedAmount = await computeConsumption({ level: data.level, scopeId: data.scopeId, periodStart, periodEnd });
  const doc: Budget = {
    _id: newId(),
    budgetCode: await generateBudgetCode(),
    name: data.name,
    level: data.level,
    scopeId: data.scopeId,
    scopeName: data.scopeName,
    period: data.period,
    periodStart,
    periodEnd,
    allocatedAmount: round2(data.allocatedAmount),
    consumedAmount,
    currency: data.currency || DEFAULT_CURRENCY,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateBudget(id: string, data: BudgetWriteData, actorId: string): Promise<Budget | null> {
  const collection = await getCollection();
  const periodStart = new Date(`${data.periodStart}T00:00:00`);
  const periodEnd = new Date(`${data.periodEnd}T23:59:59`);
  const consumedAmount = await computeConsumption({ level: data.level, scopeId: data.scopeId, periodStart, periodEnd });
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    {
      $set: {
        name: data.name,
        level: data.level,
        scopeId: data.scopeId,
        scopeName: data.scopeName,
        period: data.period,
        periodStart,
        periodEnd,
        allocatedAmount: round2(data.allocatedAmount),
        consumedAmount,
        currency: data.currency || DEFAULT_CURRENCY,
        notes: data.notes,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
}

export async function deleteBudget(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

/** Sweep hook: recompute consumption for every current budget. */
export async function refreshBudgetConsumption(): Promise<number> {
  const collection = await getCollection();
  const now = new Date();
  const budgets = await collection.find({ ...notDeleted, periodEnd: { $gte: now } }).toArray();
  let updated = 0;
  for (const b of budgets) {
    const consumed = await computeConsumption(b);
    if (consumed !== b.consumedAmount) {
      await collection.updateOne({ _id: b._id }, { $set: { consumedAmount: consumed, updatedAt: new Date() } });
      updated += 1;
    }
  }
  return updated;
}
