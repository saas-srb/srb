import "server-only";
import {
  searchAssets as searchPrmsAssets,
  getAsset as getPrmsAsset,
  type Asset,
  type AssetFilter,
} from "@/lib/products/spendiq/assets";
import { getDisposalForAsset, type AssetDisposal } from "@/lib/products/cashflow-ai/asset-disposals";

/**
 * FMS's Asset Financial Management view (§14). PRMS's `prms_assets` already
 * has a working depreciation engine (real SLM/WDV calculation) plus
 * purchase cost, vendor and assignment tracking — this module re-exports
 * PRMS's own `searchAssets`/`getAsset` as-is, the same wrapping pattern as
 * every other Phase 1-3 financial reference view. Never duplicates PRMS's
 * data or its depreciation math.
 */

export async function listAssetsFinance(
  opts: AssetFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
) {
  return searchPrmsAssets(opts);
}

export async function getAssetFinanceDetail(id: string): Promise<{ asset: Asset; disposal: AssetDisposal | null } | null> {
  const asset = await getPrmsAsset(id);
  if (!asset) return null;
  const disposal = await getDisposalForAsset(id);
  return { asset, disposal };
}
