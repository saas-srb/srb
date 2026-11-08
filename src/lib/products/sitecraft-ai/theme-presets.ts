import type { ThemeColorTokens, ThemeTokens } from "@/lib/products/sitecraft-ai/theme-shared";
import type { ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";

/**
 * The built-in theme library (like WordPress's "Add Themes" screen). Pure data,
 * client-safe. A preset can be live-previewed and customized without being
 * installed; installing it copies it into `cms_theme` as a normal, editable
 * theme whose key is the preset's id — the library entry itself never changes.
 */
export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  tags: string[];
  tokens: ThemeTokens;
  components: ThemeComponentSelections;
}

export const THEME_CATEGORIES = ["Business", "Technology", "Creative", "Minimal", "Lifestyle"] as const;
export type ThemeCategory = (typeof THEME_CATEGORIES)[number];

type Palette = Pick<
  ThemeColorTokens,
  "background" | "foreground" | "primary" | "primaryForeground" | "secondary" | "secondaryForeground" | "muted" | "mutedForeground" | "accent" | "accentForeground" | "border"
> & Partial<ThemeColorTokens>;

/** Fills the derived tokens (card/popover/input/ring/destructive) from a palette's core colours. */
function colors(p: Palette): ThemeColorTokens {
  return {
    card: p.background, cardForeground: p.foreground, popover: p.card ?? p.background, popoverForeground: p.foreground,
    input: p.border, ring: p.primary, destructive: "#ef4444",
    ...p,
  };
}

/**
 * Each library theme changes the site's STRUCTURE, not only its colours: its own
 * header, footer, page width, section spacing and section layouts.
 */
const STRUCTURE: Record<string, ThemeComponentSelections> = {
  aurora: { menu: "default", header: "floating", footer: "default", images: "themed", cards: "glass", sections: { "home-hero": "centered", "home-how-we-work": "timeline", "listing-hero": "centered", "faq-accordion": "cards", "detail-cta": "banner" } },
  "midnight-tech": { menu: "tiles", header: "menu", footer: "default", width: "wide", images: "themed", cards: "outline", sections: { "page-hero": "terminal", "home-hero": "spotlight", "listing-grid": "compact", "home-why-choose-us": "list", "listing-hero": "banner", "faq-accordion": "split", "detail-cta": "split" } },
  "emerald-finance": { menu: "list", header: "centered", footer: "centered", images: "themed", cards: "elevated", sections: { "page-hero": "minimal", "home-why-choose-us": "split", "home-how-we-work": "numbered", "listing-hero": "split", "faq-accordion": "split", "detail-cta": "default" } },
  "corporate-blue": { menu: "default", header: "default", footer: "compact", density: "compact", images: "themed", cards: "classic", sections: { "page-hero": "banner", "listing-grid": "list", "listing-hero": "banner", "faq-accordion": "default", "detail-cta": "split" } },
  "sunset-studio": { menu: "tiles", header: "floating", footer: "split", density: "spacious", images: "themed", cards: "elevated", sections: { "home-hero": "spotlight", "listing-grid": "list", "home-how-we-work": "timeline", "page-hero": "banner", "listing-hero": "split", "faq-accordion": "cards", "detail-cta": "banner" } },
  monochrome: { menu: "minimal", header: "menu", footer: "minimal", width: "narrow", images: "themed", cards: "outline", sections: { "page-hero": "minimal", "home-why-choose-us": "list", "home-how-we-work": "numbered", "listing-grid": "compact", "listing-hero": "centered", "faq-accordion": "split", "detail-cta": "default" } },
  "royal-luxe": { menu: "list", header: "centered", footer: "split", width: "narrow", density: "spacious", images: "themed", cards: "glass", sections: { "home-hero": "centered", "page-hero": "minimal", "home-why-choose-us": "split", "listing-hero": "centered", "faq-accordion": "default", "detail-cta": "banner" } },
  "ocean-breeze": { menu: "list", header: "floating", footer: "centered", images: "themed", cards: "elevated", sections: { "home-hero": "centered", "home-how-we-work": "timeline", "listing-grid": "compact", "listing-hero": "split", "faq-accordion": "cards", "detail-cta": "split" } },
  "crimson-edge": { menu: "minimal", header: "default", footer: "split", density: "compact", images: "themed", cards: "outline", sections: { "home-hero": "spotlight", "page-hero": "banner", "home-why-choose-us": "list", "listing-grid": "list", "listing-hero": "banner", "faq-accordion": "split", "detail-cta": "banner" } },
  "forest-clay": { menu: "minimal", header: "centered", footer: "default", width: "narrow", images: "themed", cards: "classic", sections: { "page-hero": "minimal", "listing-grid": "list", "home-how-we-work": "timeline", "listing-hero": "split", "faq-accordion": "default", "detail-cta": "default" } },
  "neon-cyber": { menu: "tiles", header: "menu", footer: "minimal", width: "wide", images: "themed", cards: "glass", sections: { "page-hero": "terminal", "home-hero": "centered", "listing-grid": "compact", "home-how-we-work": "numbered", "listing-hero": "banner", "faq-accordion": "cards", "detail-cta": "split" } },
  "graphite-pro": { menu: "list", header: "default", footer: "split", density: "compact", images: "themed", cards: "elevated", sections: { "page-hero": "banner", "home-why-choose-us": "list", "listing-grid": "compact", "listing-hero": "split", "faq-accordion": "split", "detail-cta": "banner" } },
  "candy-pastel": { menu: "tiles", header: "floating", footer: "centered", density: "spacious", images: "themed", cards: "elevated", sections: { "home-hero": "centered", "home-why-choose-us": "split", "home-how-we-work": "timeline", "listing-hero": "centered", "faq-accordion": "cards", "detail-cta": "default" } },
  editorial: { menu: "minimal", header: "centered", footer: "minimal", width: "narrow", images: "themed", cards: "outline", sections: { "page-hero": "minimal", "listing-grid": "list", "home-why-choose-us": "list", "listing-hero": "split", "faq-accordion": "split", "detail-cta": "split" } },
};

function preset(
  id: string, name: string, category: ThemeCategory, description: string, tags: string[],
  t: { light: Palette; dark: Palette; radius: string; body: string; heading: string; scale?: number; gradient: string; deep: string },
  components: ThemeComponentSelections = {}
): ThemePreset {
  return {
    id, name, category, description, tags, components: STRUCTURE[id] ?? components,
    tokens: {
      colors: colors(t.light),
      colorsDark: colors(t.dark),
      radius: t.radius,
      typography: { bodyFont: t.body, headingFont: t.heading, scale: t.scale ?? 100 },
      brand: { gradient: t.gradient, deep: t.deep },
    },
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  preset("aurora", "Aurora", "Technology", "Indigo-to-violet SaaS look with soft rounded cards and Plus Jakarta Sans headlines.", ["SaaS", "Gradient", "Rounded"], {
    light: { background: "#ffffff", foreground: "#0f172a", primary: "#6366f1", primaryForeground: "#ffffff", secondary: "#eef2ff", secondaryForeground: "#3730a3", muted: "#f8fafc", mutedForeground: "#64748b", accent: "#f5f3ff", accentForeground: "#5b21b6", border: "#e2e8f0" },
    dark: { background: "#0b1020", foreground: "#e0e7ff", card: "#111735", primary: "#818cf8", primaryForeground: "#0b1020", secondary: "#1e1b4b", secondaryForeground: "#e0e7ff", muted: "#161c3a", mutedForeground: "#94a3b8", accent: "#1e1b4b", accentForeground: "#c7d2fe", border: "#252b4d" },
    radius: "0.875rem", body: "inter", heading: "plus-jakarta-sans", gradient: "#a855f7", deep: "#312e81",
  }),
  preset("midnight-tech", "Midnight Tech", "Technology", "Cyan-on-navy engineering aesthetic with a terminal-style hero, wide pages and a minimal menu header.", ["Developer", "Dark-friendly", "Terminal"], {
    light: { background: "#ffffff", foreground: "#0f172a", primary: "#0891b2", primaryForeground: "#ffffff", secondary: "#ecfeff", secondaryForeground: "#155e75", muted: "#f1f5f9", mutedForeground: "#64748b", accent: "#cffafe", accentForeground: "#164e63", border: "#e2e8f0" },
    dark: { background: "#020617", foreground: "#e2e8f0", card: "#0b1224", primary: "#22d3ee", primaryForeground: "#020617", secondary: "#0c4a6e", secondaryForeground: "#e0f2fe", muted: "#0f172a", mutedForeground: "#94a3b8", accent: "#083344", accentForeground: "#a5f3fc", border: "#1e293b" },
    radius: "0.5rem", body: "inter", heading: "space-grotesk", gradient: "#3b82f6", deep: "#0c4a6e",
  }, { header: "menu", sections: { "page-hero": "terminal" } }),
  preset("emerald-finance", "Emerald Finance", "Business", "Trustworthy greens for fintech and consulting, with calm spacing and DM Sans body text.", ["Fintech", "Trust", "Clean"], {
    light: { background: "#ffffff", foreground: "#0b1f17", primary: "#059669", primaryForeground: "#ffffff", secondary: "#ecfdf5", secondaryForeground: "#065f46", muted: "#f5f7f6", mutedForeground: "#5f6b66", accent: "#d1fae5", accentForeground: "#064e3b", border: "#e3e9e6" },
    dark: { background: "#06140f", foreground: "#e7f5ee", card: "#0b1f18", primary: "#34d399", primaryForeground: "#06140f", secondary: "#064e3b", secondaryForeground: "#d1fae5", muted: "#0f2a21", mutedForeground: "#8fa89c", accent: "#064e3b", accentForeground: "#a7f3d0", border: "#1a3a2e" },
    radius: "0.75rem", body: "dm-sans", heading: "plus-jakarta-sans", gradient: "#14b8a6", deep: "#065f46",
  }),
  preset("corporate-blue", "Corporate Blue", "Business", "Enterprise-grade blue with crisp corners, IBM Plex Sans and a compact footer.", ["Enterprise", "Formal", "Compact"], {
    light: { background: "#ffffff", foreground: "#111827", primary: "#1d4ed8", primaryForeground: "#ffffff", secondary: "#eff6ff", secondaryForeground: "#1e3a8a", muted: "#f3f4f6", mutedForeground: "#6b7280", accent: "#dbeafe", accentForeground: "#1e3a8a", border: "#e5e7eb" },
    dark: { background: "#0a0f1c", foreground: "#e5e7eb", card: "#111827", primary: "#3b82f6", primaryForeground: "#ffffff", secondary: "#1e3a8a", secondaryForeground: "#dbeafe", muted: "#1f2937", mutedForeground: "#9ca3af", accent: "#1e3a8a", accentForeground: "#bfdbfe", border: "#1f2937" },
    radius: "0.375rem", body: "ibm-plex-sans", heading: "ibm-plex-sans", gradient: "#0ea5e9", deep: "#1e3a8a",
  }, { footer: "compact" }),
  preset("sunset-studio", "Sunset Studio", "Creative", "Warm rose-and-amber palette for agencies and studios, with generous radius and Outfit headlines.", ["Agency", "Warm", "Bold"], {
    light: { background: "#fffcf9", foreground: "#1c1917", primary: "#f43f5e", primaryForeground: "#ffffff", secondary: "#fff1f2", secondaryForeground: "#9f1239", muted: "#fff7ed", mutedForeground: "#78716c", accent: "#ffedd5", accentForeground: "#9a3412", border: "#f5e6dc" },
    dark: { background: "#1a0f0d", foreground: "#fdece4", card: "#24140f", primary: "#fb7185", primaryForeground: "#1a0f0d", secondary: "#4c1d24", secondaryForeground: "#ffe4e6", muted: "#2a1a15", mutedForeground: "#a8a29e", accent: "#431407", accentForeground: "#fed7aa", border: "#3b2620" },
    radius: "1rem", body: "dm-sans", heading: "outfit", gradient: "#f59e0b", deep: "#9f1239",
  }),
  preset("monochrome", "Monochrome", "Minimal", "Strict black and white with sharp corners, Manrope throughout, a menu header, minimal footer and narrow pages.", ["Minimal", "High contrast", "Editorial"], {
    light: { background: "#ffffff", foreground: "#09090b", primary: "#111111", primaryForeground: "#ffffff", secondary: "#f4f4f5", secondaryForeground: "#18181b", muted: "#f4f4f5", mutedForeground: "#71717a", accent: "#f4f4f5", accentForeground: "#18181b", border: "#e4e4e7" },
    dark: { background: "#09090b", foreground: "#fafafa", card: "#111113", primary: "#fafafa", primaryForeground: "#09090b", secondary: "#27272a", secondaryForeground: "#fafafa", muted: "#18181b", mutedForeground: "#a1a1aa", accent: "#27272a", accentForeground: "#fafafa", border: "#27272a" },
    radius: "0.25rem", body: "manrope", heading: "manrope", gradient: "#52525b", deep: "#18181b",
  }, { header: "menu", footer: "compact" }),
  preset("royal-luxe", "Royal Luxe", "Lifestyle", "Deep violet with gold accents and elegant Playfair Display headings — premium and refined.", ["Luxury", "Serif", "Elegant"], {
    light: { background: "#fdfcff", foreground: "#1e1433", primary: "#7c3aed", primaryForeground: "#ffffff", secondary: "#f5f3ff", secondaryForeground: "#4c1d95", muted: "#f7f5fb", mutedForeground: "#6b6280", accent: "#fef3c7", accentForeground: "#78350f", border: "#ece7f5" },
    dark: { background: "#120b1f", foreground: "#ede9fe", card: "#1a1130", primary: "#a78bfa", primaryForeground: "#120b1f", secondary: "#2e1065", secondaryForeground: "#ede9fe", muted: "#1f1535", mutedForeground: "#a99bc4", accent: "#3b2a0b", accentForeground: "#fde68a", border: "#2d2345" },
    radius: "0.5rem", body: "inter", heading: "playfair-display", gradient: "#d97706", deep: "#4c1d95",
  }),
  preset("ocean-breeze", "Ocean Breeze", "Lifestyle", "Fresh sky blues and teals with pill-soft corners, Nunito body text and Sora headings.", ["Friendly", "Airy", "Rounded"], {
    light: { background: "#ffffff", foreground: "#0c2231", primary: "#0284c7", primaryForeground: "#ffffff", secondary: "#f0f9ff", secondaryForeground: "#075985", muted: "#f1f7fa", mutedForeground: "#5b7083", accent: "#ccfbf1", accentForeground: "#115e59", border: "#dceaf2" },
    dark: { background: "#041621", foreground: "#e0f2fe", card: "#07202f", primary: "#38bdf8", primaryForeground: "#041621", secondary: "#0c4a6e", secondaryForeground: "#e0f2fe", muted: "#0a2a3b", mutedForeground: "#8aa6b8", accent: "#134e4a", accentForeground: "#99f6e4", border: "#123548" },
    radius: "1.25rem", body: "nunito", heading: "sora", gradient: "#14b8a6", deep: "#075985",
  }),
  preset("crimson-edge", "Crimson Edge", "Creative", "Confident red on near-black with zero-radius, square-cut components and Sora headlines.", ["Bold", "Sharp", "Statement"], {
    light: { background: "#ffffff", foreground: "#111111", primary: "#dc2626", primaryForeground: "#ffffff", secondary: "#fef2f2", secondaryForeground: "#991b1b", muted: "#f5f5f5", mutedForeground: "#6b6b6b", accent: "#fee2e2", accentForeground: "#7f1d1d", border: "#e5e5e5" },
    dark: { background: "#0d0d0d", foreground: "#f5f5f5", card: "#161616", primary: "#ef4444", primaryForeground: "#ffffff", secondary: "#3f0d0d", secondaryForeground: "#fee2e2", muted: "#1c1c1c", mutedForeground: "#a3a3a3", accent: "#450a0a", accentForeground: "#fecaca", border: "#262626" },
    radius: "0rem", body: "inter", heading: "sora", gradient: "#f97316", deep: "#7f1d1d",
  }),
  preset("forest-clay", "Forest & Clay", "Lifestyle", "Earthy olive and clay tones on warm paper, with Lora serif headings — natural and grounded.", ["Sustainable", "Organic", "Serif"], {
    light: { background: "#fbfaf6", foreground: "#1f2a1a", primary: "#4d7c0f", primaryForeground: "#ffffff", secondary: "#f1f5e9", secondaryForeground: "#365314", muted: "#f3f1ea", mutedForeground: "#6b6a5e", accent: "#f5e6d8", accentForeground: "#7c2d12", border: "#e7e3d6" },
    dark: { background: "#11160e", foreground: "#ecebdd", card: "#182014", primary: "#a3e635", primaryForeground: "#11160e", secondary: "#1f2e15", secondaryForeground: "#ecfccb", muted: "#1c2318", mutedForeground: "#a3a18f", accent: "#3b2415", accentForeground: "#fed7aa", border: "#2a3322" },
    radius: "0.625rem", body: "source-sans-3", heading: "lora", gradient: "#b45309", deep: "#365314",
  }),
  preset("neon-cyber", "Neon Cyber", "Technology", "Electric magenta and cyan in Space Grotesk, with the terminal hero and menu header — best in dark mode.", ["Futuristic", "Gaming", "Terminal"], {
    light: { background: "#ffffff", foreground: "#120b1c", primary: "#c026d3", primaryForeground: "#ffffff", secondary: "#fdf4ff", secondaryForeground: "#86198f", muted: "#f6f3fa", mutedForeground: "#6e6680", accent: "#cffafe", accentForeground: "#155e75", border: "#ebe4f2" },
    dark: { background: "#07030f", foreground: "#f5e8ff", card: "#0f0820", primary: "#e879f9", primaryForeground: "#07030f", secondary: "#3b0a45", secondaryForeground: "#fae8ff", muted: "#150c27", mutedForeground: "#a08fb8", accent: "#083344", accentForeground: "#67e8f9", border: "#25173d" },
    radius: "0.75rem", body: "space-grotesk", heading: "space-grotesk", gradient: "#06b6d4", deep: "#581c87",
  }, { header: "menu", sections: { "page-hero": "terminal" } }),
  preset("graphite-pro", "Graphite Pro", "Business", "Graphite neutrals with a sharp amber call-to-action — industrial, professional and focused.", ["Consulting", "Industrial", "Neutral"], {
    light: { background: "#ffffff", foreground: "#111827", primary: "#f59e0b", primaryForeground: "#111827", secondary: "#f3f4f6", secondaryForeground: "#111827", muted: "#f3f4f6", mutedForeground: "#6b7280", accent: "#fef3c7", accentForeground: "#78350f", border: "#e5e7eb" },
    dark: { background: "#0f1115", foreground: "#f3f4f6", card: "#161920", primary: "#fbbf24", primaryForeground: "#0f1115", secondary: "#1f232b", secondaryForeground: "#f3f4f6", muted: "#1a1d24", mutedForeground: "#9ca3af", accent: "#3a2a0a", accentForeground: "#fde68a", border: "#262a33" },
    radius: "0.5rem", body: "inter", heading: "manrope", gradient: "#ef4444", deep: "#1f2937",
  }),
  preset("candy-pastel", "Candy Pastel", "Creative", "Playful pink and lavender with extra-round corners and Quicksand headings — great for education and kids.", ["Playful", "Education", "Soft"], {
    light: { background: "#fffbfe", foreground: "#2a1b2e", primary: "#ec4899", primaryForeground: "#ffffff", secondary: "#f5f3ff", secondaryForeground: "#5b21b6", muted: "#faf5ff", mutedForeground: "#7c6a86", accent: "#fce7f3", accentForeground: "#9d174d", border: "#f1e4f0" },
    dark: { background: "#1a1020", foreground: "#fbe7f3", card: "#22152a", primary: "#f472b6", primaryForeground: "#1a1020", secondary: "#2e1a45", secondaryForeground: "#ede9fe", muted: "#24172e", mutedForeground: "#b49ac0", accent: "#4a1734", accentForeground: "#fbcfe8", border: "#3a2743" },
    radius: "1.5rem", body: "nunito", heading: "quicksand", gradient: "#8b5cf6", deep: "#6d28d9",
  }),
  preset("editorial", "Editorial", "Minimal", "Magazine-style ink on warm paper with Fraunces serif headlines, hairline corners, a centered header and a minimal footer.", ["Blog", "Publishing", "Serif"], {
    light: { background: "#fffdf8", foreground: "#1c1917", primary: "#1f2937", primaryForeground: "#ffffff", secondary: "#f5f0e6", secondaryForeground: "#44403c", muted: "#f5f2eb", mutedForeground: "#78716c", accent: "#fef3c7", accentForeground: "#78350f", border: "#e7e0d2" },
    dark: { background: "#151311", foreground: "#f5f0e6", card: "#1c1917", primary: "#f5f0e6", primaryForeground: "#151311", secondary: "#292524", secondaryForeground: "#f5f0e6", muted: "#1f1c19", mutedForeground: "#a8a29e", accent: "#3a2e14", accentForeground: "#fde68a", border: "#2e2a26" },
    radius: "0.125rem", body: "source-sans-3", heading: "fraunces", scale: 102, gradient: "#b45309", deep: "#292524",
  }, { footer: "compact" }),
];

export function getThemePreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}
