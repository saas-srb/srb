import { MODULES, type ModuleKey } from "@/lib/platform/onboarding/catalog";
import { productKeyFromSlug } from "@/lib/platform/saas/product-routes";

/**
 * Which product a URL belongs to. The proxy refuses a URL whose products the company doesn't have. Pure: no data access.
 *
 * A rule is "any of": a screen or endpoint shared by several products stays open while the company has one of them.
 */
export interface ProductRule {
  modules: ModuleKey[];
  /** A screen that shows another product's records inside a product needs that product as well. */
  also?: ModuleKey;
  /** A second "any of" list that must be met too (ClientOS job pages: the portal, and a product that has applicants). */
  either?: ModuleKey[];
  /** `external` = opened by people outside the company (customers, candidates, guests): they see "not available", never the upgrade page. */
  audience: "staff" | "external";
}

const GATED = new Set<string>(MODULES.filter((m) => !m.core).map((m) => m.key));

/** Pages and APIs that don't live under a product's own address, by path prefix. The longest match wins. */
const PREFIXES: [string, ModuleKey[], ProductRule["audience"]][] = [
  // Public links a product hands out. (/verify stays open: a certificate or signed document already issued can always be checked.)
  ["/pay", ["fms"], "external"],
  ["/sign", ["lpms"], "external"],
  ["/meeting", ["lms"], "external"],
  ["/vcard", ["smms"], "external"],
  ["/brochure", ["smms"], "external"],
  ["/agentos-public", ["aibots"], "external"],
  ["/api/agentos-public", ["aibots"], "external"],
  // The hosted forms (they work with or without a website, and can be embedded in the company's own).
  ["/forms/careers", ["hrms", "lms"], "external"],
  ["/forms/enquiry", ["lms", "cms"], "external"],
  // Public forms: careers and enquiries keep working while any product that reads them is there.
  ["/api/careers", ["hrms", "lms"], "external"],
  ["/api/leads", ["lms", "cms"], "external"],
  ["/api/lead-messages", ["lms", "cms", "portal"], "external"],
  // CommandOS screens that manage another product's records.
  ["/commandos/crm/leads", ["lms"], "staff"],
  ["/commandos/crm/clients", ["lms", "pms", "fms"], "staff"],
  ["/commandos/pms", ["pms"], "staff"],
  ["/commandos/prms", ["prms"], "staff"],
  ["/commandos/tms", ["tms"], "staff"],
  ["/commandos/careers", ["hrms", "lms"], "staff"],
  ["/commandos/chatbot", ["cms", "aibots"], "staff"],
  ["/commandos/portal", ["portal"], "staff"],
  ["/commandos/teamchat", ["messenger"], "staff"],
  ["/api/commandos/teamchat", ["messenger"], "staff"],
  ["/api/commandos/crm/leads", ["lms"], "staff"],
  ["/api/commandos/crm/clients", ["lms", "pms", "fms"], "staff"],
  ["/api/commandos/pms", ["pms"], "staff"],
  ["/api/commandos/prms", ["prms"], "staff"],
  ["/api/commandos/tms", ["tms"], "staff"],
  ["/api/commandos/careers", ["hrms", "lms"], "staff"],
  ["/api/commandos/chatbot", ["cms", "aibots"], "staff"],
  ["/api/commandos/portal", ["portal"], "staff"],
];

/** Parts of a product's own address that outsiders open. */
const EXTERNAL_PREFIXES = ["/clientos", "/api/clientos", "/evaliq/take"];

/** Calls made by machines about something that already happened (a payment, a scheduled run): never refused for the product choice. */
const MACHINE_PATH = /\/(webhooks?|cron|callback)(\/|$)/i;

/** Screens of one product that work only with a second one: [path, product, the second product]. */
const COMBINED: [string, ModuleKey, ModuleKey][] = [
  ...["payroll-runs", "salary-payments", "products/hrms"].map((p): [string, ModuleKey, ModuleKey] => [`/cashflow-ai/${p}`, "fms", "hrms"]),
  ...["employee-expenses", "reimbursements", "assets", "asset-expenses", "asset-disposals", "reports/budget-vs-actual", "products/prms"].map((p): [string, ModuleKey, ModuleKey] => [`/cashflow-ai/${p}`, "fms", "prms"]),
  ...["reports/project-profitability", "products/pms"].map((p): [string, ModuleKey, ModuleKey] => [`/cashflow-ai/${p}`, "fms", "pms"]),
  ["/cashflow-ai/products/tms", "fms", "tms"],
  ["/dealflow-ai/voice-calls", "lms", "aibots"],
  ["/api/cashflow-ai/reports/budget-vs-actual", "fms", "prms"],
];

/**
 * ClientOS comes with SiteCraft (and All products), and the people other products serve sign in through it: EvalIQ keeps
 * the candidates' test pages, Cohort AI the students' learning pages, both with the account pages. A ClientOS page that
 * shows a product's records needs that product.
 */
const PORTAL_ACCOUNT = ["journey", "documents", "profile", "notifications", "change-password", "login", "forgot-password", "register", "join"].map((p) => `/clientos/${p}`).concat("/api/clientos/session", "/api/clientos/download");
type PortalPage = [paths: string[], rule: Omit<ProductRule, "audience">];
const PORTAL_PAGES: PortalPage[] = [
  [["/clientos/tests", "/clientos/exam"], { modules: ["ots", "tms"] }],
  [["program", "schedule", "assignments", "attendance", "certificates", "payments"].map((p) => `/clientos/${p}`), { modules: ["tms"] }],
  [["/clientos/projects"], { modules: ["portal", "tms"], either: ["pms", "tms"] }],
  // Meetings here are the project's dates; messages are answered in DealFlow.
  [["/clientos/milestones", "/clientos/meetings"], { modules: ["portal"], also: "pms" }],
  [["/clientos/messages", "/api/clientos/messages"], { modules: ["portal"], also: "lms" }],
  [["/clientos/invoices", "/api/clientos/invoices"], { modules: ["portal"], also: "fms" }],
  [["/clientos/application", "/clientos/interviews"], { modules: ["portal"], either: ["hrms", "lms"] }],
];

function portalRule(pathname: string): Omit<ProductRule, "audience"> | null {
  const any = (list: string[]) => list.some((p) => under(pathname, p));
  if (pathname === "/clientos" || any(PORTAL_ACCOUNT)) return { modules: ["portal", "tms", "ots"] };
  return PORTAL_PAGES.find(([paths]) => any(paths))?.[1] ?? null;
}

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function productRuleFor(pathname: string): ProductRule | null {
  if (MACHINE_PATH.test(pathname)) return null;
  const portal = portalRule(pathname);
  if (portal) return { ...portal, audience: "external" };
  const combined = COMBINED.find(([prefix]) => under(pathname, prefix));
  if (combined) return { modules: [combined[1]], also: combined[2], audience: "staff" };
  let best: (typeof PREFIXES)[number] | null = null;
  for (const entry of PREFIXES) if (under(pathname, entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  if (best) return { modules: best[1], audience: best[2] };

  const parts = pathname.split("/").filter(Boolean);
  const isApi = parts[0] === "api";
  const analytics = parts[0] === "commandos" && parts[1] === "analytics";
  const segment = analytics ? parts[2] : isApi ? parts[1] : parts[0];
  const key = segment ? productKeyFromSlug(segment) ?? segment : "";
  if (!GATED.has(key)) return null;
  return { modules: [key as ModuleKey], audience: EXTERNAL_PREFIXES.some((p) => under(pathname, p)) ? "external" : "staff" };
}

/** Whether a company with these products (null = all) may open something that needs `rule`. */
export function ruleAllows(rule: ProductRule, modules: ReadonlySet<string> | null): boolean {
  return missingModule(rule, modules) === null;
}

/** The product to offer when `rule` is not satisfied; null when it is. */
export function missingModule(rule: ProductRule, modules: ReadonlySet<string> | null): ModuleKey | null {
  if (modules === null) return null;
  if (!rule.modules.some((m) => modules.has(m))) return rule.modules[0];
  if (rule.either && !rule.either.some((m) => modules.has(m))) return rule.either[0];
  return rule.also && !modules.has(rule.also) ? rule.also : null;
}

/** The product keys (never the included ones) a company does not have. */
export function lockedModules(modules: ReadonlySet<string> | null): Set<string> {
  return new Set(modules === null ? [] : [...GATED].filter((k) => !modules.has(k)));
}

/** Whether a link may be shown: it needs no product, or one of its products is available (`unavailable` = registry keys the company can't use). */
export function hrefAvailable(href: string, unavailable: ReadonlySet<string>): boolean {
  const rule = productRuleFor(href.split(/[?#]/)[0]);
  return !rule || (rule.modules.some((m) => !unavailable.has(m)) && !(rule.also && unavailable.has(rule.also)) && (!rule.either || rule.either.some((m) => !unavailable.has(m))));
}

/** Another product's screen → the same records inside a product that can stand in for it: [their path, our path, keeps the record id]. */
const STAND_INS: [string, string, boolean][] = [
  ["/spendiq/invoices", "/cashflow-ai/bills", true],
  ["/spendiq/vendors", "/cashflow-ai/vendors", true],
  ["/spendiq/expenses", "/cashflow-ai/transactions", false],
  ["/sprintos/clients", "/cashflow-ai/customers", true],
  ["/talentos/settings", "/commandos/settings/profile", false],
];

/**
 * Where a link should go for a company: itself when it can open it, else the stand-in screen in a product it has,
 * else null (show the text without a link).
 */
export function localHref(href: string, unavailable: ReadonlySet<string>): string | null {
  if (hrefAvailable(href, unavailable)) return href;
  const path = href.split(/[?#]/)[0];
  for (const [from, to, keeps] of STAND_INS) {
    if (path !== from && !path.startsWith(`${from}/`)) continue;
    const target = keeps ? to + href.slice(from.length) : to;
    return hrefAvailable(target, unavailable) ? target : null;
  }
  return null;
}

/** Drops the entries that belong to a product the company can't use. Entries of no product ("platform", "account") stay. */
export function onlyAvailable<T>(items: readonly T[], productOf: (item: T) => string | null | undefined, unavailable: ReadonlySet<string>): T[] {
  return items.filter((i) => !unavailable.has(productOf(i) ?? ""));
}
