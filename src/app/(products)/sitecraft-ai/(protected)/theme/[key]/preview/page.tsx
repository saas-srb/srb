import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getViewer } from "@/lib/products/sitecraft-ai/viewer";
import { getTheme, themeCssVars } from "@/lib/products/sitecraft-ai/theme";
import { listPages, getPage } from "@/lib/products/sitecraft-ai/pages";
import SectionRenderer from "@/components/products/sitecraft-ai/SectionRenderer";
import ThemePreviewPageSelect from "@/components/products/sitecraft-ai/ThemePreviewPageSelect";
import { ThemeVariantsProvider } from "@/components/products/sitecraft-ai/ThemeVariantsContext";
import SiteFooter from "@/components/footer/SiteFooter";
import { normalizeSelections, HEADER_VARIANTS, HEADER_HEIGHT_DESKTOP } from "@/lib/products/sitecraft-ai/component-variants";
import { getPublicFooter } from "@/lib/products/sitecraft-ai/footer";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { getPublicNav } from "@/lib/products/sitecraft-ai/nav";
import Header, { type HeaderVariant } from "@/components/Header";
import { CollectionsProvider } from "@/components/products/sitecraft-ai/CollectionsContext";
import { getSnapshot } from "@/lib/products/sitecraft-ai/collections/store";

export default async function CmsThemePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { key } = await params;
  const { page: pageId } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const theme = await getTheme(key).catch(() => null);
  if (!theme) notFound();

  const pages = await listPages();
  const selectedPageId = pageId || pages[0]?._id;
  const selectedPage = selectedPageId ? await getPage(selectedPageId) : null;

  const components = normalizeSelections(theme.components);
  const [cmsFooter, cmsNavigation, collections, siteInfo] = await Promise.all([getPublicFooter(), getPublicNav(), getSnapshot(["blog", "jobs", "engagement"]), getSiteInfo()]);
  // Same rule as the live site: only the platform operator's site has per-theme page arrangements.
  const variantSections = (await isPlatformOwnerContext()) ? selectedPage?.themeVariants?.[key]?.sections : undefined;
  const sections = key !== "default" && variantSections?.length ? variantSections : (selectedPage?.live?.sections ?? selectedPage?.draft.sections ?? []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/sitecraft-ai/theme/${key}`} className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> {theme.name}
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Preview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Renders this theme&apos;s tokens, section variants, page arrangement and footer in an isolated view — the live public site is unaffected.
            Header: <strong>{HEADER_VARIANTS.find((h) => h.key === components.header)?.label}</strong>.
          </p>
        </div>
        <ThemePreviewPageSelect themeKey={key} pages={pages.map((p) => ({ id: p._id, path: p.path, title: p.title }))} selectedId={selectedPageId ?? ""} />
      </div>

      {!selectedPage || sections.length === 0 ? (
        <div className="rounded-2xl border border-border/60 p-10 text-center text-sm text-muted-foreground">
          No CMS page selected, or it has no content to preview yet.
        </div>
      ) : (
        // `transform` makes this frame the containing block for the site header's `position: fixed`
        // (and its slide-out menu), so they render inside the preview instead of over the CMS.
        <div className="overflow-hidden rounded-2xl border border-border/60" style={{ ...(themeCssVars(theme.tokens) as React.CSSProperties), transform: "translateZ(0)" }}>
          <div className="bg-background text-foreground">
            <Header cmsNavigation={cmsNavigation} variant={components.header as HeaderVariant} menuStyle={components.menu} />
            <div style={{ paddingTop: HEADER_HEIGHT_DESKTOP[components.header] ?? 88 }} />
            <CollectionsProvider snapshot={collections}>
              <ThemeVariantsProvider sections={components.sections}>
                <SectionRenderer sections={sections} />
              </ThemeVariantsProvider>
            </CollectionsProvider>
            <SiteFooter variant={components.footer} cmsFooter={cmsFooter} siteInfo={siteInfo} />
          </div>
        </div>
      )}
    </div>
  );
}
