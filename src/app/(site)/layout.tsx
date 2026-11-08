import Header, { type HeaderVariant } from "@/components/Header";
import FloatingContactButtons from "@/components/FloatingContactButtons";
import WebPushPrompt from "@/components/webpush/WebPushPrompt";
import SiteFooter from "@/components/footer/SiteFooter";
import { layoutCss } from "@/lib/products/sitecraft-ai/component-variants";
import { ThemeVariantsProvider } from "@/components/products/sitecraft-ai/ThemeVariantsContext";
import { CollectionsProvider } from "@/components/products/sitecraft-ai/CollectionsContext";
import { getSnapshot } from "@/lib/products/sitecraft-ai/collections/store";
import { Toaster } from "@/components/ui/sonner";
import OfferPromotions from "@/components/offers/OfferPromotions";
import ReferralWelcome from "@/components/offers/ReferralWelcome";
import OfferClaimProvider from "@/components/offers/OfferClaimProvider";
import ManagedJsonLd from "@/components/products/rankmax-ai/ManagedJsonLd";
import { getSeoSiteState } from "@/lib/products/rankmax-ai/public";
import { getPublicNav } from "@/lib/products/sitecraft-ai/nav";
import { getPublicFooter } from "@/lib/products/sitecraft-ai/footer";
import { themeCssBlock } from "@/lib/products/sitecraft-ai/theme";
import { resolveSiteThemeState } from "@/lib/products/sitecraft-ai/theme-preview";
import SiteTracking from "@/components/products/sitecraft-ai/SiteTracking";
import SiteConsent from "@/components/products/sitecraft-ai/SiteConsent";
import { trackingNeedsConsent } from "@/lib/products/sitecraft-ai/consent";
import { getTracking } from "@/lib/products/sitecraft-ai/tracking";
import ThemeImageFilters from "@/components/products/sitecraft-ai/ThemeImageFilters";
import ThemePreviewBridge from "@/components/products/sitecraft-ai/theme/ThemePreviewBridge";
import CmsAdminToolbar from "@/components/products/sitecraft-ai/CmsAdminToolbar";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";

/** Tailwind's max-w-7xl (80rem) is the site's content width; on big screens it grows so the sides are not left empty. */
const WIDE_CONTAINER_CSS =
  // Safety net for every theme on phones: nothing may push the page wider than the screen.
  "html,body{max-width:100%;overflow-x:clip}@media (min-width:1536px){:root{--container-7xl:90rem}}@media (min-width:1920px){:root{--container-7xl:104rem}}@media (min-width:2560px){:root{--container-7xl:120rem}}";

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [{ schemas }, cmsNavigation, cmsFooter, { tokens: theme, components, preview }, collections, siteInfo, tracking] = await Promise.all([
    getSeoSiteState(),
    getPublicNav(),
    getPublicFooter(),
    // The active theme — or, for a CMS user in the theme customizer, the theme being previewed.
    resolveSiteThemeState(),
    // Blog posts, jobs and engagement models (code + published CMS records) for every client listing/card.
    getSnapshot(["blog", "jobs", "engagement"]),
    getSiteInfo(),
    getTracking(),
  ]);
  // Header/footer variant chosen by the active theme in the CMS (component-variants.ts); "default" = the standard components.
  return (
    <OfferClaimProvider>
      {/* Overrides globals.css's :root/.dark custom properties — CSS cascade (later tag wins) does the rest, no globals.css change needed. */}
      <style id="cms-theme-vars" dangerouslySetInnerHTML={{ __html: themeCssBlock(theme) + layoutCss(components) + WIDE_CONTAINER_CSS }} />
      {components.images === "themed" && <ThemeImageFilters tokens={theme} />}
      {/* The company's own analytics / tracking — never while a CMS user is previewing a theme. */}
      {/* …and only after the visitor has agreed: nothing that tracks loads before that (and nothing is asked when nothing tracks). */}
      {!preview && (trackingNeedsConsent(tracking) ? <SiteConsent><SiteTracking t={tracking} /></SiteConsent> : <SiteTracking t={tracking} />)}
      <ManagedJsonLd schemas={schemas} />
      <OfferPromotions />
      <ReferralWelcome />
      <Header cmsNavigation={cmsNavigation} variant={components.header as HeaderVariant} menuStyle={components.menu} />
      <main className="flex-grow pt-[calc(var(--site-header-h,88px)+var(--offer-strip-h,0px))]">
        <CollectionsProvider snapshot={collections}>
          <ThemeVariantsProvider sections={components.sections}>{children}</ThemeVariantsProvider>
        </CollectionsProvider>
      </main>
      <SiteFooter variant={components.footer} cmsFooter={cmsFooter} siteInfo={siteInfo} />
      <Toaster position="top-right" richColors closeButton />
      {preview && <ThemePreviewBridge themeName={preview.name} />}
      {/* Signed-in CMS users only (client-side; visitors never request it). */}
      <CmsAdminToolbar />
      {/* Floating contact buttons — website only, never shown in products. */}
      <FloatingContactButtons />
      <WebPushPrompt />
    </OfferClaimProvider>
  );
}
