/**
 * Theme tokens and the CSS they compile to — pure and client-safe, so the
 * theme customizer can compile exactly the same CSS in the browser (for its
 * instant live preview) that the server injects into the public site.
 * `theme.ts` (server-only) re-exports everything here.
 */

export interface ThemeColorTokens {
  background: string; foreground: string; card: string; cardForeground: string;
  popover: string; popoverForeground: string; primary: string; primaryForeground: string;
  secondary: string; secondaryForeground: string; muted: string; mutedForeground: string;
  accent: string; accentForeground: string; destructive: string; border: string; input: string; ring: string;
}

export interface ThemeTypography {
  /** Key into FONT_OPTIONS. */
  bodyFont: string;
  headingFont: string;
  /** Root font size as a percentage (100 = the browser default the site was designed at). */
  scale: number;
}

/** The site's two supporting brand colours (the coral gradient end and the deep blue) — themeable too. */
export interface ThemeBrand {
  gradient: string;
  deep: string;
}

export interface ThemeTokens {
  colors: ThemeColorTokens;
  colorsDark: ThemeColorTokens;
  radius: string;
  /** Absent = the site's own fonts and size (Geist, 100%). */
  typography?: ThemeTypography;
  /** Absent = the site's own coral/blue. */
  brand?: ThemeBrand;
  /** "Additional CSS", appended after the theme's variables on the public site. */
  customCss?: string;
}

// The platform's default theme (the one a company without a chosen theme falls back to), also written to
// src/app/globals.css's :root / .dark blocks.
export const FALLBACK_THEME: ThemeTokens = {
  colors: {
    background: "#ffffff", foreground: "#0b1020", card: "#ffffff", cardForeground: "#0b1020",
    popover: "#ffffff", popoverForeground: "#0b1020", primary: "#4338ca", primaryForeground: "#ffffff",
    secondary: "#eef0ff", secondaryForeground: "#312e81", muted: "#f3f4fa", mutedForeground: "#5b6478",
    accent: "#e6f8f1", accentForeground: "#0b6b4f", destructive: "#dc2626", border: "#e4e7f0", input: "#e4e7f0", ring: "#4338ca",
  },
  colorsDark: {
    background: "#0b1020", foreground: "#eef0ff", card: "#111833", cardForeground: "#eef0ff",
    popover: "#111833", popoverForeground: "#eef0ff", primary: "#7c75f5", primaryForeground: "#0b1020",
    secondary: "#1d2350", secondaryForeground: "#eef0ff", muted: "#1a2142", mutedForeground: "#a3acc9",
    accent: "#0f3a31", accentForeground: "#a7f3d0", destructive: "#f87171", border: "#27305a", input: "#27305a", ring: "#7c75f5",
  },
  radius: "0.75rem",
};

/**
 * The "classic" look: the coral-and-navy palette the products were first designed with. Companies whose theme has exactly
 * these tokens keep the original (non-"modern") product treatment; every other theme gets the modern one.
 */
export const CLASSIC_THEME: ThemeTokens = {
  colors: {
    background: "#ffffff", foreground: "#1b1a1a", card: "#ffffff", cardForeground: "#1b1a1a",
    popover: "#ffffff", popoverForeground: "#1b1a1a", primary: "#E56043", primaryForeground: "#1b1a1a",
    secondary: "#ECF2FD", secondaryForeground: "#1D428A", muted: "#f1f5f9", mutedForeground: "#64748b",
    accent: "#ECF2FD", accentForeground: "#1D428A", destructive: "#ef4444", border: "#e2e8f0", input: "#e2e8f0", ring: "#E56043",
  },
  colorsDark: {
    background: "#1b1a1a", foreground: "#ECF2FD", card: "#1b1a1a", cardForeground: "#ECF2FD",
    popover: "#1b1a1a", popoverForeground: "#ECF2FD", primary: "#E56043", primaryForeground: "#1b1a1a",
    secondary: "#1D428A", secondaryForeground: "#ECF2FD", muted: "#1D428A", mutedForeground: "#94a3b8",
    accent: "#1D428A", accentForeground: "#ECF2FD", destructive: "#ef4444", border: "#334155", input: "#334155", ring: "#E56043",
  },
  radius: "0.625rem",
};

/** True for the classic theme's own tokens (`CLASSIC_THEME`) — the original product look, kept byte-for-byte. */
export function isDefaultTokens(tokens: ThemeTokens): boolean {
  return (
    !tokens.typography && !tokens.brand && !tokens.customCss &&
    JSON.stringify([tokens.colors, tokens.colorsDark, tokens.radius]) === JSON.stringify([CLASSIC_THEME.colors, CLASSIC_THEME.colorsDark, CLASSIC_THEME.radius])
  );
}

export const DEFAULT_TYPOGRAPHY: ThemeTypography = { bodyFont: "geist", headingFont: "geist", scale: 100 };
export const DEFAULT_BRAND: ThemeBrand = { gradient: "#ff8e75", deep: "#1D428A" };

// ── Fonts ────────────────────────────────────────────────────────────────

export interface FontOption {
  key: string;
  label: string;
  /** Google Fonts family name; null = the site's self-hosted Geist (no extra download). */
  google: string | null;
  kind: "sans" | "serif" | "mono";
}

export const FONT_OPTIONS: FontOption[] = [
  { key: "geist", label: "Geist (site default)", google: null, kind: "sans" },
  { key: "inter", label: "Inter", google: "Inter", kind: "sans" },
  { key: "plus-jakarta-sans", label: "Plus Jakarta Sans", google: "Plus Jakarta Sans", kind: "sans" },
  { key: "manrope", label: "Manrope", google: "Manrope", kind: "sans" },
  { key: "dm-sans", label: "DM Sans", google: "DM Sans", kind: "sans" },
  { key: "space-grotesk", label: "Space Grotesk", google: "Space Grotesk", kind: "sans" },
  { key: "outfit", label: "Outfit", google: "Outfit", kind: "sans" },
  { key: "poppins", label: "Poppins", google: "Poppins", kind: "sans" },
  { key: "sora", label: "Sora", google: "Sora", kind: "sans" },
  { key: "ibm-plex-sans", label: "IBM Plex Sans", google: "IBM Plex Sans", kind: "sans" },
  { key: "nunito", label: "Nunito", google: "Nunito", kind: "sans" },
  { key: "source-sans-3", label: "Source Sans 3", google: "Source Sans 3", kind: "sans" },
  { key: "quicksand", label: "Quicksand", google: "Quicksand", kind: "sans" },
  { key: "playfair-display", label: "Playfair Display", google: "Playfair Display", kind: "serif" },
  { key: "lora", label: "Lora", google: "Lora", kind: "serif" },
  { key: "fraunces", label: "Fraunces", google: "Fraunces", kind: "serif" },
  { key: "jetbrains-mono", label: "JetBrains Mono", google: "JetBrains Mono", kind: "mono" },
];

const FALLBACKS = {
  sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

export function fontOption(key: string | undefined): FontOption {
  return FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0];
}

/** CSS font-family value for a font key. Geist resolves through next/font's own variable. */
export function fontStack(key: string | undefined): string {
  const f = fontOption(key);
  if (!f.google) return `var(--font-geist-sans), ${FALLBACKS.sans}`;
  return `"${f.google}", ${FALLBACKS[f.kind]}`;
}

/** One Google Fonts stylesheet URL for the given font keys (null when none need downloading). */
export function googleFontsUrl(keys: (string | undefined)[]): string | null {
  const families = [...new Set(keys.map((k) => fontOption(k).google).filter((g): g is string => !!g))];
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&")}&display=swap`;
}

// ── Sanitising (values are injected into a <style> tag) ──────────────────

const COLOR_RE = /^[#a-zA-Z0-9(),.%\s/-]{1,64}$/;
const RADIUS_RE = /^\d{1,2}(\.\d{1,3})?(rem|px|em)$|^0$/;
const COLOR_KEYS = Object.keys(FALLBACK_THEME.colors) as (keyof ThemeColorTokens)[];
export const CUSTOM_CSS_LIMIT = 20000;

function cleanColors(raw: unknown, fallback: ThemeColorTokens): ThemeColorTokens {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...fallback };
  for (const k of COLOR_KEYS) {
    const v = src[k];
    if (typeof v === "string" && COLOR_RE.test(v.trim())) out[k] = v.trim();
  }
  return out;
}

const clean = (v: unknown, re: RegExp, fallback: string) => (typeof v === "string" && re.test(v.trim()) ? v.trim() : fallback);

/** Coerces untrusted token input (e.g. from the customizer) into safe, complete tokens. */
export function sanitizeTokens(raw: unknown): ThemeTokens {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tokens: ThemeTokens = {
    colors: cleanColors(src.colors, FALLBACK_THEME.colors),
    colorsDark: cleanColors(src.colorsDark, FALLBACK_THEME.colorsDark),
    radius: clean(src.radius, RADIUS_RE, FALLBACK_THEME.radius),
  };
  const typo = src.typography as Partial<ThemeTypography> | undefined;
  if (typo && typeof typo === "object") {
    const scale = Number(typo.scale);
    tokens.typography = {
      bodyFont: fontOption(typo.bodyFont).key,
      headingFont: fontOption(typo.headingFont).key,
      scale: Number.isFinite(scale) ? Math.min(115, Math.max(85, Math.round(scale))) : 100,
    };
  }
  const brand = src.brand as Partial<ThemeBrand> | undefined;
  if (brand && typeof brand === "object") {
    tokens.brand = { gradient: clean(brand.gradient, COLOR_RE, DEFAULT_BRAND.gradient), deep: clean(brand.deep, COLOR_RE, DEFAULT_BRAND.deep) };
  }
  if (typeof src.customCss === "string" && src.customCss.trim()) tokens.customCss = src.customCss.slice(0, CUSTOM_CSS_LIMIT);
  return tokens;
}

// ── CSS ──────────────────────────────────────────────────────────────────

function colorVars(t: ThemeColorTokens): string {
  return (
    `--background:${t.background};--foreground:${t.foreground};--card:${t.card};--card-foreground:${t.cardForeground};` +
    `--popover:${t.popover};--popover-foreground:${t.popoverForeground};--primary:${t.primary};--primary-foreground:${t.primaryForeground};` +
    `--secondary:${t.secondary};--secondary-foreground:${t.secondaryForeground};--muted:${t.muted};--muted-foreground:${t.mutedForeground};` +
    `--accent:${t.accent};--accent-foreground:${t.accentForeground};--destructive:${t.destructive};--border:${t.border};--input:${t.input};--ring:${t.ring};`
  );
}

/**
 * Renders the `:root`/`.dark` CSS custom-property overrides for the given
 * tokens. A theme with no typography/brand/custom CSS (the default theme)
 * compiles to exactly the variables block it always did.
 */
export function themeCssBlock(tokens: ThemeTokens): string {
  const typo = tokens.typography;
  const fontsUrl = typo ? googleFontsUrl([typo.bodyFont, typo.headingFont]) : null;
  let css = fontsUrl ? `@import url("${fontsUrl}");` : "";

  // A theme without its own brand pair derives the gradient end-colours from ITS primary — never the default theme's coral/blue.
  const brand = tokens.brand ?? (isDefaultTokens(tokens)
    ? DEFAULT_BRAND
    : { gradient: "color-mix(in oklch,var(--primary) 72%,white)", deep: "color-mix(in oklch,var(--primary) 50%,black)" });
  const brandVars = `--brand-gradient:${brand.gradient};--brand-deep:${brand.deep};`;
  css += `:root{${colorVars(tokens.colors)}--radius:${tokens.radius};${brandVars}}.dark{${colorVars(tokens.colorsDark)}}`;


  if (typo) {
    // next/font sets --font-geist-sans with a class on <html>; `html:root` out-ranks it.
    if (typo.bodyFont !== "geist") css += `html:root{--font-geist-sans:${fontStack(typo.bodyFont)};}`;
    if (typo.headingFont !== typo.bodyFont) css += `h1,h2,h3,h4,h5,h6{font-family:${fontStack(typo.headingFont)};}`;
    if (typo.scale !== 100) css += `html{font-size:${typo.scale}%;}`;
  }
  // `<` can't appear in valid CSS outside strings; escaping it means custom CSS can never close the <style> tag.
  if (tokens.customCss?.trim()) css += `\n/* Additional CSS */\n${tokens.customCss.replace(/</g, "\\3c ")}`;
  return css;
}

/** Same CSS custom properties as `themeCssBlock`, as a React inline-style object — for scoped (non-global) preview rendering. */
export function themeCssVars(tokens: ThemeTokens, dark = false): Record<string, string> {
  const t = dark ? tokens.colorsDark : tokens.colors;
  return {
    "--background": t.background, "--foreground": t.foreground, "--card": t.card, "--card-foreground": t.cardForeground,
    "--popover": t.popover, "--popover-foreground": t.popoverForeground, "--primary": t.primary, "--primary-foreground": t.primaryForeground,
    "--secondary": t.secondary, "--secondary-foreground": t.secondaryForeground, "--muted": t.muted, "--muted-foreground": t.mutedForeground,
    "--accent": t.accent, "--accent-foreground": t.accentForeground, "--destructive": t.destructive,
    "--border": t.border, "--input": t.input, "--ring": t.ring, "--radius": tokens.radius,
    ...(tokens.brand ? { "--brand-gradient": tokens.brand.gradient, "--brand-deep": tokens.brand.deep } : {}),
  };
}

// ── Themed photos ────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.5, 0.5, 0.5];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function duotone(id: string, shadow: [number, number, number], light: [number, number, number], strength: number): string {
  const f = (i: number) => `${shadow[i].toFixed(3)} ${light[i].toFixed(3)}`;
  return (
    `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">` +
    `<feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" result="gray"/>` +
    `<feComponentTransfer in="gray" result="duo"><feFuncR type="table" tableValues="${f(0)}"/><feFuncG type="table" tableValues="${f(1)}"/><feFuncB type="table" tableValues="${f(2)}"/></feComponentTransfer>` +
    `<feComposite in="duo" in2="SourceGraphic" operator="arithmetic" k1="0" k2="${strength}" k3="${(1 - strength).toFixed(2)}" k4="0"/>` +
    `</filter>`
  );
}

/**
 * Inline SVG `<filter>`s that tone photos with a theme: shadows lean to the theme's deep colour, highlights to a pale
 * tint of its primary, blended with the original so photos stay recognisable. `#theme-photo` for light mode,
 * `#theme-photo-dark` for dark — referenced by the CSS `layoutCss()` emits.
 */
export function themePhotoFilters(tokens: ThemeTokens): string {
  const deep = rgb((tokens.brand ?? DEFAULT_BRAND).deep);
  const prim = rgb(tokens.colors.primary);
  const primDark = rgb(tokens.colorsDark.primary);
  const bgDark = rgb(tokens.colorsDark.background);
  const white: [number, number, number] = [1, 1, 1];
  const black: [number, number, number] = [0, 0, 0];
  return (
    duotone("theme-photo", mix(deep, black, 0.35), mix(prim, white, 0.82), 0.62) +
    duotone("theme-photo-dark", mix(bgDark, deep, 0.35), mix(primDark, white, 0.45), 0.6)
  );
}
