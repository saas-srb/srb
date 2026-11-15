import { canUseSrb, providerByKey, type ConnectionProvider } from "@/lib/platform/connections/catalog";

/**
 * The Integrations cards (pure, client-safe): the plain-English categories, which products use each service, and how a card's status is worked out.
 * One card per provider or service even when several products use it.
 */

export type CardStatus = "using_srb" | "using_own" | "not_set_up" | "needs_attention";

export const STATUS_LABEL: Record<CardStatus, string> = {
  using_srb: "Using SRB",
  using_own: "Using your own",
  not_set_up: "Not set up",
  needs_attention: "Needs attention",
};

export interface CardCategory { key: string; title: string; description: string }

/** The order the cards are grouped in. */
export const CARD_CATEGORIES: CardCategory[] = [
  { key: "email", title: "Email and messaging", description: "How your workspace sends emails, WhatsApp messages and push notifications." },
  { key: "payments", title: "Payments", description: "Collect money and pay out from your own accounts." },
  { key: "ai", title: "AI and chatbot", description: "The AI that powers assistants, content and your website chatbot." },
  { key: "voice", title: "Voice and calls", description: "Phone calls, voice assistants and meeting servers." },
  { key: "website", title: "Website and SEO", description: "Google search data, speed checks and website tracking." },
  { key: "social", title: "Social media", description: "Publish to Facebook, Instagram, LinkedIn, YouTube and X." },
  { key: "webhooks", title: "Webhooks and automations", description: "Send a webhook, email or notice when something happens." },
  { key: "domains", title: "Domains", description: "Your own web address and the address your emails come from." },
];

/** Which card category a provider belongs to. */
export function categoryOf(key: string): string {
  const p = providerByKey.get(key);
  if (key === "ai-chatbot") return "ai";
  if (["email", "messaging", "push"].includes(p?.group ?? "")) return "email";
  if (p?.group === "payments") return "payments";
  if (key === "openai" || key === "gemini") return "ai";
  if (key === "elevenlabs" || p?.group === "realtime") return "voice";
  if (p?.group === "search" || key === "website-tracking") return "website";
  if (p?.group === "social") return "social";
  if (key === "webhooks") return "webhooks";
  if (key === "domains") return "domains";
  if (key === "social-accounts") return "social";
  return "ai";
}

/** Product Registry keys that use a service (names come from the registry on the page). `"*"` = every product. */
export const USED_BY: Record<string, string[]> = {
  smtp: ["*"], resend: ["*"], sendgrid: ["*"], vapid: ["*"],
  twilio: ["lms", "aibots", "lpms"], "whatsapp-cloud": ["lms"],
  openai: ["aibots", "cms", "smms", "sop", "lpms", "intelligence", "seo"], gemini: ["smms"], "ai-chatbot": ["cms", "lms"],
  elevenlabs: ["aibots", "cms", "hrms", "lms"], livekit: ["messenger"], turn: ["messenger"],
  razorpay: ["fms", "prms", "tms", "hrms"],
  "google-service-account": ["seo", "cms"], pagespeed: ["seo"], "website-tracking": ["cms"],
  meta: ["smms"], google: ["smms"], linkedin: ["smms"], x: ["smms"], "social-accounts": ["smms"],
  webhooks: ["*"], domains: ["cms"],
};

export interface StatusInput {
  /** SelfRun can run this service on its own account (see `canUseSrb`). */
  canSrb: boolean;
  /** Whether SelfRun's own account for it is actually set up on this deployment. */
  srbReady: boolean;
  /** Which account is used: "srb" (default) or "own". */
  mode: "srb" | "own";
  /** The company saved its own keys. */
  hasOwnKeys: boolean;
  /** The last "Test connection" result for the own keys, if any. */
  lastTestOk: boolean | null;
  /** A service managed on its own page (Razorpay, domains …): is it connected there? Null for ordinary services. */
  managedConnected?: boolean | null;
  /** The managed service reports a problem (a domain that failed to verify, a webhook that keeps failing). */
  managedProblem?: boolean;
}

/** Derives the badge on a card. Pure, so it is tested without a database. */
export function cardStatus(i: StatusInput): CardStatus {
  if (i.managedConnected !== undefined && i.managedConnected !== null) {
    if (i.managedProblem) return "needs_attention";
    return i.managedConnected ? "using_own" : "not_set_up";
  }
  if (i.mode === "own" && i.hasOwnKeys) return i.lastTestOk === false ? "needs_attention" : "using_own";
  // SelfRun's account (the default): fine when SelfRun provides the service and it is set up, otherwise the company needs to connect its own.
  if (i.canSrb && i.srbReady) return "using_srb";
  if (i.mode === "own" && !i.hasOwnKeys) return "not_set_up";
  return "not_set_up";
}

export interface IntegrationCard {
  key: string;
  name: string;
  description: string;
  category: string;
  status: CardStatus;
  /** Plain note under the status ("SelfRun's account is used", "Last test failed: …"). */
  note: string | null;
  usedBy: string[];
  /** How Configure behaves: opens the panel, or goes to the service's own page. */
  kind: "panel" | "page";
  href?: string;
  canSrb: boolean;
}

export const providerCanSrb = (p: Pick<ConnectionProvider, "key">): boolean => canUseSrb(p.key);

/**
 * DUPLICATE CONFIGURATION noticed while building the Integrations cards (to be removed in P7; none was changed in P5):
 *  - OpenAI key/model: the OpenAI card here, and "OpenAI key" and model fields in ViralPulse settings and AgentOS settings.
 *  - Google Search Console / Analytics: the Google card here, and the Google fields in RankMax settings and in SiteCraft's tracking settings.
 *  - Razorpay: the Razorpay card links to Payments settings, and CashFlow, SpendIQ and CohortAI each have a payments page of their own.
 *  - Push (VAPID): the Web Push card here, the Push notifications pages in CommandOS, ClientOS and SiteCraft.
 *  - Company identity (name, address, GSTIN, logo): company setup, billing details, TalentOS settings, SpendIQ settings, CashFlow tax settings, Playbook brand.
 *  - Chatbot and voice screens: SiteCraft keeps a second copy of the chatbot pages (to be redirected to this panel in P7, decision D8).
 */
export const KNOWN_DUPLICATES_FOR_P7 = true;
