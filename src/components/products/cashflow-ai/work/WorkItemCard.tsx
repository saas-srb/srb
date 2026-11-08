import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkInstance, WorkState } from "@/lib/products/cashflow-ai/work/engine";

export const dmy = (d: string) => d.split("-").reverse().join("-");

export const workHref = (i: WorkInstance) => `/cashflow-ai/work/${i.task.id}/${i.period.key}`;

const BADGE: Record<WorkState, { label: (i: WorkInstance) => string; className: string }> = {
  overdue: { label: (i) => `${i.daysLate} day${i.daysLate === 1 ? "" : "s"} late`, className: "bg-destructive/10 text-destructive" },
  due_today: { label: () => "Due today", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  todo: { label: () => "To do", className: "bg-primary/10 text-primary" },
  upcoming: { label: (i) => `Opens ${dmy(i.availableFrom)}`, className: "bg-muted text-muted-foreground" },
  done: { label: () => "Done", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  skipped: { label: () => "Skipped", className: "bg-muted text-muted-foreground" },
};

export function WorkStateBadge({ instance }: { instance: WorkInstance }) {
  const b = BADGE[instance.state];
  return <Badge className={b.className}>{b.label(instance)}</Badge>;
}

export function DueLine({ instance }: { instance: WorkInstance }) {
  return <>Due {dmy(instance.due.date)} {instance.due.source === "rulebook" ? "(law)" : "(our suggestion)"}</>;
}

/** One piece of work as a card: what, why, when, how far along, and one big button into the steps. Server-compatible. */
export function WorkItemCard({ instance: i, compact = false }: { instance: WorkInstance; compact?: boolean }) {
  const total = i.task.steps.length;
  const finished = i.state === "done" || i.state === "skipped";
  const cta = finished || i.state === "upcoming" ? "View" : i.stepsDone > 0 ? "Continue" : "Do this";
  const pct = i.state === "done" ? 100 : Math.round((i.stepsDone / total) * 100);
  return (
    <div className={cn("rounded-xl border bg-card/60 p-3", i.state === "overdue" ? "border-destructive/40" : "border-border/50", !compact && "sm:p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{i.task.title}</div>
          {!compact && <div className="mt-0.5 text-xs text-muted-foreground">{i.task.why}</div>}
          <div className="mt-1 text-xs text-muted-foreground">{i.period.label} · <DueLine instance={i} /></div>
        </div>
        <WorkStateBadge instance={i} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn("h-full", i.state === "done" ? "bg-green-600" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{i.state === "done" ? `All ${total} steps done` : `${i.stepsDone} of ${total} steps ticked`}</div>
        </div>
        <Link href={workHref(i)} className={cn(buttonVariants({ variant: finished || i.state === "upcoming" ? "outline" : "default", size: "lg" }), "h-10 px-5 text-sm")}>{cta}</Link>
      </div>
    </div>
  );
}
