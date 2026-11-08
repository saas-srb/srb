import { findingsIn } from "@/lib/products/viralpulse-ai/ugc/policy";
import type { PolicyFinding } from "@/lib/products/viralpulse-ai/ugc/types";
import type { Consent } from "@/lib/products/viralpulse-ai/images/types";

/**
 * Content policy for AI images, pure and deterministic. It reads everything the picture is built from (subject, product, style,
 * the negative list, the edit instruction) and every word that will be printed on it, and returns hard blocks (cannot generate) and
 * flags (generate only after the person acknowledges). A safety net before spend, not legal advice: the provider's own moderation
 * still applies afterwards. The generic text rules (public figures, medical / finance guarantees, adult, hate, illegal products...)
 * are shared with the AI UGC Studio so the two tools never disagree.
 */

export interface ImagePolicyInput {
  subject?: string;
  product?: string;
  style?: string;
  negative?: string;
  /** Words printed on the picture, one entry per slide. */
  overlayText?: string[];
  /** A free instruction ("make the background warmer") for an edit. */
  instruction?: string;
  /** Anything else typed into a prompt box. */
  prompt?: string;
  goalId?: string;
  hasReferenceImages?: boolean;
  consent?: Consent | null;
}

export interface ImagePolicyResult {
  ok: boolean;
  blocked: PolicyFinding[];
  flagged: PolicyFinding[];
  /** The picture may look like a real photograph of people: the visible "AI generated" badge should default ON. */
  suggestAiBadge: boolean;
}

const BRANDS = "nike|adidas|puma|reebok|apple|iphone|samsung|google|microsoft|amazon|flipkart|coca[- ]?cola|pepsi|mcdonald'?s|kfc|starbucks|disney|marvel|pixar|netflix|spotify|tata|reliance|jio|airtel|paytm|phonepe|zomato|swiggy|louis vuitton|gucci|prada|rolex|ferrari|lamborghini|tesla|bmw|mercedes|toyota|honda|facebook|instagram|youtube|whatsapp|twitter|linkedin|tiktok|openai|nvidia|intel|sony|ikea|patanjali|amul|nestle|unilever|hdfc|icici|sbi";
const CHARACTERS = "mickey mouse|minnie mouse|spider-?man|batman|superman|iron man|hulk|pikachu|pok[eé]mon|hello kitty|doraemon|chh?ota bheem|harry potter|super mario|minions?|elsa|barbie|donald duck|winnie the pooh|peppa pig|shin-?chan|naruto|goku|simba";

interface Rule {
  code: string;
  severity: "block" | "flag";
  message: string;
  re: RegExp;
}
const R = (code: string, severity: "block" | "flag", message: string, re: RegExp): Rule => ({ code, severity, message, re });

const RULES: Rule[] = [
  R("likeness_request", "block", "Asks for a picture that looks like, or swaps in, a specific real person. Images must use fictional people, or people who gave their consent through a reference photo.", /\b(look(?:s|ing)?\s+(?:exactly\s+)?like|lookalike|resembl\w+|in the likeness of|face[- ]?swap|swap (?:the |his |her )?face|deep[- ]?fake|clone (?:his|her|their) (?:face|look))\b/i),
  R("brand_logo", "block", "Asks for another company's logo, packaging or branding. Only marks you own or are licensed to use may appear.", new RegExp(`\\b(?:${BRANDS})\\b[^.\\n]{0,25}\\b(?:logo|logotype|emblem|trademark|packaging|trade dress|branding|brand mark)\\b|\\b(?:logo|logotype|emblem|trademark|packaging|branding)\\b[^.\\n]{0,25}\\b(?:of|from|like|by)\\s+(?:${BRANDS})\\b`, "i")),
  R("brand_name", "flag", "Names another company's brand. Do not show or imitate a brand you do not own or have rights to.", new RegExp(`\\b(?:${BRANDS})\\b`, "i")),
  R("protected_character", "block", "Asks for a protected cartoon, film or game character. Those are copyrighted; use your own original character.", new RegExp(`\\b(?:${CHARACTERS})\\b`, "i")),
  R("government_emblem", "block", "Asks for a government emblem, seal or national symbol. Using them in advertising is restricted by law in India.", /\b(national emblem|state emblem|ashok(?:a)? (?:chakra|pillar|stambh|emblem)|lion capital|government (?:logo|seal|emblem)|rbi (?:logo|seal)|sebi (?:logo|seal)|tricolou?r (?:flag )?(?:on|with) (?:the )?(?:product|ad))\b/i),
  R("certification_mark", "flag", "Shows a certification mark (FSSAI, ISI, BIS, ISO...). Only use one you hold; do not draw it with AI.", /\b(fssai|isi mark|bis (?:mark|hallmark)|iso[- ]?\d{4,5}|ayush mark|agmark)\b/i),
  R("fake_document", "block", "Asks for a fake news headline, screenshot, certificate, receipt or ID, which can mislead people.", /\b(fake|forged|counterfeit|doctored)\s+(?:news|headline|screenshot|certificate|receipt|id|passport|aadhaar|pan card|invoice|review|testimonial|degree)\b/i),
  R("nazi_hate_symbol", "block", "Hate symbols are not allowed.", /\b(nazi|hakenkreuz|ss bolts?|kkk|white power|heil hitler|confederate flag|neo-?nazi|swastika\s+(?:flag|armband))\b/i),
  R("sexualised", "block", "Sexualised or revealing imagery is not allowed.", /\b(sexy|seductive|erotic|cleavage|busty|provocative(?:ly)?|lingerie|topless|nude|nsfw|bare (?:chest|breasts?)|sensual)\b/i),
  R("minor_sexual", "block", "A minor in any sexual or revealing context is never allowed.", /\b(child|kid|boy|girl|teen(?:ager)?|minor|toddler|schoolgirl|schoolboy|underage)\b[^.\n]{0,50}\b(sexy|nude|naked|bikini|swimsuit|lingerie|seductive|provocative|topless)\b/i),
  R("minor_present", "flag", "A child or teenager may appear. Only use pictures of minors with a parent or guardian's written consent, and avoid health, money or adult subjects.", /\b(child(?:ren)?|kids?|baby|babies|toddler|teen(?:ager)?s?|minor|schoolchild(?:ren)?|school ?(?:boy|girl)|infant|newborn|\d{1,2}[- ]year[- ]old)\b/i),
  R("weapons", "flag", "Shows weapons. Ad platforms usually reject them; remove them unless essential.", /\b(guns?|rifles?|pistols?|revolvers?|knife|knives|swords?|grenades?|bombs?|explosives?|ammunition|assault weapon)\b/i),
  R("drugs_props", "block", "Shows illegal drugs or drug use.", /\b(syringe (?:with|and) drugs|cocaine|heroin|meth|crack pipe|marijuana leaf|joint|bong|snorting|injecting drugs)\b/i),
  R("alters_real_person", "flag", "Changes the body or face of a person in a reference photo. Only do this with that person's consent and never to mislead.", /\b(make (?:her|him|them|me) (?:look )?(?:thinner|slimmer|younger|fatter|older|taller|fairer|lighter[- ]skinned|darker)|slim(?:mer)? (?:her|him)|change (?:her|his|their) (?:skin|face|body|ethnicity|age|gender)|lighten (?:her|his) skin|remove (?:her|his) (?:clothes|clothing))\b/i),
  R("medical_before_after", "block", "A before-and-after picture of a body or medical result is not allowed.", /\b(before\s*(?:and|&|\/|-|vs\.?)\s*after|transformation photo)\b[^.\n]{0,40}\b(weight|body|skin|hair|fat|belly|treatment|clinic|surgery|face)\b/i),
  R("contact_number", "flag", "A phone number will be printed on the picture. Check it digit by digit before publishing.", /(?:\+?91[- ]?)?[6-9]\d{9}\b/),
  R("secret_id_number", "block", "Contains an Aadhaar, card or similar number, which must never be printed on an image.", /\b\d{4}\s\d{4}\s\d{4}\b|\b(?:\d{4}[- ]){3}\d{4}\b/),
  R("political_content", "block", "Political persuasion or election content is not allowed.", /\b(vote for|election (?:campaign|rally|poster)|political party|manifesto|campaign poster)\b/i),
  R("violence_gore", "block", "Graphic violence, gore or self-harm is not allowed.", /\b(gore|bloody|blood[- ]soaked|dead body|corpse|severed|mutilat\w+|self[- ]harm|suicide|beheading|torture|lynching)\b/i),
  R("religious_sensitive", "flag", "A religious symbol or place is shown. Check it is accurate and respectful before publishing.", /\b(mosque|masjid|temple|mandir|church|gurudwara|quran|bible|bhagavad|om symbol|cross|crescent|deity|idol)\b/i),
  R("scarcity_in_text", "flag", "Urgency wording on the picture. Use it only if it is true.", /\b(last chance|only \d+ (?:left|pieces)|hurry|ends (?:today|tonight)|today only|limited stock)\b/i),
  R("guarantee_overlay", "block", "Guarantees a result, return or cure on the picture.", /\b(guaranteed?|assured|100%\s*(?:safe|natural|effective|result|genuine|cure)|risk[- ]free|no side effects?)\b[^.\n]{0,30}\b(results?|returns?|profit|cure|income|approval|relief|weight loss|growth)\b/i),
];

/** Words that make a picture of "people" likely to be realistic; styles that make it clearly not a photograph. */
const PEOPLE = /\b(person|people|man|men|woman|women|boy|girl|child|kids?|family|couple|customer|client|doctor|nurse|teacher|student|worker|model|founder|team|crowd|portrait|selfie|face|smiling|shopkeeper|farmer|athlete|chef|driver)\b/i;
const NOT_PHOTO = /\b(illustration|illustrated|cartoon|vector|flat design|icon|isometric|3d render|clay|anime|pixel art|line art|watercolou?r|sketch|infographic|abstract|silhouette)\b/i;

const dedupe = (items: PolicyFinding[]): PolicyFinding[] => {
  const seen = new Set<string>();
  return items.filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)));
};

export function policyCheck(input: ImagePolicyInput): ImagePolicyResult {
  const visual = [input.subject, input.product, input.style, input.instruction, input.prompt].filter(Boolean).join("\n");
  const printed = (input.overlayText ?? []).filter(Boolean).join("\n");
  const all = [visual, input.negative ?? "", printed].join("\n");
  const found: PolicyFinding[] = [];

  // Shared text rules, minus the video-only ones that do not apply to a still or that this tool handles itself.
  const SKIP = new Set(["personal_data", "religion_sensitive", "minor_actor", "price_claim", "superlative"]);
  for (const f of findingsIn(`${visual}\n${printed}`)) if (!SKIP.has(f.code)) found.push(f);
  // Prices and superlatives matter only for words that will be printed: a price in the picture must match the offer.
  if (printed) for (const f of findingsIn(printed)) if (f.code === "price_claim" || f.code === "superlative") found.push(f);

  // The negative list says what NOT to draw ("no logos, no children"), so it is checked only against the strictest rules.
  const negative = input.negative ?? "";
  for (const rule of RULES) {
    const text = rule.code === "contact_number" || rule.code === "secret_id_number" || rule.code === "guarantee_overlay" || rule.code === "scarcity_in_text" ? printed : visual;
    if (text && rule.re.test(text)) found.push({ code: rule.code, severity: rule.severity, message: rule.message });
  }

  const hasPeopleRef = !!input.hasReferenceImages && !!input.consent?.showsPeople;
  if (input.hasReferenceImages) {
    const c = input.consent;
    if (c?.publicFigure) found.push({ code: "public_figure_reference", severity: "block", message: "A reference photo shows a public figure or celebrity. Their likeness cannot be used." });
    if (c?.showsPeople && !c.attested) found.push({ code: "consent_missing", severity: "block", message: "Confirm that every person in the reference photos agreed to be used in this image." });
    if (!c) found.push({ code: "consent_missing", severity: "block", message: "Say whether the reference photos show people, and confirm the right to use them." });
  }

  const deduped = dedupe(found);
  const blocked = deduped.filter((f) => f.severity === "block");
  const flagged = deduped.filter((f) => f.severity === "flag");
  const peopleLikely = PEOPLE.test(all.replace(negative, "")) || hasPeopleRef;
  const suggestAiBadge = peopleLikely && !NOT_PHOTO.test(`${input.style ?? ""} ${input.subject ?? ""}`);
  return { ok: blocked.length === 0, blocked, flagged, suggestAiBadge };
}

/** Flags that need the person's explicit acknowledgement are listed by code; this is what the UI sends back as "acknowledged". */
export function unacknowledged(result: ImagePolicyResult, acknowledged: readonly string[]): PolicyFinding[] {
  const ack = new Set(acknowledged);
  return result.flagged.filter((f) => !ack.has(f.code));
}

// ── Text printed on the picture ─────────────────────────────────────────────

/** Scripts the bundled fonts can draw. Anything else would render as empty boxes, so it is refused with a clear message. */
const SUPPORTED = /^[\p{Script=Latin}\p{Script=Devanagari}\p{N}\p{P}\p{S}\p{Z}\n‌‍]*$/u;
const EMOJI = /\p{Extended_Pictographic}/u;

export interface OverlayCheck {
  ok: boolean;
  message: string | null;
}

export function checkOverlayText(text: string): OverlayCheck {
  const t = text.trim();
  if (!t) return { ok: true, message: null };
  if (t.length > 160) return { ok: false, message: "Keep the text on the picture under 160 characters." };
  if (t.split("\n").length > 6) return { ok: false, message: "Use at most 6 lines of text on the picture." };
  if (EMOJI.test(t)) return { ok: false, message: "Emoji can't be drawn on the picture. Remove them or use words." };
  if (!SUPPORTED.test(t)) return { ok: false, message: "That text uses a script the app has no font for. English and Hindi (Devanagari) text can be drawn on pictures." };
  return { ok: true, message: null };
}

export const hasDevanagari = (s: string) => /\p{Script=Devanagari}/u.test(s);
