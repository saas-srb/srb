/**
 * Offer rules (pure). Offer styles may only use offer details written in the brief: the discount, price, validity, coupon code and terms are
 * shown as on-screen text exactly as the brief has them, "Terms apply" is shown when the brief has terms, and urgency (countdown, "ends tonight",
 * "last few") is allowed only when the brief states a real deadline or a real stock limit.
 */
import type { ProductBrief, ScenePlan } from "./types";
import type { UgcStyle } from "./styles/types";

export interface ProductOffer {
  /** What the offer is, in the brief's own words (discount, price, what is included). Required for offer styles. */
  details: string;
  /** Dates or deadline, as written. */
  validity?: string;
  code?: string;
  terms?: string;
  /** True only when the brief says stock or places are really limited. */
  stockLimited?: boolean;
}

export const OFFER_MISSING = "Add the offer details (what the offer is, plus its dates or terms) before using an offer style. The video can only show an offer you write here.";
export const TERMS_LINE = "Terms apply";

export const hasOffer = (b: ProductBrief): boolean => !!b.offer?.details.trim();

export function offerFacts(o: ProductOffer | undefined): string[] {
  return o ? [o.details, o.validity ?? "", o.code ?? "", o.terms ?? ""].map((x) => x.trim()).filter(Boolean) : [];
}

/** Why this brief cannot be used with this style; empty when fine. */
export function offerProblems(brief: ProductBrief, style: Pick<UgcStyle, "offer" | "offerNeeds">): string[] {
  if (!style.offer) return [];
  const o = brief.offer;
  if (!o || !o.details.trim()) return [OFFER_MISSING];
  const out: string[] = [];
  if (style.offerNeeds === "validity" && !o.validity?.trim()) out.push("This style builds to a deadline. Add the offer's end date or time (validity) to the brief, or pick an offer style without a countdown. A deadline is never made up.");
  if (style.offerNeeds === "stock" && !o.stockLimited) out.push("This style says only a few are left. Tick 'Stock is limited' only if that is really true, or pick another offer style.");
  return out;
}

const numbers = (t: string) => [...t.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ""));
const flat = (t: string) => t.toLowerCase().replace(/[,\s]+/g, " ");

const DEADLINE_WORDS = /\b(ends? (?:tonight|today|soon|tomorrow)|today only|last (?:day|chance)|hurry|countdown|running out of time|hours left|days left)\b/i;
const STOCK_WORDS = /\b(last few|only a few (?:left|remain)|few (?:pieces|units|seats|slots) left|running out|almost gone|while stocks? last)\b/i;

/** Checks a finished plan: terms/validity on screen verbatim, "Terms apply", and no false urgency. */
export function offerPlanProblems(plan: ScenePlan, style: Pick<UgcStyle, "offer">): string[] {
  if (!style.offer) return [];
  const brief = plan.productBrief;
  const o = brief.offer;
  if (!o || !o.details.trim()) return [OFFER_MISSING];
  const out: string[] = [];
  const screen = flat(plan.scenes.map((s) => s.onScreenText ?? "").join(" "));
  const needed = [...numbers(`${o.details} ${o.validity ?? ""}`), ...(o.code ? [o.code.toLowerCase()] : [])];
  const missing = [...new Set(needed.filter((n) => !screen.includes(flat(n))))];
  if (missing.length) out.push(`The offer's ${missing.length > 1 ? "figures and code" : "figure or code"} (${missing.join(", ")}) must appear as on-screen text exactly as written in the brief.`);
  if (o.terms?.trim() && !new RegExp(TERMS_LINE, "i").test(screen)) out.push(`The brief has terms, so show the line "${TERMS_LINE}" as on-screen text.`);
  const spoken = plan.scenes.flatMap((s) => [s.onScreenText ?? "", s.voiceOver ?? "", ...s.dialogue.map((l) => l.text)]).join(" . ");
  if (DEADLINE_WORDS.test(spoken) && !o.validity?.trim()) out.push("The script uses deadline urgency, but the brief gives no end date or time. Remove it or add the validity to the brief.");
  if (STOCK_WORDS.test(spoken) && !o.stockLimited) out.push("The script says stock is running low, but the brief does not say stock is limited. Remove it.");
  return out;
}

export function parseOffer(input: unknown): ProductOffer | undefined {
  if (!input || typeof input !== "object") return undefined;
  const r = input as Record<string, unknown>;
  const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const details = t(r.details, 400);
  if (!details) return undefined;
  const o: ProductOffer = { details };
  const validity = t(r.validity, 160), code = t(r.code, 40), terms = t(r.terms, 400);
  if (validity) o.validity = validity;
  if (code) o.code = code;
  if (terms) o.terms = terms;
  if (r.stockLimited === true) o.stockLimited = true;
  return o;
}

/** Prompt lines for the offer in the brief. */
export function offerBriefLines(o: ProductOffer | undefined): string[] {
  if (!o) return [];
  return [
    "OFFER (copy exactly, never change or add to it):",
    `  details: ${o.details}`,
    o.validity ? `  valid: ${o.validity}` : "  valid: (no dates given: show no deadline and no countdown)",
    o.code ? `  code: ${o.code}` : "",
    o.terms ? `  terms: ${o.terms}` : "  terms: (none given)",
    o.stockLimited ? "  stock: the brief says stock is limited" : "  stock: (not stated as limited: never say 'last few')",
  ].filter(Boolean);
}
