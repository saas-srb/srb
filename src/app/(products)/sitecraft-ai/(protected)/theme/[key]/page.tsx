import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Palette, Eye, Paintbrush } from "lucide-react";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { getTheme, getActiveThemeKey } from "@/lib/products/sitecraft-ai/theme";
import { normalizeSelections } from "@/lib/products/sitecraft-ai/component-variants";
import ThemeComponentsEditor from "@/components/products/sitecraft-ai/ThemeComponentsEditor";
import ThemeEditor from "@/components/products/sitecraft-ai/ThemeEditor";

export default async function CmsThemeEditPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const [doc, activeKey] = await Promise.all([getTheme(key).catch(() => null), getActiveThemeKey()]);
  if (!doc) notFound();

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "Themes", href: "/sitecraft-ai/theme" }, { label: doc.name }]}
        icon={Palette}
        title={doc.name}
        description={doc.description}
        badges={activeKey === doc._id ? <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">Active</Badge> : undefined}
        actions={
          <>
            <Link href={`/sitecraft-ai/theme/${doc._id}/preview`} className={buttonVariants({ variant: "outline", size: "sm" })}><Eye className="size-3.5" /> Page arrangements</Link>
            <Link href={`/sitecraft-ai/customize/${doc._id}`} className={buttonVariants({ size: "sm" })}><Paintbrush className="size-3.5" /> Customize</Link>
          </>
        }
      />
      <ThemeComponentsEditor themeKey={doc._id} initial={normalizeSelections(doc.components)} isActive={activeKey === doc._id} canEdit={can(viewer, "THEME_PUBLISH")} />
      <ThemeEditor
        themeKey={doc._id}
        draftTokens={doc.draftTokens}
        publishedTokens={doc.tokens}
        canEdit={can(viewer, "THEME_UPDATE")}
        canPublish={can(viewer, "THEME_PUBLISH")}
        history={[...(doc.history ?? [])].reverse().map((h, i) => ({
          version: h.version,
          publishedAt: new Date(h.publishedAt).toISOString(),
          note: h.note,
          // Newest entry is what's live (publishing is the only way an entry is added).
          isLive: i === 0,
        }))}
      />
    </div>
  );
}
