import type { PolicyFinding, PolicyResult, ProductBrief, ScenePlan } from "./types";

/**
 * Content policy for AI UGC, pure and deterministic. `policyCheck` reads the brief and every word the plan would have actors say or show,
 * and returns hard blocks (cannot generate) and flags (generate only after a person acknowledges). It is a safety net before spend, not
 * legal advice: the provider's own moderation still applies afterwards.
 */

interface Rule {
  code: string;
  severity: "block" | "flag";
  message: string;
  re: RegExp;
}

const R = (code: string, severity: "block" | "flag", message: string, re: RegExp): Rule => ({ code, severity, message, re });

const RULES: Rule[] = [
  // real people
  R("public_figure", "block", "Mentions a real public figure. AI UGC must use fictional adults only.", /\b(narendra\s+modi|modi\s?ji|rahul\s+gandhi|amit\s+shah|arvind\s+kejriwal|yogi\s+adityanath|mamata\s+banerjee|donald\s+trump|joe\s+biden|barack\s+obama|elon\s+musk|mukesh\s+ambani|ratan\s+tata|virat\s+kohli|ms\s+dhoni|sachin\s+tendulkar|shah\s?rukh\s+khan|salman\s+khan|amitabh\s+bachchan|deepika\s+padukone|alia\s+bhatt|priyanka\s+chopra|ranveer\s+singh|akshay\s+kumar|taylor\s+swift|cristiano\s+ronaldo|lionel\s+messi|kim\s+kardashian)\b/i),
  R("celebrity_likeness", "block", "Asks for a celebrity, politician or other real person's likeness or voice.", /\b(look(?:s|ing)?\s+like|lookalike|resembl\w+|in the (?:style|voice) of|sounds?\s+like|impersonat\w+|deepfake|face[- ]?swap|clone (?:his|her|their|the) voice)\b[^.\n]{0,40}\b(celebrity|actor|actress|politician|minister|cricketer|influencer|president|prime minister|star|famous)\b/i),
  R("celebrity_endorsement", "block", "Implies a celebrity, politician or public figure endorses the product.", /\b(celebrity|famous (?:actor|actress|cricketer|star)|bollywood (?:star|actor|actress)|politician|minister|prime minister|president|cricketer)\b[^.\n]{0,40}\b(endorse\w*|recommend\w*|use[sd]?|love[sd]?|trust\w*|approved?)\b/i),
  R("politics", "block", "Political persuasion or election content is not allowed in AI UGC.", /\b(vote for|election campaign|political party|bjp|congress party|aap party|manifesto|election rally)\b/i),
  // minors
  R("minor_sensitive", "block", "A minor appears in a sensitive, medical, financial or adult context.", /\b(child|kid|boy|girl|teen(?:ager)?|minor|baby|toddler|school\s?(?:boy|girl)|\d{1,2}[- ]year[- ]old)\b[^.\n]{0,60}\b(medicine|medical|pill|tablet|loan|credit card|alcohol|beer|wine|vape|cigarette|smoking|betting|casino|insurance|lingerie|swimsuit|bikini|weight loss|diet|surgery)\b/i),
  R("minor_actor", "block", "UGC Studio only creates adult actors; a minor is requested as an on-screen actor.", /\b(?:child|kid|boy|girl|teen(?:ager)?|toddler|schoolchild|school\s?(?:boy|girl))\s+(?:actor|speaking|talking|reviewing|presenter|influencer|model)\b|\b(?:\d|1[0-7])[- ]year[- ]old\s+(?:boy|girl|child|kid|actor|influencer)\b/i),
  // impersonation / fake testimonials
  R("impersonation", "block", "Impersonates a real person, a real brand representative or an official body.", /\b(pretend(?:ing)? to be|posing as|impersonat\w+|speaking as|on behalf of (?:the )?(?:government|rbi|sebi|police|bank))\b/i),
  R("fake_real_customer", "block", "Presents the video as a real customer's review. AI actors are not real customers.", /\b(real customer|actual customer|genuine (?:customer|review|testimonial)|verified (?:buyer|customer|review)|true story|real story|real (?:review|testimonial)|authentic customer)\b/i),
  R("fake_authority", "block", "Claims endorsement or certification by an authority or professional body that is not provided.", /\b(doctor[- ]recommended|dentist[- ]recommended|recommended by (?:doctors|dentists|experts)|clinically proven|dermatologist[- ]tested|fda[- ]approved|icmr|ayush certified|government approved|rbi approved|sebi registered|iso certified)\b/i),
  // health / finance / legal
  R("miracle_claim", "block", "Makes a miracle or guaranteed-cure style claim.", /\b(miracle|cure[sd]?\b|100%\s*(?:cure|guarantee|safe|natural|effective|result)|permanent(?:ly)? (?:cure|fix|remove)|instant(?:ly)? (?:cure|relief|slim|fair)|overnight results?|lose \d+\s?(?:kg|kgs|pounds|lbs) in (?:a|\d+) (?:day|days|week|weeks)|no side effects?)\b/i),
  R("medical_claim", "block", "Makes a medical claim (treat, cure, prevent or diagnose a condition).", /\b(treats?|cures?|prevents?|reverses?|heals?|diagnos\w+|relieves?)\b[^.\n]{0,40}\b(diabetes|cancer|covid|hiv|aids|arthritis|asthma|thyroid|hypertension|blood pressure|cholesterol|depression|anxiety|migraine|psoriasis|eczema|infertility|piles|kidney|liver|heart (?:disease|attack)|alzheimer\w*|hair ?fall|baldness)\b/i),
  R("finance_guarantee", "block", "Guarantees financial returns or promises risk-free gains.", /\b(guaranteed (?:returns?|profit|income|earnings?)|risk[- ]free (?:returns?|investment|profit)|double your money|get rich|earn \S+ (?:per|a) (?:day|week|month) (?:guaranteed|easily|from home)|assured returns?|no[- ]risk investment)\b/i),
  R("legal_guarantee", "block", "Guarantees a legal outcome.", /\b(guaranteed (?:acquittal|win|verdict|visa|approval|bail|divorce)|100% (?:visa|approval)|we (?:always|will) win your case|visa guaranteed)\b/i),
  R("weight_loss", "flag", "Weight-loss or body-transformation content needs careful, non-guaranteed wording.", /\b(weight loss|lose weight|fat burn\w*|slim(?:ming)?|belly fat|before and after|transformation)\b/i),
  R("health_claim", "flag", "Health benefit wording: only claims supplied and substantiated by the brand may be used.", /\b(immunity|detox|boosts? (?:energy|metabolism|immunity)|anti[- ]?aging|health benefits?|cleanses?)\b/i),
  R("finance_topic", "flag", "Financial product content: check it against RBI/SEBI advertising rules and include required disclaimers.", /\b(mutual funds?|stocks?|trading|crypto|loan|credit score|insurance|investment|sip|forex|emi)\b/i),
  R("legal_topic", "flag", "Legal services content: check it against Bar Council advertising restrictions.", /\b(lawyer|advocate|law firm|legal advice|court case)\b/i),
  // adult / violent / hate / illegal
  R("adult", "block", "Adult or sexual content.", /\b(nude|nudity|naked|porn\w*|sexual\w*|sex ?toy|erotic|escort|onlyfans|nsfw|topless|strip(?:per|tease)|fetish|sensual massage)\b/i),
  R("violence", "block", "Graphic violence, weapons or self-harm.", /\b(gore|bloody|kill(?:ing|ed)?\b|murder|stab(?:bing|bed)?|shoot(?:ing)? (?:him|her|them|someone)|suicide|self[- ]harm|beheading|torture|bomb threat|terroris\w+|mass shooting|rape)\b/i),
  R("hate", "block", "Hateful content targeting a group.", /\b(hate (?:speech|crowd)|(?:all|those) (?:muslims|hindus|christians|sikhs|jews|dalits|brahmins|blacks|whites|gays|immigrants) (?:are|should)|racial slur|ethnic cleansing|inferior race|go back to your country)\b/i),
  R("illegal_products", "block", "Illegal or restricted products (drugs, weapons, counterfeits, gambling, tobacco ads).", /\b(cocaine|heroin|meth(?:amphetamine)?|mdma|lsd|weed for sale|ganja for sale|buy (?:drugs|guns|weapons)|illegal weapons?|fake (?:id|passport|currency|degree|certificate)|counterfeit|black market|hawala|online betting|satta|casino bonus|cigarette brand|hookah promo|vape for sale|prescription drugs without)\b/i),
  R("alcohol_tobacco", "block", "Alcohol, tobacco or betting promotion is restricted on social ad platforms and in India's advertising codes.", /\b(whisky|whiskey|vodka|rum brand|beer brand|buy (?:beer|wine|liquor)|cigarettes?|gutkha|pan masala|bidi|tobacco|fantasy cricket|dream11|rummy|poker|betting)\b/i),
  // competitors
  R("competitor_disparage", "block", "Disparages a competitor or compares against a named competitor with negative claims.", /\b(unlike (?:amazon|flipkart|swiggy|zomato|jio|airtel|paytm|phonepe|byju'?s|nykaa|myntra|big ?basket|ola|uber)|(?:amazon|flipkart|swiggy|zomato|jio|airtel|paytm|phonepe|byju'?s|nykaa|myntra|ola|uber) (?:is|are) (?:a )?(?:scam|fraud|worst|terrible|useless|cheat\w*|fake|rubbish))\b/i),
  R("competitor_generic", "block", "Disparages competitors (\"other brands are scams / cheat you\").", /\b(other (?:brands?|companies|sellers|shops|clinics|apps) (?:are|is) (?:a )?(?:scam|fraud|cheat\w*|fake|useless|rubbish|toxic|dangerous|unsafe)|everyone else (?:cheats|lies)|our competitors? (?:lie|cheat|are frauds?))\b/i),
  // misleading urgency / claims
  R("fake_scarcity", "flag", "Urgency or scarcity wording: only use it if it is true and supplied in the brief.", /\b(only \d+ (?:left|pieces|units|seats)|last chance|today only|hurry|limited stock|offer ends (?:today|tonight|soon)|sale ends)\b/i),
  R("superlative", "flag", "Unsubstantiated superlative (best, number one): needs proof from the brief.", /\b(no\.?\s?1|number one|#1|world'?s best|india'?s best|best in (?:india|the world|class)|market leader|unbeatable|unmatched)\b/i),
  R("price_claim", "flag", "Contains a price, discount or saving figure: it must match the brief exactly.", /(?:₹|rs\.?|inr|\$)\s?\d[\d,]*|\b\d{1,3}\s?%\s?(?:off|discount|cashback)\b|\bflat \d+\b/i),
  R("award_claim", "flag", "Contains an award or ranking claim: it must be supplied and verifiable.", /\b(award[- ]winning|winner of|rated \d(?:\.\d)?\s?(?:\/|out of)\s?5|\d+k?\+? (?:happy )?customers|trusted by \d+)\b/i),
  R("personal_data", "block", "Contains personal data (phone numbers, Aadhaar, card numbers) that must not appear in a video.", /\b(?:\+?91[- ]?)?[6-9]\d{9}\b|\b\d{4}\s\d{4}\s\d{4}\b|\b(?:\d{4}[- ]){3}\d{4}\b/),
  R("religion_sensitive", "flag", "Religious or community-sensitive subject: review carefully before publishing.", /\b(god|allah|bhagwan|mandir|masjid|church|gurudwara|religion|caste|reservation)\b/i),
  R("child_safety_topic", "flag", "Content about children's products: make sure only adults appear on screen and claims are not about child health.", /\b(baby food|infant|newborn|kids? (?:product|toy|snack|school))\b/i),
];

export function findingsIn(text: string): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    if (seen.has(rule.code)) continue;
    if (rule.re.test(text)) {
      seen.add(rule.code);
      out.push({ code: rule.code, severity: rule.severity, message: rule.message });
    }
  }
  return out;
}

const TESTIMONIAL = /\b(review(?:ing|s)?|testimonial|my experience|i (?:tried|used|bought|switched|love|have been using)|been using|honest opinion|results? (?:after|in)|unboxing|worked for me|changed my life|recommend (?:it|this))\b/i;

function briefText(b: ProductBrief): string {
  return [b.name, b.description, ...b.keyPoints, b.audience ?? "", b.callToAction ?? "", b.offer?.details ?? "", b.offer?.validity ?? "", b.offer?.code ?? "", b.offer?.terms ?? ""].join("\n");
}

export function planText(plan: ScenePlan): string {
  const parts: string[] = [plan.title];
  for (const a of plan.actors) parts.push(`${a.label} ${a.ageRange} ${a.look} ${a.wardrobe} ${a.personality}`);
  for (const s of plan.scenes) {
    parts.push(s.setting, s.visualPrompt, s.cameraNotes, s.onScreenText ?? "", s.voiceOver ?? "");
    for (const l of s.dialogue) parts.push(l.text);
  }
  return parts.join("\n");
}

/** Lowest age mentioned in an actor's age range, e.g. "25-30" -> 25, "mid 20s" -> 20, "teens" -> 13. */
export function minAge(range: string): number | null {
  const t = range.toLowerCase();
  if (/\b(teen|teens|teenage|child|kid|minor|toddler|infant|baby|schoolchild)\b/.test(t)) return 13;
  const nums = [...t.matchAll(/\d{1,2}/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return null;
  return Math.min(...nums);
}

export function policyCheck(brief: ProductBrief, plan: ScenePlan | null, opts: { illustrativeStyle?: boolean } = {}): PolicyResult {
  const findings: PolicyFinding[] = [];
  const add = (f: PolicyFinding[]) => {
    for (const x of f) if (!findings.some((y) => y.code === x.code)) findings.push(x);
  };
  add(findingsIn(briefText(brief)));
  let testimonialLike = !!opts.illustrativeStyle;
  if (plan) {
    add(findingsIn(planText(plan)));
    for (const a of plan.actors) {
      const age = minAge(a.ageRange);
      if (age === null || age < 18) add([{ code: "actor_age", severity: "block", message: `Actor "${a.label}" must be a clearly stated adult (18+); the age range "${a.ageRange}" is not allowed.` }]);
    }
    const spoken = plan.scenes.flatMap((s) => s.dialogue.map((l) => l.text)).join("\n");
    if (TESTIMONIAL.test(spoken)) testimonialLike = true;
    if (!plan.scenes.some((s) => (s.onScreenText ?? "").trim()) && testimonialLike) {
      /* the on-screen notice is added by the assembler; nothing to flag here */
    }
  }
  if (TESTIMONIAL.test(briefText(brief))) testimonialLike = true;
  const blocked = findings.filter((f) => f.severity === "block");
  const flagged = findings.filter((f) => f.severity === "flag");
  return { ok: blocked.length === 0, blocked, flagged, requiresIllustrativeNotice: testimonialLike };
}

/** Plain text for a UI/error: blocked reasons first. */
export function policySummary(r: PolicyResult): string {
  return [...r.blocked, ...r.flagged].map((f) => f.message).join(" ");
}

export const ILLUSTRATIVE_NOTICE = "Illustrative AI-generated video. Not a real customer review.";
export const AI_LABEL_TEXT = "AI generated";

export interface PlatformDisclosure {
  platform: "instagram" | "youtube" | "facebook" | "whatsapp" | "linkedin" | "x";
  /** What the person must do in the platform's own UI, where one exists. */
  action: string;
  captionSuffix: string;
}

/**
 * Caption suffixes and the platform-side labelling step per platform. Instagram/Facebook (Meta) ask creators to use the "AI info" label for
 * realistic AI video; YouTube requires the "altered or synthetic content" disclosure for realistic content; India's synthetic-media
 * (IT Rules) labelling expectations call for a clear, prominent label. The on-screen label and the metadata flag cover the rest.
 */
export function platformDisclosures(language = "en"): PlatformDisclosure[] {
  const hi = /^(hi|hindi|hinglish)/i.test(language);
  const tag = hi ? "AI-generated video (AI se banaya gaya)" : "AI-generated video";
  return [
    { platform: "instagram", action: "Turn on the \"AI info\" label when you post (Advanced settings).", captionSuffix: `#AIGenerated - ${tag}` },
    { platform: "facebook", action: "Turn on the \"AI info\" label when you post.", captionSuffix: `#AIGenerated - ${tag}` },
    { platform: "youtube", action: "Answer Yes to \"Altered or synthetic content\" in Video details.", captionSuffix: `${tag}. #AIGenerated` },
    { platform: "linkedin", action: "Mention AI generation in the post text.", captionSuffix: `${tag}.` },
    { platform: "x", action: "Use the platform's synthetic or manipulated media label if offered, and say in the post that the video is AI-generated.", captionSuffix: `${tag}.` },
    { platform: "whatsapp", action: "State in the message that the video is AI-generated.", captionSuffix: `${tag}.` },
  ];
}

export function disclosureFor(platform: string, language = "en"): PlatformDisclosure {
  return platformDisclosures(language).find((d) => d.platform === platform) ?? platformDisclosures(language)[0];
}
