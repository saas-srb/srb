import type { NavIcon } from "@/lib/products/commandos/nav";
import { productSlugFor } from "@/lib/platform/saas/product-routes";

/**
 * The Product Registry: the one place the platform keeps what each product is called, how it is described, where it lives and
 * whether it is switched on. Every listing (Workspace, onboarding, plan editors, product headers, search, back links …)
 * reads from it; the Platform Console (Products) is where it is edited.
 */

export interface PanelRecord {
  /** Route segment and stable id: `hrms` → `/talentos`. */
  key: string;
  /** The one name used everywhere (listings, headers, back link, search). */
  name: string;
  /** Short label for tight spaces (chips, breadcrumbs). */
  shortName: string;
  /** The one description used everywhere. */
  description: string;
  /**
   * Other names this product is known by in screens that still carry the old wording ("HRMS", "Standard Operating
   * Procedures"). Wherever one appears in a product screen it is shown as the product's current registry name instead:
   * an acronym becomes `shortName`, anything longer becomes `name`.
   */
  aliases: string[];
  /** Product header overrides; blank = use `name` / `description`. */
  headerTitle: string;
  headerDescription: string;
  icon: NavIcon;
  route: string;
  order: number;
  /** Core products can't be switched off (the Workspace itself). */
  core: boolean;
  /** Global switch: off = hidden and inaccessible for EVERY company. */
  active: boolean;
  /**
   * The connections this product uses (Integrations card ids: `email`, `push`, `openai`, `razorpay` …). The Integrations and Product settings
   * pages compute "Used by" from this, so a product that starts using a service is listed on that card by declaring it here, nowhere else.
   */
  connections: string[];
}

/** What the browser needs for one product (no admin fields). */
export interface PanelMeta {
  key: string;
  name: string;
  shortName: string;
  description: string;
  headerTitle: string;
  headerDescription: string;
  icon: NavIcon;
  route: string;
  order: number;
  core: boolean;
  aliases: string[];
  /** Active globally AND not switched off for this company. */
  available: boolean;
}

/**
 * Not listed in "All products" or on the dashboard: they aren't products a person switches to. ResolveIQ is the help link
 * in the sidebar, ClientOS is for the company's clients and applicants, Sites is the public website itself.
 */
export const NOT_LISTED_PRODUCTS: ReadonlySet<string> = new Set(["portal", "support", "website"]);

/** Remove the platform brand when a product name is shown inside a customer's white-label workspace. */
export function whiteLabelProductName(name: string): string {
  return name.replace(/\b(?:SelfRun|SRB)(?:\s+AI)?\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Old wording per product (unambiguous product names only — never a word that also names a feature, like "SEO" or "SOP").
 * These seed each product's `aliases`; the Platform Console can change them.
 */
const ALIASES: Record<string, string[]> = {
  hrms: ["HRMS", "Human Resource Management System", "HR & Payroll"],
  pms: ["PMS", "Project Management System", "Projects"],
  prms: ["PRMS", "Procurement Management System", "Procurement & Expense", "Procurement & Assets"],
  tms: ["TMS", "Training Management System", "Training"],
  fms: ["FMS", "Financial Management System", "Finance Management", "Finance"],
  lms: ["LMS", "Lead Management System", "Lead Management", "CRM & Sales"],
  messenger: ["Team Chat", "Team Messenger", "Team Communication"],
  sop: ["Standard Operating Procedures", "SOPs & Policies"],
  lpms: ["LPMS", "Legal & Document Automation", "Legal & Documents"],
  dlms: ["DLMS", "Digi Locker"],
  ots: ["OTS", "Online Test System", "Online Tests"],
  aibots: ["AI Bots", "AI Assistants"],
  smms: ["SMMS", "Social Media Marketing", "Social Media"],
  seo: ["Search Engine Optimization", "SEO"],
  cms: ["Website CMS", "Website"],
  portal: ["External Portal", "Client & Student Portal"],
  workspace: ["Staff Hub", "Workspace"],
  support: ["Help & Support"],
  website: ["Public Website"],
};
/** The connections each built-in product uses (what the old hand-written "Used by" map said, now held by the registry). */
const CONNECTIONS: Record<string, string[]> = {
  workspace: ["email", "push", "webhooks", "storage", "domains"],
  hrms: ["email", "push", "razorpay", "elevenlabs", "storage"],
  pms: ["email", "storage"],
  lms: ["email", "push", "twilio", "whatsapp-cloud", "livekit", "elevenlabs", "ai-chatbot", "storage"],
  fms: ["email", "razorpay", "storage"],
  prms: ["email", "razorpay", "storage"],
  tms: ["email", "razorpay", "storage"],
  messenger: ["email", "push", "livekit", "turn", "storage"],
  sop: ["email", "openai", "storage"],
  lpms: ["email", "openai", "twilio", "storage"],
  dlms: ["email", "storage"],
  ots: ["email", "storage"],
  aibots: ["email", "openai", "twilio", "elevenlabs", "storage"],
  intelligence: ["email", "openai"],
  smms: ["email", "openai", "gemini", "meta", "google", "linkedin", "x", "social-accounts", "storage"],
  seo: ["email", "openai", "google-service-account", "pagespeed"],
  cms: ["email", "push", "openai", "ai-chatbot", "elevenlabs", "google-service-account", "website-tracking", "domains", "storage"],
  portal: ["email", "push", "storage"],
  support: ["email", "openai"],
  website: ["domains", "website-tracking"],
};
/** The built-in connections for a product key (used for registry rows saved before connections existed). */
export const defaultConnections = (key: string): string[] => CONNECTIONS[key] ?? ["email"];

/** The built-in aliases for a product key (used for registry rows saved before aliases existed). */
export const defaultAliases = (key: string): string[] => ALIASES[key] ?? [];

const P = (key: string, name: string, shortName: string, description: string, icon: NavIcon, order: number, core = false): PanelRecord => ({
  key,
  name,
  shortName,
  description,
  aliases: ALIASES[key] ?? [],
  headerTitle: "",
  headerDescription: "",
  icon,
  route: `/${productSlugFor(key)}`,
  order,
  core,
  active: true,
  connections: CONNECTIONS[key] ?? ["email"],
});

/** The starter registry written on first start (and used as a fallback until it has run). */
export const DEFAULT_PANELS: PanelRecord[] = [
  P("workspace", "CommandOS", "CommandOS", "Autonomous business operating system, command center and workflow automations", "dashboard", 0, true),
  P("hrms", "TalentOS", "TalentOS", "Autonomous HR, employee directory, attendance, leave, payroll and recruitment", "users", 10),
  P("pms", "SprintOS", "SprintOS", "Agile project delivery, Kanban boards, tasks, milestones, timesheets and costing", "projects", 20),
  P("lms", "DealFlow AI", "DealFlow", "Autonomous sales CRM, lead pipeline, campaigns, deal closing and client onboarding", "grid", 30),
  P("fms", "CashFlow AI", "CashFlow", "Autonomous invoicing, accounting, payment links, bank reconciliation and ledger", "finance", 40),
  P("prms", "SpendIQ", "SpendIQ", "Autonomous procurement, purchase orders, vendor bills, asset registry and expenses", "cart", 50),
  P("tms", "Cohort AI", "Cohort AI", "Interactive training programs, batch scheduling, student curriculum and certificates", "training", 60),
  P("messenger", "Huddle AI", "Huddle", "Context-aware team chat channels, direct messaging, voice meetings and company calls", "chat", 70),
  P("sop", "Playbook AI", "Playbook", "Digital standard operating procedures, policy versioning and staff compliance", "book", 80),
  P("lpms", "ContractFlow AI", "ContractFlow", "A register of agreements and policy documents with approval history; signing and a signed-document vault are being built", "file", 90),
  P("dlms", "CyberVault", "CyberVault", "Zero-trust encrypted credential vault, sensitive document lockers and expiry alerts", "vault", 100),
  P("ots", "EvalIQ", "EvalIQ", "Timed online skill assessments, automated anti-cheat grading and verifiable certificates", "test", 110),
  P("aibots", "AgentOS", "AgentOS", "Custom AI agents, trained bots, enterprise knowledge grounding and chat copilots", "bot", 120),
  P("intelligence", "DataBrain AI", "DataBrain", "Conversational AI business intelligence, live querying and metric analytics", "chart", 130),
  P("smms", "ViralPulse AI", "ViralPulse", "AI social post generation, viral campaigns, multi-platform calendars and analytics", "megaphone", 140),
  P("seo", "RankMax AI", "RankMax", "Automated Google rank tracking, technical SEO audits, backlinks and sitemaps", "search", 150),
  P("cms", "SiteCraft AI", "SiteCraft", "No-code AI website builder, CMS, blogs, custom themes and lead conversion forms", "website", 160),
  P("portal", "ClientOS", "ClientOS", "White-label client, student, partner and applicant self-service portal", "globe", 170),
  P("support", "ResolveIQ", "ResolveIQ", "Self-solving AI customer support desk, help assistant and searchable knowledgebase", "help", 180),
  // The public website each company publishes (switching it off takes that company's public pages offline).
  { ...P("website", "Sites", "Sites", "Public company website, custom domain hosting and automatic SSL", "globe", 190), route: "/" },
];

/**
 * Not a company product: the Platform Console belongs to the SaaS provider alone (it only exists on the platform owner's
 * own host and is gated by platform roles), so it is never listed in the registry or offered to companies.
 */
export const PLATFORM_ONLY_KEYS: readonly string[] = ["platform"];

export const PANEL_KEY_RE = /^[a-z][a-z0-9-]{1,29}$/;
