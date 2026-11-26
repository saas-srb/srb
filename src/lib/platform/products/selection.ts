import { MODULES, type ModuleKey } from "@/lib/platform/onboarding/catalog";

/**
 * Which products a company owns (chosen at sign-up, changed from Billing or the Platform Console) and whether it has a
 * website with us. Pure and client-safe: the sign-up form, the billing screens and the server all read these rules.
 * See docs/standalone-products-plan.md.
 *
 * A company record WITHOUT these fields owns every product and has a website (every company that existed before).
 */

export type ProductSelection = { mode: "all" } | { mode: "selected"; keys: ModuleKey[] };

/** `platform` = we host their website; `external` = they already run one elsewhere; `none` = no website. */
export type WebsiteMode = "platform" | "external" | "none";
export interface CompanyWebsite {
  mode: WebsiteMode;
  /** Their own website's address (mode "external"). */
  externalUrl?: string;
}

/** SiteCraft AI and Sites (the public website) are sold as one product. */
export const SITES_MODULE: ModuleKey = "cms";

/**
 * Products that come with another at no extra charge: the website product brings search (RankMax) and the client portal
 * (ClientOS); ContractFlow's documents are written in Playbook. (The public website itself, "Sites", is part of SiteCraft.)
 */
export const INCLUDED_WITH: Partial<Record<ModuleKey, readonly ModuleKey[]>> = { cms: ["seo", "portal"], lpms: ["sop"] };

/** Every company has these whatever it buys: CommandOS (workspace and command center) and DataBrain. (ResolveIQ, help and support, is the platform's own service and needs no entry.) */
export const INCLUDED_PRODUCTS: readonly ModuleKey[] = [...MODULES.filter((m) => m.core).map((m) => m.key), "intelligence"];

/** The products that can be picked one by one (sign-up dropdown, billing), in the order they are offered. */
export const SELLABLE_PRODUCTS: readonly ModuleKey[] = ["lms", "smms", "cms", "hrms", "tms", "ots", "fms", "pms", "prms", "sop", "lpms", "dlms", "aibots", "messenger"];

const isSellable = (k: string): k is ModuleKey => (SELLABLE_PRODUCTS as readonly string[]).includes(k);
const broughtBy = (keys: Iterable<string>): ModuleKey[] => [...keys].flatMap((k) => INCLUDED_WITH[k as ModuleKey] ?? []);

/** How many products a selection is charged for; null = "All products". What comes with another product doesn't count. */
export function billableCount(selection: ProductSelection | null | undefined): number | null {
  if (!selection || selection.mode === "all") return null;
  const free = new Set<string>([...INCLUDED_PRODUCTS, ...broughtBy(selection.keys)]);
  const paid = new Set<string>(selection.keys.filter((k) => !free.has(k)));
  return Math.max(paid.size, selection.keys.length > 0 ? 1 : 0);
}

/** What each product is for, shown under its name wherever it is chosen (with what it brings along), and the words that find it. */
export const PRODUCT_CHOICE: Partial<Record<ModuleKey, { description: string; keywords: string[] }>> = {
  lms: { description: "For your sales team: collect leads from your website, ads or WhatsApp, follow each one through the sales pipeline, set reminders, send offers and see who became a customer.", keywords: ["crm", "sales", "leads", "marketing", "whatsapp"] },
  smms: { description: "For your marketing: write social media posts with AI, make images, plan them on a content calendar, get them approved, publish to your accounts and track how they perform.", keywords: ["social", "instagram", "facebook", "posts", "ads"] },
  cms: { description: "Build and run your business website without code: pages, blog, menus, enquiry forms. Includes: Sites (your website online), RankMax (Google search improvement), ClientOS (login area for your clients).", keywords: ["website", "sites", "seo", "rankmax", "portal", "clientos", "blog"] },
  hrms: { description: "For HR: keep employee records, mark attendance, approve leave, run monthly payroll with payslips, post job openings and track applicants until they join.", keywords: ["hr", "hrms", "payroll", "salary", "recruitment"] },
  tms: { description: "For training institutes or staff training: create courses, make batches, enroll students, take attendance, give assignments, collect fees and issue certificates.", keywords: ["training", "lms", "courses", "students", "classes"] },
  ots: { description: "Test people online: make question banks, send timed tests to candidates, students or staff, block cheating, check answers and share results with certificates.", keywords: ["exam", "test", "quiz", "assessment"] },
  fms: { description: "For your accounts: create GST invoices, send payment links, record money received and spent, manage bank accounts, taxes and see profit, cash flow reports.", keywords: ["finance", "accounting", "billing", "gst", "invoice"] },
  pms: { description: "For delivering work: create client projects, split them into tasks, assign people, follow boards and deadlines, log working hours and see what each project costs.", keywords: ["project", "tasks", "kanban", "timesheet"] },
  prms: { description: "For buying: keep your vendors, raise purchase requests, approve purchase orders, record vendor bills, control expenses and track company assets, subscriptions.", keywords: ["procurement", "purchase", "vendor", "expense", "assets"] },
  sop: { description: "Write your company's rules: process manuals, policies, letters, forms. Review them, issue the approved version to staff and see who has read them.", keywords: ["sop", "policy", "documents", "process"] },
  lpms: { description: "For agreements: prepare contracts from ready templates, send them for e-signature, track who has signed and keep signed copies safe. Includes: Playbook (document writing).", keywords: ["contract", "agreement", "signature", "legal", "playbook"] },
  dlms: { description: "A secure locker for your business: store passwords, important documents, links, private notes, control who can see each one and get reminders before documents expire.", keywords: ["vault", "password", "locker", "documents"] },
  aibots: { description: "Make your own AI assistants: chatbots trained on your information that answer customers or staff, plus AI voice calls that talk to people on the phone.", keywords: ["ai", "bot", "chatbot", "voice", "calls"] },
  messenger: { description: "For your team to talk: direct messages, group channels, file sharing, audio, video calls, scheduled meetings with screen sharing.", keywords: ["chat", "meeting", "video", "messages"] },
};

/** What every company gets, in words. */
export const ALWAYS_INCLUDED_TEXT = "CommandOS, DataBrain and ResolveIQ come with every workspace.";

/** The value of the "All products" choice in forms and links (`/signup?product=all`). */
export const ALL_PRODUCTS_VALUE = "all";

/**
 * Reads a choice from a form or a link: "all", one product key, or a list of keys. Products that come anyway (with every
 * workspace, or with another chosen one) are accepted and not stored. Null when anything in it can't be bought.
 */
export function parseSelection(input: string | readonly string[] | null | undefined): ProductSelection | null {
  const values = (Array.isArray(input) ? input : [input]).map((v) => String(v ?? "").trim()).filter(Boolean);
  if (values.length === 0) return null;
  if (values.includes(ALL_PRODUCTS_VALUE)) return values.length === 1 ? { mode: "all" } : null;
  const free = new Set<string>([...INCLUDED_PRODUCTS, ...broughtBy(values)]);
  if (!values.every((v) => isSellable(v) || free.has(v))) return null;
  const keys = SELLABLE_PRODUCTS.filter((k) => values.includes(k));
  return keys.length ? { mode: "selected", keys: [...keys] } : null;
}

/** The products the company owns, including the ones that come with them. Null = every product. */
export function ownedModules(selection: ProductSelection | null | undefined): Set<string> | null {
  if (!selection || selection.mode === "all") return null;
  // Every stored key counts, also one that is no longer sold by itself.
  return new Set<string>([...INCLUDED_PRODUCTS, ...selection.keys, ...broughtBy(selection.keys)]);
}

/** What a plan allows, narrowed to what the company owns. Null on either side = no limit from that side. */
export function restrictToOwned(planModules: ReadonlySet<string> | null, owned: ReadonlySet<string> | null): Set<string> | null {
  if (owned === null) return planModules === null ? null : new Set(planModules);
  if (planModules === null) return new Set(owned);
  return new Set([...owned].filter((k) => planModules.has(k)));
}

/**
 * The website choice that applies to a selection. Without SiteCraft there is no website with us. Buying SiteCraft on
 * its own means wanting the website. With "All products" the company decides.
 */
export function resolveWebsite(selection: ProductSelection | null | undefined, wanted: CompanyWebsite | null | undefined): CompanyWebsite {
  if (selection?.mode === "selected") {
    if (selection.keys.includes(SITES_MODULE)) return { mode: "platform" };
    return wanted?.mode === "external" ? wanted : { mode: "none" };
  }
  return wanted ?? { mode: "platform" };
}

/**
 * Whether the company's public website is served by us: it has SiteCraft (`modules`: the effective products, so a
 * Platform Console unlock or lock counts) and it did not say it runs its website elsewhere. A company that was given
 * SiteCraft by the Console keeps no website only if it chose so under "All products".
 */
export function sitesEnabled(selection: ProductSelection | null | undefined, website: CompanyWebsite | null | undefined, modules: ReadonlySet<string> | null): boolean {
  if (modules !== null && !modules.has(SITES_MODULE)) return false;
  if (selection?.mode === "selected") return true;
  return (website?.mode ?? "platform") === "platform";
}

/**
 * Whether a company has TWO addresses: its website on `<name>.<domain>` and the app on `<name>-app.<domain>`. A company
 * whose website we don't run has ONE address, `<name>.<domain>`, and the app is served there (no `-app` / `app.` host).
 * The same goes for its own domains.
 */
export function hasSeparateAppHost(company: { products?: ProductSelection | null; website?: CompanyWebsite | null; isPlatformOwner?: boolean }): boolean {
  return company.isPlatformOwner === true || sitesEnabled(company.products, company.website, ownedModules(company.products));
}
