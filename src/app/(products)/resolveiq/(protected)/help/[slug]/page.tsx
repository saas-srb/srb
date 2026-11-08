import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Markdown } from "@/components/chat/Markdown";
import { buttonVariants } from "@/components/ui/button";
import { getPublishedBySlug } from "@/lib/support/articles";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getPublishedBySlug(slug);
  if (!article) notFound();
  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[{ label: "Help & Support", href: "/resolveiq" }, { label: "Help Center", href: "/resolveiq/help" }, { label: article.title }]}
        title={<>{article.title}</>}
        description={<>{article.category} · Updated {formatDate(article.updatedAt)}</>}
      />
<div className="space-y-4">
      <GlassCard interactive={false} className="p-6 sm:p-8">
        <Markdown content={article.body} className="mt-5" />
      </GlassCard>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card p-4">
        <p className="text-sm text-muted-foreground">Didn&apos;t solve it?</p>
        <Link href="/resolveiq/requests/new" className={buttonVariants({ size: "sm" })}><LifeBuoy className="size-3.5" data-icon="inline-start" /> Contact support</Link>
      </div>
    </div>
</div>
  );
}
