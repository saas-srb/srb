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

/** Sold only as part of "All products": it shows other products' data to clients, students and applicants. */
export const ALL_PRODUCTS_ONLY: readonly ModuleKey[] = ["portal"];

/** Products that come with another: ContractFlow's documents are written in Playbook. */
export const INCLUDED_WITH: Partial<Record<ModuleKey, readonly ModuleKey[]>> = { lpms: ["sop"] };

/**
 * Not offered on their own (they hold no records of their own), but can be added beside one of the listed products:
 * DataBrain answers questions about their data.
 */
export const NEEDS_ONE_OF: Partial<Record<ModuleKey, readonly ModuleKey[]>> = { intelligence: ["fms", "hrms", "pms", "lms", "prms"] };

/** Every company has these whatever it buys: CommandOS (workspace and command center) and Huddle. */
export const INCLUDED_PRODUCTS: readonly ModuleKey[] = MODULES.filter((m) => m.core).map((m) => m.key);

/** CommandOS comes with every workspace, so it is never offered as a choice. Huddle is included AND can be bought alone. */
const NEVER_OFFERED: readonly ModuleKey[] = ["workspace", "admin", ...ALL_PRODUCTS_ONLY, ...(Object.keys(NEEDS_ONE_OF) as ModuleKey[])];

/** The products that can be picked one by one (sign-up dropdown, billing). */
export const SELLABLE_PRODUCTS: readonly ModuleKey[] = MODULES.map((m) => m.key).filter((k) => !NEVER_OFFERED.includes(k));

const isSellable = (k: string): k is ModuleKey => (SELLABLE_PRODUCTS as readonly string[]).includes(k);

/** The companions among `chosen` whose data product is there too. */
const companions = (chosen: ReadonlySet<string>): ModuleKey[] =>
  (Object.entries(NEEDS_ONE_OF) as [ModuleKey, readonly ModuleKey[]][]).filter(([key, needs]) => chosen.has(key) && needs.some((n) => chosen.has(n))).map(([key]) => key);

/**
 * How many products a selection is charged for; null = "All products". What comes free doesn't count: Huddle beside
 * another product (alone it is the product bought), and Playbook when it came with ContractFlow.
 */
export function billableCount(selection: ProductSelection | null | undefined): number | null {
  if (!selection || selection.mode === "all") return null;
  const keys = new Set(selection.keys);
  const free = new Set<string>([...keys].flatMap((k) => INCLUDED_WITH[k] ?? []));
  const paid = [...keys].filter((k) => k !== "messenger" && !free.has(k));
  return Math.max(paid.length, keys.size > 0 ? 1 : 0);
}

/** The name shown where a product is chosen, when buying it brings another along. */
export function offerName(key: string, name: string): string {
  if (key === SITES_MODULE) return `${name} & Sites`;
  return key === "lpms" ? `${name} (with Playbook)` : name;
}

/** The value of the "All products" choice in forms and links (`/signup?product=all`). */
export const ALL_PRODUCTS_VALUE = "all";

/** Reads a choice from a form or a link: "all", one product key, or a list of keys. Null when anything in it can't be bought. */
export function parseSelection(input: string | readonly string[] | null | undefined): ProductSelection | null {
  const values = (Array.isArray(input) ? input : [input]).map((v) => String(v ?? "").trim()).filter(Boolean);
  if (values.length === 0) return null;
  if (values.includes(ALL_PRODUCTS_VALUE)) return values.length === 1 ? { mode: "all" } : null;
  const chosen = new Set<string>(values);
  const extra = companions(chosen);
  if (!values.every((v) => isSellable(v) || (extra as string[]).includes(v))) return null;
  return { mode: "selected", keys: [...SELLABLE_PRODUCTS.filter((k) => chosen.has(k)), ...extra] };
}

/** The products the company owns, including the ones everyone gets. Null = every product. */
export function ownedModules(selection: ProductSelection | null | undefined): Set<string> | null {
  if (!selection || selection.mode === "all") return null;
  const chosen = selection.keys.filter(isSellable);
  const have = [...chosen, ...chosen.flatMap((k) => INCLUDED_WITH[k] ?? [])];
  return new Set<string>([...INCLUDED_PRODUCTS, ...have, ...companions(new Set([...have, ...selection.keys]))]);
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
