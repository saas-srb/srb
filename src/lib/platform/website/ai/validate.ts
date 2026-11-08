import type { RawSite } from "@/lib/platform/website/ai/generate";
import type { WebsitePlan } from "@/lib/platform/website/ai/plan";

/**
 * Checks what the AI wrote before anything is published: facts nobody gave it (numbers, prices, years, phone numbers, "best",
 * "certified", "free delivery"…), claims the business's own trade must never make (from its category playbook), words that belong to other
 * industries, text in the wrong language or script, and missing pages. Pure functions: `audit` lists the problems, `scrub` removes the
 * offending sentences from what is left after one repair attempt, so a website never goes live with an invented claim.
 */

export interface Issue { path: string; text: string; reason: string }
export interface Banned { claims: string[]; words: string[]; techBusiness: boolean }

const SCRIPTS: [RegExp, RegExp][] = [
  [/hindi \(devanagari\)|marathi|nepali|sanskrit/i, /[ऀ-ॿ]/],
  [/arabic/i, /[؀-ۿ]/],
  [/urdu|persian|farsi/i, /[؀-ۿ]/],
  [/japanese/i, /[぀-ヿ一-鿿]/],
  [/korean/i, /[가-힯]/],
  [/chinese|mandarin|cantonese/i, /[一-鿿]/],
  [/thai/i, /[฀-๿]/],
  [/russian|ukrainian|bulgarian|serbian/i, /[Ѐ-ӿ]/],
  [/bengali|bangla/i, /[ঀ-৿]/],
  [/tamil/i, /[஀-௿]/],
  [/telugu/i, /[ఀ-౿]/],
  [/gujarati/i, /[઀-૿]/],
  [/punjabi|gurmukhi/i, /[਀-੿]/],
  [/kannada/i, /[ಀ-೿]/],
  [/malayalam/i, /[ഀ-ൿ]/],
  [/greek/i, /[Ͱ-Ͽ]/],
  [/hebrew/i, /[֐-׿]/],
];
const LATIN_ONLY = /^(?!.*(devanagari|arabic|urdu|persian|farsi|japanese|korean|chinese|mandarin|cantonese|thai|russian|ukrainian|bulgarian|serbian|bengali|bangla|tamil|telugu|gujarati|punjabi|kannada|malayalam|greek|hebrew|marathi|nepali)).*$/i;

/** Things no AI can know about a business, whatever the language. */
const UNKNOWABLE: [RegExp, string][] = [
  [/\d\s?(\+|%)/, "an invented figure"],
  [/\b(19|20)\d{2}\b/, "a year (when it started?)"],
  [/\d+\s*(years?|yrs|saal|sal|anos|años|ans|jahre|tahun|ปี|年)\b/i, "years in business"],
  [/[₹$€£¥]\s?\d|\b\d+\s?(rs\.?|rupees?|inr|usd|eur|dollars?)\b/i, "a price"],
  [/\+?\d[\d\s().-]{8,}\d/, "a phone number"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, "an email address"],
  [/https?:\/\/|www\./i, "a web address"],
  // The same kinds of claim in Hindi (Roman and Devanagari) and Spanish / Portuguese / French / German, where the English pattern cannot see them.
  [/\b(purani|puraani|puraana|saalon|bharosa|bharosemand|vishwas(niya)?|imaandari|imandari|sabse (achha|accha|behtar|sasta|badhiya|sasti)|behtareen|asli|guarantee|pakki|el mejor|la mejor|garantía|garantizado|desde \d{4}|o melhor|a melhor|garantia|le meilleur|la meilleure|garanti|der beste|die beste|garantiert)\b|पुरानी|सालों|भरोसा|ईमानदारी|सबसे|गारंटी|नंबर\s?1|असली/iu, "an unproven claim"],
  [/\b(bharosa|bharose|imaandari|imandari|sabse (achha|accha|sasta|bada|behtar)|garanti|garantía|garantie|garantia|jaminan|vertrauen|confiable|confiance|terpercaya)\b|भरोसा|ईमानदार|गारंटी|सबसे (अच्छा|सस्ता|बड़ा)|ضمان|أفضل|最安|最高|信頼|保証/iu, "an unproven claim in the local language"],
  [/\b(best|no\.?\s?1|number one|top[- ]rated|leading|award[- ]winning|trusted by|world[- ]class|premium quality|lowest price|cheapest|free delivery|same[- ]day|24\/7|round the clock|family[- ]owned|since \d{4}|guarantee[ds]?|money[- ]back)\b/i, "an unproven claim"],
];

type Walk = (path: string, value: string) => void;
function walk(node: unknown, path: string, fn: Walk) {
  if (typeof node === "string") return fn(path, node);
  if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`, fn));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, fn);
}
/** Only the text a visitor reads (not slugs, icon names, block kinds or menu targets). */
const SKIP = /(\.slug|\.icon|\.kind|\.target|\.href)$|^design\b/;
const wordRe = (w: string) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");

export function audit(raw: RawSite, plan: WebsitePlan, banned: Banned, businessName: string): Issue[] {
  const issues: Issue[] = [];
  const nameLower = businessName.toLowerCase();
  const texts: { path: string; text: string }[] = [];
  walk({ pack: raw.pack, structure: raw.structure }, "", (path, text) => { if (text.trim() && !SKIP.test(path)) texts.push({ path, text }); });

  for (const { path, text } of texts) {
    const lower = text.toLowerCase();
    for (const [re, reason] of UNKNOWABLE) {
      if (re.test(text)) { issues.push({ path, text, reason }); break; }
    }
    const claim = banned.claims.find((c) => lower.includes(c));
    if (claim) issues.push({ path, text, reason: `a claim this trade must not make without proof ("${claim}")` });
    if (!banned.techBusiness) {
      const word = banned.words.find((w) => wordRe(w).test(text) && !nameLower.includes(w));
      if (word) issues.push({ path, text, reason: `"${word}" belongs to another industry` });
    }
  }

  // Language and script of the main visitor-facing text.
  const sample = `${raw.pack?.hero?.description ?? ""} ${raw.pack?.tagline ?? ""} ${raw.pack?.servicesIntro ?? ""}`;
  const expected = SCRIPTS.find(([name]) => name.test(plan.language))?.[1];
  const letters = sample.replace(/[^\p{L}]/gu, "");
  if (expected && letters.length > 10 && !expected.test(sample)) issues.push({ path: "pack.hero.description", text: sample.slice(0, 120), reason: `not written in ${plan.language}` });
  if (!expected && LATIN_ONLY.test(plan.language) && letters.length > 10) {
    const nonLatin = (letters.match(/[^\p{Script=Latin}]/gu) ?? []).length;
    if (nonLatin / letters.length > 0.3) issues.push({ path: "pack.hero.description", text: sample.slice(0, 120), reason: `not written in ${plan.language}` });
  }

  // Structure.
  const slugs = new Set((raw.structure?.extraPages ?? []).map((p: { slug?: string }) => p.slug));
  const missing = plan.pages.filter((p) => !slugs.has(p.slug)).map((p) => p.slug);
  if (missing.length > Math.floor(plan.pages.length / 2)) issues.push({ path: "structure.extraPages", text: missing.join(", "), reason: "planned pages are missing" });
  if ((raw.structure?.homeBlocks ?? []).length < 3) issues.push({ path: "structure.homeBlocks", text: "", reason: "the home page is too short" });
  return issues;
}

/** Splits text into sentences in any script. */
const SENTENCE = /(?<=[.!?।。！？؟])\s+/u;

/**
 * Removes, from every text field, the sentences that still carry an invented fact, an unprovable claim or another industry's words.
 * Fields that would end up empty are left with their first clean sentence or cleared (the website builder then drops or fills that block).
 */
export function scrub(raw: RawSite, banned: Banned, businessName: string): RawSite {
  const nameLower = businessName.toLowerCase();
  const bad = (sentence: string): boolean => {
    const lower = sentence.toLowerCase();
    if (UNKNOWABLE.some(([re]) => re.test(sentence))) return true;
    if (banned.claims.some((c) => lower.includes(c))) return true;
    if (!banned.techBusiness && banned.words.some((w) => !nameLower.includes(w) && wordRe(w).test(sentence))) return true;
    return false;
  };
  const clean = (text: string): string => {
    if (!bad(text)) return text;
    return text.split(SENTENCE).filter((s) => !bad(s)).join(" ").trim();
  };
  const apply = (node: unknown, path: string): unknown => {
    if (typeof node === "string") return SKIP.test(path) ? node : clean(node);
    if (Array.isArray(node)) return node.map((v, i) => apply(v, `${path}[${i}]`));
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, apply(v, path ? `${path}.${k}` : k)]));
    return node;
  };
  return { ...raw, pack: apply(raw.pack, "pack") as RawSite["pack"], structure: apply(raw.structure, "structure") as RawSite["structure"] };
}
