import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, Briefcase, CheckCircle2, CircleDashed, CreditCard, Globe, HardDrive, Lock, Mail, Mic, PlugZap, Search, Settings, Share2, ShieldCheck, Users, Webhook, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LOOK, STATUS_WORDS, primaryLabel, type SettingsCardData, type SettingsStatus } from "@/components/settings/model";

/** The icon names a card may use (strings, so server and client code can pass them). Product pages may also pass an icon component. */
export const ICON_NAMES: Record<string, LucideIcon> = {
  email: Mail, payments: CreditCard, ai: Bot, voice: Mic, website: Search, social: Share2, webhooks: Webhook, domains: Globe, storage: HardDrive, leads: Briefcase, people: Users, plug: PlugZap, settings: Settings,
};

const TONE: Record<"good" | "brand" | "muted" | "warn", string> = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  brand: "border-primary/30 bg-primary/10 text-primary",
  muted: "border-border bg-muted text-muted-foreground",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
};
const BADGE_ICON = { check: CheckCircle2, shield: ShieldCheck, dashed: CircleDashed, alert: AlertTriangle, lock: Lock };

/** The status badge: the same words, colours and icons on every settings page and in every panel header. */
export function StatusBadge({ status, className }: { status: SettingsStatus; className?: string }) {
  const look = STATUS_LOOK[status];
  const Icon = BADGE_ICON[look.icon];
  return (
    <span data-status={status} className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", TONE[look.tone], className)}>
      <Icon className="size-3" aria-hidden />
      {STATUS_WORDS[status]}
    </span>
  );
}

/** The icon tile: the same size and gradient as the icon tile of the dashboard KPI card. */
export function IconTile({ icon, className }: { icon: string | LucideIcon; className?: string }) {
  const Icon = typeof icon === "string" ? (ICON_NAMES[icon] ?? PlugZap) : icon;
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-accent text-white", className)}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

/**
 * THE settings card. One anatomy and one set of sizes everywhere, with no page-specific overrides: icon tile, name and status badge on the top row;
 * one sentence (two lines, always reserved); a muted block of two reserved lines ("Used by" / "Connections", then a note); ONE primary button.
 * Every card has the same height and padding; a locked card looks the same on every page and leads to the page that explains it.
 */
export default function SettingsCard({ card, icon }: { card: SettingsCardData; icon?: LucideIcon }) {
  const locked = card.status === "locked";
  const metaText = card.meta && card.meta.items.length > 0 ? metaLine(card.meta.label, card.meta.items) : null;
  const full = card.meta && card.meta.items.length > 0 ? `${card.meta.label}: ${card.meta.items.join(", ")}` : undefined;
  return (
    <article data-settings-card={card.key} data-status={card.status} className={cn("flex h-[14rem] min-w-0 flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm", locked && "opacity-70")}>
      <div className="flex h-9 items-center gap-3">
        <IconTile icon={icon ?? card.icon} className={locked ? "grayscale" : undefined} />
        <h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{card.name}</h3>
        <StatusBadge status={card.status} />
      </div>
      <p className="line-clamp-2 min-h-10 text-sm leading-5 text-foreground/80">{card.description}</p>
      <div className="h-10 space-y-0 text-xs leading-5 text-muted-foreground">
        <p className="truncate" title={full}>{metaText ?? "\u00a0"}</p>
        <p className="truncate">{card.note ?? "\u00a0"}</p>
      </div>
      <div className="mt-auto flex items-center">
        {locked ? (
          <Link href={card.lockedHref ?? card.href} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted">Ask your Director for access</Link>
        ) : (
          <Link href={card.href} scroll={false} aria-label={`${primaryLabel(card.status)} ${card.name}`} className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {primaryLabel(card.status)} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </article>
  );
}

/** "Used by: A, B, C +2 more": at most three names, then how many more. */
export function metaLine(label: string, items: string[]): string {
  const shown = items.slice(0, 3).join(", ");
  return `${label}: ${shown}${items.length > 3 ? ` +${items.length - 3} more` : ""}`;
}
