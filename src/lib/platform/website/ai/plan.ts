import { getPrompt } from "@/lib/prompts/store";
import "server-only";
import { getOpenAI } from "@/lib/openai";
import OpenAI from "openai";
import { BLOCK_KINDS } from "@/lib/platform/website/starter-packs";
import type { WebsiteBrief } from "@/lib/platform/website/ai/generate";

/**
 * Step one of building a website: think about THIS business, and the people who will use its site, before any page is written.
 *
 * The platform is used by everyone: people who read well and people who barely read, villagers and city people, traditional and very
 * modern businesses, tiny street traders and large enterprises, schools, hospitals, charities and government offices, in every country
 * and language. So nothing here is a fixed template. From the business's categories and sub-categories (plus anything we know about where
 * the owner is) the planner decides who the visitors are and how they prefer to reach a business, which language and script to write in,
 * which pages exist and what they are called, how the home page flows, what the site should feel like, and writes the full "website
 * building prompt" the second step follows. It is stated openly (in `assumptions`) whenever it had to guess.
 *
 * Planning can never fail the whole website: if the AI cannot produce a valid plan after several tries (and a smaller model), a sensible
 * plan is built from the categories alone (`fallbackPlan`).
 */

export const ACTIONS = ["call", "whatsapp", "book", "order", "visit", "enquire"] as const;
const PURPOSES = ["sell", "book", "showcase", "inform", "portfolio", "community"] as const;
const SCALES = ["individual", "micro", "small", "medium", "large", "enterprise", "institution", "nonprofit", "government", "creator", "student"] as const;
const SETTINGS = ["village", "town", "city", "online", "regional", "global"] as const;
const LITERACY = ["low", "mixed", "high", "professional"] as const;

export interface WebsitePlan {
  /** Where this plan came from: the AI, or the built-in fallback. */
  source: "ai" | "fallback";
  audience: string;
  scale: (typeof SCALES)[number];
  setting: (typeof SETTINGS)[number];
  /** How comfortable the visitors are with reading and with technology. */
  literacy: (typeof LITERACY)[number];
  purpose: (typeof PURPOSES)[number];
  /** The language (and script) all visitor-facing text is written in, e.g. "Hinglish (Hindi in English letters)", "Spanish", "Arabic". */
  language: string;
  direction: "ltr" | "rtl";
  /** The country the plan assumed, and how visitors there prefer to contact a business ("WhatsApp", "LINE", "phone call", "email"). */
  assumedCountry: string;
  preferredChannel: string;
  tone: string;
  lookAndFeel: string;
  vocabulary: { offerings: string; offeringsOne: string; mainAction: string };
  primaryAction: (typeof ACTIONS)[number];
  needsAccounts: boolean;
  pages: { slug: string; title: string; navLabel: string; purpose: string }[];
  /** The URL word for the page of each single offering ("treatments" -> /treatments/<offering>). */
  offeringBase: string;
  homeOutline: { kind: (typeof BLOCK_KINDS)[number]; purpose: string }[];
  /** What the planner had to guess (shown to the owner so they can correct the prompt). */
  assumptions: string[];
  /** The complete brief the website is written from. Shown in CMS → AI Website. */
  sitePrompt: string;
}

const str = { type: "string" } as const;
const en = (v: readonly string[]) => ({ type: "string", enum: [...v] }) as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false }) as const;
const list = (items: unknown) => ({ type: "array", items }) as const;

const SCHEMA = obj({
  audience: str,
  scale: en(SCALES),
  setting: en(SETTINGS),
  literacy: en(LITERACY),
  purpose: en(PURPOSES),
  language: str,
  direction: en(["ltr", "rtl"]),
  assumedCountry: str,
  preferredChannel: str,
  tone: str,
  lookAndFeel: str,
  vocabulary: obj({ offerings: str, offeringsOne: str, mainAction: str }),
  primaryAction: en(ACTIONS),
  needsAccounts: { type: "boolean" },
  pages: list(obj({ slug: str, title: str, navLabel: str, purpose: str })),
  offeringBase: str,
  homeOutline: list(obj({ kind: en(BLOCK_KINDS), purpose: str })),
  assumptions: list(str),
  sitePrompt: str,
});


async function client(): Promise<OpenAI> {
  // The company's metered client: planning the site counts against its AI-token allowance like everything else.
  return getOpenAI({ timeoutMs: 90_000, maxRetries: 1 });
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);
const NEEDS_OWNER_FACTS = /\b(team|staff|doctors?|founder|story|history|gallery|photos?|videos?|testimonials?|reviews?|awards?|clients?|branches|locations?|timings?|hours|prices?|pricing|careers?|jobs?|news|find[- ]us|visit[- ]us|directions|address|map|how[- ]to[- ](reach|find|get[- ]here)|where[- ]we)\b|\bour (story|team|clients|doctors)\b/i;
const RESERVED = new Set(["contact", "privacy-policy", "login", "register", "portal", "api", "workspace", "platform", "cms"]);

/** Cleans whatever the AI returned into a valid plan, filling gaps with safe defaults. Returns null only when it is unusable. */
function repair(raw: Partial<WebsitePlan> | null | undefined, b: WebsiteBrief, ownerMode = false): WebsitePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const seen = new Set<string>();
  const pages = (Array.isArray(raw.pages) ? raw.pages : []).flatMap((p) => {
    const slug = s(p?.slug, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    const title = s(p?.title, 80);
    if (!slug || !title || RESERVED.has(slug) || seen.has(slug) || (!ownerMode && NEEDS_OWNER_FACTS.test(`${slug} ${s(p?.title, 80)}`))) return [];
    seen.add(slug);
    return [{ slug, title, navLabel: s(p?.navLabel, 30) || title.slice(0, 30), purpose: s(p?.purpose, 240) || title }];
  }).slice(0, 8);
  const homeOutline = (Array.isArray(raw.homeOutline) ? raw.homeOutline : []).filter((h) => (BLOCK_KINDS as readonly string[]).includes(h?.kind)).slice(0, 9).map((h) => ({ kind: h.kind, purpose: s(h.purpose, 200) }));
  const offeringBase = s(raw.offeringBase, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "offerings";
  if (pages.length < 1 || homeOutline.length < 3 || s(raw.sitePrompt, 5000).length < 150) return null;
  const language = s(raw.language, 60) || "English (simple)";
  return {
    source: "ai",
    audience: s(raw.audience, 400) || `People looking for ${b.categories[0] ?? "this kind of business"}.`,
    scale: pick(raw.scale, SCALES, "small"), setting: pick(raw.setting, SETTINGS, "town"), literacy: pick(raw.literacy, LITERACY, "mixed"),
    purpose: pick(raw.purpose, PURPOSES, "inform"),
    language,
    direction: raw.direction === "rtl" ? "rtl" : "ltr",
    assumedCountry: s(raw.assumedCountry, 60) || b.country || "not known",
    preferredChannel: s(raw.preferredChannel, 40) || "phone call",
    tone: s(raw.tone, 200) || "plain and friendly",
    lookAndFeel: s(raw.lookAndFeel, 600) || "Clean and friendly, with one confident brand colour and plenty of space.",
    vocabulary: { offerings: s(raw.vocabulary?.offerings, 40) || "What we offer", offeringsOne: s(raw.vocabulary?.offeringsOne, 40) || "Offering", mainAction: s(raw.vocabulary?.mainAction, 30) || "Contact us" },
    primaryAction: pick(raw.primaryAction, ACTIONS, "enquire"),
    needsAccounts: raw.needsAccounts === true, pages, offeringBase: RESERVED.has(offeringBase) || seen.has(offeringBase) ? `${offeringBase}-list` : offeringBase, homeOutline,
    assumptions: (Array.isArray(raw.assumptions) ? raw.assumptions : []).map((a) => s(a, 220)).filter(Boolean).slice(0, 6),
    sitePrompt: s(raw.sitePrompt, 5000),
  };
}

/** A sensible plan from the categories alone, used only when the AI could not produce one. Plain, safe and honest. */
export function fallbackPlan(b: WebsiteBrief): WebsitePlan {
  const main = b.categories[0] ?? b.subCategories[0]?.name ?? "this business";
  const offers = (b.subCategories.length ? b.subCategories.map((x) => x.name) : b.categories).slice(0, 4).join(", ");
  const hindi = /^hi\b|^hi-/i.test((b.hints?.languages ?? "").trim()) || b.hints?.country === "IN" && /^hi/i.test(b.hints?.languages ?? "");
  const language = hindi ? "Hinglish (Hindi in English letters)" : "English (simple)";
  return {
    source: "fallback",
    audience: `People who need ${main.toLowerCase()} and want a simple way to find out what is offered and get in touch.`,
    scale: "small", setting: "town", literacy: "mixed", purpose: "inform", language, direction: "ltr",
    assumedCountry: b.hints?.country || b.country || "not known", preferredChannel: "phone call or message",
    tone: "plain, short and friendly",
    lookAndFeel: "Clean and friendly with one confident brand colour, large readable text, plenty of space and simple icons.",
    vocabulary: { offerings: hindi ? "Hamari sevayein" : "What we offer", offeringsOne: hindi ? "Seva" : "Offering", mainAction: hindi ? "Humse sampark karein" : "Contact us" },
    primaryAction: "enquire", needsAccounts: false,
    offeringBase: "offerings",
    pages: [
      { slug: "what-we-offer", title: hindi ? "Hum kya karte hain" : "What we offer", navLabel: hindi ? "Hamari sevayein" : "What we offer", purpose: `List what ${b.name} offers (${offers}).` },
      { slug: "how-it-works", title: hindi ? "Kaise kaam hota hai" : "How it works", navLabel: hindi ? "Kaise" : "How it works", purpose: "Explain how to get started in a few simple steps." },
    ],
    homeOutline: [
      { kind: "services-grid", purpose: "Show the main offerings." },
      { kind: "features", purpose: "Short points about what to expect, without claims." },
      { kind: "steps", purpose: "How to get started." },
      { kind: "faq", purpose: "Common questions, answered by inviting the visitor to ask." },
      { kind: "cta", purpose: "Invite the visitor to get in touch." },
    ],
    assumptions: ["The AI could not plan this site, so a simple plan was built from your categories.", `Language assumed: ${language}.`],
    sitePrompt: `This website is for ${b.name}, a ${main.toLowerCase()} business that offers ${offers || "its products and services"}. Visitors are people who need this kind of work and want a clear, quick way to see what is offered and to get in touch. Write all text in ${language} using short, familiar words. The home page opens with a clear headline that says what the business does, then shows the main offerings, a few short points about what to expect, simple steps to get started, a few common questions answered by inviting the visitor to ask, and a closing invitation to get in touch. The site has two supporting pages: one listing what the business offers and one explaining how to get started, plus the contact and privacy pages. The main action is to get in touch. The look is clean and friendly, with one confident brand colour, large readable text and plenty of space. Do not invent any facts: no prices, hours, address, years in business, customers, awards or guarantees. Wherever a detail is unknown, invite the visitor to ask.`,
  };
}

export async function planWebsite(b: WebsiteBrief, knowledge = "", ownerPrompt = ""): Promise<WebsitePlan> {
  // No OpenAI key at all: this throws, and the caller reports it (the website cannot be written without AI).
  const c = await client();
  const hints = b.hints ?? {};
  const user = await getPrompt("website.plan.user", {
    name: b.name,
    categories: b.categories.join("; ") || await getPrompt("website.not_stated"),
    sub_categories: b.subCategories.map((x) => `${x.name} (${x.category})`).join("; ") || await getPrompt("website.not_stated"),
    country: b.country || await getPrompt("website.not_stated"),
    hint_country: hints.country || await getPrompt("website.unknown"),
    hint_languages: hints.languages || await getPrompt("website.unknown"),
    hint_timezone: hints.timezone || await getPrompt("website.unknown"),
    knowledge_block: knowledge ? await getPrompt("website.plan.knowledge", { knowledge }) : "",
    owner_block: ownerPrompt ? await getPrompt("website.plan.owner", { owner_prompt: ownerPrompt.slice(0, 4000) }) : "",
  });
  const system = await getPrompt("website.plan.system", { block_kinds: BLOCK_KINDS.join(", ") });
  const primary = process.env.WEBSITE_AI_MODEL || "gpt-4.1";
  const attempts: { model: string; temperature: number }[] = [
    { model: primary, temperature: 0.8 },
    { model: primary, temperature: 0.5 },
    { model: process.env.WEBSITE_AI_FALLBACK_MODEL || "gpt-4.1-mini", temperature: 0.4 },
  ];
  for (const a of attempts) {
    try {
      const res = await c.chat.completions.create({
        model: a.model,
        temperature: a.temperature,
        max_completion_tokens: 5000,
        response_format: { type: "json_schema", json_schema: { name: "plan", strict: true, schema: SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      });
      const plan = repair(JSON.parse(res.choices[0]?.message?.content ?? "null"), b, !!ownerPrompt);
      if (plan) return plan;
    } catch (err) {
      console.error("[ai-website] plan attempt failed", a.model, err instanceof Error ? err.message : err);
    }
  }
  console.error("[ai-website] planning failed; using the built-in plan for", b.name);
  return fallbackPlan(b);
}
