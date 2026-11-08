import { sanitizeTokens, type ThemeTokens } from "@/lib/products/sitecraft-ai/theme-shared";

/**
 * Turns a few brand colours chosen for a business into a complete light + dark theme: every token derived from them with a
 * contrast check, so any palette produces readable text and visible borders. Pure — no data access.
 */

type RGB = [number, number, number];
const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

const toRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const toHex = (c: RGB) => `#${c.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
/** `t` of `b` blended into `a` (0 = a, 1 = b). */
const mix = (a: string, b: string, t: number) => {
  const x = toRgb(a), y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};
const lum = (hex: string) => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
/** Black or white, whichever reads better on `bg`. */
const readableOn = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#0b0b10") ? "#ffffff" : "#0b0b10");
/** Darkens (or lightens) `hex` until it reaches `min` contrast against `bg`. */
function ensure(hex: string, bg: string, min: number): string {
  let c = hex;
  const toward = lum(bg) > 0.5 ? "#000000" : "#ffffff";
  for (let i = 0; i < 12 && contrast(c, bg) < min; i++) c = mix(c, toward, 0.12);
  return c;
}

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  /** "white" | "warm" | "cool" | "tinted": the feel of the light-mode page background. */
  tone: string;
  radius: string;
  headingFont: string;
  bodyFont: string;
}

const TONES: Record<string, string> = { white: "#ffffff", warm: "#fbf7f1", cool: "#f4f7fb", tinted: "#f6f5fb" };

export function buildThemeTokens(p: Palette, extraCss = ""): ThemeTokens {
  const base = TONES[p.tone] ?? TONES.white;
  const bg = mix(base, p.primary, p.tone === "tinted" ? 0.05 : 0.02);
  const fg = mix("#0b0b10", p.primary, 0.14);
  const primary = ensure(p.primary, bg, 3.2);
  const card = p.tone === "white" ? "#ffffff" : mix(bg, "#ffffff", 0.7);
  const muted = mix(bg, p.primary, 0.07);
  const secondary = mix(bg, p.secondary, 0.14);
  const accent = mix(bg, p.accent, 0.18);
  const border = mix(bg, fg, 0.13);
  const colors = {
    background: bg, foreground: fg, card, cardForeground: fg, popover: card, popoverForeground: fg,
    primary, primaryForeground: readableOn(primary),
    secondary, secondaryForeground: ensure(mix(p.secondary, "#000000", 0.45), secondary, 4.5),
    muted, mutedForeground: ensure(mix(fg, bg, 0.42), muted, 4.5),
    accent, accentForeground: ensure(mix(p.accent, "#000000", 0.5), accent, 4.5),
    destructive: "#dc2626", border, input: border, ring: primary,
  };

  const dbg = mix("#0a0a10", p.primary, 0.1);
  const dfg = mix("#f5f5fa", p.primary, 0.06);
  const dprimary = mix(p.primary, "#ffffff", lum(p.primary) < 0.25 ? 0.38 : 0.12);
  const dcard = mix(dbg, "#ffffff", 0.06);
  const dmuted = mix(dbg, "#ffffff", 0.1);
  const dsecondary = mix(dbg, p.secondary, 0.3);
  const daccent = mix(dbg, p.accent, 0.3);
  const dborder = mix(dbg, "#ffffff", 0.16);
  const colorsDark = {
    background: dbg, foreground: dfg, card: dcard, cardForeground: dfg, popover: dcard, popoverForeground: dfg,
    primary: dprimary, primaryForeground: readableOn(dprimary),
    secondary: dsecondary, secondaryForeground: dfg,
    muted: dmuted, mutedForeground: ensure(mix(dfg, dbg, 0.35), dmuted, 4.5),
    accent: daccent, accentForeground: dfg,
    destructive: "#f87171", border: dborder, input: dborder, ring: dprimary,
  };

  return sanitizeTokens({
    colors,
    colorsDark,
    radius: p.radius,
    typography: { bodyFont: p.bodyFont, headingFont: p.headingFont, scale: 100 },
    brand: { gradient: p.accent, deep: mix(p.secondary, "#000000", 0.35) },
    ...(extraCss ? { customCss: extraCss } : {}),
  });
}
