import Link from "next/link";
import { ArrowRight, Bot, CreditCard, Globe, Mail, Mic, PlugZap, Search, Share2, Webhook, type LucideIcon } from "lucide-react";
import { CARD_CATEGORIES, STATUS_LABEL, type CardStatus, type IntegrationCard } from "@/lib/platform/connections/cards";
import { cn } from "@/lib/utils";

const PATH = "/commandos/settings/integrations";
const ICON: Record<string, LucideIcon> = { email: Mail, payments: CreditCard, ai: Bot, voice: Mic, website: Search, social: Share2, webhooks: Webhook, domains: Globe };
const BADGE: Record<CardStatus, string> = {
  using_srb: "border-primary/30 bg-primary/10 text-primary",
  using_own: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  not_set_up: "border-border bg-muted text-muted-foreground",
  needs_attention: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
};

export function IntegrationCardView({ c }: { c: IntegrationCard }) {
  const Icon = ICON[c.category] ?? PlugZap;
  return (
    <article data-integration={c.key} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{c.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{c.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span data-status={c.status} className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", BADGE[c.status])}>{STATUS_LABEL[c.status]}</span>
        {c.note && <span className="text-xs text-muted-foreground">{c.note}</span>}
      </div>
      {c.usedBy.length > 0 && <p className="text-xs text-muted-foreground">Used by: {c.usedBy.join(", ")}</p>}
      <div className="mt-auto">
        {c.kind === "page" ? (
          <Link href={c.href!} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">Configure <ArrowRight className="size-3.5" aria-hidden /></Link>
        ) : (
          <Link href={`${PATH}?open=${c.key}`} scroll={false} aria-label={`Configure ${c.name}`} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Configure</Link>
        )}
      </div>
    </article>
  );
}


/** The cards grouped by plain-English category (no data access: the page and the dev harness both use it). */
export default function IntegrationsView({ cards }: { cards: IntegrationCard[] }) {
  return (
    <>
      {CARD_CATEGORIES.map((cat) => {
        const items = cards.filter((c) => c.category === cat.key);
        if (items.length === 0) return null;
        return (
          <section key={cat.key} aria-label={cat.title} className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">{cat.title}</h2>
              <p className="text-sm text-muted-foreground">{cat.description}</p>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((c) => <IntegrationCardView key={c.key} c={c} />)}</div>
          </section>
        );
      })}
    </>
  );
}
