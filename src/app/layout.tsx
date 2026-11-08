import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { jsonForScript } from "@/lib/security/json-script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

import { SiteInfoProvider } from "@/components/products/sitecraft-ai/SiteInfoContext";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { parseSiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";
import { siteUrl } from "@/lib/seo";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { getSiteSeo, parseSiteSeo, siteMetadata } from "@/lib/products/sitecraft-ai/site-seo";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getCompanyBrand } from "@/lib/platform/branding";
import { NEUTRAL_BRAND } from "@/lib/platform/branding/types";
import { resolveSiteThemeState } from "@/lib/products/sitecraft-ai/theme-preview";
import { FALLBACK_THEME, isDefaultTokens, themeCssBlock } from "@/lib/products/sitecraft-ai/theme-shared";
import { BrandProvider } from "@/components/platform/BrandProvider";
import { PanelsProvider } from "@/components/platform/PanelsProvider";
import PanelTextSync from "@/components/platform/PanelTextSync";
import { panelMetaFor } from "@/lib/platform/panels/store";
import PlatformNoticeBanner from "@/components/platform/PlatformNoticeBanner";
import MaintenanceBanner from "@/components/platform/MaintenanceBanner";
import { getEffectiveMaintenance } from "@/lib/platform/maintenance-state";
import { isBannerNow, maintenancePhase } from "@/lib/platform/maintenance-shared";
import { getTracking, type TrackingSettings } from "@/lib/products/sitecraft-ai/tracking";
import { getPlatformSettings } from "@/lib/platform/settings";
import { onAppSurface, onSaasHost, saasOrigin } from "@/lib/platform/saas/request";
import { getPwaIdentity } from "@/lib/pwa/identity";
import PwaRegister from "@/components/pwa/PwaRegister";
import NavigationProgress from "@/components/pwa/NavigationProgress";
import { InstallBanner } from "@/components/pwa/InstallApp";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import { SAAS_THEME } from "@/lib/platform/saas/theme";
import TransportBoot from "@/components/security/TransportBoot";
import { transportPublicKey } from "@/lib/security/transport";
import { BASE_KEYWORDS } from "@/lib/platform/saas/product-seo";

function verificationMetadata(t: TrackingSettings): Metadata["verification"] {
  const other: Record<string, string[]> = {};
  const add = (name: string, content: string) => (other[name] ??= []).push(content);
  t.bingVerification.forEach((c) => add("msvalidate.01", c));
  t.verificationMeta.filter((m) => m.attr === "name").forEach((m) => add(m.name, m.content));
  return { google: t.googleSiteVerification.length ? t.googleSiteVerification : undefined, other: Object.keys(other).length ? other : undefined };
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** App hosts (`app.…`, `<slug>-app.…`) are for signed-in work: never indexed. */
export async function generateMetadata(): Promise<Metadata> {
  const metadata = await siteWideMetadata();
  if (!(await onAppSurface())) return metadata;
  // The installable app (app hosts only): manifest, iOS home-screen settings and app icons.
  const pwa = await getPwaIdentity().catch(() => null);
  return {
    ...metadata,
    robots: { index: false, follow: false },
    ...(pwa
      ? {
          manifest: "/manifest.webmanifest",
          applicationName: pwa.shortName,
          appleWebApp: { capable: true, title: pwa.shortName, statusBarStyle: pwa.statusBar },
          formatDetection: { telephone: false },
          other: { "mobile-web-app-capable": "yes", "msapplication-TileColor": pwa.themeColor, "msapplication-tap-highlight": "no" },
          icons: { icon: [{ url: `/pwa/icons/192.png?v=${pwa.version}`, sizes: "192x192", type: "image/png" }, { url: `/pwa/icons/512.png?v=${pwa.version}`, sizes: "512x512", type: "image/png" }], apple: [{ url: `/pwa/icons/180.png?v=${pwa.version}`, sizes: "180x180", type: "image/png" }] },
        }
      : {}),
  };
}

/**
 * Phones: full-bleed under the notch and a themed browser/status bar in the app. The pages do not pad for the notch or the status bar,
 * so inside the Android and iOS apps (their user agent ends with "WorkspaceNative", set in mobile/scripts/build-company-mobile.mjs)
 * the page is not drawn under the system bars: without this the header sits under the status bar and cannot be tapped.
 */
export async function generateViewport(): Promise<Viewport> {
  const nativeShell = ((await headers()).get("user-agent") ?? "").includes("WorkspaceNative");
  const base: Viewport = nativeShell ? { width: "device-width", initialScale: 1 } : { width: "device-width", initialScale: 1, viewportFit: "cover" };
  if (!(await onAppSurface())) return base;
  const pwa = await getPwaIdentity().catch(() => null);
  return pwa ? { ...base, themeColor: [{ media: "(prefers-color-scheme: light)", color: pwa.themeColor }, { media: "(prefers-color-scheme: dark)", color: pwa.themeColorDark }], colorScheme: "light dark" } : base;
}

/** Site-wide SEO defaults every page inherits — CMS → Settings (see lib/sitecraft-ai/site-seo.ts). */
async function siteWideMetadata(): Promise<Metadata> {
  // The SaaS product's own website carries the product's identity, never a customer's.
  if (await onSaasHost()) {
    return {
      metadataBase: new URL(await saasOrigin()),
      title: { default: `${SAAS_BRAND.name} — ${SAAS_BRAND.tagline}`, template: `%s | ${SAAS_BRAND.name}` },
      description: SAAS_BRAND.description,
      applicationName: SAAS_BRAND.name,
      keywords: BASE_KEYWORDS,
      category: "Business software",
      authors: [{ name: SAAS_BRAND.name }],
      creator: SAAS_BRAND.name,
      publisher: SAAS_BRAND.name,
      formatDetection: { telephone: false, email: false, address: false },
      robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
      verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined },
      icons: { icon: [{ url: SAAS_BRAND.assets.faviconIco, sizes: "any" }, { url: SAAS_BRAND.assets.faviconSmall, type: "image/png", sizes: "16x16" }, { url: SAAS_BRAND.assets.favicon, type: "image/png", sizes: "32x32" }], shortcut: SAAS_BRAND.assets.faviconIco, apple: SAAS_BRAND.assets.appleTouch },
      openGraph: { type: "website", locale: "en_IN", url: "/", siteName: SAAS_BRAND.name, title: `${SAAS_BRAND.name} — ${SAAS_BRAND.tagline}`, description: SAAS_BRAND.description, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: SAAS_BRAND.name }] },
      twitter: { card: "summary_large_image", title: `${SAAS_BRAND.name} — ${SAAS_BRAND.tagline}`, description: SAAS_BRAND.description },
    };
  }
  // metadataBase = this company's own public site, so relative canonical / OG URLs resolve to it.
  const hasCompany = (await currentCompanyIdOrNull()) !== null;
  const [seo, origin] = hasCompany ? await Promise.all([getSiteSeo(), companySiteUrl()]) : [parseSiteSeo(null), siteUrl];
  return siteMetadata(seo, {
    metadataBase: new URL(origin),
    // Search-engine site verification: the company's own tags (CMS → Settings → Tracking).
    verification: hasCompany ? verificationMetadata(await getTracking()) : undefined,
  });
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Brand, contact details and social links (CMS → Site Identity); site-wide structured data (CMS → Settings).
  // No company owns this host (the proxy is showing /workspace-not-found): render the bare shell.
  // On the SaaS product's host the page chrome is the product's own (bare shell + SaaS brand), not the owner company's.
  const [saasHost, appSurface] = await Promise.all([onSaasHost(), onAppSurface()]);
  const companyId = saasHost ? null : await currentCompanyIdOrNull();
  const hasCompany = companyId !== null;
  // Everything the shell needs is independent: fetched together (each is a database read, and this runs on every full page load, so
  // doing them one after another is what made the installed app sit on a blank screen). Every one of them is non-fatal.
  const [pwa, panels, siteInfoRes, seoRes, brand, tracking, themeState, platformSettings, maintenance] = await Promise.all([
    appSurface ? getPwaIdentity().catch(() => null) : null,
    // The Product Registry (names, descriptions, what is switched on) as it applies to this company.
    hasCompany ? panelMetaFor(companyId).catch(() => ({})) : {},
    hasCompany ? getSiteInfo() : parseSiteInfo(null),
    // Site-wide structured data (CMS → Settings): public-website only.
    hasCompany && !appSurface ? getSiteSeo() : parseSiteSeo(null),
    hasCompany ? getCompanyBrand() : NEUTRAL_BRAND,
    hasCompany && !appSurface ? getTracking() : null,
    // The company's active theme (CMS → Themes, or the pick made in setup): colours, fonts, corner radius for the website and every product.
    hasCompany ? resolveSiteThemeState().catch(() => null) : null,
    // Platform Console → Platform settings: a maintenance message for every company's products (cached).
    hasCompany ? getPlatformSettings().catch(() => null) : null,
    // The platform maintenance window (Platform Console → Maintenance); never on the product's own hosts.
    hasCompany && !saasHost ? getEffectiveMaintenance(companyId) : null,
  ]);
  const installPrompt = appSurface ? (pwa?.installPrompt ?? true) : false;
  const siteInfo = siteInfoRes;
  const { jsonLd } = seoRes;
  const liveChatId = tracking?.tawkId ?? "";
  const themeTokens = hasCompany ? (themeState?.tokens ?? FALLBACK_THEME) : FALLBACK_THEME;
  const themeCss = saasHost ? themeCssBlock(SAAS_THEME) : hasCompany ? themeCssBlock(themeTokens) : "";
  // Every theme but the original default gets the modern product treatment (see globals.css `[data-ui="modern"]`).
  const modernUi = saasHost || (hasCompany && !isDefaultTokens(themeTokens));
  const notice = platformSettings?.maintenanceBanner ?? "";

  return (
    <html lang={saasHost ? "en-IN" : "en"} suppressHydrationWarning data-ui={modernUi ? "modern" : undefined} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* The active theme, for the website and every product. */}
        {/* `themeCss` is "" with no company: `"" && …` would put a text node in <head> (hydration error, page left unstyled). */}
        {themeCss ? <style id="company-theme-vars" dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TransportBoot serverKey={transportPublicKey()} />
        {jsonLd.map((schema, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(schema) }} />
        ))}
        {/* On the product's own hosts (its website and its products) the theme is the website's: light unless the visitor chose dark with the website's switch, kept under the same key. Customers' hosts keep following the system. */}
        <ThemeProvider
          attribute="class"
          {...(saasHost ? { defaultTheme: "light", enableSystem: false, storageKey: "sr-theme" } : { defaultTheme: "system", enableSystem: true })}
          disableTransitionOnChange
        >
          <BrandProvider brand={saasHost ? { ...NEUTRAL_BRAND, name: SAAS_BRAND.name, namePrimary: SAAS_BRAND.namePrimary, nameAccent: SAAS_BRAND.nameAccent, logoUrl: SAAS_BRAND.assets.mark, wordmarkUrl: SAAS_BRAND.assets.logo, wordmarkDarkUrl: SAAS_BRAND.assets.logoDark } : brand}>
            <PanelsProvider panels={panels}>
              <PanelTextSync />
              <SiteInfoProvider value={{ ...siteInfo, liveChatId }}>
                {maintenance && !brand.isPlatformOwner && isBannerNow(maintenance, appSurface ? "app" : "site") ? (
                  <MaintenanceBanner surface={appSurface ? "app" : "site"} phase={maintenancePhase(maintenance) as "upcoming" | "active"} message={maintenance.message} startsAt={maintenance.startsAt} endsAt={maintenance.endsAt} />
                ) : null}
                {children}

                {notice && <PlatformNoticeBanner message={notice} />}
                {appSurface ? (
                  <>
                    <PwaRegister />
                    <NavigationProgress />
                    {installPrompt ? <InstallBanner /> : null}
                  </>
                ) : null}
              </SiteInfoProvider>
            </PanelsProvider>
          </BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
