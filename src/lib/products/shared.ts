import type { ProductCtaKind, ProductItem } from "@/types/content";

/**
 * Pure helpers for the Products section (/products, /products/<slug>, the
 * header menu). Client-safe: no server-only imports.
 */

/** A product as the CMS stores it (icons as icon-map keys) — what crosses the server/client boundary. */
export type StoredProduct = Omit<ProductItem, "icon">;

export const PRODUCTS_PATH = "/products";
export const productHref = (slug: string) => `${PRODUCTS_PATH}/${slug}`;

/** The order categories appear in on the listing and in the menu. */
export const CATEGORY_ORDER: ProductItem["category"][] = [
  "Executive & Operations",
  "AI & Intelligence",
  "HR & Talent",
  "Project & Delivery",
  "Procurement & Finance",
  "Sales & Marketing",
  "Assessment & Security",
];

export const label = (p: Pick<StoredProduct, "name" | "shortName">) => p.shortName || p.name;
export const valueLine = (p: Pick<StoredProduct, "tagline" | "valueLine">) => p.valueLine || p.tagline;

export interface ProductGroup<T extends { category: string }> {
  category: string;
  products: T[];
}

/** Products grouped by category in `CATEGORY_ORDER`; products keep their catalogue order inside a group. Empty groups are dropped. */
export function groupByCategory<T extends { category: string }>(products: T[]): ProductGroup<T>[] {
  const known = new Set<string>(CATEGORY_ORDER);
  const order = [...CATEGORY_ORDER, ...Array.from(new Set(products.map((p) => p.category))).filter((c) => !known.has(c))];
  return order.map((category) => ({ category, products: products.filter((p) => p.category === category) })).filter((g) => g.products.length > 0);
}

/**
 * Where "Start Using" (existing customers) goes: the product's own product via
 * the Workspace sign-in. `/` (the public website product) and unknown values have no product.
 */
export function startUsingHref(panelPath: string): string | null {
  const p = panelPath.trim();
  if (!p.startsWith("/") || p === "/" || p.startsWith("//")) return null;
  // /admin was folded into the Workspace (see next.config.ts redirects).
  const target = p === "/admin" ? "/commandos" : p;
  return `/commandos/login?next=${encodeURIComponent(target)}`;
}

export interface ResolvedCtas {
  primary: ProductCtaKind;
  secondary: ProductCtaKind;
  /** Existing-customer entry; null when the product has no product to sign in to. */
  startUsing: string | null;
}

/** Primary Get Started, secondary Request Demo — unless the product overrides them. "none" hides a button. */
export function resolveCtas(p: Pick<StoredProduct, "panelPath" | "ctas">): ResolvedCtas {
  return { primary: p.ctas?.primary ?? "get-started", secondary: p.ctas?.secondary ?? "request-demo", startUsing: startUsingHref(p.panelPath) };
}

/** Where a CTA kind leads. `request-demo` opens the demo form (an in-page anchor). */
export function ctaTarget(kind: ProductCtaKind, startUsing: string | null): { href: string; kind: ProductCtaKind } | null {
  switch (kind) {
    case "get-started": return { href: "/signup", kind };
    case "request-demo": return { href: "#demo", kind };
    case "start-using": return startUsing ? { href: startUsing, kind } : null;
    default: return null;
  }
}

/** Products related to `product`: same category first, then the rest, never itself, at most `limit`. */
export function relatedProducts<T extends { slug: string; category: string }>(product: T, all: T[], limit = 3): T[] {
  const others = all.filter((p) => p.slug !== product.slug);
  return [...others.filter((p) => p.category === product.category), ...others.filter((p) => p.category !== product.category)].slice(0, limit);
}

/** Previous / next product in catalogue order (wrapping), or null when there is only one. */
export function neighbours<T extends { slug: string }>(product: T, all: T[]): { prev: T; next: T } | null {
  const i = all.findIndex((p) => p.slug === product.slug);
  if (i < 0 || all.length < 2) return null;
  return { prev: all[(i - 1 + all.length) % all.length], next: all[(i + 1) % all.length] };
}

/** The 2-3 chips on a listing card: the first features' titles. */
export function capabilityChips(p: Pick<StoredProduct, "features" | "keyFeatures">, n = 3): string[] {
  const src = p.features?.length ? p.features : p.keyFeatures;
  return src.slice(0, n).map((f) => f.title);
}

/** Header-menu shape for the owner's Products item (matches `PublicNavTop`). */
export interface ProductsNavTop {
  name: string;
  href: string;
  iconKey: string;
  featured: { title: string; description: string; image: string };
  items: { name: string; href: string; description: string; iconKey: string; group: string }[];
}

export const PRODUCTS_NAV_LABEL = "Products";
/** Where "Start Automating Your Business" / "Create Your Business Automation" lead: the company registration. */
export const SIGNUP_PATH = "/signup";

/** What the header's Products featured card said in round 1. The upgrade script replaces a stored value only while it still equals this. */
export const PRODUCTS_NAV_FEATURED_PREVIOUS = {
  title: "AI-powered business software",
  description: "One connected platform for HR, projects, finance, sales, AI and more.",
  image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600&auto=format&fit=crop",
};
/** The header's Products featured card: the business-automation SaaS (a photo of a live analytics dashboard). */
export const PRODUCTS_NAV_FEATURED = {
  title: "Automate Your Business with Our AI-Powered Business Automation SaaS",
  description: "One workspace for HR, projects, finance, CRM and AI, with workflow automation that connects them.",
  image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=600&auto=format&fit=crop",
};

/** The hero background of a product page: an AI visual for the AI category, the connected-platform visual otherwise (both editable text keys). */
export const productHeroImage = (p: Pick<StoredProduct, "category">, text: Record<string, string>): string =>
  p.category === "AI & Intelligence" ? text["products.hero.imageAi"] : text["products.hero.imageDefault"];

/** Menu entries for the given products: grouped by category, each with name, one-line value and icon. */
export function buildProductsNav(products: StoredProduct[]): ProductsNavTop {
  return {
    name: PRODUCTS_NAV_LABEL,
    href: PRODUCTS_PATH,
    iconKey: "Boxes",
    featured: PRODUCTS_NAV_FEATURED,
    items: groupByCategory(products).flatMap((g) =>
      g.products.map((p) => ({ name: label(p), href: productHref(p.slug), description: valueLine(p), iconKey: p.iconName || "Sparkles", group: g.category })),
    ),
  };
}

/** True for a nav/footer href that belongs to the Products section. */
export const isProductsHref = (href: string) => href === PRODUCTS_PATH || href.startsWith(`${PRODUCTS_PATH}/`) || href.startsWith(`${PRODUCTS_PATH}?`);

/** The product page's content with each field's fallback applied (new page fields first, then the catalogue's own). */
export function pageContent(p: StoredProduct) {
  return {
    pitch: p.pitch || p.shortDescription,
    overview: p.overview || p.fullDescription,
    purpose: p.primaryPurpose,
    problem: p.problemSolved,
    outcome: p.outcome || p.businessOutcome,
    facts: p.facts?.length ? p.facts : p.metrics,
    features: (p.features?.length ? p.features : p.keyFeatures.map((f) => ({ title: f.title, description: f.description, icon: undefined as string | undefined }))),
    ai: p.aiFeatures?.length ? p.aiFeatures : p.aiCapabilities.map((c) => ({ title: c, description: "", icon: undefined as string | undefined })),
    benefits: p.benefits ?? [],
    useCases: p.useCases ?? [],
    workflows: p.automationWorkflows ?? [],
    integrations: p.integrations ?? [],
    scenarios: p.scenarios ?? [],
    faq: p.faq ?? [],
    audience: p.audience ?? "",
    problemIntro: p.problemIntro ?? "",
    problems: p.problems ?? [],
    beforeAfter: p.beforeAfter ?? [],
    screenshots: p.screenshots ?? [],
  };
}

/** True when the product has AI of its own. A product whose AI entry says "No AI of its own" (it only has the suite's AI around it) does not. */
export function hasOwnAi(p: Pick<StoredProduct, "aiFeatures">): boolean {
  return Boolean(p.aiFeatures?.some((f) => !/^no ai of its own/i.test(f.title.trim())));
}

export type DetailSectionId = "problem" | "compare" | "overview" | "features" | "ai" | "automation" | "useCases" | "benefits" | "audience" | "integrations" | "faq" | "related";

/**
 * Which detail sections a product has content for, in page order, each with the background tone it gets
 * (alternating, starting with the muted band right after the hero) so absent sections never leave two equal bands side by side.
 */
export function detailSectionTones(p: StoredProduct, all: StoredProduct[]): Partial<Record<DetailSectionId, "default" | "muted">> {
  const c = pageContent(p);
  const has: [DetailSectionId, boolean][] = [
    ["problem", Boolean(c.problem || c.problems.length || c.problemIntro)],
    ["compare", c.beforeAfter.length > 0],
    ["overview", Boolean(c.overview || c.purpose || p.screens.length || c.screenshots.length)],
    ["features", c.features.length > 0],
    ["ai", c.ai.length > 0],
    ["automation", c.workflows.length > 0],
    ["useCases", c.useCases.length > 0 || c.scenarios.length > 0],
    ["benefits", Boolean(c.benefits.length || c.outcome)],
    ["audience", Boolean(c.audience || p.targetDepartments.length || p.targetUsers.length)],
    ["integrations", c.integrations.length > 0],
    ["faq", c.faq.length > 0],
    ["related", relatedProducts(p, all, 1).length > 0],
  ];
  const out: Partial<Record<DetailSectionId, "default" | "muted">> = {};
  has.filter(([, on]) => on).forEach(([id], i) => { out[id] = i % 2 === 0 ? "muted" : "default"; });
  return out;
}
