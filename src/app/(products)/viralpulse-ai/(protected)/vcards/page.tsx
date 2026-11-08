import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, CreditCard, Eye, Globe, TrendingUp, FileEdit, Copy, Trash2, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import { getViewer } from "@/lib/products/viralpulse-ai/viewer";
import { listVCardsAction } from "@/app/(products)/viralpulse-ai/(protected)/vcards/actions";
import type { VCardListItem } from "@/lib/products/viralpulse-ai/vcard/types";
import VCardCardActions from "@/components/products/viralpulse-ai/vcard/VCardCardActions";

export const dynamic = "force-dynamic";

function kpi(label: string, value: string | number, icon: React.ElementType, colorClass: string) {
  const Icon = icon;
  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-xs p-4 flex items-center gap-3">
      <div className={`size-10 rounded-xl flex items-center justify-center ${colorClass}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function CardItem({ card }: { card: VCardListItem }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-xs p-4 hover:border-primary/30 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-base shrink-0">
            {card.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{card.name}</h3>
            <p className="text-xs text-muted-foreground truncate">{card.jobTitle} · {card.company}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant={card.status === "published" ? "default" : "secondary"}
            className="text-[10px] capitalize"
          >
            {card.status}
          </Badge>
          <Badge variant="outline" className="text-[10px] capitalize hidden sm:inline-flex">
            {card.layout}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Eye className="size-3" /> {card.views} views</span>
        <span className="hidden sm:flex items-center gap-1 ml-auto text-[10px]">
          Updated {new Date(card.updatedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
        <Link href={`/viralpulse-ai/vcards/${card.id}`} className={buttonVariants({ variant: "default", size: "sm", className: "flex-1 gap-1.5 text-xs" })}>
          <FileEdit className="size-3" /> Edit
        </Link>
        {card.status === "published" && (
          <Link href={`/vcard/${card.slug}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5 text-xs" })}>
            <ExternalLink className="size-3" /> View
          </Link>
        )}
        <VCardCardActions card={card} />
      </div>
    </div>
  );
}

export default async function VCardsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");

  const res = await listVCardsAction({ status: "all" });
  const cards: VCardListItem[] = res.ok ? (res as unknown as { ok: true } & Record<string, VCardListItem[]>)[Object.keys(res).find((k) => k !== "ok") || ""] || [] : [];

  const totalViews = cards.reduce((a, c) => a + c.views, 0);
  const publishedCount = cards.filter((c) => c.status === "published").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Visiting Cards"
        crumbs={[{ label: "AI Visiting Cards" }]}
        description="Create beautiful, AI-powered digital visiting cards and share them with the world."
        actions={[
          <Button key="new" nativeButton={false} render={<Link href="/viralpulse-ai/vcards/new" />} className="gap-2">
            <Plus className="size-4" /> Create New Card
          </Button>,
        ]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpi("Total Cards", cards.length, CreditCard, "bg-primary/10 text-primary")}
        {kpi("Published", publishedCount, Globe, "bg-emerald-500/10 text-emerald-600")}
        {kpi("Total Views", totalViews, TrendingUp, "bg-blue-500/10 text-blue-600")}
        {kpi("Drafts", cards.length - publishedCount, FileEdit, "bg-amber-500/10 text-amber-600")}
      </div>

      {/* Card grid or empty state */}
      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-16 flex flex-col items-center justify-center gap-4 text-center">
          <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <CreditCard className="size-8" />
          </div>
          <div>
            <h3 className="text-base font-bold">Create your first AI Visiting Card</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              AI will generate your professional bio, tagline, layout, and colour scheme in seconds.
            </p>
          </div>
          <Link href="/viralpulse-ai/vcards/new" className={buttonVariants({ size: "lg", className: "gap-2 mt-2" })}>
            <Plus className="size-4" /> Create Visiting Card
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cards.map((card) => (
            <CardItem key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
