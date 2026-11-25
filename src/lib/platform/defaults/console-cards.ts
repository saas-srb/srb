import { CONNECTION_PROVIDERS } from "@/lib/platform/connections/catalog";
import { CONFIG_FIELDS } from "@/lib/platform/config/registry";
import { INTEGRATION_DEFAULTS } from "@/lib/platform/defaults/integration-map";
import type { SettingsCardData, SettingsCategory } from "@/components/settings/model";

/**
 * The cards of Platform Console → Integrations (the platform DEFAULT of every service), one per company Integrations card plus the platform's own services.
 * Pure: the page, the dev harness and the tests build the same cards. Every Console server key is edited in exactly ONE card's panel (`PANELS`).
 */
export const CONSOLE_PATH = "/console/integrations";

export const CONSOLE_CATEGORIES: SettingsCategory[] = [
  { key: "email", title: "Email and messaging", description: "The included email, WhatsApp, SMS and push accounts." },
  { key: "ai", title: "AI and voice", description: "The included AI, voice and meeting services." },
  { key: "search", title: "Search and website", description: "Google search data, speed checks and website services." },
  { key: "social", title: "Social media", description: "Publishing identities stay with each company." },
  { key: "payments", title: "Payments", description: "Company money always goes through the company's own account." },
  { key: "hosting", title: "Hosting and files", description: "Domains, file storage and app builds." },
  { key: "operations", title: "Platform operations", description: "Used by the platform itself, never by a company." },
];

/** What a card's panel edits. `keys` are Console server keys (config registry); the named forms are the existing specialised editors. */
export interface PanelDef { keys?: string[]; email?: true; domains?: true; previousProject?: true; blobMigration?: true }

export interface PlatformCardDef {
  key: string;
  name: string;
  description: string;
  category: string;
  kind: "default" | "company-only" | "not-available" | "platform-only";
  /** Why it is company only / not available yet, or what the platform default is used for. */
  note?: string;
  panel: PanelDef;
  /** The connection tester that can check the platform's saved values (`connections/testers.ts`). */
  tester?: string;
}

const CATEGORY: Record<string, string> = {
  smtp: "email", resend: "email", sendgrid: "email", twilio: "email", "whatsapp-cloud": "email", vapid: "email",
  openai: "ai", elevenlabs: "ai", gemini: "ai", livekit: "ai", turn: "ai",
  "google-service-account": "search", pagespeed: "search", "website-tracking": "search",
  meta: "social", google: "social", linkedin: "social", x: "social", "social-accounts": "social",
  razorpay: "payments", domains: "hosting", storage: "hosting", webhooks: "operations",
};
const TESTABLE = new Set(["smtp", "sendgrid", "twilio", "openai", "elevenlabs", "google-service-account", "pagespeed", "vapid", "livekit"]);
const NOTES: Record<string, string> = {
  twilio: "The platform's SMS sender is used only for the platform's own registered messages (sign-in and verification codes). Company-written SMS needs the company's own registered sender. Staff note: the WhatsApp sender here is never used for a company's own messages (automations, manual sends). A company without its own WhatsApp sender sees \"Add your WhatsApp sender to send this\" and the send is recorded as skipped. It is kept for the platform's own approved template messages (none are sent yet) and the operator's own workspace.",
  smtp: "Used only when the platform has no Resend account. Mail comes from the platform's verified address under the company's name, never from a company's domain.",
  sendgrid: "Used only when the platform has no Resend or SMTP account. Mail comes from the platform's verified sender under the company's name.",
};

const providerCards: PlatformCardDef[] = CONNECTION_PROVIDERS.map((p) => {
  const d = INTEGRATION_DEFAULTS[p.key];
  const base = { key: p.key, name: p.name, category: CATEGORY[p.key] ?? "operations" };
  if (d.status === "company-only") return { ...base, description: "Each company connects its own account.", kind: "company-only" as const, note: d.reason, panel: {} };
  if (d.status === "gap") return { ...base, description: "No platform default yet: each company connects its own.", kind: "not-available" as const, note: d.missing, panel: {} };
  const keys = d.keys.filter((k) => k in CONFIG_FIELDS);
  const panel: PanelDef = p.key === "resend" ? { email: true } : p.key === "domains" ? { domains: true, previousProject: true } : p.key === "storage" ? { keys, blobMigration: true } : { keys };
  return { ...base, description: "The included default for companies without their own.", kind: "default" as const, note: NOTES[p.key], panel, ...(TESTABLE.has(p.key) ? { tester: p.key } : {}) };
});

const own = (key: string, name: string, category: string, description: string, keys: string[]): PlatformCardDef => ({ key, name, category, description, kind: "platform-only", panel: { keys } });

export const PLATFORM_CARDS: PlatformCardDef[] = [
  ...providerCards,
  own("sms-dlt", "SMS registration (India DLT)", "email", "The registration of the platform's own SMS templates.", ["DLT_ENTITY_ID", "DLT_TEMPLATE_ID", "DLT_SENDER_ID"]),
  own("app-builds", "App builds (GitHub)", "hosting", "Builds companies' desktop and mobile apps.", ["GITHUB_DISPATCH_TOKEN", "GITHUB_REPOSITORY", "DESKTOP_BUILD_SECRET", "GITHUB_WORKFLOW_FILE", "DESKTOP_RELEASES_REPO"]),
  own("cron", "Scheduled jobs", "operations", "The secret every scheduled-job address requires.", ["CRON_SECRET"]),
  own("email-testing", "Email testing", "operations", "Send every email to one test inbox.", ["EMAIL_DEV_TO"]),
  own("upload-safety", "Upload safety check", "operations", "Optional VirusTotal lookup of uploaded files.", ["VIRUSTOTAL_API_KEY"]),
];

export const platformCard = (key: string): PlatformCardDef | null => PLATFORM_CARDS.find((c) => c.key === key) ?? null;
/** The card whose panel edits a Console server key (used by "fix this" links). */
export const cardOfKey = (configKey: string): string | null => PLATFORM_CARDS.find((c) => c.panel.keys?.includes(configKey))?.key ?? null;
export const consoleHref = (cardKey: string): string => `${CONSOLE_PATH}?open=${cardKey}`;

/** What the server knows about a card: is the platform default in place, and how many companies use it or their own. */
export interface CardFacts { configured: boolean; usage?: { usingDefault: number; usingOwn: number } | null }

export function consoleCardData(c: PlatformCardDef, facts: CardFacts): SettingsCardData {
  const status = c.kind === "company-only" ? "company_only" : c.kind === "not-available" || !facts.configured ? "not_set_up" : "ready";
  const usage = c.kind === "default" && facts.usage ? usageLine(facts.usage) : null;
  return { key: c.key, name: c.name, description: c.description, category: c.category, status, icon: c.category === "hosting" ? "domains" : c.category === "operations" ? "settings" : c.category === "search" ? "website" : c.category, note: usage ?? c.note ?? null, href: consoleHref(c.key) };
}

export const usageLine = (u: { usingDefault: number; usingOwn: number }): string => `${u.usingDefault} ${u.usingDefault === 1 ? "company uses" : "companies use"} this default, ${u.usingOwn} ${u.usingOwn === 1 ? "uses" : "use"} their own`;
