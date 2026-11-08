import { withTransport } from "@/lib/security/transport";
import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { getTheme } from "@/lib/products/sitecraft-ai/theme";
import { getThemePreset } from "@/lib/products/sitecraft-ai/theme-presets";
import { normalizeSelections } from "@/lib/products/sitecraft-ai/component-variants";
import { THEME_PREVIEW_COOKIE, type ThemePreviewCookie } from "@/lib/products/sitecraft-ai/theme-preview";

/**
 * Starts (or updates) a theme live preview for the signed-in CMS user:
 * `?theme=<key|presetId>&path=/some/page[&c=<component choices JSON>]`.
 * Turns on Draft Mode for this browser, remembers the theme in a cookie, and
 * redirects to the public page — which then renders with that theme.
 */
async function handleGET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "VIEW")) return new Response("Sign in to the CMS to preview themes.", { status: 401 });

  const url = new URL(request.url);
  const themeKey = url.searchParams.get("theme") ?? "";
  const exists = getThemePreset(themeKey) || (await getTheme(themeKey).catch(() => null));
  if (!exists) return new Response("Theme not found.", { status: 404 });

  let components: ThemePreviewCookie["components"];
  const rawComponents = url.searchParams.get("c");
  if (rawComponents) {
    try {
      components = normalizeSelections(JSON.parse(rawComponents));
    } catch {
      return new Response("Invalid component selection.", { status: 400 });
    }
  }

  // Only ever redirect to a public page on this site.
  const target = new URL(url.searchParams.get("path") || "/", url.origin);
  const safe = target.origin === url.origin && !/^\/(cms|api)(\/|$)/.test(target.pathname);
  const path = safe ? target.pathname + target.search : "/";

  (await draftMode()).enable();
  const value: ThemePreviewCookie = { theme: themeKey, ...(components ? { components } : {}) };
  (await cookies()).set(THEME_PREVIEW_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
  redirect(path);
}

export const GET = withTransport(handleGET);
