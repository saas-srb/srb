import "server-only";
import { createHash } from "node:crypto";
import { getCompanyBrand } from "@/lib/platform/branding";
import { getActiveThemeState } from "@/lib/products/sitecraft-ai/theme";
import { FALLBACK_THEME } from "@/lib/products/sitecraft-ai/theme-shared";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import { SAAS_THEME } from "@/lib/platform/saas/theme";
import { onAppSurface, onSaasHost } from "@/lib/platform/saas/request";
import { getAppSettings } from "@/lib/pwa/store";
import { availableAppPanels } from "@/lib/pwa/panels";
import type { AppSettings } from "@/lib/pwa/settings";

/**
 * What the installed APP is called and looks like on THIS host. Only app hosts are installable: the website (the
 * product's or a company's) is never an app and has no manifest, service worker or install prompt.
 *  - `app.selfrunbusiness.com`: the product's own products (fixed identity);
 *  - `<slug>-app.…` / `app.<custom domain>`: that company's app. Everything is dynamic: its name, logo, colours (from its
 *    theme, light and dark), start page and shortcuts, each overridable in Workspace → Settings → Mobile app.
 */
export interface PwaIdentity {
  scope: "product-app" | "company-app";
  name: string;
  shortName: string;
  description: string;
  /** Status bar / title bar colour, light and dark mode. */
  themeColor: string;
  themeColorDark: string;
  backgroundColor: string;
  startUrl: string;
  shortcuts: { name: string; url: string }[];
  display: AppSettings["display"];
  orientation: AppSettings["orientation"];
  statusBar: AppSettings["statusBar"];
  installPrompt: boolean;
  /** Changes whenever anything about the app's look changes; appended to icon URLs so devices fetch fresh icons. */
  version: string;
  /** Changes only when what an installer bakes in changes (its name and icon). Colours, shortcuts and so on are read at run time. */
  buildHash: string;
  desktop: AppSettings["desktop"];
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n).trimEnd());

/** The installable app of this host, or null on a website host (and on a host no company owns). */
export async function getPwaIdentity(): Promise<PwaIdentity | null> {
  const [saas, app] = await Promise.all([onSaasHost(), onAppSurface()]);
  if (!app) return null;

  if (saas) {
    return {
      scope: "product-app",
      name: SAAS_BRAND.name,
      shortName: "SelfRun",
      description: "Run SelfRun AI: companies, plans, billing and support.",
      themeColor: SAAS_THEME.colors.primary,
      themeColorDark: SAAS_THEME.colorsDark.background,
      backgroundColor: SAAS_THEME.colors.background,
      startUrl: "/commandos",
      shortcuts: [
        { name: "Workspace", url: "/commandos" },
        { name: "Platform Console", url: "/console" },
        { name: "Notifications", url: "/commandos/notifications" },
      ],
      display: "standalone",
      orientation: "any",
      statusBar: "default",
      installPrompt: true,
      version: "p1",
      buildHash: "p1",
      desktop: { closeToTray: true, launchAtLogin: false },
    };
  }
  return buildCompanyIdentity();
}

/**
 * The identity of the CURRENT company's app, from its brand, theme and Mobile app settings. Needs a company in scope (a request
 * on its host, or `runAsCompany` in a cron) but not a particular host, so installers can be built from background jobs.
 */
export async function buildCompanyIdentity(): Promise<PwaIdentity> {
  const [brand, theme, { settings }, panels] = await Promise.all([
    getCompanyBrand().catch(() => null),
    getActiveThemeState().catch(() => null),
    getAppSettings(),
    availableAppPanels().catch(() => []),
  ]);
  const tokens = theme?.tokens ?? FALLBACK_THEME;
  const company = brand?.name?.trim() || "Workspace";
  const byKey = new Map(panels.map((p) => [p.key, p]));

  const themeColor = settings.themeColor.mode === "custom" ? settings.themeColor.value : tokens.colors.primary;
  const themeColorDark = settings.themeColor.mode === "custom" ? settings.themeColor.value : tokens.colorsDark.background;
  const backgroundColor = settings.backgroundColor.mode === "custom" ? settings.backgroundColor.value : tokens.colors.background;

  const shortcuts = settings.shortcuts
    .map((key) => (key === "notifications" ? { name: "Notifications", url: "/commandos/notifications" } : byKey.has(key) ? { name: clip(byKey.get(key)!.shortName, 24), url: byKey.get(key)!.route } : null))
    .filter((x): x is { name: string; url: string } => x !== null);
  const start = byKey.get(settings.startPage);

  const version = createHash("sha1")
    .update(JSON.stringify({ settings, company, logo: brand?.logoUrl ?? null, themeColor, themeColorDark, backgroundColor, primary: tokens.colors.primary, fg: tokens.colors.primaryForeground }))
    .digest("hex")
    .slice(0, 8);

  return {
    scope: "company-app",
    name: settings.name || clip(company, 45),
    shortName: settings.shortName || clip(company, 12),
    description: settings.description || `${company}: your team's workspace and products.`,
    themeColor,
    themeColorDark,
    backgroundColor,
    startUrl: start?.route ?? "/commandos",
    shortcuts,
    display: settings.display,
    orientation: settings.orientation,
    statusBar: settings.statusBar,
    installPrompt: settings.installPrompt,
    version,
    buildHash: createHash("sha1")
      .update(JSON.stringify({ name: settings.name || company, short: settings.shortName, icon: settings.icon, logo: brand?.logoUrl ?? null, primary: tokens.colors.primary, fg: tokens.colors.primaryForeground }))
      .digest("hex")
      .slice(0, 12),
    desktop: settings.desktop,
  };
}
