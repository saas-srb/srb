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
import {
  DEFAULT_REQUISITION_STATUS,
  DEFAULT_PRIORITY,
  DEFAULT_CURRENCY,
  DEFAULT_UOM,
  PENDING_REQUISITION_STATUSES,
  type RequisitionStatus,
  type Priority,
} from "@/lib/products/spendiq/constants";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import type { PrmsRole } from "@/lib/prms-roles";
import { isPrmsAdmin } from "@/lib/prms-roles";
import type { RoleContext } from "@/lib/permission-overrides";

export const REQUISITIONS_COLLECTION = "prms_requisitions";
const REQUISITION_CODE_PREFIX = "PR";

export interface RequisitionAttachment {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

export interface RequisitionRequester {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string | null;
}

export interface ApprovalStep {
  level: number;
  /** The status the requisition sits in while this level is pending. */
  status: RequisitionStatus;
  role: PrmsRole;
  label: string;
  decision: "pending" | "approved" | "rejected";
  approverId: string | null;
  approverEmail: string | null;
  note: string | null;
  decidedAt: Date | null;
}

export interface Requisition extends AuditFields {
  _id: string;
  prCode: string;
  departmentId: string;
  departmentName: string | null;
  projectId: string | null;
  projectName: string | null;
  requestedBy: RequisitionRequester;
  category: string;
  subcategory: string | null;
  itemName: string;
  quantity: number;
  uom: string;
  estimatedCost: number;
  currency: string;
  requiredDate: string | null; // ISO yyyy-mm-dd
  priority: Priority;
  justification: string | null;
  attachments: RequisitionAttachment[];
  preferredVendorId: string | null;
  status: RequisitionStatus;
  /** 0 = not yet in an approval level. */
  currentLevel: number;
  approvals: ApprovalStep[];
  rejectionReason: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
}

export interface SerializedRequisition
  extends Omit<Requisition, "createdAt" | "updatedAt" | "deletedAt" | "submittedAt" | "approvedAt" | "attachments" | "approvals"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  attachments: (Omit<RequisitionAttachment, "uploadedAt"> & { uploadedAt: string })[];
  approvals: (Omit<ApprovalStep, "decidedAt"> & { decidedAt: string | null })[];
}

export function serializeRequisition(r: Requisition): SerializedRequisition {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    attachments: r.attachments.map((a) => ({ ...a, uploadedAt: a.uploadedAt.toISOString() })),
    approvals: r.approvals.map((a) => ({ ...a, decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null })),
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Requisition>(REQUISITIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ prCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ departmentId: 1 }).catch(() => {}),
      collection.createIndex({ "requestedBy.userId": 1 }).catch(() => {}),
      collection.createIndex({ priority: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateRequisitionCode(): Promise<string> {
  const seq = await nextSequence("requisition_code");
  return formatCode(REQUISITION_CODE_PREFIX, seq);
}

// ---------------------------------------------------------------------------
// Approval chain
// ---------------------------------------------------------------------------

/** Builds the pending approval chain for a requisition given its cost. */
function buildApprovalChain(estimatedCost: number, threshold: number): ApprovalStep[] {
  const chain: ApprovalStep[] = [
    {
      level: 1,
      status: "manager_approval",
      role: "dept_manager",
      label: "Department Manager",
      decision: "pending",
      approverId: null,
      approverEmail: null,
      note: null,
      decidedAt: null,
    },
  ];
  if (estimatedCost >= threshold) {
    chain.push({
      level: 2,
      status: "procurement_review",
      role: "procurement_manager",
      label: "Procurement Review",
      decision: "pending",
      approverId: null,
      approverEmail: null,
      note: null,
      decidedAt: null,
    });
  }
  return chain;
}

/** Can this role act on the given approval level? Admins can act on any level. */
export function canDecideLevel(user: RoleContext, level: number): boolean {
  if (isPrmsAdmin(user)) return true;
  if (level === 1) return user.roles.includes("dept_manager") || user.roles.includes("procurement_manager");
  if (level === 2) return user.roles.includes("procurement_manager");
  return false;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getRequisition(id: string): Promise<Requisition | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface RequisitionFilter {
  search?: string;
  departmentId?: string;
  projectId?: string;
  status?: RequisitionStatus;
  priority?: Priority;
  category?: string;
  /** Restrict to requisitions raised by this user (portal "my requests"). */
  requesterUserId?: string;
  /** Only requisitions awaiting a decision. */
  pendingOnly?: boolean;
}

function buildFilter(opts: RequisitionFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ prCode: rx }, { itemName: rx }, { "requestedBy.name": rx }, { justification: rx }];
  }
  if (opts.departmentId) filter.departmentId = opts.departmentId;
  if (opts.projectId) filter.projectId = opts.projectId;
  if (opts.status) filter.status = opts.status;
  if (opts.priority) filter.priority = opts.priority;
  if (opts.category) filter.category = opts.category;
  if (opts.requesterUserId) filter["requestedBy.userId"] = opts.requesterUserId;
  if (opts.pendingOnly) filter.status = { $in: PENDING_REQUISITION_STATUSES };
  return filter;
}

export interface SearchRequisitionsOptions extends RequisitionFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "prCode" | "estimatedCost" | "requiredDate" | "priority" | "status";
  sortDir?: "asc" | "desc";
}

export async function searchRequisitions(opts: SearchRequisitionsOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);

  const sortField =
    opts.sortBy === "prCode"
      ? "prCode"
      : opts.sortBy === "estimatedCost"
        ? "estimatedCost"
        : opts.sortBy === "requiredDate"
          ? "requiredDate"
          : opts.sortBy === "priority"
            ? "priority"
            : opts.sortBy === "status"
              ? "status"
              : "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countRequisitions(filter: RequisitionFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportRequisitions(opts: RequisitionFilter & { ids?: string[] } = {}): Promise<Requisition[]> {
  const collection = await getCollection();
  const filter =
    opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

/** Total estimated value of requisitions currently awaiting a decision. */
export async function pendingRequisitionValue(): Promise<number> {
  const collection = await getCollection();
  const res = await collection
    .aggregate<{ total: number }>([
      { $match: { deletedAt: null, status: { $in: PENDING_REQUISITION_STATUSES } } },
      { $group: { _id: null, total: { $sum: "$estimatedCost" } } },
    ])
    .toArray();
  return res[0]?.total ?? 0;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface RequisitionWriteData {
  departmentId: string;
  departmentName: string | null;
  projectId: string | null;
  projectName: string | null;
  category: string;
  subcategory: string | null;
  itemName: string;
  quantity: number;
  uom: string;
  estimatedCost: number;
  currency: string;
  requiredDate: string | null;
  priority: Priority;
  justification: string | null;
  preferredVendorId: string | null;
}

export async function createRequisition(
  data: RequisitionWriteData,
  requester: RequisitionRequester,
  actorId: string
): Promise<Requisition> {
  const collection = await getCollection();
  const doc: Requisition = {
    _id: newId(),
    prCode: await generateRequisitionCode(),
    departmentId: data.departmentId,
    departmentName: data.departmentName,
    projectId: data.projectId,
    projectName: data.projectName,
    requestedBy: requester,
    category: data.category,
    subcategory: data.subcategory,
    itemName: data.itemName,
    quantity: data.quantity,
    uom: data.uom || DEFAULT_UOM,
    estimatedCost: data.estimatedCost,
    currency: data.currency || DEFAULT_CURRENCY,
    requiredDate: data.requiredDate,
    priority: data.priority ?? DEFAULT_PRIORITY,
    justification: data.justification,
    attachments: [],
    preferredVendorId: data.preferredVendorId,
    status: DEFAULT_REQUISITION_STATUS,
    currentLevel: 0,
    approvals: [],
    rejectionReason: null,
    submittedAt: null,
    approvedAt: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

/** Edits are only allowed while the requisition is still a draft. */
export async function updateRequisition(
  id: string,
  data: Partial<RequisitionWriteData>,
  actorId: string
): Promise<{ ok: boolean; reason?: string; doc?: Requisition | null }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Requisition not found." };
  if (existing.status !== "draft") return { ok: false, reason: "Only draft requisitions can be edited." };
  const doc = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  return { ok: true, doc };
}

export async function addRequisitionAttachment(
  id: string,
  attachment: Omit<RequisitionAttachment, "uploadedAt">,
  actorId: string
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    { _id: id, ...notDeleted },
    {
      $push: { attachments: { ...attachment, uploadedAt: new Date() } },
      $set: updateStamp(actorId),
    }
  );
}

export async function removeRequisitionAttachment(id: string, storageKey: string, actorId: string): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    { _id: id, ...notDeleted },
    { $pull: { attachments: { storageKey } }, $set: updateStamp(actorId) }
  );
}

/** Draft → submitted, then straight into the first approval level. */
export async function submitRequisition(
  id: string,
  actorId: string
): Promise<{ ok: boolean; reason?: string; doc?: Requisition | null }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Requisition not found." };
  if (existing.status !== "draft") return { ok: false, reason: "Requisition is not a draft." };

  const settings = await getPrmsSettings();
  const chain = buildApprovalChain(existing.estimatedCost, settings.procurementReviewThreshold);
  const now = new Date();

  const doc = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted, status: "draft" },
    {
      $set: {
        status: chain[0].status,
        currentLevel: 1,
        approvals: chain,
        submittedAt: now,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
  return { ok: true, doc };
}

export interface DecisionResult {
  ok: boolean;
  reason?: string;
  doc?: Requisition | null;
  /** True when this decision moved the requisition to `approved`. */
  fullyApproved?: boolean;
  /** True when this decision rejected the requisition. */
  rejected?: boolean;
}

/**
 * Records an approve / reject decision on the requisition's *current* pending
 * level. Advancing past the last level sets `approved`.
 */
export async function decideRequisition(
  id: string,
  approve: boolean,
  note: string | null,
  actor: { id: string; email: string; roles: readonly PrmsRole[]; permissionOverrides?: Record<string, boolean> }
): Promise<DecisionResult> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Requisition not found." };
  if (!PENDING_REQUISITION_STATUSES.includes(existing.status)) {
    return { ok: false, reason: "This requisition is not awaiting approval." };
  }

  const level = existing.currentLevel;
  const stepIdx = existing.approvals.findIndex((a) => a.level === level && a.decision === "pending");
  if (stepIdx === -1) return { ok: false, reason: "No pending approval step found." };
  if (!canDecideLevel(actor, level)) {
    return { ok: false, reason: "You are not authorised to decide this approval level." };
  }
  if (existing.requestedBy.userId === actor.id && !isPrmsAdmin(actor)) {
    return { ok: false, reason: "You cannot approve your own requisition." };
  }

  const now = new Date();
  const approvals = existing.approvals.map((a, i) =>
    i === stepIdx
      ? {
          ...a,
          decision: approve ? ("approved" as const) : ("rejected" as const),
          approverId: actor.id,
          approverEmail: actor.email,
          note: note?.trim() || null,
          decidedAt: now,
        }
      : a
  );

  if (!approve) {
    const doc = await collection.findOneAndUpdate(
      { _id: id, ...notDeleted },
      {
        $set: {
          status: "rejected",
          approvals,
          rejectionReason: note?.trim() || null,
          ...updateStamp(actor.id),
        },
      },
      { returnDocument: "after" }
    );
    return { ok: true, doc, rejected: true };
  }

  const nextStep = approvals.find((a) => a.level > level && a.decision === "pending");
  if (nextStep) {
    const doc = await collection.findOneAndUpdate(
      { _id: id, ...notDeleted },
      { $set: { status: nextStep.status, currentLevel: nextStep.level, approvals, ...updateStamp(actor.id) } },
      { returnDocument: "after" }
    );
    return { ok: true, doc };
  }

  const doc = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { status: "approved", approvals, approvedAt: now, ...updateStamp(actor.id) } },
    { returnDocument: "after" }
  );
  return { ok: true, doc, fullyApproved: true };
}

/** Soft-delete. Only drafts and rejected requisitions can be removed. */
export async function deleteRequisition(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Requisition not found." };
  if (!["draft", "rejected"].includes(existing.status)) {
    return { ok: false, reason: "Only draft or rejected requisitions can be deleted." };
  }
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}
