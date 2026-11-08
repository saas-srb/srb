import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { buttonVariants } from "@/components/ui/button";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { listAllArticles } from "@/lib/support/articles";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Help content" };
export const dynamic = "force-dynamic";

export default async function HelpContentPage() {
  const user = await requirePlatformPermission("support.read");
  const articles = await listAllArticles();
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Help content"
        description="The guides and FAQs every company sees in the Help Center. The AI assistant answers only from published articles."
        crumbs={[{ label: "Support" }]}
        actions={can(user, "support.manage") ? <Link href="/console/resolveiq/help/new" className={buttonVariants({ size: "sm" })}><Plus className="size-3.5" data-icon="inline-start" /> New article</Link> : undefined}
      />
      <PanelListFilters>
{articles.length === 0 ? (
        <GlassCard interactive={false} className="p-8 text-center text-sm text-muted-foreground">No articles yet. Write the first guide so the assistant has something to answer from.</GlassCard>
      ) : (
        <GlassCard interactive={false} className="divide-y divide-border/50 overflow-hidden p-0">
          {articles.map((a) => (
            <Link key={a._id} href={`/console/resolveiq/help/${a._id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{a.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.category} · updated {formatDate(a.updatedAt)}{a.panels.length ? ` · ${a.panels.join(", ")}` : ""}</span>
              </span>
              <span className={a.status === "published" ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300" : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"}>{a.status}</span>
            </Link>
          ))}
        </GlassCard>
      )}
</PanelListFilters>
    </div>
  );
}
