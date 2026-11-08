/** Stable public URL names for each product. Registry keys remain internal identifiers. */
export const PRODUCT_URL_SLUGS: Record<string, string> = {
  workspace: "commandos",
  hrms: "talentos",
  pms: "sprintos",
  lms: "dealflow-ai",
  fms: "cashflow-ai",
  prms: "spendiq",
  tms: "cohort-ai",
  messenger: "huddle-ai",
  sop: "playbook-ai",
  lpms: "contractflow-ai",
  dlms: "cybervault",
  ots: "evaliq",
  aibots: "agentos",
  intelligence: "databrain-ai",
  smms: "viralpulse-ai",
  seo: "rankmax-ai",
  cms: "sitecraft-ai",
  portal: "clientos",
  support: "resolveiq",
  website: "sites",
};

export const SAAS_PRODUCT_COUNT = Object.keys(PRODUCT_URL_SLUGS).length;

export function selfRunProductName(name: string): string {
  const trimmedName = name.trim();
  return /^SelfRun\b/i.test(trimmedName) ? trimmedName : `SelfRun ${trimmedName}`;
}

const KEY_BY_SLUG = new Map(Object.entries(PRODUCT_URL_SLUGS).map(([key, slug]) => [slug, key]));

/** Accepts a registry key (legacy URL) or a public product slug. */
export function productKeyFromSlug(slug: string): string | undefined {
  return PRODUCT_URL_SLUGS[slug] ? slug : KEY_BY_SLUG.get(slug);
}

export function productSlugFor(key: string): string {
  return PRODUCT_URL_SLUGS[key] ?? key;
}

/** Canonical path for a signed-in product app. */
export function productAppPath(key: string): string {
  return `/${productSlugFor(key)}`;
}

/** Canonical Workspace analytics path for a product's public URL slug. */
export function productAnalyticsPath(key: string): string {
  return `/commandos/analytics/${productSlugFor(key)}`;
}

export function productPath(key: string): string {
  return `/products/${productSlugFor(key)}`;
}

export function productDocsPath(key: string, feature: string): string {
  return `/docs/${productSlugFor(key)}/${feature}`;
}
