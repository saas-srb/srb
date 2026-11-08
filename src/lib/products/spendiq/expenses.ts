import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { notify } from "@/lib/products/spendiq/notifications";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextSequence,
  formatCode,
  type AuditFields,
} from "@/lib/products/spendiq/db";
import {
  DEFAULT_EXPENSE_STATUS,
  DEFAULT_CURRENCY,
  DEFAULT_GST_RATE,
  round2,
  recurrenceMonths,
  type ExpenseStatus,
  type RecurrenceInterval,
} from "@/lib/products/spendiq/constants";

export const EXPENSES_COLLECTION = "prms_expenses";
const EXPENSE_CODE_PREFIX = "EXP";

export interface ExpenseRecurrence {
  interval: RecurrenceInterval;
  nextRunDate: string; // yyyy-mm-dd
  active: boolean;
}

export interface Expense extends AuditFields {
  _id: string;
  expenseCode: string;
  category: string;
  subcategory: string | null;
  vendorId: string | null;
  vendorName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  currency: string;
  paymentMethod: string;
  invoiceNumber: string | null;
  invoiceStorageKey: string | null;
  invoiceFilename: string | null;
  expenseDate: Date;
  description: string | null;
  expenseType: "one_time" | "recurring";
  recurrence: ExpenseRecurrence | null;
  /** Set on instances generated from a recurring template. */
  parentExpenseId: string | null;
  approvalStatus: ExpenseStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  raisedByUserId: string;
  raisedByName: string;
}

export interface SerializedExpense
  extends Omit<Expense, "createdAt" | "updatedAt" | "deletedAt" | "expenseDate" | "approvedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  expenseDate: string;
  approvedAt: string | null;
}

export function serializeExpense(e: Expense): SerializedExpense {
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    deletedAt: e.deletedAt ? e.deletedAt.toISOString() : null,
    expenseDate: e.expenseDate.toISOString().slice(0, 10),
    approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Expense>(EXPENSES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ expenseCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ category: 1 }).catch(() => {}),
      collection.createIndex({ approvalStatus: 1 }).catch(() => {}),
      collection.createIndex({ expenseType: 1 }).catch(() => {}),
      collection.createIndex({ vendorId: 1 }).catch(() => {}),
      collection.createIndex({ departmentId: 1 }).catch(() => {}),
      collection.createIndex({ expenseDate: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateExpenseCode(): Promise<string> {
  return formatCode(EXPENSE_CODE_PREFIX, await nextSequence("expense_code"));
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export async function getExpense(id: string): Promise<Expense | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface ExpenseFilter {
  search?: string;
  category?: string;
  approvalStatus?: ExpenseStatus;
  expenseType?: "one_time" | "recurring";
  vendorId?: string;
  departmentId?: string;
  raisedByUserId?: string;
  /**
   * True to match only out-of-pocket personal claims (`vendorId` unset) —
   * every expense has a `raisedByUserId` (mandatory, even for staff-logged
   * vendor costs), so that field alone can't distinguish "this needs
   * reimbursing to a person" from "this was paid to a vendor."
   */
  personalClaimOnly?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

function buildFilter(opts: ExpenseFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ expenseCode: rx }, { description: rx }, { vendorName: rx }, { invoiceNumber: rx }];
  }
  if (opts.category) filter.category = opts.category;
  if (opts.approvalStatus) filter.approvalStatus = opts.approvalStatus;
  if (opts.expenseType) filter.expenseType = opts.expenseType;
  if (opts.vendorId) filter.vendorId = opts.vendorId;
  if (opts.departmentId) filter.departmentId = opts.departmentId;
  if (opts.raisedByUserId) filter.raisedByUserId = opts.raisedByUserId;
  if (opts.personalClaimOnly) filter.vendorId = null;
  if (opts.dateFrom || opts.dateTo) {
    const r: Record<string, Date> = {};
    if (opts.dateFrom) r.$gte = opts.dateFrom;
    if (opts.dateTo) r.$lte = opts.dateTo;
    filter.expenseDate = r;
  }
  return filter;
}

export async function searchExpenses(
  opts: ExpenseFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy || "expenseDate";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countExpenses(filter: ExpenseFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

export async function sumExpenses(filter: ExpenseFilter = {}): Promise<number> {
  const collection = await getCollection();
  const res = await collection
    .aggregate<{ total: number }>([
      { $match: buildFilter(filter) },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray();
  return res[0]?.total ?? 0;
}

export async function exportExpenses(opts: ExpenseFilter & { ids?: string[] } = {}): Promise<Expense[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ expenseDate: -1 }).limit(5000).toArray();
}

export interface ExpenseWriteData {
  category: string;
  subcategory: string | null;
  vendorId: string | null;
  vendorName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  gstRate: number;
  currency: string;
  paymentMethod: string;
  invoiceNumber: string | null;
  invoiceStorageKey?: string | null;
  invoiceFilename?: string | null;
  expenseDate: string;
  description: string | null;
  expenseType: "one_time" | "recurring";
  recurrenceInterval?: RecurrenceInterval | null;
}

function computeTotals(amount: number, gstRate: number) {
  const gstAmount = round2(amount * (gstRate / 100));
  return { amount: round2(amount), gstRate, gstAmount, totalAmount: round2(amount + gstAmount) };
}

export async function createExpense(
  data: ExpenseWriteData,
  raisedBy: { userId: string; name: string },
  actorId: string,
  autoApprove = false
): Promise<Expense> {
  const collection = await getCollection();
  const totals = computeTotals(data.amount, Number.isFinite(data.gstRate) ? data.gstRate : DEFAULT_GST_RATE);
  const recurrence: ExpenseRecurrence | null =
    data.expenseType === "recurring" && data.recurrenceInterval
      ? { interval: data.recurrenceInterval, nextRunDate: addMonths(data.expenseDate, recurrenceMonths(data.recurrenceInterval)), active: true }
      : null;

  const doc: Expense = {
    _id: newId(),
    expenseCode: await generateExpenseCode(),
    category: data.category,
    subcategory: data.subcategory,
    vendorId: data.vendorId,
    vendorName: data.vendorName,
    departmentId: data.departmentId,
    departmentName: data.departmentName,
    projectId: data.projectId,
    projectName: data.projectName,
    ...totals,
    currency: data.currency || DEFAULT_CURRENCY,
    paymentMethod: data.paymentMethod,
    invoiceNumber: data.invoiceNumber,
    invoiceStorageKey: data.invoiceStorageKey ?? null,
    invoiceFilename: data.invoiceFilename ?? null,
    expenseDate: new Date(`${data.expenseDate}T00:00:00`),
    description: data.description,
    expenseType: data.expenseType,
    recurrence,
    parentExpenseId: null,
    approvalStatus: autoApprove ? "approved" : DEFAULT_EXPENSE_STATUS,
    approvedBy: autoApprove ? actorId : null,
    approvedAt: autoApprove ? new Date() : null,
    rejectionReason: null,
    raisedByUserId: raisedBy.userId,
    raisedByName: raisedBy.name,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateExpense(
  id: string,
  data: ExpenseWriteData,
  actorId: string
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Expense not found." };
  if (existing.approvalStatus !== "pending") return { ok: false, reason: "Only pending expenses can be edited." };
  const totals = computeTotals(data.amount, Number.isFinite(data.gstRate) ? data.gstRate : DEFAULT_GST_RATE);
  const recurrence: ExpenseRecurrence | null =
    data.expenseType === "recurring" && data.recurrenceInterval
      ? {
          interval: data.recurrenceInterval,
          nextRunDate: existing.recurrence?.nextRunDate ?? addMonths(data.expenseDate, recurrenceMonths(data.recurrenceInterval)),
          active: existing.recurrence?.active ?? true,
        }
      : null;
  await collection.updateOne(
    { _id: id, ...notDeleted },
    {
      $set: {
        category: data.category,
        subcategory: data.subcategory,
        vendorId: data.vendorId,
        vendorName: data.vendorName,
        departmentId: data.departmentId,
        departmentName: data.departmentName,
        projectId: data.projectId,
        projectName: data.projectName,
        ...totals,
        currency: data.currency || DEFAULT_CURRENCY,
        paymentMethod: data.paymentMethod,
        invoiceNumber: data.invoiceNumber,
        ...(data.invoiceStorageKey !== undefined ? { invoiceStorageKey: data.invoiceStorageKey, invoiceFilename: data.invoiceFilename ?? null } : {}),
        expenseDate: new Date(`${data.expenseDate}T00:00:00`),
        description: data.description,
        expenseType: data.expenseType,
        recurrence,
        ...updateStamp(actorId),
      },
    }
  );
  return { ok: true };
}

export async function decideExpense(
  id: string,
  approve: boolean,
  note: string | null,
  actorId: string
): Promise<{ ok: boolean; reason?: string; expense?: Expense | null }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Expense not found." };
  if (existing.approvalStatus !== "pending") return { ok: false, reason: "This expense is not pending." };
  const expense = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    {
      $set: {
        approvalStatus: approve ? "approved" : "rejected",
        approvedBy: actorId,
        approvedAt: new Date(),
        rejectionReason: approve ? null : note?.trim() || null,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
  // The person who raised it is told here, in the one place every route to a decision goes through (the product, the Workspace manage page,
  // its bulk action, the AI agent): a decision made anywhere reaches them.
  if (expense) {
    await notify({
      recipientUserId: expense.raisedByUserId,
      audience: "employee",
      type: approve ? "expense_approved" : "expense_rejected",
      title: `Expense ${expense.expenseCode} ${approve ? "approved" : "rejected"}`,
      body: approve ? null : note?.trim() || null,
      link: `/spendiq/me/expenses/${id}`,
    });
  }
  return { ok: true, expense };
}

export async function markExpenseReimbursed(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Expense not found." };
  if (existing.approvalStatus !== "approved") return { ok: false, reason: "Only approved expenses can be reimbursed." };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { approvalStatus: "reimbursed", ...updateStamp(actorId) } });
  await notify({
    recipientUserId: existing.raisedByUserId,
    audience: "employee",
    type: "expense_reimbursed",
    title: `Expense ${existing.expenseCode} reimbursed`,
    body: "The amount has been paid out to you.",
    link: `/spendiq/me/expenses/${id}`,
  });
  return { ok: true };
}

export async function setRecurringActive(id: string, active: boolean, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted, "recurrence.interval": { $exists: true } },
    { $set: { "recurrence.active": active, ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}

export async function deleteExpense(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Expense not found." };
  if (existing.approvalStatus === "reimbursed") return { ok: false, reason: "Reimbursed expenses cannot be deleted." };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}

/**
 * Sweep hook: for every active recurring expense whose `nextRunDate` is due,
 * clone it as a fresh pending expense and advance the schedule. Returns the
 * number of instances generated.
 */
export async function generateDueRecurringExpenses(): Promise<number> {
  const collection = await getCollection();
  const today = new Date().toISOString().slice(0, 10);
  const templates = await collection
    .find({ ...notDeleted, expenseType: "recurring", "recurrence.active": true, "recurrence.nextRunDate": { $lte: today } })
    .limit(200)
    .toArray();

  let generated = 0;
  for (const t of templates) {
    if (!t.recurrence) continue;
    const totals = computeTotals(t.amount, t.gstRate);
    const instance: Expense = {
      ...t,
      _id: newId(),
      expenseCode: await generateExpenseCode(),
      ...totals,
      expenseDate: new Date(`${t.recurrence.nextRunDate}T00:00:00`),
      expenseType: "one_time",
      recurrence: null,
      parentExpenseId: t._id,
      approvalStatus: "pending",
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      ...createStamp(null),
    };
    await collection.insertOne(instance);
    await collection.updateOne(
      { _id: t._id },
      { $set: { "recurrence.nextRunDate": addMonthsSafe(t.recurrence.nextRunDate, recurrenceMonths(t.recurrence.interval)) } }
    );
    generated += 1;
  }
  return generated;
}

function addMonthsSafe(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
