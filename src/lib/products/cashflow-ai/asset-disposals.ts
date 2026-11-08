import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, notDeleted, nextYearSequence, formatYearCode, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { round2, type FundAccountType } from "@/lib/products/cashflow-ai/constants";
import { getAsset, computeCurrentValue, changeAssetStatus } from "@/lib/products/spendiq/assets";
import { postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";

/**
 * Asset Disposal (§14) — genuinely new. Confirmed via research that zero
 * disposal logic exists anywhere in the codebase (no disposal date, no
 * gain/loss computation, no proceeds tracking — PRMS's `changeAssetStatus`
 * can flip an asset to `"retired"` but that's a status change, not a
 * disposal transaction). Records the disposal here, computes gain/loss
 * against the asset's real book value at disposal time
 * (`computeCurrentValue`, reused from PRMS, not reimplemented), calls
 * PRMS's own real `changeAssetStatus(id, "retired", …)` so the asset
 * record itself stays consistent (never a shadow status), and posts a
 * transaction for any disposal proceeds.
 */

export const ASSET_DISPOSALS_COLLECTION = "fms_asset_disposals";
const DISPOSAL_NUMBER_PREFIX = "DSP";

export interface AssetDisposal extends AuditFields {
  _id: string;
  disposalNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  disposalDate: Date;
  disposalValue: number;
  bookValueAtDisposal: number;
  gainLoss: number;
  reason: string;
  transactionId: string | null;
}

export interface SerializedAssetDisposal extends Omit<AssetDisposal, "createdAt" | "updatedAt" | "deletedAt" | "disposalDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  disposalDate: string;
}

export function serializeAssetDisposal(d: AssetDisposal): SerializedAssetDisposal {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
    disposalDate: d.disposalDate.toISOString().slice(0, 10),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<AssetDisposal>(ASSET_DISPOSALS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ disposalNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ assetId: 1 }, { unique: true }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateDisposalNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(DISPOSAL_NUMBER_PREFIX, year);
  return formatYearCode(DISPOSAL_NUMBER_PREFIX, year, seq);
}

export async function getDisposalForAsset(assetId: string): Promise<AssetDisposal | null> {
  const collection = await getCollection();
  return collection.findOne({ assetId, ...notDeleted });
}

export async function searchAssetDisposals(opts: { page?: number; pageSize?: number } = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = { ...notDeleted };
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ disposalDate: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface DisposeAssetData {
  assetId: string;
  disposalDate: string;
  disposalValue: number;
  reason: string;
  fundAccountId?: string | null;
  fundAccountType?: FundAccountType | null;
}

export async function disposeAsset(
  data: DisposeAssetData,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true; disposal: AssetDisposal } | { ok: false; reason: string }> {
  const asset = await getAsset(data.assetId);
  if (!asset) return { ok: false, reason: "Asset not found." };
  if (asset.status === "retired") return { ok: false, reason: "This asset has already been retired." };

  const existing = await getDisposalForAsset(data.assetId);
  if (existing) return { ok: false, reason: "This asset already has a disposal record." };

  const disposalDate = new Date(`${data.disposalDate}T00:00:00`);
  const bookValueAtDisposal = computeCurrentValue(asset, disposalDate);
  const disposalValue = round2(data.disposalValue);
  const gainLoss = round2(disposalValue - bookValueAtDisposal);

  const statusChange = await changeAssetStatus(asset._id, "retired", data.reason, actorId);
  if (!statusChange.ok) return { ok: false, reason: statusChange.reason ?? "Could not retire the asset." };

  let transactionId: string | null = null;
  if (disposalValue > 0) {
    const txn = await postSystemTransaction(
      {
        type: "income",
        transactionDate: disposalDate,
        postingDate: disposalDate,
        amount: disposalValue,
        currency: asset.currency,
        paymentMethod: "bank_transfer",
        sourceModule: "prms",
        sourceRecordId: asset._id,
        customerId: null,
        vendorId: null,
        employeeId: null,
        projectId: null,
        department: null,
        accountId: null,
        fundAccountId: data.fundAccountId ?? null,
        fundAccountType: data.fundAccountType ?? null,
        taxAmount: 0,
        referenceNumber: null,
        description: `Disposal proceeds for ${asset.assetCode} (${asset.name})`,
        attachments: [],
      },
      actorId,
      actorEmail
    );
    if ("ok" in txn) return txn;
    transactionId = txn._id;
  }

  const collection = await getCollection();
  const doc: AssetDisposal = {
    _id: newId(),
    disposalNumber: await generateDisposalNumber(disposalDate.getFullYear()),
    assetId: asset._id,
    assetCode: asset.assetCode,
    assetName: asset.name,
    disposalDate,
    disposalValue,
    bookValueAtDisposal,
    gainLoss,
    reason: data.reason,
    transactionId,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await fmsEvents.assetDisposed({ disposalNumber: doc.disposalNumber, assetName: (asset as { name?: string }).name ?? null }, actorId);
  return { ok: true, disposal: doc };
}
