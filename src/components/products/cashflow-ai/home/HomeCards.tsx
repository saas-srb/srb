import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, XCircle } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttentionItem, SetupStep } from "@/lib/products/cashflow-ai/home/home";

const ICON = {
  bad: <XCircle className="size-4 shrink-0 text-destructive" />,
  warn: <AlertTriangle className="size-4 shrink-0 text-amber-600" />,
  unknown: <AlertTriangle className="size-4 shrink-0 text-muted-foreground" />,
  ok: <CheckCircle2 className="size-4 shrink-0 text-green-600" />,
};

/** The few things that need doing now, in plain words, worst first. */
export function AttentionCard({ items, allChecked }: { items: AttentionItem[]; allChecked: number }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>{items.length === 0 ? "Nothing needs your attention" : "Needs your attention"}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-green-600" /> All {allChecked} checks look fine.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((i) => {
              const body = (
                <div className="flex items-start gap-3 py-2.5">
                  {ICON[i.level]}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{i.title}</div>
                    <div className="text-xs text-muted-foreground">{i.detail}</div>
                  </div>
                  {i.href && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                </div>
              );
              return <li key={i.key}>{i.href ? <Link href={i.href} className="block rounded-lg hover:bg-muted/50">{body}</Link> : body}</li>;
            })}
          </ul>
        )}
      </CardContent>
    </GlassCard>
  );
}

/** One-time setup, in the order that matters. Hidden once every step is done. */
export function GetStartedCard({ steps }: { steps: SetupStep[] }) {
  const left = steps.filter((s) => !s.done);
  if (left.length === 0) return null;
  const done = steps.length - left.length;
  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>Get started — {done} of {steps.length} done</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length}>
          <div className="h-full bg-primary" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <ol className="space-y-2">
          {steps.map((s) => (
            <li key={s.key} className="flex items-start gap-3 text-sm">
              {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0">
                {s.done ? <span className="text-muted-foreground line-through">{s.title}</span> : <Link href={s.href} className="font-medium text-primary hover:underline">{s.title}</Link>}
                {!s.done && <div className="text-xs text-muted-foreground">{s.why}</div>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </GlassCard>
  );
}

export interface HubCard {
  href: string;
  title: string;
  /** One sentence: what this is for. */
  help: string;
  /** Live status in a few words; level colours it. */
  status?: { text: string; level: "ok" | "warn" | "bad" | "unknown" } | null;
  /** Smaller places inside it, for people who know what they want. */
  more?: { label: string; href: string }[];
}

/** A grid of big cards, each one place to go, with its status. */
export function HubGrid({ cards }: { cards: HubCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((c) => (
        <div key={c.href} className="flex flex-col gap-1.5">
        <Link href={c.href} className="group block flex-1">
          <GlassCard className="h-full p-4 transition-all group-hover:border-primary/40">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">{c.title}</h3>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{c.help}</p>
            {c.status && (
              <p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${c.status.level === "ok" ? "text-green-700 dark:text-green-400" : c.status.level === "bad" ? "text-destructive" : c.status.level === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                {ICON[c.status.level]} {c.status.text}
              </p>
            )}
          </GlassCard>
        </Link>
        {c.more && c.more.length > 0 && (
          <p className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
            {c.more.map((m) => <Link key={m.href} href={m.href} className="hover:text-primary hover:underline">{m.label}</Link>)}
          </p>
        )}
        </div>
      ))}
    </div>
  );
}
