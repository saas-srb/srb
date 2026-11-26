/**
 * The Workspace navigation — the one definition of what a company's Workspace
 * contains and who may open each part. Pure data + pure rules (safe to import
 * anywhere); the server side that loads a user's context and guards pages is
 * `access.ts`.
 *
 * An item is available when ALL of these hold:
 *   1. `allow(user)` — a rule built from the existing role files
 *      (`*-roles.ts`) and the permission catalog (`permissionOverrides`,
 *      resolved by `resolvePermission`). Director has access across all products.
 *   2. The product is switched on for this company and in the product registry.
 *   3. `platform` items: the Platform Console's own access check passed.
 */
import { hrefAvailable, productRuleFor } from "@/lib/platform/products/routes";
import { hasAdminAccess } from "@/lib/admin-roles";
import { productAnalyticsPath, productSlugFor } from "@/lib/platform/saas/product-routes";
import { canViewWorkspaceAnalytics } from "@/lib/workspace-roles";
import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";
import type { AccessSubject } from "@/lib/access/can";
import { holdsLegacy, holdsProduct } from "@/lib/access/holds";

export type NavSectionKey = "dashboard" | "panels" | "analytics" | "manage" | "company" | "insight" | "support" | "account" | "platform";

export type NavIcon =
  | "smartphone"
  | "dashboard"
  | "users"
  | "projects"
  | "cart"
  | "training"
  | "finance"
  | "book"
  | "search"
  | "vault"
  | "bot"
  | "megaphone"
  | "test"
  | "chat"
  | "grid"
  | "website"
  | "shield"
  | "chart"
  | "globe"
  | "mail"
  | "building"
  | "card"
  | "receipt"
  | "gauge"
  | "palette"
  | "bank"
  | "plug"
  | "zap"
  | "upload"
  | "history"
  | "lock"
  | "bell"
  | "key"
  | "file"
  | "platform"
  | "help";

interface NavItemDef {
  key: string;
  section: NavSectionKey;
  /** Sidebar label. */
  label: string;
  /** Card title on the settings hub, when it differs from the sidebar label. */
  title?: string;
  description?: string;
  href: string;
  icon: NavIcon;
  /** Sub-heading inside a section (Company admin). */
  group?: string;
  /** Product key (`onboarding/catalog.ts` MODULES): must be in the plan and switched on. */
  module?: string;
  /** Product Registry key for items that aren't plan-gated modules (e.g. Help & Support). */
  panel?: string;
  /** Opens in a new tab (products have their own shell). */
  external?: boolean;
  /** `false`: a real, guarded item (its page and actions check it) that is not listed in the sidebar or on the settings cards. */
  inSidebar?: boolean;
  /** Needs the Platform Console access check instead of a company role. */
  platform?: boolean;
  allow: (user: RoleContext) => boolean;
}

const anyone = () => true;

/**
 * Product access in the Workspace comes from the person's micro features (People & access), not from role names: the subject the sign-in loaded
 * (their stored access, or what their roles grant until they are migrated). A product is open to a person who holds ANY of its features; an analytics
 * entry needs the feature(s) that carry the matching old capability name (`legacy[]` in the micro catalogue). See `access/holds.ts`.
 */
const microProduct = (product: string) => (u: RoleContext) => holdsProduct(u, product);
const microLegacyRule = (product: string, ...names: string[]) => (u: RoleContext) => holdsLegacy(u, product, ...names);
/** `super_admin` only (`admin-roles.ts`) — what every company-settings page (`/commandos/settings/*`) checks. */
const superAdmin = (u: RoleContext) => hasAdminAccess(u.roles);

// ── Products: the same role test each product's own sign-in uses ────────────────
const PANELS: NavItemDef[] = (
  [
    ["hrms", "Human Resources", "users", microProduct("talentos")],
    ["pms", "Projects", "projects", microProduct("sprintos")],
    ["lms", "CRM & Leads", "grid", microProduct("dealflow-ai")],
    ["fms", "Finance", "finance", microProduct("cashflow-ai")],
    ["prms", "Procurement & Expenses", "cart", microProduct("spendiq")],
    ["tms", "Training", "training", microProduct("cohort-ai")],
    ["messenger", "Team Chat", "chat", microProduct("huddle-ai")],
    ["sop", "Playbook Library", "book", microProduct("playbook-ai")],
    ["lpms", "Legal & Documents", "file", microProduct("contractflow-ai")],
    ["dlms", "CyberVault", "vault", microProduct("cybervault")],
    ["ots", "Online Tests", "test", microProduct("evaliq")],
    ["aibots", "AgentOS", "bot", microProduct("agentos")],
    ["intelligence", "DataBrain", "chart", microProduct("databrain-ai")],
    ["smms", "Social Media", "megaphone", microProduct("viralpulse-ai")],
    ["seo", "SEO", "search", microProduct("rankmax-ai")],
    ["cms", "Website", "website", microProduct("sitecraft-ai")],
  ] as [string, string, NavIcon, NavItemDef["allow"]][]
).map(([key, label, icon, allow]) => ({ key: `product.${key}`, section: "panels", label, href: `/${productSlugFor(key)}`, icon, module: key, allow: (u: RoleContext) => superAdmin(u) || allow(u) }));

// ── Analytics: /commandos/analytics/[product] ─────────────────────────────────
// Each page shows COMPANY-WIDE numbers, so a product whose own screens are scoped
// per person (SOP readers, Digi Locker and AI Bots users, test takers) opens its
// analytics only to the people who already see the whole product: its report /
// analytics permission where it has one, otherwise its see-everything tier.
const ANALYTICS: NavItemDef[] = (
  [
    ["aibots", "AgentOS Analytics", "bot", microLegacyRule("agentos", "aibots.isAibotsManagerTier")],
    ["cms", "Website Analytics", "website", microLegacyRule("sitecraft-ai", "cms.VIEW")],
    ["dlms", "CyberVault Analytics", "vault", microLegacyRule("cybervault", "dlms.isDlmsManagerTier")],
    ["fms", "Finance Analytics", "finance", microProduct("cashflow-ai")],
    ["hrms", "HR Analytics", "users", microProduct("talentos")],
    ["lms", "Lead Analytics", "grid", microLegacyRule("dealflow-ai", "lms.VIEW_ANALYTICS")],
    ["lpms", "ContractFlow Analytics", "file", microLegacyRule("contractflow-ai", "lpms.isLpmsManagerTier")],
    ["messenger", "Messenger Analytics", "chat", microProduct("huddle-ai")],
    ["ots", "Online Tests Analytics", "test", microLegacyRule("evaliq", "ots.VIEW_REPORTS")],
    ["pms", "Project Analytics", "projects", microProduct("sprintos")],
    ["portal", "Portal Analytics", "globe", (u) => resolvePermission(u, "portal.isPortalAdmin", () => u.roles.includes("portal_admin"))],
    ["prms", "Procurement Analytics", "cart", microProduct("spendiq")],
    ["seo", "RankMax Analytics", "search", microLegacyRule("rankmax-ai", "seo.VIEW")],
    ["smms", "Social Media Analytics", "megaphone", microLegacyRule("viralpulse-ai", "smms.VIEW_ANALYTICS")],
    ["sop", "Playbook Analytics", "book", microLegacyRule("playbook-ai", "sop.EXPORT")],
    ["tms", "Training Analytics", "training", microProduct("cohort-ai")],
    ["workspace", "Workspace Analytics", "chart", canViewWorkspaceAnalytics],
  ] as [string, string, NavIcon, NavItemDef["allow"]][]
).map(([key, label, icon, allow]) => ({
  key: `analytics.${key}`,
  section: "analytics",
  label,
  href: productAnalyticsPath(key),
  icon,
  module: key,
  // The Command Center permission includes every product's (full) analytics.
  allow: (u: RoleContext) => superAdmin(u) || canViewCommandCenter(u) || allow(u),
}));

// ── Management: the company-wide registers (formerly the separate admin product) ──
/**
 * Company-management capabilities, in the permission catalog
 * (`permission-catalog.ts`, group "Workspace management"). `super_admin`
 * holds all of them; nobody else does by default, and a Director can grant
 * any single one to a person through permission overrides in Users & roles.
 */
export const MANAGE_PERMISSIONS = {
  commandCenter: "workspace.viewCommandCenter",
  users: "workspace.manageUsers",
  auditLog: "workspace.viewAuditLog",
  documents: "workspace.manageDocuments",
  crm: "workspace.manageCrm",
  projects: "workspace.manageProjects",
  procurement: "workspace.manageProcurement",
  training: "workspace.manageTraining",
  chat: "workspace.manageChat",
  portalUsers: "workspace.managePortalUsers",
  careers: "workspace.manageCareers",
  chatbot: "workspace.manageChatbot",
  pushNotifications: "workspace.manageWebsitePush",
} as const;
const may = (permission: string) => (u: RoleContext) => resolvePermission(u, permission, () => false);

/**
 * The executive sections of the dashboard (`/commandos`: financial position,
 * KPIs by area, product performance) — the former Command Center. Not a nav item
 * any more (the dashboard is one page for everybody), so this is the one rule
 * every caller asks: the dashboard loader, the analytics pages, the bell.
 */
export const canViewCommandCenter = (u: RoleContext): boolean => may(MANAGE_PERMISSIONS.commandCenter)(u);

/** Who may open the Audit log page, and which of its two sources each reader gets. */
export const canViewAuditLog = (u: RoleContext): boolean => may(MANAGE_PERMISSIONS.auditLog)(u);
/** Workspace events (`platform_events`, the event bus) — company Director only, as `/settings/activity` always was. */
export const canViewWorkspaceEvents = (u: RoleContext): boolean => superAdmin(u);

const P = MANAGE_PERMISSIONS;
const chatbotAccess = (u: RoleContext) =>
  may(P.chatbot)(u) || microLegacyRule("dealflow-ai", "lms.VIEW_CHATBOT")(u) || microLegacyRule("sitecraft-ai", "cms.SETTINGS_MANAGE")(u);
const websitePushAccess = (u: RoleContext) =>
  resolvePermission(u, P.pushNotifications, () => microLegacyRule("sitecraft-ai", "cms.SETTINGS_MANAGE")(u));
const MANAGE_PAGES: [group: string, path: string, label: string, icon: NavIcon, permission: string, module?: string][] = [
  ["CRM", "crm/leads", "Leads", "grid", P.crm, "lms"],
  ["CRM", "crm/clients", "Clients", "grid", P.crm, "pms"],
  ["Projects", "pms/projects", "Projects", "projects", P.projects, "pms"],
  ["Projects", "pms/tasks", "Tasks", "projects", P.projects, "pms"],
  ["Projects", "pms/milestones", "Milestones", "projects", P.projects, "pms"],
  ["Projects", "pms/timesheets", "Timesheets", "projects", P.projects, "pms"],
  ["Procurement", "prms/vendors", "Vendors", "cart", P.procurement, "prms"],
  ["Procurement", "prms/requisitions", "Requisitions", "cart", P.procurement, "prms"],
  ["Procurement", "prms/rfqs", "RFQs", "cart", P.procurement, "prms"],
  ["Procurement", "prms/purchase-orders", "Purchase orders", "cart", P.procurement, "prms"],
  ["Procurement", "prms/invoices", "Vendor invoices", "cart", P.procurement, "prms"],
  ["Procurement", "prms/payments", "Vendor payments", "cart", P.procurement, "prms"],
  ["Procurement", "prms/expenses", "Expenses", "cart", P.procurement, "prms"],
  ["Procurement", "prms/assets", "Assets", "cart", P.procurement, "prms"],
  ["Procurement", "prms/inventory", "Inventory", "cart", P.procurement, "prms"],
  ["Procurement", "prms/infrastructure", "Infrastructure", "cart", P.procurement, "prms"],
  ["Procurement", "prms/subscriptions", "Software subscriptions", "cart", P.procurement, "prms"],
  ["Training", "tms/programs", "Programs", "training", P.training, "tms"],
  ["Training", "tms/batches", "Batches", "training", P.training, "tms"],
  ["Training", "tms/students", "Students", "training", P.training, "tms"],
  ["Training", "tms/certificates", "Certificates", "training", P.training, "tms"],
  ["Training", "tms/payments", "Fee payments", "training", P.training, "tms"],
  ["Team chat", "teamchat/channels", "Channels", "chat", P.chat, "messenger"],
  ["Team chat", "teamchat/direct-messages", "Direct messages", "chat", P.chat, "messenger"],
  ["Team chat", "teamchat/meetings", "Meetings", "chat", P.chat, "messenger"],
  ["People", "portal/users", "Portal users", "users", P.portalUsers, "portal"],
  ["People", "careers/applicants", "Job applicants", "users", P.careers],
  ["Engagement", "push", "Push notifications", "bell", P.pushNotifications, "cms"],
  ["AI Chatbot", "chatbot", "Dashboard", "bot", P.chatbot],
  ["AI Chatbot", "chatbot/conversations", "Conversations", "bot", P.chatbot],
  ["AI Chatbot", "chatbot/knowledge-base", "Knowledge Base", "bot", P.chatbot],
  ["AI Chatbot", "chatbot/config", "AI Config", "bot", P.chatbot],
  ["Conversation AI", "chatbot/voice", "Voice Dashboard", "bot", P.chatbot],
  ["Conversation AI", "chatbot/voice-conversations", "Voice Conversations", "bot", P.chatbot],
  ["Conversation AI", "chatbot/voice/config", "ElevenLabs Config", "bot", P.chatbot],
];
/** Management groups that ARE a product: their heading is that product's Product Registry name. */
const GROUP_PANEL: Record<string, string> = { CRM: "lms", Projects: "pms", Procurement: "prms", Training: "tms", "Team chat": "messenger" };

const AI_GROUPS = new Set(["AI Chatbot", "Conversation AI"]);
const MANAGE: NavItemDef[] = MANAGE_PAGES.map(([group, path, label, icon, permission, module]) => ({
  key: `manage.${path.replace(/\//g, ".")}`,
  // Push notifications, the AI Chatbot Dashboard and Analytics are ONE sidebar section ("Engagement & Insights"), without sub-headings.
  section: AI_GROUPS.has(group) || group === "Engagement" ? "insight" : "manage",
  group: AI_GROUPS.has(group) || group === "Engagement" ? undefined : group,
  label,
  href: `/commandos/${path}`,
  icon,
  module: module ?? (AI_GROUPS.has(group) ? "cms" : undefined),
  // The AI Chatbot Dashboard is the only chatbot item in the sidebar: conversations, knowledge base, AI config and every voice screen live in
  // Integrations (AI Chatbot and Voice cards). They stay guarded items because their screens check them.
  ...(AI_GROUPS.has(group) && path !== "chatbot" ? { inSidebar: false } : {}),
  allow: permission === P.chatbot ? chatbotAccess : permission === P.pushNotifications ? websitePushAccess : may(permission),
}));

// ── Company: the company managing itself ────────────────────────────────────
const COMPANY_GROUPS: Record<string, string> = {
  progress: "Organization Setup", setup: "Organization Setup", integrations: "Organization Setup", products: "Organization Setup",
  departments: "Users & Access", teams: "Users & Access", designations: "Users & Access", users: "Users & Access",
  billing: "Billing & plan", invoices: "Billing & plan", usage: "Billing & plan",
  app: "Branding & domains", website: "Branding & domains", addresses: "Branding & domains", domains: "Branding & domains",
  notifications: "System default", prompts: "System default", schedules: "System default", pdfs: "System default",
  backups: "Security & Logs", import: "Security & Logs", audit: "Security & Logs", security: "Security & Logs",
};
const company = (key: string, href: string, icon: NavIcon, label: string, description: string, title?: string): NavItemDef => ({ key: `company.${key}`, section: "company", group: COMPANY_GROUPS[key], label, title, description, href, icon, allow: superAdmin });
const COMPANY: NavItemDef[] = [
  company("progress", "/commandos/setup", "gauge", "Setup progress", "How much of your company's setup is done, what is left and the next best step. Complete when every step that applies to you is done.", "Setup progress"),
  company("setup", "/commandos/onboarding", "building", "Company setup", "Profile, departments, invitations and which products your team uses."),
  company("integrations", "/commandos/settings/integrations", "plug", "Integrations", "What your workspace is connected to: payment gateway, webhooks and your own domain."),
  company("products", "/commandos/settings/products", "grid", "Product settings", "Configure every product your company uses — HR, Projects, Finance, SEO, Social Media, Training and more — from one place.", "All product settings"),
  company("departments", "/commandos/settings/organization/departments", "users", "Departments", "Create and manage the departments your company is divided into."),
  company("teams", "/commandos/settings/organization/teams", "users", "Teams", "Groups of people within departments working on the same area."),
  company("designations", "/commandos/settings/organization/designations", "users", "Designations", "Job titles and seniority levels for your company's positions."),
  { ...company("users", "/commandos/users", "users", "People & access", "Everyone who can sign in: where they work, their status (active, on leave, left the company …), which products and features they can use, and seats used.", "People & access"), allow: may(P.users) },
  company("app", "/commandos/settings/apps", "smartphone", "Apps & downloads", "Your company's own apps for phones and Windows, macOS and Linux computers: settings, and a Generate button and download link for each app.", "Apps"),
  company("addresses", "/commandos/addresses", "website", "Default domain", "The default address we give your company (and your website's, if it has one here)", "Default domain"),
  company("website", "/commandos/settings/website", "website", "Website & public forms", "Run your website here or use your own, share or embed the enquiry and careers forms, and list your job openings.", "Website"),
  company("domains", "/commandos/settings/domains", "globe", "Custom domains", "Your workspace address and your own custom domains, with automatic SSL.", "Domains"),
  company("billing", "/commandos/settings/billing", "card", "Plan & billing", "Your plan, payments, coupon codes and GST billing details."),
  company("invoices", "/commandos/settings/billing/invoices", "receipt", "Invoices & payments", "Tax invoices, credit notes and every payment made for your subscription."),
  company("usage", "/commandos/settings/usage", "gauge", "Usage & limits", "What your workspace uses against its plan (seats, AI tokens, storage, emails, voice, domains), and where to add more capacity.", "Usage & limits"),
  company("notifications", "/commandos/settings/notifications", "bell", "Notification center", "Every email, in-app and push notification your workspace sends: turn each on or off, change its wording, send your own announcements, and see what was delivered."),
  company("prompts", "/commandos/settings/prompts", "bot", "AI prompts", "How your AI assistants are told to write and behave: change the wording for your own workspace, with every version kept so you can go back to any of them. Fixed security rules always apply.", "AI prompts"),
  company("schedules", "/commandos/settings/schedules", "history", "Scheduled jobs", "What runs on its own and when: backups, reminders, notifications, billing checks and more. When each runs, when it last ran and what it does for your workspace.", "Scheduled jobs"),
  company("pdfs", "/commandos/settings/documents", "file", "Documents & PDFs", "Every PDF your workspace produces — invoices, receipts, certificates, payslips, reports — with a preview in your own letterhead, when each is made, where it is used and how it reaches people.", "Documents & PDFs"),
  company("backups", "/commandos/settings/backups", "history", "Backups & data", "Weekly backups you can download and restore, and deleting your data or your company."),
  company("import", "/commandos/settings/import", "upload", "Import data", "Bring leads, clients and employees in from CSV files, or download a copy of everything your workspace holds."),
  {
    ...company("audit", "/commandos/settings/audit-log", "history", "Audit log", "Who did what across your workspace and its products, and when: workspace events and product activity in one place."),
    // Same rule as the old Management → Activity log; the Director's workspace events source is checked on the page itself.
    allow: canViewAuditLog,
  },
  company("security", "/commandos/settings/security", "lock", "Security", "Your sign-in, password, active sessions and accounts that need attention."),
  { ...company("email", "/commandos/settings/email", "mail", "Sender email", "Send your emails from your own address, like hello@yourbusiness.com, by connecting your domain.", "Sender email"), inSidebar: false },
  { ...company("payments", "/commandos/settings/payments", "bank", "Payments & payouts", "Connect Razorpay and manage the company bank accounts used for invoice payments, salaries and government dues.", "Payments & payouts"), inSidebar: false },
  { ...company("automations", "/commandos/settings/automations", "zap", "Automations", "Rules that send a webhook, email or in-app notice when something happens.", "Automations"), inSidebar: false },
  { ...company("branding", "/commandos/settings/branding", "palette", "Branding", "Your company name, logo, colours and theme.", "Branding"), inSidebar: false },
  { key: "analytics.overview", section: "insight", label: "Analytics", href: "/commandos/analytics", icon: "chart", allow: (u) => canViewCommandCenter(u) || ANALYTICS.some((item) => item.allow(u)) },
];

export const NAV_ITEMS: NavItemDef[] = [
  { key: "dashboard", section: "dashboard", label: "Dashboard", href: "/commandos", icon: "dashboard", allow: anyone },
  ...PANELS,
  // ResolveIQ (help and support) is the platform's own service for every company: no role gate and no plan module. It sits in the sidebar.
  { key: "panel.support", section: "support", label: "ResolveIQ", href: "/resolveiq", icon: "help", panel: "support", allow: anyone },
  // The external portal and the company's public website are products in the registry too, so they are listed like the rest.
  { key: "panel.portal", section: "panels", label: "Client & Student Portal", href: "/clientos", icon: "globe", module: "portal", allow: (u: RoleContext) => superAdmin(u) || resolvePermission(u, "portal.isPortalAdmin", () => u.roles.includes("portal_admin")) },
  { key: "panel.website", section: "panels", label: "Public Website", href: "/", icon: "website", panel: "website", external: true, allow: anyone },
  ...ANALYTICS,
  ...MANAGE,
  ...COMPANY,
  { key: "account.documents", section: "account", label: "Documents", description: "Documents uploaded across Projects, HR and the External Portal.", href: "/commandos/account/documents", icon: "file", allow: may(P.documents) },
  { key: "account.notifications", section: "account", label: "Notifications", href: "/commandos/notifications", icon: "bell", allow: anyone },
  { key: "account.sessions", section: "account", label: "Security & sessions", description: "Where you are signed in, and your sign-in history.", href: "/commandos/account/sessions", icon: "lock", allow: anyone },
  { key: "account.password", section: "account", label: "Change Password", href: "/commandos/change-password", icon: "key", allow: anyone },
  {
    key: "platform.panel",
    section: "platform",
    label: "Platform Console",
    description: "The SaaS control centre: companies, sign-ups, plans, billing, tax and platform settings.",
    href: "/console",
    icon: "platform",
    platform: true,
    allow: anyone,
  },
];

export const NAV_SECTIONS: { key: NavSectionKey; label: string; href?: string; /** `false`: resolved and guarded like any section, but not listed in the sidebar. */ sidebar?: boolean }[] = [
  { key: "dashboard", label: "" },
  // Not in the sidebar by design: products open from the dashboard cards, the Staff Hub tiles and each product's own sidebar, so their tiles stay
  // guarded items (open or locked) without a second list; the Management registers are reached from their products; per-product analytics entries
  // are what the Analytics page (Insight) lists.
  { key: "panels", label: "Products", sidebar: false },
  { key: "analytics", label: "Analytics", sidebar: false },
  { key: "manage", label: "Management", sidebar: false },
  { key: "company", label: "Company", href: "/commandos/settings" },
  { key: "insight", label: "Engagement & Insights" },
  { key: "support", label: "Help & support" },
  { key: "account", label: "Account", sidebar: false },
  { key: "platform", label: "Platform" },
];

export const NAV_KEYS: string[] = NAV_ITEMS.map((i) => i.key);

/** Everything a rule may look at. Loaded on the server by `access.ts`. */
export interface NavContext {
  user: RoleContext & { subject?: AccessSubject };
  /** Result of the Platform Console's own access check (owner company + platform role). */
  platformAccess: boolean;
  /** Products the platform switched off (for everyone, or for this company): their items are hidden. */
  unavailablePanels?: ReadonlySet<string>;
  /** Product Registry names / descriptions, so every listing says the same thing. */
  panels?: Readonly<Record<string, { name: string; description: string }>>;
}

/**
 * open   = the person can use it;
 * locked = it exists for the company but the person has no access: shown in the same place, greyed with a lock (owner decision D1);
 * hidden = it does not exist for this company (product switched off by plan or platform, platform-staff items): left out for everyone, the Director included.
 */
export type NavState = "open" | "locked" | "hidden";

export function stateOf(item: NavItemDef, ctx: NavContext): NavState {
  if (item.platform) return ctx.platformAccess ? "open" : "hidden";
  const unavailable = ctx.unavailablePanels;
  if (unavailable) {
    // A screen shared by several products (clients, job applicants …) stays while the company has one of them.
    // Only a CommandOS screen can belong to "any of" several products; a product's own entry follows that product (ClientOS
    // stays out of the menu even where some of its sign-in pages open with another product).
    const shared = item.href.startsWith("/commandos/") ? productRuleFor(item.href) : null;
    const panelKey = item.module ?? item.panel;
    if (shared ? !hrefAvailable(item.href, unavailable) : panelKey && unavailable.has(panelKey)) return "hidden";
  }
  // `allow` is the older role rule; a person's roles and overrides are the exact image of their access map (see src/lib/access), so this IS the matrix answer.
  return item.allow(ctx.user) ? "open" : "locked";
}

/** Where a locked item leads: the in-shell page that explains it and lets the person ask a Director for access. */
export const lockedHref = (key: string) => `/commandos/locked?item=${encodeURIComponent(key)}`;

/** Serialisable — handed to the client sidebar. */
export interface NavItem {
  key: string;
  label: string;
  title: string;
  description: string | null;
  href: string;
  icon: NavIcon;
  group: string | null;
  external: boolean;
  /** True when the person has no access: the sidebar shows it greyed with a lock and it opens the locked page. */
  locked: boolean;
  /** Listed in the sidebar and on the settings cards (false: reached from another page, still guarded). */
  inSidebar: boolean;
  /** A small badge in the sidebar, set by the server (the setup percentage). */
  badge?: string | null;
}

export interface NavSection {
  key: NavSectionKey;
  label: string;
  href: string | null;
  /** Whether the sidebar lists this section (the Products section is reached from the Staff Hub tiles instead). */
  sidebar: boolean;
  items: NavItem[];
}

export interface ResolvedNav {
  /** Sections with at least one item the user may open, in display order. */
  sections: NavSection[];
  /** Keys of every item the user may open (locked items are in `sections`, not here). */
  allowed: string[];
  /** Keys of the items shown locked. */
  lockedKeys: string[];
}

/** Pure: the Director's navigation for everyone, each item open or locked for `ctx`. Items that do not exist for the company are left out. */
export function resolveNav(ctx: NavContext): ResolvedNav {
  const shown: { item: NavItemDef; locked: boolean }[] = [];
  for (const item of NAV_ITEMS) {
    const state = stateOf(item, ctx);
    if (state !== "hidden") shown.push({ item, locked: state === "locked" });
  }
  const sections = NAV_SECTIONS.map((s) => ({
    key: s.key,
    label: s.label,
    href: s.href ?? null,
    sidebar: s.sidebar !== false,
    // OWNER RULE (2026-11-17, replaces "locked items are shown greyed"): what a person has no access to is HIDDEN, not greyed and not locked. A section with
    // nothing left to show disappears. A direct address to something hidden still lands on the polite locked page (`workspaceItemState`).
    items: shown
      .filter((x) => x.item.section === s.key && !x.locked)
      .map(({ item: i, locked }) => {
        // Product tiles and analytics entries take their name / description from the Product Registry.
        const meta = ctx.panels?.[i.module ?? i.panel ?? ""];
        const named = meta && (i.section === "panels" || i.section === "support") ? meta.name : meta && i.section === "analytics" ? `${meta.name} Analytics` : null;
        const label = named ?? i.label;
        const description = meta && (i.section === "panels" || i.section === "support") ? meta.description : (i.description ?? null);
        return { key: i.key, label, title: named ?? i.title ?? i.label, description, href: locked ? lockedHref(i.key) : i.href, icon: i.icon, group: (i.group && !ctx.unavailablePanels?.has(GROUP_PANEL[i.group] ?? "") && ctx.panels?.[GROUP_PANEL[i.group] ?? ""]?.name) || i.group || null, external: locked ? false : Boolean(i.external), locked, inSidebar: i.inSidebar !== false };
      }),
  })).filter((s) => s.items.length > 0);
  return { sections, allowed: shown.filter((x) => !x.locked).map((x) => x.item.key), lockedKeys: shown.filter((x) => x.locked).map((x) => x.item.key) };
}

/** Pure: may `ctx` open the item `key`? Unknown keys are refused. */
export function navAllows(ctx: NavContext, key: string): boolean {
  const item = NAV_ITEMS.find((i) => i.key === key);
  return item ? stateOf(item, ctx) === "open" : false;
}
