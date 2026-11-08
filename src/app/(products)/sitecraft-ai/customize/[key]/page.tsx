import { notFound, redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { getTheme, getActiveThemeKey } from "@/lib/products/sitecraft-ai/theme";
import { FONT_OPTIONS, googleFontsUrl } from "@/lib/products/sitecraft-ai/theme-shared";
import { getThemePreset } from "@/lib/products/sitecraft-ai/theme-presets";
import { listPages } from "@/lib/products/sitecraft-ai/pages";
import { displayTitle } from "@/lib/products/sitecraft-ai/site-areas";
import ThemeCustomizer from "@/components/products/sitecraft-ai/theme/ThemeCustomizer";
import { ConfirmProvider } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export const metadata = { title: "Customize theme", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The full-screen theme customizer (WordPress-style): controls on the left,
 * the real website in a live-preview frame on the right. Works for installed
 * themes and for theme-library presets that aren't installed yet. Outside the
 * CMS shell so the preview gets the whole screen.
 */
export default async function CmsThemeCustomizePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ path?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "VIEW")) redirect("/sitecraft-ai/login");
  const { key } = await params;
  const { path } = await searchParams;

  const [installed, activeKey, pages] = await Promise.all([getTheme(key).catch(() => null), getActiveThemeKey(), listPages()]);
  const preset = getThemePreset(key);
  if (!installed && !preset) notFound();

  const published = pages
    .filter((p) => p.live)
    .map((p) => ({ path: p.path, title: displayTitle(p.title, p.path) }))
    .sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path)));
  const fontsUrl = googleFontsUrl(FONT_OPTIONS.map((f) => f.key));

  return (
    <TooltipProvider delay={200}>
      <ConfirmProvider>
        {fontsUrl && <link rel="stylesheet" href={fontsUrl} precedence="default" />}
        <ThemeCustomizer
          themeKey={key}
          name={installed?.name ?? preset!.name}
          description={installed?.description ?? preset!.description}
          installed={!!installed}
          isActive={activeKey === key}
          hasUnpublishedDraft={!!installed && JSON.stringify(installed.draftTokens) !== JSON.stringify(installed.tokens)}
          initialTokens={installed ? installed.draftTokens ?? installed.tokens : preset!.tokens}
          initialComponents={installed ? installed.draftComponents ?? installed.components ?? {} : preset!.components}
          pages={published}
          initialPath={path?.startsWith("/") ? path : "/"}
          canEdit={can(viewer, "THEME_UPDATE")}
          canPublish={can(viewer, "THEME_PUBLISH")}
        />
        <Toaster position="top-right" richColors closeButton />
      </ConfirmProvider>
    </TooltipProvider>
  );
}
