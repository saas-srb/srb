import { redirect } from "next/navigation";
import Link from "next/link";
import { Palette, Paintbrush } from "lucide-react";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { listThemes, getActiveThemeKey } from "@/lib/products/sitecraft-ai/theme";
import { FONT_OPTIONS, googleFontsUrl } from "@/lib/products/sitecraft-ai/theme-shared";
import { THEME_PRESETS } from "@/lib/products/sitecraft-ai/theme-presets";
import { buttonVariants } from "@/components/ui/button";
import ThemeGallery from "@/components/products/sitecraft-ai/theme/ThemeGallery";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";

export default async function CmsThemeListPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const [themes, activeKey] = await Promise.all([listThemes(), getActiveThemeKey()]);
  const activeName = themes.find((t) => t._id === activeKey)?.name ?? "Default";
  // Every library font, so each thumbnail shows its theme's real typography.
  const fontsUrl = googleFontsUrl(FONT_OPTIONS.map((f) => f.key));

  return (
    <div className="space-y-4">
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} precedence="default" />}
      <CmsPageHeader
        breadcrumbs={[{ label: "Themes" }]}
        icon={Palette}
        title="Themes"
        description={<>Browse, live-preview and customize themes. The active theme — <strong className="text-foreground">{activeName}</strong> — drives the public site&apos;s colours, fonts, header, footer and hero layout.</>}
        actions={<Link href={`/sitecraft-ai/customize/${activeKey}`} className={buttonVariants({ size: "sm" })}><Paintbrush className="size-3.5" /> Customize active theme</Link>}
      />
      <ThemeGallery themes={themes} presets={THEME_PRESETS} activeKey={activeKey} canEdit={can(viewer, "THEME_UPDATE")} canPublish={can(viewer, "THEME_PUBLISH")} />
    </div>
  );
}
