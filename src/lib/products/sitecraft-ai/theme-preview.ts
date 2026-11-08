import "server-only";
import { cookies, draftMode } from "next/headers";
import { getActiveThemeKey, getActiveThemeState, getTheme, type ThemeTokens } from "@/lib/products/sitecraft-ai/theme";
import { getThemePreset } from "@/lib/products/sitecraft-ai/theme-presets";
import { normalizeSelections, type ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";

/**
 * Theme live preview (the CMS customizer's iframe). A CMS user opens
 * `/api/sitecraft-ai/theme-preview`, which turns on Next's Draft Mode for their
 * browser and stores which theme to preview in THEME_PREVIEW_COOKIE. The
 * public site then renders that theme instead of the active one — for that
 * browser only. Everyone else keeps getting the cached site with the active
 * theme; `cookies()` is only read when Draft Mode is on, so pages stay
 * statically renderable.
 */
export const THEME_PREVIEW_COOKIE = "cms_theme_preview";

export interface ThemePreviewCookie {
  /** Installed theme key, or a theme-library preset id. */
  theme: string;
  components?: ThemeComponentSelections;
}

export interface SiteThemeState {
  tokens: ThemeTokens;
  components: Required<ThemeComponentSelections>;
  /** Set only while previewing: the theme key and its display name. */
  preview: { key: string; name: string } | null;
}

export async function readThemePreviewCookie(): Promise<ThemePreviewCookie | null> {
  try {
    if (!(await draftMode()).isEnabled) return null;
    const raw = (await cookies()).get(THEME_PREVIEW_COOKIE)?.value;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ThemePreviewCookie;
    return typeof parsed?.theme === "string" ? parsed : null;
  } catch {
    // Outside a request (static generation) or a malformed cookie: no preview.
    return null;
  }
}

/** The theme the preview cookie points at — an installed theme's DRAFT, or a library preset. */
async function loadPreviewTheme(c: ThemePreviewCookie): Promise<SiteThemeState | null> {
  const installed = await getTheme(c.theme).catch(() => null);
  if (installed) {
    return {
      tokens: installed.draftTokens ?? installed.tokens,
      components: normalizeSelections(c.components ?? installed.draftComponents ?? installed.components),
      preview: { key: installed._id, name: installed.name },
    };
  }
  const preset = getThemePreset(c.theme);
  if (!preset) return null;
  return { tokens: preset.tokens, components: normalizeSelections(c.components ?? preset.components), preview: { key: preset.id, name: preset.name } };
}

/** What the public site renders with: the previewed theme for a CMS user in preview, otherwise the active theme. */
export async function resolveSiteThemeState(): Promise<SiteThemeState> {
  const c = await readThemePreviewCookie();
  const previewed = c ? await loadPreviewTheme(c).catch(() => null) : null;
  if (previewed) return previewed;
  return { ...(await getActiveThemeState()), preview: null };
}

/** Which theme's page arrangements (`themeVariants`) to render — preview-aware counterpart of getActiveThemeKey. */
export async function getRenderThemeKey(): Promise<string> {
  const c = await readThemePreviewCookie();
  return c?.theme ?? getActiveThemeKey();
}
