/**
 * The SaaS product's own identity — the product that is sold, not any customer of it. Nothing here belongs to a
 * company running on the platform; customers' brands live in `lib/platform/branding`.
 */

export const SAAS_BRAND = {
  /** Wordmark parts: "SelfRun" + "Business". */
  namePrimary: "SelfRun",
  nameAccent: "Business",
  name: "SelfRun AI",
  tagline: "The AI business platform that runs itself",
  /** One line for search results and link previews. */
  description:
    "SelfRun AI is one AI-powered platform that automates sales, HR, finance, projects, procurement, training and your website — so your business keeps running without you chasing it.",
  /** The palette of the product. Customers' themes never touch these. */
  colors: {
    primary: "#4338ca",
    primaryDark: "#312e81",
    accent: "#10b981",
    ink: "#0b1020",
    muted: "#5b6478",
    surface: "#f7f8fc",
    line: "#e4e7f0",
  },
  /** The company that operates the product and is the contracting party in its legal terms — set `SAAS_OPERATOR_NAME`; empty = not shown. */
  operator: process.env.SAAS_OPERATOR_NAME || "",
  /**
   * When the launch offer ends (ISO date-time) — `SAAS_OFFER_ENDS_AT`, default 31 Dec 2026 23:59:59 IST. It is a real deadline: the plans carry
   * a normal price above the offer price, and when this moment passes the catalogue's price becomes the normal one (see `plans.ts`,
   * `endOfferIfDue`). Subscribers who bought during the offer keep the price they bought.
   */
  offerEndsAt: process.env.SAAS_OFFER_ENDS_AT || "2026-12-31T23:59:59+05:30",
  /** Static assets under /public/selfrun. */
  assets: {
    /** The full logo (mark + name) for light and for dark backgrounds, and the mark alone. All of them live in /public/selfrun/logo. */
    logo: "/selfrun/logo/header-light.png",
    logoDark: "/selfrun/logo/header-dark.png",
    /** The originals (with their own backgrounds) the two above were cut from. */
    logoFull: "/selfrun/logo/full-light-mode-logo.png",
    logoFullDark: "/selfrun/logo/full-dark-mode-logo.png",
    name: "/selfrun/logo/name-light-mode.png",
    nameDark: "/selfrun/logo/name-dark-mode.png",
    mark: "/selfrun/logo/logo.png",
    /** Browser-tab and home-screen icons, made from the mark. */
    favicon: "/selfrun/logo/favicon-32.png",
    faviconSmall: "/selfrun/logo/favicon-16.png",
    faviconIco: "/selfrun/logo/favicon.ico",
    appleTouch: "/selfrun/logo/apple-touch-icon.png",
    icon192: "/selfrun/logo/icon-192.png",
    icon512: "/selfrun/logo/icon-512.png",
    iconMaskable: "/selfrun/logo/icon-maskable-512.png",
  },
} as const;

/** Where visitors land to start: the registration flow every customer uses. */
export const SAAS_PATHS = {
  register: "/signup",
  login: "/login",
  demo: "/demo",
  pricing: "/pricing",
  contact: "/contact",
} as const;

/** Public contact addresses of the product, from the deployment's environment; derived from the domain when unset. */
export function saasContact(host: string): { hello: string; support: string; sales: string; security: string; privacy: string } {
  const domain = host.replace(/^www\./, "");
  return {
    hello: process.env.SAAS_HELLO_EMAIL || `hello@${domain}`,
    support: process.env.SAAS_SUPPORT_EMAIL || `support@${domain}`,
    sales: process.env.SAAS_SALES_EMAIL || `sales@${domain}`,
    security: process.env.SAAS_SECURITY_EMAIL || `security@${domain}`,
    /** Privacy requests (access, correction, deletion …) and the data-protection contact. */
    privacy: process.env.SAAS_PRIVACY_EMAIL || `privacy@${domain}`,
  };
}
