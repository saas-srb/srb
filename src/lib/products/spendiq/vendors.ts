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
  DEFAULT_VENDOR_CATEGORY,
  DEFAULT_VENDOR_STATUS,
  DEFAULT_PAYMENT_TERM,
  DEFAULT_CURRENCY,
  type VendorCategory,
  type VendorStatus,
  type PaymentTerm,
} from "@/lib/products/spendiq/constants";

export const VENDORS_COLLECTION = "prms_vendors";
const REQUISITIONS_COLLECTION = "prms_requisitions";
const VENDOR_CODE_PREFIX = "VEN";

export interface VendorBankDetails {
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
  branch: string | null;
}

export interface Vendor extends AuditFields {
  _id: string;
  vendorCode: string;
  companyName: string;
  gstin: string | null;
  pan: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  bankDetails: VendorBankDetails;
  paymentTerms: PaymentTerm;
  currency: string;
  category: VendorCategory;
  /** 0–5, one decimal. `null` until rated. */
  rating: number | null;
  status: VendorStatus;
  notes: string | null;
}

export interface SerializedVendor extends Omit<Vendor, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeVendor(v: Vendor): SerializedVendor {
  return {
    ...v,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    deletedAt: v.deletedAt ? v.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Vendor>(VENDORS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ vendorCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ companyName: 1 }).catch(() => {}),
      collection.createIndex({ category: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ gstin: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateVendorCode(): Promise<string> {
  const seq = await nextSequence("vendor_code");
  return formatCode(VENDOR_CODE_PREFIX, seq);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getVendor(id: string): Promise<Vendor | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

/** Lightweight list for pickers (RFQ / PO / expense vendor dropdowns). */
export async function listVendorOptions(
  opts: { category?: VendorCategory; activeOnly?: boolean } = {}
): Promise<{ _id: string; vendorCode: string; companyName: string; category: VendorCategory }[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.category) filter.category = opts.category;
  if (opts.activeOnly) filter.status = "active";
  const docs = await collection
    .find(filter, { projection: { companyName: 1, vendorCode: 1, category: 1 } })
    .sort({ companyName: 1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, vendorCode: d.vendorCode, companyName: d.companyName, category: d.category }));
}

export interface VendorFilter {
  search?: string;
  category?: VendorCategory;
  status?: VendorStatus;
  minRating?: number;
}

function buildFilter(opts: VendorFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [
      { companyName: rx },
      { vendorCode: rx },
      { contactPerson: rx },
      { email: rx },
      { gstin: rx },
      { pan: rx },
    ];
  }
  if (opts.category) filter.category = opts.category;
  if (opts.status) filter.status = opts.status;
  if (typeof opts.minRating === "number") filter.rating = { $gte: opts.minRating };
  return filter;
}

export interface SearchVendorsOptions extends VendorFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "companyName" | "vendorCode" | "rating" | "status";
  sortDir?: "asc" | "desc";
}

export async function searchVendors(opts: SearchVendorsOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);

  const sortField =
    opts.sortBy === "companyName"
      ? "companyName"
      : opts.sortBy === "vendorCode"
        ? "vendorCode"
        : opts.sortBy === "rating"
          ? "rating"
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

const EXPORT_ROW_LIMIT = 5000;

export async function exportVendors(opts: VendorFilter & { ids?: string[] } = {}): Promise<Vendor[]> {
  const collection = await getCollection();
  const filter =
    opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

export async function countVendors(filter: VendorFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

/**
 * Complete purchase history for a vendor. Empty until the PO / invoice modules
 * land (phases 2 / 6) — querying missing collections is a Mongo no-op.
 */
export async function vendorPurchaseHistory(vendorId: string): Promise<
  { type: string; code: string; date: string; amount: number; status: string }[]
> {
  const db = await getDb();
  const collections = ["prms_purchase_orders", "prms_invoices", "prms_expenses"] as const;
  const rows: { type: string; code: string; date: string; amount: number; status: string }[] = [];
  for (const name of collections) {
    const docs = await db
      .collection<Record<string, unknown>>(name)
      .find({ vendorId, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray()
      .catch(() => [] as Record<string, unknown>[]);
    for (const d of docs) {
      rows.push({
        type: name.replace("prms_", "").replace(/_/g, " "),
        code: String(d.poNumber ?? d.invoiceNumber ?? d.expenseCode ?? d._id),
        date: (d.createdAt instanceof Date ? d.createdAt : new Date()).toISOString().slice(0, 10),
        amount: Number(d.totalAmount ?? d.amount ?? 0),
        status: String(d.status ?? "—"),
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface VendorWriteData {
  companyName: string;
  gstin: string | null;
  pan: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  bankDetails: VendorBankDetails;
  paymentTerms: PaymentTerm;
  currency: string;
  category: VendorCategory;
  rating: number | null;
  status: VendorStatus;
  notes: string | null;
}

export async function createVendor(data: VendorWriteData, actorId: string): Promise<Vendor> {
  const collection = await getCollection();
  const doc: Vendor = {
    _id: newId(),
    vendorCode: await generateVendorCode(),
    companyName: data.companyName,
    gstin: data.gstin,
    pan: data.pan,
    contactPerson: data.contactPerson,
    email: data.email,
    phone: data.phone,
    addressLine: data.addressLine,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    bankDetails: data.bankDetails,
    paymentTerms: data.paymentTerms ?? DEFAULT_PAYMENT_TERM,
    currency: data.currency || DEFAULT_CURRENCY,
    category: data.category ?? DEFAULT_VENDOR_CATEGORY,
    rating: data.rating,
    status: data.status ?? DEFAULT_VENDOR_STATUS,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateVendor(
  id: string,
  data: Partial<VendorWriteData>,
  actorId: string
): Promise<Vendor | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

/** Soft-delete. Refuses when open requisitions still reference the vendor. */
export async function deleteVendor(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const db = await getDb();
  const openRefs = await db
    .collection(REQUISITIONS_COLLECTION)
    .countDocuments({ preferredVendorId: id, deletedAt: null, status: { $nin: ["rejected", "converted"] } })
    .catch(() => 0);
  if (openRefs > 0) {
    return {
      ok: false,
      reason: `${openRefs} open requisition(s) still reference this vendor. Resolve them first.`,
    };
  }
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}
