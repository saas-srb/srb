/**
 * Deterministic style ranking from industry, goal, platform and language.
 */
import { listStyles } from "./catalogue";
import { normalizeLanguage } from "./language";
import type { Goal, Platform, StyleSuggestion } from "./types";

const INDUSTRY_ALIASES: Record<string, string[]> = {
  saas: ["software", "saas", "b2b software", "it", "tech"],
  apps: ["app", "apps", "mobile app", "software"],
  food: ["food", "beverage", "grocery", "snacks", "fmcg", "f&b", "cafe", "restaurant"],
  restaurant: ["restaurant", "cafe", "qsr", "dining", "hotel"],
  d2c: ["d2c", "dtc", "ecommerce", "e-commerce", "consumer", "brand"],
  ecommerce: ["ecommerce", "e-commerce", "online store", "marketplace"],
  beauty: ["beauty", "skincare", "cosmetics", "salon", "personal care"],
  fashion: ["fashion", "apparel", "clothing", "footwear", "accessories"],
  jewellery: ["jewellery", "jewelry", "gold"],
  fitness: ["fitness", "gym", "sports", "yoga"],
  wellness: ["wellness", "health", "ayurveda", "nutrition"],
  "healthcare-info": ["healthcare", "clinic", "hospital", "pharma"],
  education: ["education", "school", "coaching", "training", "tutoring", "university"],
  edtech: ["edtech", "e-learning", "online courses"],
  finance: ["finance", "banking", "insurance", "investing", "lending"],
  fintech: ["fintech", "payments", "upi", "neobank"],
  "real-estate": ["real estate", "property", "realty", "housing"],
  home: ["home", "furniture", "decor", "interiors", "appliances", "kitchenware"],
  electronics: ["electronics", "gadgets", "consumer electronics", "mobile"],
  automotive: ["automotive", "auto", "cars", "ev", "mobility"],
  services: ["services", "agency", "consulting", "home services", "repair"],
  b2b: ["b2b", "enterprise", "manufacturing", "logistics"],
  retail: ["retail", "store", "kirana", "shop", "supermarket"],
  local: ["local", "neighbourhood", "neighborhood", "small business", "msme"],
  gifting: ["gifting", "gifts", "hampers"],
  travel: ["travel", "tourism", "tour", "holiday", "trip", "resort"],
  hospitality: ["hospitality", "hotel", "stay", "homestay"],
  salon: ["salon", "spa", "barber", "parlour", "parlor"],
  clinic: ["clinic", "dental", "diagnostic", "physio"],
  agriculture: ["agriculture", "farm", "farming", "agri", "seeds", "fertiliser", "irrigation"],
  manufacturing: ["manufacturing", "factory", "industrial", "msme", "fabrication", "engineering"],
  wedding: ["wedding", "bridal", "event planning", "shaadi", "decor planner"],
  events: ["events", "event", "conference", "expo", "meetup", "webinar"],
  hr: ["hr", "hiring", "recruitment", "staffing", "careers", "talent"],
  legal: ["legal", "law", "lawyer", "ca", "chartered accountant", "tax", "compliance", "audit"],
  media: ["media", "creator", "podcast", "publisher", "news"],
  logistics: ["logistics", "warehouse", "supply chain", "courier", "transport"],
  footwear: ["footwear", "shoes", "sandals"],
  agency: ["agency", "marketing", "advertising", "digital marketing"],
  devotional: ["devotional", "spiritual", "temple", "puja", "pooja", "bhajan", "religious"],
};

/** Words in the industry text that point to specific styles. A small, explainable bonus on top of the industry match. */
const STYLE_KEYWORDS: Record<string, string[]> = {
  "diwali-greeting-offer": ["diwali", "deepavali", "festive", "festival"], "holi-colours-moment": ["holi", "colours", "festive"], "eid-greeting-gifting": ["eid", "festive"],
  "christmas-new-year-cheer": ["christmas", "new year", "season"], "raksha-bandhan-gifting": ["rakhi", "raksha", "gifting"], "independence-day-tribute": ["independence", "republic"],
  "monsoon-comfort-chat": ["monsoon", "rain"], "wedding-season-shopping": ["wedding", "bridal", "shaadi"], "board-exam-season-support": ["board exam", "exam", "tuition", "coaching"],
  "wedding-planner-pitch": ["wedding", "event planning"], "real-estate-flat-tour": ["real estate", "property", "flat", "apartment", "builder"], "car-test-drive-showroom": ["car", "automobile", "automotive", "dealer"],
  "jewellery-counter-showcase": ["jewellery", "jewelry", "gold"], "salon-service-showcase": ["salon", "spa", "parlour", "barber"], "gym-floor-invite": ["gym", "fitness"], "clinic-reception-welcome": ["clinic", "dental", "diagnostic"],
  "restaurant-signature-dish": ["restaurant", "cafe", "qsr"], "kitchen-behind-the-scenes": ["restaurant", "cloud kitchen", "kitchen"], "travel-spot-pitch": ["travel", "tour", "tourism", "resort"],
  "coaching-institute-intro": ["coaching", "institute", "tuition", "academy"], "ca-legal-finance-awareness": ["ca", "chartered", "tax", "legal", "lawyer", "advisor"], "farm-field-talk": ["farm", "agri", "seed", "fertiliser"],
  "home-services-visit": ["plumber", "electrician", "cleaning", "repair", "home service", "ac service"], "repair-contractor-site": ["contractor", "renovation", "interior", "construction", "civil"],
  "b2b-manufacturing-capability": ["manufactur", "fabrication", "industrial", "oem"], "factory-floor-tour": ["factory", "manufactur", "warehouse"], "hiring-job-openings": ["hiring", "recruit", "jobs", "careers"],
  "internship-drive-invite": ["internship", "intern", "campus"], "webinar-promo": ["webinar", "online session", "masterclass"], "workshop-promo-invite": ["workshop", "class", "bootcamp"], "event-hall-invite": ["event", "expo", "exhibition"],
  "app-install-screen-reaction": ["app", "install", "mobile"], "lead-gen-consult-cta": ["consult", "quote", "enquiry", "lead"], "giveaway-contest-announce": ["giveaway", "contest"], "referral-loyalty-promo": ["referral", "loyalty", "membership"],
  "flash-sale-announcement": ["sale", "flash"], "end-of-season-clearance": ["clearance", "end of season"], "fashion-lookbook-walk": ["fashion", "apparel", "boutique"],
  "tech-qa-office-desk": ["software", "devops", "docker", "kubernetes", "api", "git", "cloud", "database", "cyber", "testing", "developer", "it"], "tech-qa-whiteboard": ["software", "devops", "cloud", "data", "architecture"],
  "tech-qa-screen-share": ["saas", "software", "api", "cloud", "tool"], "tech-qa-explain-like-new": ["beginner", "training", "bootcamp", "edtech", "course"], "tech-qa-rapid-fire": ["quiz", "training", "edtech", "developer"],
  "tech-qa-interviewer-candidate": ["hiring", "interview", "recruit"], "dev-works-on-my-machine": ["developer", "software", "devops", "engineering"], "dev-standup-sprint-jokes": ["agile", "scrum", "software", "developer"],
  "dev-client-vs-developer": ["agency", "freelance", "software", "web"], "dev-bug-vs-feature": ["software", "qa", "testing"], "dev-interview-jokes": ["developer", "hiring"], "dev-friday-deploy": ["devops", "deploy", "release"],
  "devotional-aarti-moment": ["devotional", "puja", "aarti", "spiritual"], "devotional-bhajan-intro": ["bhajan", "devotional", "music"], "devotional-festival-blessings": ["devotional", "festival"],
  "devotional-temple-visit-vlog": ["temple", "pilgrimage", "devotional"], "devotional-spiritual-quote": ["spiritual", "quote"],
  "parenting-tip-adult-chat": ["parenting", "baby", "kids", "family"], "school-season-prep": ["school", "stationery", "kids", "uniform"], "toy-and-book-pick": ["toy", "book", "kids"], "edu-app-walkthrough-parents": ["edtech", "learning app", "kids"],
  "news-breaking-bulletin": ["news", "media", "press"], "news-local-desk": ["local", "news"], "news-explainer-segment": ["news", "explainer"], "news-anchor-and-reporter": ["news", "media"],
  "gaming-reaction-couch": ["gaming", "esports"], "gaming-tips-chat": ["gaming"], "student-life-vlog": ["student", "college", "campus"], "travel-weekend-vlog": ["travel", "tour"], "beauty-simple-routine": ["beauty", "skincare", "grooming"],
  "money-habits-awareness": ["finance", "money", "budget", "fintech", "insurance"], "motivational-monologue": ["motivation", "coach", "fitness"], "storytime-sofa": ["story", "creator"], "comedy-everyday-skit": ["comedy", "entertainment"],
  "brand-values-statement": ["brand", "values"], "company-culture-glimpse": ["culture", "hr", "company"], "company-vision-note": ["vision", "startup"], "partnership-announcement": ["partnership", "collaboration"],
  "investor-style-progress-note": ["startup", "investor", "funding"], "service-explainer": ["service", "consult", "agency"], "process-walkthrough-steps": ["service", "process", "agency"], "how-we-work-team": ["agency", "consult", "service"],
  "pricing-from-brief": ["pricing", "plans", "saas"], "feature-highlight-spotlight": ["saas", "app", "feature"], "product-demo-walkthrough": ["product", "gadget", "demo"], "product-own-lineup-comparison": ["product", "range", "models"], "product-launch-announcement": ["launch", "product"],
  "regional-chat-local-language": ["regional", "marathi", "tamil", "telugu", "bengali", "gujarati", "kannada", "malayalam", "punjabi"], "customer-success-illustrative": ["case study", "success"],
};

/** Words in a goal text that map to a Goal. */
const GOAL_ALIASES: Record<string, Goal> = {
  conversion: "sales", conversions: "sales", purchase: "sales", signups: "leads", "sign-ups": "leads", enquiries: "leads", enquiry: "leads", registrations: "leads",
  downloads: "installs", "app installs": "installs", "walk-ins": "footfall", visits: "footfall", reach: "awareness", branding: "awareness", loyalty: "retention", recruitment: "leads", hiring: "leads",
};

function industryTags(input: string): Set<string> {
  const t = input.trim().toLowerCase();
  const out = new Set<string>();
  if (!t) return out;
  out.add(t);
  for (const [tag, aliases] of Object.entries(INDUSTRY_ALIASES)) {
    if (tag === t || aliases.some((a) => t === a || t.includes(a) || (a.length > 4 && a.includes(t) && t.length > 3))) out.add(tag);
  }
  return out;
}

const LANGUAGE_FIT: Record<string, string[]> = {
  // Styles whose speech register works best with code-mixed or Hindi chat get a small nudge.
  hinglish: ["conversation", "reaction", "street-interview", "problem-solution", "pov", "grwm", "festival", "family", "offer-sale", "direct-response", "community", "entertainment", "lifestyle", "tech-humour"],
  hi: ["conversation", "family", "festival", "local-business", "street-interview", "trades", "wellness-care", "hospitality", "devotional", "kids-parenting"],
  en: ["b2b", "podcast", "tutorial", "founder-story", "tech-demo", "explainer", "hiring", "events", "learning-finance", "social-proof", "tech-qa", "company-marketing", "product-marketing", "services-marketing"],
};

export function suggestStyles(input: { industry?: string; goal?: string; platform?: string; language?: string; limit?: number }): StyleSuggestion[] {
  const tags = industryTags(input.industry ?? "");
  const goalText = (input.goal ?? "").trim().toLowerCase();
  const goal = (GOAL_ALIASES[goalText] ?? goalText) as Goal;
  const industryText = (input.industry ?? "").trim().toLowerCase();
  const platform = (input.platform ?? "").trim().toLowerCase() as Platform;
  const lang = normalizeLanguage(input.language);

  const ranked = listStyles().map((s): StyleSuggestion => {
    let score = 0;
    const reasons: string[] = [];
    const exact = s.industries.filter((i) => tags.has(i));
    if (exact.length) {
      score += 5 + Math.min(2, exact.length - 1);
      reasons.push(`Suits ${exact[0]} businesses`);
    } else if (s.industries.includes("any")) {
      score += 2;
      reasons.push("Works across industries");
    }
    const kw = industryText ? STYLE_KEYWORDS[s.id]?.find((w) => industryText.includes(w)) : undefined;
    if (kw) {
      score += 3;
      reasons.push(`Matches "${kw}"`);
    }
    if (goal && s.goals.includes(goal)) {
      score += 3;
      reasons.push(`Good for ${goal}`);
    }
    if (platform && s.platforms.includes(platform)) {
      score += 2;
      reasons.push(`Native feel on ${platform}`);
      if (s.nativePlatform === platform) {
        score += 2;
        reasons.push(`Built for ${platform}`);
      }
    }
    if (platform && s.nativePlatform && s.nativePlatform !== platform) score -= 1.5;
    if ((platform === "linkedin" || platform === "x") && s.aspects.includes("16:9")) { score += 1; reasons.push("Has a landscape layout"); }
    if (platform && platform !== "linkedin" && platform !== "x" && s.aspects[0] === "9:16") score += 0.5;
    const fit = LANGUAGE_FIT[lang === "other" ? "" : lang === "hinglish" || lang === "hi" ? lang : "en"];
    if (fit?.includes(s.category)) {
      score += 1;
      reasons.push(`Speaking style fits ${lang === "en" ? "English" : lang === "hi" ? "Hindi" : "Hinglish"}`);
    }
    if (!reasons.length) reasons.push("General-purpose option");
    return { styleId: s.id, score: Math.round(score * 10) / 10, reasons };
  });

  ranked.sort((a, b) => b.score - a.score || (a.styleId < b.styleId ? -1 : a.styleId > b.styleId ? 1 : 0));
  return ranked.slice(0, Math.max(1, input.limit ?? ranked.length));
}
