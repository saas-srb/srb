import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clock, Lock, MinusCircle, PartyPopper, Search } from "lucide-react";
import SetupRing from "@/components/setup/SetupRing";
import StepActions, { type StepActionHandlers } from "@/components/setup/StepActions";
import { GROUPS, type SetupProgress, type StepState } from "@/lib/platform/setup-progress/types";
import { STATUS_CHIP, filterSteps, type SetupFilter } from "@/lib/platform/setup-progress/filter";
import { cn } from "@/lib/utils";

const CHIP: Record<StepState["status"], { cls: string; Icon: typeof CheckCircle2 }> = {
  done: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 },
  partial: { cls: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300", Icon: Clock },
  todo: { cls: "border-border bg-muted text-muted-foreground", Icon: CircleDashed },
  notApplicable: { cls: "border-border bg-muted/60 text-muted-foreground", Icon: MinusCircle },
  unknown: { cls: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300", Icon: AlertTriangle },
};
const TIER_WORD = { required: "Required", recommended: "Recommended", optional: "Optional" } as const;

export function Bar({ percent, className }: { percent: number; className?: string }) {
  return <span role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className={cn("block h-2 w-full overflow-hidden rounded-full bg-muted", className)}><span className={cn("block h-full rounded-full", percent === 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${percent}%` }} /></span>;
}

function StepRow({ s, allowed, canMark, handlers }: { s: StepState; allowed: ReadonlySet<string> | null; canMark: boolean; handlers: StepActionHandlers }) {
  const chip = CHIP[s.status];
  const open = allowed === null || allowed.has(s.feature);
  const label = s.status === "done" || s.status === "notApplicable" ? "View" : s.status === "partial" ? "Finish" : s.manual ? "Open" : "Set up";
  return (
    <li data-step={s.id} data-status={s.status} className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{s.title}</h3>
          <span data-chip={s.status} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", chip.cls)}><chip.Icon className="size-3" aria-hidden />{STATUS_CHIP[s.status]}</span>
          <span className="text-xs text-muted-foreground">{TIER_WORD[s.tier]} · about {s.minutes} min</span>
        </div>
        <p className="text-sm text-foreground/80">{s.description}</p>
        <p className="text-xs text-muted-foreground"><span className="font-medium">Why it matters:</span> {s.why}</p>
        <p className="text-xs text-muted-foreground">{s.detail}{s.blockedBy.length > 0 ? " Do the step before it first." : ""}</p>
        {canMark && (s.manual || s.canMarkNotApplicable) && <StepActions id={s.id} manual={s.manual} canNa={s.canMarkNotApplicable} mark={s.mark} handlers={handlers} />}
      </div>
      <div className="shrink-0">
        {open ? (
          <Link href={s.href} scroll={false} className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">{label} <ArrowRight className="size-3.5" aria-hidden /></Link>
        ) : (
          <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground"><Lock className="size-3.5" aria-hidden />Ask your Director</span>
        )}
      </div>
    </li>
  );
}

/** The body of the Setup progress page (pure presentation, also used by the dev harness). */
export default function SetupView({ progress, filter, trend, allowed, canMark, handlers, productNames, action = "/commandos/setup" }: { progress: SetupProgress; filter: SetupFilter; trend: { day: string; percent: number }[]; allowed: ReadonlySet<string> | null; canMark: boolean; handlers: StepActionHandlers; productNames: Record<string, string>; action?: string }) {
  const s = progress.summary;
  const shown = filterSteps(progress.steps, filter);
  const tab = (show: string, text: string) => <Link key={show} href={`${action}?${new URLSearchParams({ ...(filter.q ? { q: filter.q } : {}), ...(show !== "all" ? { show } : {}) })}`} aria-current={filter.show === show ? "true" : undefined} className={cn("inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium", filter.show === show ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{text}</Link>;
  return (
    <div className="space-y-6">
      <section data-setup-hero className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:flex-row sm:items-center">
        <SetupRing percent={s.percent} size={128} />
        <div className="min-w-0 flex-1 space-y-2">
          {s.complete ? (
            <><h2 className="flex items-center gap-2 text-xl font-semibold"><PartyPopper className="size-5 text-emerald-600" aria-hidden />Setup complete</h2><p className="text-sm text-muted-foreground">Every step that applies to you is done. New steps appear if you switch on another product.</p></>
          ) : (
            <><h2 className="text-xl font-semibold">{s.done} of {s.applicable} steps done</h2><p className="text-sm text-muted-foreground">{s.minutesLeft > 0 ? `About ${s.minutesLeft} minutes left. ` : ""}Complete when all steps that apply to you are done.</p></>
          )}
          <Bar percent={s.percent} />
          <p className="text-xs text-muted-foreground">{s.partial} in progress · {s.todo} to do · {s.notApplicable} not applicable{s.unknown > 0 ? ` · ${s.unknown} could not be checked` : ""}</p>
          {trend.length > 1 && <p className="text-xs text-muted-foreground" data-trend>Last {trend.length} days: {trend.map((t) => `${t.percent}%`).join(" → ")}</p>}
        </div>
      </section>

      <section aria-label="Progress by area" className="space-y-3">
        <h2 className="text-base font-semibold">By area</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {s.groups.map((g) => (
            <a key={g.key} href={`#group-${g.key}`} data-group-tile={g.key} className="space-y-2 rounded-2xl border border-border/60 bg-card p-4 shadow-sm hover:bg-muted/30">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{g.title}</h3><span className="text-sm font-bold tabular-nums">{g.percent}%</span></div>
              <Bar percent={g.percent} />
              <p className="text-xs text-muted-foreground">{g.done} of {g.applicable} done</p>
            </a>
          ))}
        </div>
      </section>

      {s.products.length > 0 && (
        <section aria-label="Progress by product" className="space-y-3">
          <h2 className="text-base font-semibold">By product</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {s.products.map((p) => (
              <div key={p.module} data-product-bar={p.module} className="space-y-2 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{productNames[p.module] ?? p.module}</h3><span className="text-sm font-bold tabular-nums">{p.percent}%</span></div>
                <Bar percent={p.percent} />
                <p className="text-xs text-muted-foreground">{p.done} of {p.applicable} done</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <form method="get" action={action} role="search" data-setup-filters className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <label className="relative block min-w-0 flex-1 basis-60"><span className="sr-only">Search steps</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><input name="q" defaultValue={filter.q} placeholder="Search steps" className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm" /></label>
        {filter.show !== "all" && <input type="hidden" name="show" value={filter.show} />}
        <button type="submit" className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">Search</button>
        <nav aria-label="Show" className="flex gap-2">{tab("all", "All")}{tab("todo", "To do")}{tab("done", "Done")}</nav>
      </form>

      {shown.length === 0 ? (
        <p data-setup-empty className="rounded-2xl border border-dashed border-border bg-card/50 py-12 text-center text-sm text-muted-foreground">No steps match. Try another word or show all steps.</p>
      ) : (
        GROUPS.map((g) => {
          const items = shown.filter((x) => x.group === g.key);
          if (items.length === 0) return null;
          return (
            <section key={g.key} id={`group-${g.key}`} aria-label={g.title} className="space-y-3">
              <div><h2 className="text-base font-semibold">{g.title} <span className="font-normal text-muted-foreground">({items.length})</span></h2><p className="text-sm text-muted-foreground">{g.description}</p></div>
              <ul className="space-y-3">{items.map((x) => <StepRow key={x.id} s={x} allowed={allowed} canMark={canMark} handlers={handlers} />)}</ul>
            </section>
          );
        })
      )}
    </div>
  );
}
