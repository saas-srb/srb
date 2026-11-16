import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { connectionSummary } from "@/lib/platform/connections/summary";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  using_srb: "border-primary/30 bg-primary/10 text-primary",
  using_own: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  srb_unavailable: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  needs_attention: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  not_set_up: "border-border bg-muted text-muted-foreground",
};

/**
 * A product's view of a shared connection (OpenAI, Google, Razorpay …): the status, who else uses it, and the way to change it. Read-only: a
 * connection is kept ONCE in CommandOS (Integrations) and every product reads it from there, so a product never has a form for keys.
 */
export default async function ConnectionSummary({ provider, children }: { provider: string; children?: React.ReactNode }) {
  const s = await connectionSummary(provider);
  if (!s) return null;
  return (
    <div data-connection-summary={provider} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {s.name}
          <span data-status={s.status} className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", TONE[s.status])}>{s.label}</span>
        </p>
        <p className="text-xs text-muted-foreground">{s.note}</p>
        {s.usedBy.length > 0 && <p className="text-xs text-muted-foreground">Also used by: {s.usedBy.join(", ")}. Changes apply to all of them.</p>}
        {children}
      </div>
      <Link href={s.href} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted">
        Manage in CommandOS <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
