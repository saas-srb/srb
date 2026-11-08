import type { ImageQuality } from "@/lib/products/viralpulse-ai/image-pricing-core";
import type { ImageProviderId } from "@/lib/products/viralpulse-ai/images/types";
import type { GeminiPriceTable } from "@/lib/products/viralpulse-ai/images/pricing";

/** Per-company Image Studio limits and the pure decision that applies them before any spend. */

export interface ImageSettings {
  enabled: boolean;
  defaultProvider: ImageProviderId;
  geminiModel: string;
  defaultQuality: ImageQuality;
  /** Most pictures one request may ask for (1-4). */
  maxVariants: number;
  /** Pictures one person may generate per rolling minute. */
  perUserPerMinute: number;
  /** Estimated + actual spend allowed per day (India time), USD. 0 = image generation is off. */
  dailySpendCapUsd: number;
  /** A request estimated above this needs someone with approval rights (publish permission). 0 = every request needs a manager. */
  approvalThresholdUsd: number;
  /** Start the visible "AI generated" badge ON for pictures that may show realistic people. */
  badgeForPeopleDefault: boolean;
  /** Editable Gemini price table (USD per image); overrides the built-in one per model and size. */
  geminiPrices?: GeminiPriceTable;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  enabled: true,
  defaultProvider: "openai",
  geminiModel: "gemini-nano-banana-2.1",
  defaultQuality: "medium",
  maxVariants: 4,
  perUserPerMinute: 8,
  dailySpendCapUsd: 20,
  approvalThresholdUsd: 2,
  badgeForPeopleDefault: true,
};

export type LimitCode = "DISABLED" | "VARIANTS" | "RATE" | "CAP";

export type LimitDecision = { ok: true; needsApproval: boolean } | { ok: false; code: LimitCode; message: string };

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

/** Applies the rules in order: off switch, variant count, rate, daily cap, then approval. Pure. */
export function evaluateRequest(opts: { settings: ImageSettings; images: number; estimateUsd: number; recentImagesByUser: number; spentTodayUsd: number; canApprove: boolean }): LimitDecision {
  const s = opts.settings;
  if (!s.enabled) return { ok: false, code: "DISABLED", message: "Image generation is switched off for this workspace." };
  if (s.dailySpendCapUsd <= 0) return { ok: false, code: "DISABLED", message: "Image generation is off: the daily spend limit is 0. A manager can raise it in the Image Studio settings." };
  if (opts.images < 1 || opts.images > 6 || !Number.isFinite(opts.images)) return { ok: false, code: "VARIANTS", message: "Ask for between 1 and 6 pictures at a time." };
  if (opts.recentImagesByUser + opts.images > s.perUserPerMinute) return { ok: false, code: "RATE", message: `You can generate ${s.perUserPerMinute} pictures a minute. Wait a moment and try again.` };
  if (opts.spentTodayUsd + opts.estimateUsd > s.dailySpendCapUsd + 1e-9) {
    const left = Math.max(0, s.dailySpendCapUsd - opts.spentTodayUsd);
    return { ok: false, code: "CAP", message: `Today's image spend limit of ${usd(s.dailySpendCapUsd)} would be passed (${usd(left)} left, this request is about ${usd(opts.estimateUsd)}). A manager can raise the limit.` };
  }
  return { ok: true, needsApproval: opts.estimateUsd > s.approvalThresholdUsd + 1e-9 && !opts.canApprove };
}

/** Start of the current day in India (UTC+5:30), as a UTC instant: the window the daily cap counts over. */
export function istDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + 5.5 * 3600_000);
  const startShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(startShifted - 5.5 * 3600_000);
}

export function cleanSettings(patch: Partial<ImageSettings>, cur: ImageSettings): ImageSettings {
  const n = (v: unknown, lo: number, hi: number, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
  };
  const price = (t: unknown): GeminiPriceTable | undefined => {
    if (!t || typeof t !== "object") return cur.geminiPrices;
    const out: GeminiPriceTable = {};
    for (const [model, row] of Object.entries(t as Record<string, unknown>)) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,63}$/.test(model) || !row || typeof row !== "object") continue;
      const r: Partial<Record<"1K" | "2K" | "4K", number>> = {};
      for (const k of ["1K", "2K", "4K"] as const) {
        const v = (row as Record<string, unknown>)[k];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5) r[k] = v;
      }
      if (Object.keys(r).length) out[model] = r;
    }
    return out;
  };
  return {
    enabled: patch.enabled === undefined ? cur.enabled : !!patch.enabled,
    defaultProvider: patch.defaultProvider === "gemini" ? "gemini" : patch.defaultProvider === "openai" ? "openai" : cur.defaultProvider,
    geminiModel: typeof patch.geminiModel === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,63}$/.test(patch.geminiModel) ? patch.geminiModel : cur.geminiModel,
    defaultQuality: (["low", "medium", "high", "xhigh", "max"] as const).includes(patch.defaultQuality as never) ? (patch.defaultQuality as ImageQuality) : cur.defaultQuality,
    maxVariants: Math.round(n(patch.maxVariants, 1, 4, cur.maxVariants)),
    perUserPerMinute: Math.round(n(patch.perUserPerMinute, 1, 60, cur.perUserPerMinute)),
    dailySpendCapUsd: n(patch.dailySpendCapUsd, 0, 100000, cur.dailySpendCapUsd),
    approvalThresholdUsd: n(patch.approvalThresholdUsd, 0, 100000, cur.approvalThresholdUsd),
    badgeForPeopleDefault: patch.badgeForPeopleDefault === undefined ? cur.badgeForPeopleDefault : !!patch.badgeForPeopleDefault,
    ...(patch.geminiPrices !== undefined ? { geminiPrices: price(patch.geminiPrices) } : cur.geminiPrices ? { geminiPrices: cur.geminiPrices } : {}),
  };
}
