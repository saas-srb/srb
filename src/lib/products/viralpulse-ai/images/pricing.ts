import { IMAGE_FALLBACK_PRICES, imageCost, isImageQuality, type ImageCost, type ImagePriceTable, type ImageQuality, type ImageUsage } from "@/lib/products/viralpulse-ai/image-pricing-core";
import type { ImageProviderId } from "@/lib/products/viralpulse-ai/images/types";

/**
 * What an image costs, before and after the call. Pure.
 *
 * OpenAI: the call reports token usage and the cost is usage x the published token rates (models.ts); the per-image table in
 * models.ts (editable in Settings) is used only when no usage comes back. Before a call there is no usage, so the estimate is
 * the table. Edits that send reference pictures are billed for those input tokens too, so an estimate for an edit is a floor.
 *
 * Gemini: Google bills image output per image by size ("1K" = 1024px on the long side, default). Table below from
 * ai.google.dev/gemini-api/docs/pricing, standard paid tier, read 2026-11-01. Input tokens (the prompt and any reference pictures)
 * are billed on top at a few hundredths of a cent and are not included.
 */

export type GeminiSize = "1K" | "2K" | "4K";
export type GeminiPriceTable = Record<string, Partial<Record<GeminiSize, number>>>;

export const GEMINI_IMAGE_PRICES: GeminiPriceTable = {
  "gemini-nano-banana-2.1": { "1K": 0.0336, "2K": 0.0504, "4K": 0.113 },
  "gemini-3.1-flash-lite-image": { "1K": 0.0336 },
  "gemini-3.1-flash-image": { "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  "gemini-3-pro-image": { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
  "gemini-2.5-flash-image": { "1K": 0.039 },
};
/** Output tokens per image at 1K, for the usage history (price / USD 30 per 1M output tokens). */
export const GEMINI_TOKENS_PER_IMAGE: Record<GeminiSize, number> = { "1K": 1120, "2K": 1680, "4K": 3767 };

export interface UnitCost extends ImageCost {
  usd: number;
}

/** USD for one OpenAI image. */
export function openAiImageCost(opts: { model: string; quality: ImageQuality | string; size: string; usage?: ImageUsage | null; overrides?: ImagePriceTable | null; flatUsd?: number | null }): UnitCost {
  const quality: ImageQuality = isImageQuality(opts.quality) ? opts.quality : "medium";
  return imageCost({ model: opts.model, quality, size: opts.size, usage: opts.usage, overrides: opts.overrides, flatUsd: opts.flatUsd });
}

/** USD for one Gemini image (unknown models and sizes fall back to the 1K price, then to 0 with basis "unknown"). */
export function geminiImageCost(opts: { model: string; size?: GeminiSize; overrides?: GeminiPriceTable | null }): UnitCost {
  const size = opts.size ?? "1K";
  const row = opts.overrides?.[opts.model] ?? GEMINI_IMAGE_PRICES[opts.model];
  const v = row?.[size] ?? row?.["1K"];
  return typeof v === "number" ? { usd: v, basis: "price-table" } : { usd: 0, basis: "unknown" };
}

export interface Estimate {
  perImageUsd: number;
  totalUsd: number;
  images: number;
  basis: string;
}

export function estimateJob(opts: { provider: ImageProviderId; model: string; quality: ImageQuality | string; openAiSize: string; images: number; openAiOverrides?: ImagePriceTable | null; geminiOverrides?: GeminiPriceTable | null; flatUsd?: number | null }): Estimate {
  const n = Math.max(0, Math.round(opts.images));
  const unit = opts.provider === "gemini" ? geminiImageCost({ model: opts.model, overrides: opts.geminiOverrides }) : openAiImageCost({ model: opts.model, quality: opts.quality, size: opts.openAiSize, overrides: opts.openAiOverrides, flatUsd: opts.flatUsd });
  return { perImageUsd: unit.usd, totalUsd: Math.round(unit.usd * n * 1e6) / 1e6, images: n, basis: unit.basis };
}

export { IMAGE_FALLBACK_PRICES };
