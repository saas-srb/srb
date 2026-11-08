"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { disposeAsset, type DisposeAssetData } from "@/lib/products/cashflow-ai/asset-disposals";
import { isValidFundAccountType } from "@/lib/products/cashflow-ai/constants";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface AssetDisposalActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(assetId?: string) {
  revalidatePath("/cashflow-ai/assets");
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai");
  if (assetId) revalidatePath(`/cashflow-ai/assets/${assetId}`);
}

export async function disposeAssetAction(input: Record<string, unknown>): Promise<AssetDisposalActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const assetId = String(input.assetId ?? "");
  if (!assetId) return { ok: false, fieldErrors: { assetId: "Missing asset reference." } };

  const disposalValue = Number(input.disposalValue);
  if (!Number.isFinite(disposalValue) || disposalValue < 0) return { ok: false, fieldErrors: { disposalValue: "Enter a disposal value." } };

  const reason = String(input.reason ?? "").trim();
  if (!reason) return { ok: false, fieldErrors: { reason: "Enter a reason." } };

  const fundAccountKey = String(input.fundAccountKey ?? "");
  let fundAccountId: string | null = null;
  let fundAccountType: DisposeAssetData["fundAccountType"] = null;
  if (fundAccountKey) {
    const [type, accountId] = fundAccountKey.split(":");
    if (isValidFundAccountType(type) && accountId) {
      fundAccountType = type;
      fundAccountId = accountId;
    }
  }

  const data: DisposeAssetData = {
    assetId,
    disposalDate: String(input.disposalDate ?? new Date().toISOString().slice(0, 10)),
    disposalValue,
    reason,
    fundAccountId,
    fundAccountType,
  };

  const res = await disposeAsset(data, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "record",
    entity: "transaction",
    entityId: res.disposal._id,
    entityLabel: res.disposal.disposalNumber,
    summary: `Disposed ${res.disposal.assetCode}: gain/loss ${res.disposal.gainLoss}`,
  });
  revalidate(assetId);
  return { ok: true, id: res.disposal._id };
}
