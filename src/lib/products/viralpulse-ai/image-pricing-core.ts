/**
 * Client-safe half of the model catalogue: image qualities, the price table and the cost maths. No server imports, so 'use client'
 * components may import it (models.ts is server-only and re-exports all of this).
 */

export const IMAGE_QUALITIES = ["low", "medium", "high", "xhigh", "max"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export const isImageQuality = (v: unknown): v is ImageQuality => IMAGE_QUALITIES.includes(v as ImageQuality);

// ── Image pricing ───────────────────────────────────────────────────────────

export interface ImageRates {
  /** USD per 1M tokens. */
  textIn: number;
  imageIn: number;
  imageOut: number;
}

/**
 * Editable price table. Source: developers.openai.com/api/docs/pricing (checked 2026-11-01), standard (non-batch) processing.
 * Both GPT-Image-2.5 models share the same token rates.
 */
export const IMAGE_RATES: Record<string, ImageRates> = {
  "gpt-image-2.5-flare": { textIn: 5, imageIn: 8, imageOut: 30 },
  "gpt-image-2.5-sunburst": { textIn: 5, imageIn: 8, imageOut: 30 },
};

export type ImageSizeKey = "1024x1024" | "1024x1536" | "1536x1024";
export type ImagePriceTable = Partial<Record<ImageQuality, Partial<Record<ImageSizeKey, number>>>>;

/**
 * Per-image USD used ONLY when the API response carries no token usage. OpenAI publishes per-image prices for GPT Image 2 (not for 2.5,
 * which is billed by tokens): low 0.006/0.005/0.005, medium 0.053/0.041/0.041, high 0.211/0.165/0.165 for 1024x1024 / 1024x1536 /
 * 1536x1024. They are a reference for the same quality tiers, not an invoice; `xhigh` and `max` have no published figure, so the `high`
 * price is used as a lower bound. Admins can override any cell in Settings (`ai.imagePrices`).
 */
export const IMAGE_FALLBACK_PRICES: ImagePriceTable = {
  low: { "1024x1024": 0.006, "1024x1536": 0.005, "1536x1024": 0.005 },
  medium: { "1024x1024": 0.053, "1024x1536": 0.041, "1536x1024": 0.041 },
  high: { "1024x1024": 0.211, "1024x1536": 0.165, "1536x1024": 0.165 },
};

export interface ImageUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}

export interface ImageCost {
  usd: number;
  basis: "usage" | "price-table" | "flat-setting" | "unknown";
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** USD for one generated image: token usage x rates when reported, else the (editable) per-image table, else the flat setting. */
export function imageCost(opts: { model: string; quality: ImageQuality; size: string; usage?: ImageUsage | null; overrides?: ImagePriceTable | null; flatUsd?: number | null; rates?: Record<string, ImageRates> }): ImageCost {
  const rate = (opts.rates ?? IMAGE_RATES)[opts.model];
  const u = opts.usage;
  if (rate && u && (u.output_tokens ?? 0) > 0) {
    const imageIn = u.input_tokens_details?.image_tokens ?? 0;
    const textIn = u.input_tokens_details?.text_tokens ?? Math.max(0, (u.input_tokens ?? 0) - imageIn);
    return { usd: round6((textIn * rate.textIn + imageIn * rate.imageIn + (u.output_tokens ?? 0) * rate.imageOut) / 1_000_000), basis: "usage" };
  }
  const q = opts.quality;
  const cell = opts.overrides?.[q]?.[opts.size as ImageSizeKey] ?? IMAGE_FALLBACK_PRICES[q]?.[opts.size as ImageSizeKey] ?? (q === "xhigh" || q === "max" ? IMAGE_FALLBACK_PRICES.high?.[opts.size as ImageSizeKey] : undefined);
  if (typeof cell === "number") return { usd: cell, basis: "price-table" };
  if (opts.flatUsd && opts.flatUsd > 0) return { usd: opts.flatUsd, basis: "flat-setting" };
  return { usd: 0, basis: "unknown" };
}
