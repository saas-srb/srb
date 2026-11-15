/**
 * The status badge on a Product settings card (pure). "Needs setup" only where a product cannot do its main job without a connection the company
 * has not made; everything else is "Ready". The facts come from the Integrations (SRB or the company's own account both count).
 */
export type ProductStatus = "ready" | "needs_setup";
export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = { ready: "Ready", needs_setup: "Needs setup" };

export interface ProductFacts {
  /** An AI account is available (SelfRun's or the company's own). */
  aiReady: boolean;
  /** A Google account for search data is available. */
  googleReady: boolean;
  /** At least one social app (Facebook/Instagram, Google, LinkedIn, X) is connected. */
  socialConnected: boolean;
}

/** The product's key (the slug used in addresses) to its Product Registry key. */
export const SLUG_TO_PANEL: Record<string, string> = {
  talentos: "hrms", sprintos: "pms", "dealflow-ai": "lms", "cashflow-ai": "fms", spendiq: "prms", "cohort-ai": "tms", "playbook-ai": "sop",
  "contractflow-ai": "lpms", "viralpulse-ai": "smms", "rankmax-ai": "seo", "sitecraft-ai": "cms", agentos: "aibots", cybervault: "dlms", evaliq: "ots",
  "databrain-ai": "intelligence", resolveiq: "support", "huddle-ai": "messenger",
};

export function productStatus(slug: string, f: ProductFacts): ProductStatus {
  switch (slug) {
    case "agentos": return f.aiReady ? "ready" : "needs_setup";
    case "viralpulse-ai": return f.aiReady && f.socialConnected ? "ready" : "needs_setup";
    case "rankmax-ai": return f.googleReady ? "ready" : "needs_setup";
    default: return "ready";
  }
}

/** Products whose settings screen lives in CommandOS (the panel shows it); the others show their settings links. */
export const SETTINGS_SCREENS = ["talentos", "sprintos", "cohort-ai", "cashflow-ai", "spendiq", "agentos", "evaliq", "viralpulse-ai", "rankmax-ai", "cybervault", "playbook-ai", "sitecraft-ai"] as const;
