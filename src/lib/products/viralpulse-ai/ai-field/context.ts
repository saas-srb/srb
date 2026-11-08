import type { FieldDef } from "@/lib/products/viralpulse-ai/ai-field/registry";
import type { FieldValue } from "@/lib/products/viralpulse-ai/ai-field/types";

/**
 * Turns what the browser sent into the context a field may read. Anything not named in the field's `readsFrom` is dropped,
 * values are coerced to plain text/lists/numbers, and the whole thing is capped, so a tampered request cannot widen what the
 * model sees or flood the prompt. Trusted data (brand, offers, company) never comes from here.
 */

export const CONTEXT_LIMITS = { perValue: 1500, perJson: 3000, total: 8000, listItems: 40 } as const;

export type CleanContext = Record<string, string | number | string[]>;

function coerce(v: unknown): string | number | string[] | null {
  if (typeof v === "string") return v.trim().slice(0, CONTEXT_LIMITS.perValue) || null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) {
    const flat = v.filter((x) => typeof x === "string" || typeof x === "number").map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, CONTEXT_LIMITS.listItems);
    if (flat.length) return flat;
    if (v.length && v.every((x) => x && typeof x === "object")) return JSON.stringify(v).slice(0, CONTEXT_LIMITS.perJson);
    return null;
  }
  if (v && typeof v === "object") {
    try {
      return JSON.stringify(v).slice(0, CONTEXT_LIMITS.perJson);
    } catch {
      return null;
    }
  }
  return null;
}

export function sanitizeContext(def: FieldDef, raw: Record<string, unknown> | null | undefined): CleanContext {
  const out: CleanContext = {};
  let used = 0;
  for (const k of def.readsFrom) {
    const c = coerce(raw?.[k]);
    if (c === null) continue;
    const size = typeof c === "string" ? c.length : Array.isArray(c) ? c.join("").length : String(c).length;
    if (used + size > CONTEXT_LIMITS.total) continue;
    used += size;
    out[k] = c;
  }
  return out;
}

/** Everything the person wrote that the model may rely on as fact: the context values plus the field's current text. */
export function allowedCorpus(ctx: CleanContext, current: FieldValue | null, extra: string[] = []): string[] {
  const parts: string[] = [];
  for (const v of Object.values(ctx)) parts.push(Array.isArray(v) ? v.join("\n") : String(v));
  if (current !== null && current !== undefined) parts.push(Array.isArray(current) ? current.join("\n") : String(current));
  return [...parts, ...extra].filter(Boolean);
}

export function coerceCurrent(def: FieldDef, v: unknown): FieldValue | null {
  if (v === null || v === undefined) return null;
  if (def.kind === "list" || def.kind === "multienum") {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 400)).filter(Boolean).slice(0, 60);
    if (typeof v === "string") return v.split("\n").map((x) => x.trim().slice(0, 400)).filter(Boolean).slice(0, 60);
    return null;
  }
  if (def.kind === "number") {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "string") return v.slice(0, 8000);
  if (typeof v === "number") return String(v);
  return null;
}

/** The campaign brief as AI context (what the campaign, ad and strategy fields read). Structural type so client and server share it. */
export function campaignBriefContext(c: { name: string; objective: string; platforms: readonly string[]; targetAudience: string; industry: string; location: string; budget: number | null; currency: string; startDate: Date | string | null; endDate: Date | string | null; cta: string; landingPage: string; offerService: string; offerId: string | null; clientId: string | null; brandInfo: string; keywords: readonly string[]; tone: string; language: string }): Record<string, unknown> {
  const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  return {
    name: c.name, objective: c.objective, platforms: [...c.platforms], targetAudience: c.targetAudience, industry: c.industry, location: c.location,
    budget: c.budget ?? "", currency: c.currency, startDate: day(c.startDate), endDate: day(c.endDate), cta: c.cta, landingPage: c.landingPage, offerService: c.offerService,
    offerId: c.offerId ?? "", clientId: c.clientId ?? "", brandInfo: c.brandInfo, keywords: [...c.keywords], tone: c.tone, language: c.language,
  };
}
