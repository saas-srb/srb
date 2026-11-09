import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { nf } from "@/lib/products/playbook-ai/dashboard/format";
import type { AttentionItem, CountItem, FunnelStep } from "@/lib/products/playbook-ai/dashboard/types";

/** Shared dashboard blocks (Playbook and ContractFlow): section card, divider, bar list, funnel, attention list and the date-range bar. */

export function Section({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <GlassCard interactive={false} className={className}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-bold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </GlassCard>
  );
}

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

export function BarList({ items, empty, href }: { items: CountItem[]; empty: string; href?: (i: CountItem) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => {
        const bar = (
          <>
            <span className="flex justify-between gap-2 text-xs"><span className="truncate font-medium">{i.label}</span><span className="tabular-nums text-muted-foreground">{nf.format(i.value)}</span></span>
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/80" style={{ width: `${Math.max((i.value / max) * 100, 3)}%` }} /></span>
          </>
        );
        return <li key={i.key}>{href ? <Link href={href(i)} className="block rounded-md hover:bg-muted/40">{bar}</Link> : bar}</li>;
      })}
    </ul>
  );
}

export function Funnel({ steps, emptyText = "Nothing was created in this period, so there is no funnel yet.", footLabel = "did not move on from the step before" }: { steps: FunnelStep[]; emptyText?: string; footLabel?: string }) {
  const max = Math.max(steps[0]?.value ?? 0, 1);
  if (!steps[0] || steps[0].value === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.key}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">{i + 1}. {s.label}</span>
            <span className="tabular-nums"><strong>{nf.format(s.value)}</strong>{s.pctOfFirst !== null && <span className="text-muted-foreground"> · {s.pctOfFirst}% of the first step</span>}</span>
          </div>
          <div className="mt-1 h-6 overflow-hidden rounded-md bg-muted"><div className="h-full rounded-md bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 2 : 0)}%` }} /></div>
          {s.dropPct !== null && s.dropPct > 0 && <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">{s.dropPct}% {footLabel}</p>}
        </li>
      ))}
    </ol>
  );
}

export function AttentionCard({ title, empty, items, tone }: { title: string; empty: string; items: AttentionItem[]; tone: "warn" | "info" }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <AlertTriangle className={cn("size-4", items.length ? (tone === "warn" ? "text-amber-500" : "text-blue-500") : "text-muted-foreground")} aria-hidden />
          {title}
          {items.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{items.length}{items.length === 8 ? "+" : ""}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />{empty}</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((i) => (
              <li key={i.id}>
                <Link href={i.href} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary">
                  <span className="min-w-0"><span className="block truncate font-medium">{i.title}</span><span className="block truncate text-xs text-muted-foreground">{i.detail}</span></span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </GlassCard>
  );
}


/** The quick ranges both dashboards offer (the key is what the URL carries, see `resolveRange`). */
export const DASH_RANGE_CHIPS = {
  options: [{ value: "today", label: "Today" }, { value: "7", label: "Last 7 Days" }, { value: "30", label: "Last 30 Days" }, { value: "month", label: "This Month" }, { value: "fy", label: "This FY" }, { value: "custom", label: "Custom" }],
  defaultValue: "30",
  customValue: "custom",
} as const;
