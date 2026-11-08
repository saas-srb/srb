import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { notifyEmployeeLogin } from "@/lib/products/spendiq/notifications";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextSequence,
  formatCode,
  type AuditFields,
} from "@/lib/products/spendiq/db";
import { DEFAULT_ASSET_STATUS, DEFAULT_CURRENCY, round2, type AssetStatus, type DepreciationMethod } from "@/lib/products/spendiq/constants";

export const ASSETS_COLLECTION = "prms_assets";
export const ASSET_ASSIGNMENTS_COLLECTION = "prms_asset_assignments";
const ASSET_CODE_PREFIX = "AST";

export interface Asset extends AuditFields {
  _id: string;
  assetCode: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  purchaseDate: Date;
  purchaseCost: number;
  currency: string;
  vendorId: string | null;
  vendorName: string | null;
  poId: string | null;
  warrantyExpiry: string | null;
  officeLocation: string | null;
  depreciationMethod: DepreciationMethod;
  usefulLifeYears: number;
  salvageValue: number;
  /** Refreshed on write and by the sweep. */
  currentValue: number;
  status: AssetStatus;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  assignedAt: Date | null;
  notes: string | null;
}

export interface SerializedAsset
  extends Omit<Asset, "createdAt" | "updatedAt" | "deletedAt" | "purchaseDate" | "assignedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  purchaseDate: string;
  assignedAt: string | null;
}

export function serializeAsset(a: Asset): SerializedAsset {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
    purchaseDate: a.purchaseDate.toISOString().slice(0, 10),
    assignedAt: a.assignedAt ? a.assignedAt.toISOString() : null,
  };
}

export interface AssetAssignment {
  _id: string;
  assetId: string;
  action: "assigned" | "returned" | "repair" | "repaired" | "lost" | "retired";
  employeeId: string | null;
  employeeName: string | null;
  note: string | null;
  date: Date;
  actorId: string;
}

/** Straight-line / written-down-value depreciation → current book value. */
export function computeCurrentValue(
  input: { purchaseCost: number; purchaseDate: Date; depreciationMethod: DepreciationMethod; usefulLifeYears: number; salvageValue: number },
  asOf: Date = new Date()
): number {
  const { purchaseCost, depreciationMethod, salvageValue } = input;
  if (depreciationMethod === "none" || purchaseCost <= 0) return round2(purchaseCost);
  const life = Math.max(input.usefulLifeYears || 5, 0.5);
  const ageYears = Math.max((asOf.getTime() - input.purchaseDate.getTime()) / (365.25 * 86400000), 0);
  const salvage = Math.min(Math.max(salvageValue, 0), purchaseCost);

  if (depreciationMethod === "slm") {
    const depreciable = purchaseCost - salvage;
    const value = purchaseCost - depreciable * Math.min(ageYears / life, 1);
    return round2(Math.max(value, salvage));
  }
  // WDV
  const rate = salvage > 0 ? 1 - Math.pow(salvage / purchaseCost, 1 / life) : 1 - Math.pow(0.1, 1 / life);
  const value = purchaseCost * Math.pow(1 - rate, ageYears);
  return round2(Math.max(value, salvage));
}

let indexesEnsured = false;
async function collections() {
  const db = await getDb();
  const assets = db.collection<Asset>(ASSETS_COLLECTION);
  const assignments = db.collection<AssetAssignment>(ASSET_ASSIGNMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      assets.createIndex({ assetCode: 1 }, { unique: true }).catch(() => {}),
      assets.createIndex({ category: 1 }).catch(() => {}),
      assets.createIndex({ status: 1 }).catch(() => {}),
      assets.createIndex({ assignedEmployeeId: 1 }).catch(() => {}),
      assets.createIndex({ purchaseDate: -1 }).catch(() => {}),
      assignments.createIndex({ assetId: 1, date: -1 }).catch(() => {}),
    ]);
  }
  return { assets, assignments };
}

export async function generateAssetCode(): Promise<string> {
  return formatCode(ASSET_CODE_PREFIX, await nextSequence("asset_code"));
}

export async function getAsset(id: string): Promise<Asset | null> {
  const { assets } = await collections();
  return assets.findOne({ _id: id, ...notDeleted });
}

export interface AssetFilter {
  search?: string;
  category?: string;
  status?: AssetStatus;
  assignedEmployeeId?: string;
}

function buildFilter(opts: AssetFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ assetCode: rx }, { name: rx }, { serialNumber: rx }, { brand: rx }, { model: rx }];
  }
  if (opts.category) filter.category = opts.category;
  if (opts.status) filter.status = opts.status;
  if (opts.assignedEmployeeId) filter.assignedEmployeeId = opts.assignedEmployeeId;
  return filter;
}

export async function searchAssets(
  opts: AssetFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
) {
  const { assets } = await collections();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy || "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    assets.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    assets.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countAssets(filter: AssetFilter = {}): Promise<number> {
  const { assets } = await collections();
  return assets.countDocuments(buildFilter(filter));
}

export async function sumAssetValue(filter: AssetFilter = {}): Promise<number> {
  const { assets } = await collections();
  const res = await assets
    .aggregate<{ total: number }>([{ $match: buildFilter(filter) }, { $group: { _id: null, total: { $sum: "$currentValue" } } }])
    .toArray();
  return res[0]?.total ?? 0;
}

export async function exportAssets(opts: AssetFilter & { ids?: string[] } = {}): Promise<Asset[]> {
  const { assets } = await collections();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return assets.find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
}

export async function listAssignments(assetId: string): Promise<AssetAssignment[]> {
  const { assignments } = await collections();
  return assignments.find({ assetId }).sort({ date: -1 }).toArray();
}

export interface AssetWriteData {
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  purchaseDate: string;
  purchaseCost: number;
  currency: string;
  vendorId: string | null;
  vendorName: string | null;
  poId?: string | null;
  warrantyExpiry: string | null;
  officeLocation: string | null;
  depreciationMethod: DepreciationMethod;
  usefulLifeYears: number;
  salvageValue: number;
  notes: string | null;
}

export async function createAsset(data: AssetWriteData, actorId: string): Promise<Asset> {
  const { assets } = await collections();
  const purchaseDate = new Date(`${data.purchaseDate}T00:00:00`);
  const currentValue = computeCurrentValue({
    purchaseCost: data.purchaseCost,
    purchaseDate,
    depreciationMethod: data.depreciationMethod,
    usefulLifeYears: data.usefulLifeYears,
    salvageValue: data.salvageValue,
  });
  const doc: Asset = {
    _id: newId(),
    assetCode: await generateAssetCode(),
    name: data.name,
    category: data.category,
    brand: data.brand,
    model: data.model,
    serialNumber: data.serialNumber,
    purchaseDate,
    purchaseCost: round2(data.purchaseCost),
    currency: data.currency || DEFAULT_CURRENCY,
    vendorId: data.vendorId,
    vendorName: data.vendorName,
    poId: data.poId ?? null,
    warrantyExpiry: data.warrantyExpiry,
    officeLocation: data.officeLocation,
    depreciationMethod: data.depreciationMethod,
    usefulLifeYears: data.usefulLifeYears || 5,
    salvageValue: round2(data.salvageValue),
    currentValue,
    status: DEFAULT_ASSET_STATUS,
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    assignedAt: null,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await assets.insertOne(doc);
  return doc;
}

export async function updateAsset(id: string, data: AssetWriteData, actorId: string): Promise<Asset | null> {
  const { assets } = await collections();
  const purchaseDate = new Date(`${data.purchaseDate}T00:00:00`);
  const currentValue = computeCurrentValue({
    purchaseCost: data.purchaseCost,
    purchaseDate,
    depreciationMethod: data.depreciationMethod,
    usefulLifeYears: data.usefulLifeYears,
    salvageValue: data.salvageValue,
  });
  return assets.findOneAndUpdate(
    { _id: id, ...notDeleted },
    {
      $set: {
        name: data.name,
        category: data.category,
        brand: data.brand,
        model: data.model,
        serialNumber: data.serialNumber,
        purchaseDate,
        purchaseCost: round2(data.purchaseCost),
        currency: data.currency || DEFAULT_CURRENCY,
        vendorId: data.vendorId,
        vendorName: data.vendorName,
        warrantyExpiry: data.warrantyExpiry,
        officeLocation: data.officeLocation,
        depreciationMethod: data.depreciationMethod,
        usefulLifeYears: data.usefulLifeYears || 5,
        salvageValue: round2(data.salvageValue),
        currentValue,
        notes: data.notes,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
}

async function logAssignment(entry: Omit<AssetAssignment, "_id" | "date">): Promise<void> {
  const { assignments } = await collections();
  await assignments.insertOne({ _id: newId(), date: new Date(), ...entry });
}

export async function assignAsset(
  id: string,
  employee: { id: string; name: string },
  note: string | null,
  actorId: string
): Promise<{ ok: boolean; reason?: string }> {
  const { assets } = await collections();
  const asset = await assets.findOne({ _id: id, ...notDeleted });
  if (!asset) return { ok: false, reason: "Asset not found." };
  if (asset.status === "retired" || asset.status === "lost") return { ok: false, reason: "This asset cannot be assigned." };
  await assets.updateOne(
    { _id: id, ...notDeleted },
    { $set: { status: "assigned", assignedEmployeeId: employee.id, assignedEmployeeName: employee.name, assignedAt: new Date(), ...updateStamp(actorId) } }
  );
  await logAssignment({ assetId: id, action: "assigned", employeeId: employee.id, employeeName: employee.name, note, actorId });
  await notifyEmployeeLogin(employee.id, { type: "asset_assigned", title: `${asset.name} (${asset.assetCode}) is assigned to you`, body: note, link: "/spendiq/notifications" }, actorId);
  return { ok: true };
}

export async function returnAsset(id: string, note: string | null, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const { assets } = await collections();
  const asset = await assets.findOne({ _id: id, ...notDeleted });
  if (!asset) return { ok: false, reason: "Asset not found." };
  await assets.updateOne(
    { _id: id, ...notDeleted },
    { $set: { status: "in_stock", assignedEmployeeId: null, assignedEmployeeName: null, assignedAt: null, ...updateStamp(actorId) } }
  );
  await logAssignment({ assetId: id, action: "returned", employeeId: asset.assignedEmployeeId, employeeName: asset.assignedEmployeeName, note, actorId });
  return { ok: true };
}

export async function changeAssetStatus(
  id: string,
  status: AssetStatus,
  note: string | null,
  actorId: string
): Promise<{ ok: boolean; reason?: string }> {
  const { assets } = await collections();
  const asset = await assets.findOne({ _id: id, ...notDeleted });
  if (!asset) return { ok: false, reason: "Asset not found." };
  const set: Record<string, unknown> = { status, ...updateStamp(actorId) };
  if (status === "in_stock" || status === "retired" || status === "lost") {
    set.assignedEmployeeId = null;
    set.assignedEmployeeName = null;
    set.assignedAt = null;
  }
  await assets.updateOne({ _id: id, ...notDeleted }, { $set: set });
  const action = status === "under_repair" ? "repair" : status === "retired" ? "retired" : status === "lost" ? "lost" : "repaired";
  await logAssignment({ assetId: id, action, employeeId: null, employeeName: null, note, actorId });
  return { ok: true };
}

export async function deleteAsset(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const { assets } = await collections();
  const asset = await assets.findOne({ _id: id, ...notDeleted });
  if (!asset) return { ok: false, reason: "Asset not found." };
  if (asset.status === "assigned") return { ok: false, reason: "Return the asset before deleting it." };
  await assets.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}

/** Sweep hook: recompute `currentValue` for every depreciating asset. */
export async function refreshAssetValuations(): Promise<number> {
  const { assets } = await collections();
  const rows = await assets.find({ ...notDeleted, depreciationMethod: { $ne: "none" } }).toArray();
  let updated = 0;
  for (const a of rows) {
    const cv = computeCurrentValue(a);
    if (cv !== a.currentValue) {
      await assets.updateOne({ _id: a._id }, { $set: { currentValue: cv, updatedAt: new Date() } });
      updated += 1;
    }
  }
  return updated;
}
