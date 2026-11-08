import type { ThemeTokens } from "@/lib/products/sitecraft-ai/theme-shared";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

const c = SAAS_BRAND.colors;

/**
 * The product's own colour theme for the screens served on the SaaS host that use the shared UI kit (sign-up, the
 * Platform Console). Customers' workspaces use their own themes; this one never reaches them.
 */
export const SAAS_THEME: ThemeTokens = {
  colors: {
    background: "#ffffff", foreground: c.ink, card: "#ffffff", cardForeground: c.ink,
    popover: "#ffffff", popoverForeground: c.ink, primary: c.primary, primaryForeground: "#ffffff",
    secondary: "#eef0ff", secondaryForeground: c.primaryDark, muted: "#f3f4fa", mutedForeground: c.muted,
    accent: "#e6f8f1", accentForeground: "#0b6b4f", destructive: "#dc2626", border: c.line, input: c.line, ring: c.primary,
  },
  colorsDark: {
    background: "#0b1020", foreground: "#eef0ff", card: "#111833", cardForeground: "#eef0ff",
    popover: "#111833", popoverForeground: "#eef0ff", primary: "#7c75f5", primaryForeground: "#0b1020",
    secondary: "#1d2350", secondaryForeground: "#eef0ff", muted: "#1a2142", mutedForeground: "#a3acc9",
    accent: "#0f3a31", accentForeground: "#a7f3d0", destructive: "#f87171", border: "#27305a", input: "#27305a", ring: "#7c75f5",
  },
  radius: "0.75rem",
  brand: { gradient: c.accent, deep: c.primaryDark },
};
