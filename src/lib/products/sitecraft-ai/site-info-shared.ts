/**
 * Site identity & contact — the header/footer "chrome" content that isn't a
 * navigation item or a footer link column: brand wordmark + logo, header CTA,
 * contact details, social links and the footer's CTA strip / intro / copyright.
 *
 * Pure module (no server-only) so client components can import the type.
 * The content lives only in the CMS: the `cms_settings` doc's `siteInfo`
 * (see `site-info.ts`), seeded from `cms-seed/site-info.json`.
 */

import { EMPTY_UI_LABELS, parseUiLabels, type UiLabels } from "@/lib/products/sitecraft-ai/ui-labels";

export interface SiteLink {
  label: string;
  href: string;
}

export interface SiteSocialLink {
  /** Facebook, GitHub, X (Twitter), Instagram, YouTube get their brand icon; any other name gets a generic link icon. */
  name: string;
  href: string;
}

/**
 * Which pieces of the header, footer and floating button are shown. Defaults
 * match the original site; an element whose content is empty (no WhatsApp
 * link, no phone …) is also hidden regardless of its switch.
 */
export interface SiteDisplay {
  header: { themeToggle: boolean; askAi: boolean; authLinks: boolean; cta: boolean; social: boolean; contactTiles: boolean };
  footer: { ctaBand: boolean; whatsappButton: boolean; contact: boolean; social: boolean; about: boolean; bottomBar: boolean };
  floating: { enabled: boolean; assistant: boolean; whatsapp: boolean; liveChat: boolean };
}

export const DEFAULT_DISPLAY: SiteDisplay = {
  header: { themeToggle: true, askAi: true, authLinks: true, cta: true, social: false, contactTiles: true },
  footer: { ctaBand: true, whatsappButton: true, contact: true, social: true, about: true, bottomBar: false },
  floating: { enabled: true, assistant: true, whatsapp: true, liveChat: true },
};

export const DISPLAY_LABELS: { group: keyof SiteDisplay; title: string; items: { key: string; label: string }[] }[] = [
  {
    group: "header",
    title: "Header",
    items: [
      { key: "themeToggle", label: "Light / dark mode toggle" },
      { key: "askAi", label: "AI assistant link" },
      { key: "authLinks", label: "Login / Dashboard link" },
      { key: "cta", label: "Call-to-action button" },
      { key: "social", label: "Social icons in the header bar" },
      { key: "contactTiles", label: "Mobile menu — contact tiles (consultation, chat, WhatsApp)" },
    ],
  },
  {
    group: "footer",
    title: "Footer",
    items: [
      { key: "ctaBand", label: "Call-to-action band" },
      { key: "whatsappButton", label: "WhatsApp button" },
      { key: "contact", label: "Email & phone" },
      { key: "social", label: "Social icons" },
      { key: "about", label: "About paragraph" },
      { key: "bottomBar", label: "Copyright & legal links bar" },
    ],
  },
  {
    group: "floating",
    title: "Floating contact button",
    items: [
      { key: "enabled", label: "Show the floating button" },
      { key: "assistant", label: "AI assistant" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "liveChat", label: "Live chat" },
    ],
  },
];

function parseDisplay(raw: unknown): SiteDisplay {
  const r = rec(raw);
  const group = <K extends keyof SiteDisplay>(k: K): SiteDisplay[K] => {
    const src = rec(r[k]);
    const def = DEFAULT_DISPLAY[k] as Record<string, boolean>;
    return Object.fromEntries(Object.entries(def).map(([key, v]) => [key, typeof src[key] === "boolean" ? src[key] : v])) as SiteDisplay[K];
  };
  return { header: group("header"), footer: group("footer"), floating: group("floating") };
}

export interface SiteInfo {
  display: SiteDisplay;
  /** Set at render time from CMS → Settings → Tracking (not part of Site Identity): the Tawk.to widget id, or "" for no live chat. */
  liveChatId?: string;
  brand: {
    /** Wordmark is rendered two-tone: `namePrimary` in the text colour, `nameAccent` in the brand colour. */
    namePrimary: string;
    nameAccent: string;
    subtitle: string;
    /** Empty = the company's generated monogram (the platform owner's own site keeps its built-in logo). */
    logoUrl: string;
    /** Optional logo for dark mode; empty = the same logo in both modes. */
    logoDarkUrl: string;
  };
  header: {
    ctaLabel: string;
    ctaHref: string;
    /** Heading above the social icons in the mobile menu. */
    followLabel: string;
    askAiLabel: string;
    askAiHref: string;
    /** Tag on a mega-menu column's featured card. */
    featuredLabel: string;
    /** Mobile menu contact tiles. */
    consultLabel: string;
    consultHref: string;
    liveChatLabel: string;
    whatsappLabel: string;
    /** Portal account links. */
    dashboardLabel: string;
    loginLabel: string;
    signupLabel: string;
  };
  /** The floating contact button's menu. */
  floating: {
    assistantLabel: string;
    whatsappLabel: string;
    liveChatLabel: string;
  };
  contact: {
    email: string;
    phoneDisplay: string;
    phoneHref: string;
    whatsappHref: string;
    linkedinHref: string;
    mapsUrl: string;
    /** Street address shown after "<wordmark> <addressName>" on the contact page — one line per row. */
    addressName: string;
    address: string;
  };
  social: SiteSocialLink[];
  footer: {
    badge: string;
    ctaTitle: string;
    ctaText: string;
    ctaLabel: string;
    ctaHref: string;
    whatsappLabel: string;
    about: string;
    followLabel: string;
    /** Shown after "© <year> <wordmark>" in the (currently hidden) bottom bar. */
    copyright: string;
    /** The (currently hidden) bottom bar's legal links. */
    legalLinks: SiteLink[];
    /** The compact footer style's bottom links. */
    compactLinks: SiteLink[];
  };
  /** The site-wide social share image (generated) and its alt text. */
  shareImage: {
    alt: string;
    tag: string;
    headline: string;
    subline: string;
    domain: string;
    badges: string[];
  };
  /** Interface text for shared components — see `ui-labels.ts`. */
  labels: UiLabels;
  /** Keyed page & widget text (chat widget, offers & rewards pages …) — see `TextContext`. */
  text: Record<string, string>;
}

/** The shape with no content — what a missing field reads as. The content itself lives only in the CMS. */
export const EMPTY_SITE_INFO: SiteInfo = {
  display: DEFAULT_DISPLAY,
  brand: { namePrimary: "", nameAccent: "", subtitle: "", logoUrl: "", logoDarkUrl: "" },
  header: {
    ctaLabel: "", ctaHref: "", followLabel: "", askAiLabel: "", askAiHref: "", featuredLabel: "",
    consultLabel: "", consultHref: "", liveChatLabel: "", whatsappLabel: "", dashboardLabel: "", loginLabel: "", signupLabel: "",
  },
  floating: { assistantLabel: "", whatsappLabel: "", liveChatLabel: "" },
  contact: { email: "", phoneDisplay: "", phoneHref: "", whatsappHref: "", linkedinHref: "", mapsUrl: "", addressName: "", address: "" },
  social: [],
  footer: { badge: "", ctaTitle: "", ctaText: "", ctaLabel: "", ctaHref: "", whatsappLabel: "", about: "", followLabel: "", copyright: "", legalLinks: [], compactLinks: [] },
  shareImage: { alt: "", tag: "", headline: "", subline: "", domain: "", badges: [] },
  labels: EMPTY_UI_LABELS,
  text: {},
};

/** Multi-line fields keep their inner whitespace (a line's leading space is part of today's markup); the rest are trimmed. */
const MULTILINE = new Set(["address"]);
const str = (v: unknown, fallback: string, max = 1000, key = "") =>
  typeof v !== "string" ? fallback : (MULTILINE.has(key) ? v.replace(/\r\n/g, "\n").replace(/^\s+$|\s+$/g, "") : v.trim()).slice(0, max);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Normalises a stored value; a missing field reads as empty. */
export function parseSiteInfo(raw: unknown): SiteInfo {
  const r = rec(raw);
  const d = EMPTY_SITE_INFO;
  const pick = <K extends keyof SiteInfo>(k: K) => rec(r[k]);
  const obj = <T extends Record<string, string>>(src: Record<string, unknown>, def: T): T =>
    Object.fromEntries(Object.entries(def).map(([k, v]) => [k, str(src[k], v, 1000, k)])) as T;
  const links = (v: unknown): SiteLink[] =>
    Array.isArray(v)
      ? v.map((x) => ({ label: str(rec(x).label, "", 120), href: str(rec(x).href, "", 500) })).filter((x) => x.label && x.href).slice(0, 20)
      : [];
  const footer = pick("footer");
  const { legalLinks: _l, compactLinks: _c, ...footerText } = d.footer;
  const { badges: _b, ...shareText } = d.shareImage;
  const social = Array.isArray(r.social)
    ? r.social
        .map((s) => ({ name: str(rec(s).name, "", 60), href: str(rec(s).href, "", 500) }))
        .filter((s) => s.name && s.href)
        .slice(0, 20)
    : [];
  return {
    display: parseDisplay(r.display),
    brand: obj(pick("brand"), d.brand),
    header: obj(pick("header"), d.header),
    contact: obj(pick("contact"), d.contact),
    social,
    floating: obj(pick("floating"), d.floating),
    footer: { ...obj(footer, footerText), legalLinks: links(footer.legalLinks), compactLinks: links(footer.compactLinks) },
    shareImage: {
      ...obj(pick("shareImage"), shareText),
      badges: Array.isArray(pick("shareImage").badges) ? (pick("shareImage").badges as unknown[]).map((b) => str(b, "", 60)).filter(Boolean).slice(0, 6) : [],
    },
    labels: parseUiLabels(r.labels),
    text: parseTextDictionary(r.text),
  };
}

/** A keyed text dictionary: keys like "offers.hero.title", values kept verbatim (some carry meaningful spaces). */
export function parseTextDictionary(raw: unknown): Record<string, string> {
  const r = rec(raw);
  return Object.fromEntries(
    Object.entries(r).filter(([k, v]) => /^[a-z0-9][a-z0-9._-]{0,120}$/i.test(k) && typeof v === "string").map(([k, v]) => [k, (v as string).slice(0, 4000)])
  );
}
