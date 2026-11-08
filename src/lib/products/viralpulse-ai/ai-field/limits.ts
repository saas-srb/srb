import type { FieldDef, FieldKey } from "@/lib/products/viralpulse-ai/ai-field/registry";
import { PLATFORM_META, isPlatform } from "@/lib/products/viralpulse-ai/constants";

/** Request-rate limits for the field button. Counted per user and per company from the `smms_ai_field_runs` ledger. */
export const FIELD_LIMITS = {
  perUserPerMinute: 20,
  perUserPerDay: 300,
  perCompanyPerDay: 3000,
} as const;

export interface FieldCounts {
  userLastMinute: number;
  userLastDay: number;
  companyLastDay: number;
}

export interface FieldLimitCaps {
  perUserPerMinute: number;
  perUserPerDay: number;
  perCompanyPerDay: number;
}

/** The per-user daily cap follows the workspace's own "AI generations per user per day" setting (x3: fields are small calls). */
export function capsFor(dailyGenerationLimit: number): FieldLimitCaps {
  const perUserPerDay = dailyGenerationLimit > 0 ? Math.min(dailyGenerationLimit * 3, 1000) : FIELD_LIMITS.perUserPerDay;
  return { perUserPerMinute: FIELD_LIMITS.perUserPerMinute, perUserPerDay, perCompanyPerDay: FIELD_LIMITS.perCompanyPerDay };
}

export type LimitVerdict = { ok: true } | { ok: false; code: "RATE" | "LIMIT"; error: string };

/** `counts` include the request being evaluated. */
export function evaluateLimits(counts: FieldCounts, caps: FieldLimitCaps = capsFor(0)): LimitVerdict {
  if (counts.userLastMinute > caps.perUserPerMinute) return { ok: false, code: "RATE", error: `That's a lot of AI requests in a minute (limit ${caps.perUserPerMinute}). Wait a few seconds and try again.` };
  if (counts.userLastDay > caps.perUserPerDay) return { ok: false, code: "LIMIT", error: `You've reached today's limit of ${caps.perUserPerDay} AI field requests.` };
  if (counts.companyLastDay > caps.perCompanyPerDay) return { ok: false, code: "LIMIT", error: "Your workspace has reached today's limit of AI field requests. It resets tomorrow." };
  return { ok: true };
}

/**
 * The longest text a field may hold: the registry limit, tightened by the platform's own limit where the field is a
 * platform field (post body/caption/title, ad headline/body/caption).
 */
export function maxCharsFor(key: FieldKey | string, def: FieldDef, context: Record<string, unknown>): number {
  const platform = typeof context.platform === "string" ? context.platform : "";
  if (!isPlatform(platform)) return def.maxChars;
  const m = PLATFORM_META[platform];
  const head = /(?:^|\.)(?:title|headline)$/.test(key);
  const body = /(?:^|\.)(?:content|caption|primaryText)$/.test(key) && (key.startsWith("post.variant") || key.startsWith("ad.") || key.startsWith("campaign.strategy.adConcepts"));
  if (head && m.headlineLimit) return Math.min(def.maxChars, m.headlineLimit);
  if (body) return Math.min(def.maxChars, m.captionLimit);
  return def.maxChars;
}
