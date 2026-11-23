import { canUseSrb, providerByKey, type ConnectionProvider } from "@/lib/platform/connections/catalog";

/**
 * The Integrations cards (pure, client-safe): the plain-English categories, which products use each service, and how a card's status is worked out.
 * One card per provider or service even when several products use it.
 */

export type CardStatus = "ready" | "using_srb" | "using_own" | "srb_unavailable" | "not_set_up" | "needs_attention";

export const STATUS_LABEL: Record<CardStatus, string> = {
  ready: "Ready",
  using_srb: "Included default",
  using_own: "Using your own",
  srb_unavailable: "No included default, add your own",
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
  { key: "leads", title: "Leads and applications", description: "Where your leads and job applications come from." },
  { key: "storage", title: "File storage", description: "Where uploaded files, documents and backups are kept." },
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
  if (key === "storage") return "storage";
  if (key === "dealflow-sync") return "leads";
  if (key === "social-accounts") return "social";
  return "ai";
}

/** The id a product's registry row uses for a connection: every email provider is "email", push is "push", the rest use their own key. */
export function connectionIdOf(providerKey: string): string {
  const p = providerByKey.get(providerKey);
  if (p?.group === "email") return "email";
  if (providerKey === "vapid") return "push";
  return providerKey;
}

/** The plain name of a connection id used in a product's registry row. */
export function connectionLabel(id: string): string {
  if (id === "email") return "Email";
  if (id === "push") return "Push notifications";
  if (id === "ai-chatbot") return "AI Chatbot";
  const p = providerByKey.get(id);
  return id === "elevenlabs" ? "Voice (ElevenLabs)" : (p?.name ?? id);
}

/** The fields of a registry row this needs (so the pure function is tested without the database). */
export interface RegistryProduct { key: string; name: string; connections: string[] }

/**
 * "Used by", computed from the live Product Registry: the products that declare the connection, minus the ones switched off for this company.
 * Replaces the old hand-written map, so a product that starts (or stops) using a service shows up here by changing its registry row only.
 */
export function usedByProducts(providerKey: string, registry: RegistryProduct[], unavailable: ReadonlySet<string> = new Set()): string[] {
  const id = connectionIdOf(providerKey);
  return registry.filter((p) => p.connections.includes(id) && !unavailable.has(p.key)).map((p) => p.name);
}

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
  // SelfRun could provide it but has not set it up on this deployment: say so plainly instead of pretending it works.
  if (i.canSrb) return "srb_unavailable";
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
  /** Has a real "Test connection" check. */
  testable: boolean;
  /** Changing it here changes it for every product listed in "Used by". */
  appliesToAll: true;
}

export const providerCanSrb = (p: Pick<ConnectionProvider, "key">): boolean => canUseSrb(p.key);
