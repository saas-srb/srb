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
import { round2, DEFAULT_GST_RATE, type RfqStatus } from "@/lib/products/spendiq/constants";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { createPurchaseOrder } from "@/lib/products/spendiq/purchase-orders";
import { getRequisition } from "@/lib/products/spendiq/requisitions";

export const RFQS_COLLECTION = "prms_rfqs";
const RFQ_CODE_PREFIX = "RFQ";

export interface RfqLine {
  description: string;
  quantity: number;
  uom: string;
}

export interface RfqQuotation {
  vendorId: string;
  vendorName: string;
  /** Unit price per RFQ line, same order as `lines`. */
  unitPrices: number[];
  deliveryDays: number | null;
  paymentTerms: string | null;
  /** 0–10 subjective technical fit. */
  technicalScore: number | null;
  notes: string | null;
  totalAmount: number;
  submittedAt: Date;
}

export interface Rfq extends AuditFields {
  _id: string;
  rfqCode: string;
  title: string;
  description: string | null;
  requisitionId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  lines: RfqLine[];
  vendorIds: string[];
  quotations: RfqQuotation[];
  status: RfqStatus;
  awardedVendorId: string | null;
  awardedPoId: string | null;
}

export interface SerializedRfq extends Omit<Rfq, "createdAt" | "updatedAt" | "deletedAt" | "quotations"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  quotations: (Omit<RfqQuotation, "submittedAt"> & { submittedAt: string })[];
}

export function serializeRfq(r: Rfq): SerializedRfq {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    quotations: r.quotations.map((q) => ({ ...q, submittedAt: q.submittedAt.toISOString() })),
  };
}

/** L1 / L2 / L3 ranking by total quote value (ascending). */
export function rankQuotations(quotations: { vendorId: string; totalAmount: number }[]): Map<string, number> {
  const sorted = [...quotations].sort((a, b) => a.totalAmount - b.totalAmount);
  const map = new Map<string, number>();
  sorted.forEach((q, i) => map.set(q.vendorId, i + 1));
  return map;
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Rfq>(RFQS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ rfqCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ requisitionId: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateRfqCode(): Promise<string> {
  return formatCode(RFQ_CODE_PREFIX, await nextSequence("rfq_code"));
}

export async function getRfq(id: string): Promise<Rfq | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface RfqFilter {
  search?: string;
  status?: RfqStatus;
}

function buildFilter(opts: RfqFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ rfqCode: rx }, { title: rx }];
  }
  if (opts.status) filter.status = opts.status;
  return filter;
}

export async function searchRfqs(
  opts: RfqFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy || "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countRfqs(filter: RfqFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

export async function exportRfqs(opts: RfqFilter & { ids?: string[] } = {}): Promise<Rfq[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
}

export interface RfqWriteData {
  title: string;
  description: string | null;
  requisitionId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  lines: RfqLine[];
  vendorIds: string[];
}

export async function createRfq(data: RfqWriteData, actorId: string): Promise<Rfq> {
  const collection = await getCollection();
  const doc: Rfq = {
    _id: newId(),
    rfqCode: await generateRfqCode(),
    title: data.title,
    description: data.description,
    requisitionId: data.requisitionId,
    departmentId: data.departmentId,
    departmentName: data.departmentName,
    lines: data.lines,
    vendorIds: data.vendorIds,
    quotations: [],
    status: "draft",
    awardedVendorId: null,
    awardedPoId: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

/** Build an RFQ straight from an approved requisition. */
export async function createRfqFromRequisition(requisitionId: string, vendorIds: string[], actorId: string): Promise<Rfq | null> {
  const req = await getRequisition(requisitionId);
  if (!req) return null;
  return createRfq(
    {
      title: `RFQ for ${req.itemName}`,
      description: req.justification,
      requisitionId,
      departmentId: req.departmentId,
      departmentName: req.departmentName,
      lines: [{ description: req.itemName, quantity: req.quantity, uom: req.uom }],
      vendorIds,
    },
    actorId
  );
}

export async function updateRfq(id: string, data: Partial<RfqWriteData>, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "RFQ not found." };
  if (existing.status === "awarded") return { ok: false, reason: "An awarded RFQ cannot be edited." };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { ...data, ...updateStamp(actorId) } });
  return { ok: true };
}

export async function setRfqStatus(id: string, status: RfqStatus, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { status, ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

export async function addQuotation(
  rfqId: string,
  input: { vendorId: string; unitPrices: number[]; deliveryDays: number | null; paymentTerms: string | null; technicalScore: number | null; notes: string | null },
  actorId: string
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const rfq = await collection.findOne({ _id: rfqId, ...notDeleted });
  if (!rfq) return { ok: false, reason: "RFQ not found." };
  const vendor = await getVendor(input.vendorId);
  if (!vendor) return { ok: false, reason: "Vendor not found." };

  const totalAmount = round2(
    rfq.lines.reduce((s, line, i) => s + line.quantity * (input.unitPrices[i] ?? 0), 0)
  );
  const quotation: RfqQuotation = {
    vendorId: input.vendorId,
    vendorName: vendor.companyName,
    unitPrices: rfq.lines.map((_, i) => round2(input.unitPrices[i] ?? 0)),
    deliveryDays: input.deliveryDays,
    paymentTerms: input.paymentTerms,
    technicalScore: input.technicalScore,
    notes: input.notes,
    totalAmount,
    submittedAt: new Date(),
  };
  const quotations = [...rfq.quotations.filter((q) => q.vendorId !== input.vendorId), quotation];
  await collection.updateOne(
    { _id: rfqId, ...notDeleted },
    {
      $set: {
        quotations,
        status: rfq.status === "draft" || rfq.status === "sent" ? "quoted" : rfq.status,
        vendorIds: Array.from(new Set([...rfq.vendorIds, input.vendorId])),
        ...updateStamp(actorId),
      },
    }
  );
  return { ok: true };
}

/** Award the RFQ to a vendor: generates a draft PO from that vendor's quote. */
export async function awardRfq(
  rfqId: string,
  vendorId: string,
  actorId: string
): Promise<{ ok: boolean; reason?: string; poId?: string }> {
  const collection = await getCollection();
  const rfq = await collection.findOne({ _id: rfqId, ...notDeleted });
  if (!rfq) return { ok: false, reason: "RFQ not found." };
  if (rfq.status === "awarded") return { ok: false, reason: "This RFQ is already awarded." };
  const quote = rfq.quotations.find((q) => q.vendorId === vendorId);
  if (!quote) return { ok: false, reason: "That vendor has not submitted a quotation." };

  const po = await createPurchaseOrder(
    {
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      rfqId,
      requisitionId: rfq.requisitionId,
      departmentId: rfq.departmentId,
      departmentName: rfq.departmentName,
      items: rfq.lines.map((line, i) => ({
        description: line.description,
        quantity: line.quantity,
        uom: line.uom,
        unitPrice: quote.unitPrices[i] ?? 0,
        gstRate: DEFAULT_GST_RATE,
      })),
      discount: 0,
      currency: "INR",
      deliveryAddress: null,
      deliveryDate: null,
      paymentTerms: quote.paymentTerms,
      notes: `Auto-generated from ${rfq.rfqCode}`,
    },
    actorId
  );

  await collection.updateOne(
    { _id: rfqId, ...notDeleted },
    { $set: { status: "awarded", awardedVendorId: vendorId, awardedPoId: po._id, ...updateStamp(actorId) } }
  );
  return { ok: true, poId: po._id };
}

export async function deleteRfq(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "RFQ not found." };
  if (existing.status === "awarded") return { ok: false, reason: "An awarded RFQ cannot be deleted." };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}
