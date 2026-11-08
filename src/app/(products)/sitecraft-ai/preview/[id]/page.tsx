import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/products/sitecraft-ai/viewer";
import { getPage } from "@/lib/products/sitecraft-ai/pages";
import { getActiveThemeState, themeCssBlock } from "@/lib/products/sitecraft-ai/theme";
import { getPublicNav } from "@/lib/products/sitecraft-ai/nav";
import { getPublicFooter } from "@/lib/products/sitecraft-ai/footer";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { getSnapshot } from "@/lib/products/sitecraft-ai/collections/store";
import SectionRenderer from "@/components/products/sitecraft-ai/SectionRenderer";
import { CollectionsProvider } from "@/components/products/sitecraft-ai/CollectionsContext";
import { ThemeVariantsProvider } from "@/components/products/sitecraft-ai/ThemeVariantsContext";
import Header, { type HeaderVariant } from "@/components/Header";
import ThemeImageFilters from "@/components/products/sitecraft-ai/ThemeImageFilters";
import SiteFooter from "@/components/footer/SiteFooter";
import { layoutCss } from "@/lib/products/sitecraft-ai/component-variants";

export const metadata = { title: "Draft preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A page's DRAFT rendered exactly like the public site (active theme, real
 * header and footer) — for CMS users only, never cached, never indexed.
 * Outside the CMS shell so it can be framed at real device widths.
 */
export default async function CmsDraftPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getViewer())) redirect("/sitecraft-ai/login");
  const { id } = await params;
  const page = await getPage(id);
  if (!page) notFound();

  const [{ tokens, components }, cmsNavigation, cmsFooter, siteInfo, collections] = await Promise.all([
    getActiveThemeState(),
    getPublicNav(),
    getPublicFooter(),
    getSiteInfo(),
    getSnapshot(["blog", "jobs", "engagement", "products"]),
  ]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCssBlock(tokens) + layoutCss(components) }} />
      {components.images === "themed" && <ThemeImageFilters tokens={tokens} />}
      <Header cmsNavigation={cmsNavigation} variant={components.header as HeaderVariant} menuStyle={components.menu} />
      <main className="flex-grow pt-[var(--site-header-h,88px)]">
        <CollectionsProvider snapshot={collections}>
          <ThemeVariantsProvider sections={components.sections}>
            {page.draft.sections.length ? (
              <SectionRenderer sections={page.draft.sections} />
            ) : (
              <p className="px-6 py-24 text-center text-sm text-muted-foreground">This page has no sections yet.</p>
            )}
          </ThemeVariantsProvider>
        </CollectionsProvider>
      </main>
      <SiteFooter variant={components.footer} cmsFooter={cmsFooter} siteInfo={siteInfo} />
    </>
  );
}
