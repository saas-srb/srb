import Link from "next/link";
import { CheckCircle2, AlertTriangle, HelpCircle, Circle, UserCheck, Lock } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LockControls, MonthPicker, PersonStepControls } from "@/components/products/cashflow-ai/month-close/MonthCloseControls";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageFiscalPeriods, canReconcile } from "@/lib/fms-roles";
import { REPORT_LINKS, currentMonthIst, defaultCloseMonth, indiaFiscalYear, isMonthString, monthLabel, progressOf, stepDef, type StepStatus } from "@/lib/products/cashflow-ai/month-close/core";
import { getMonthClose } from "@/lib/products/cashflow-ai/month-close/store";

const BADGE: Record<StepStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  passed: { label: "Done by the books", cls: "bg-green-500/15 text-green-700 dark:text-green-400", icon: <CheckCircle2 className="size-4 text-green-600" /> },
  failing: { label: "Needs attention", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: <AlertTriangle className="size-4 text-amber-600" /> },
  unknown: { label: "Could not check", cls: "bg-muted text-muted-foreground", icon: <HelpCircle className="size-4 text-muted-foreground" /> },
  recorded: { label: "Recorded", cls: "bg-green-500/15 text-green-700 dark:text-green-400", icon: <UserCheck className="size-4 text-green-600" /> },
  todo: { label: "To do", cls: "bg-muted text-muted-foreground", icon: <Circle className="size-4 text-muted-foreground" /> },
};

const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function MonthClosePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = isMonthString(sp.month) ? sp.month : defaultCloseMonth();
  const user = await getCurrentFmsUser();
  const canRecord = user ? canReconcile(user) || canManageFiscalPeriods(user) : false;
  const canLock = user ? canManageFiscalPeriods(user) : false;
  const view = await getMonthClose(month);
  const progress = progressOf(view.steps);
  const fy = indiaFiscalYear(month);
  const lockDef = stepDef("lock")!;
  const locked = view.period.state === "closed";

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Month-end close" }]}
        title={<>Month-end close</>}
        description={<>Go through these steps for the month. Some are checked from your books; the rest a person confirms and the name and date are kept. When they are done, lock the month so nothing in it can be changed by mistake.</>}
      />

      <GlassCard interactive={false}>
        <CardContent className="flex flex-wrap items-end justify-between gap-4 pt-6">
          <div className="space-y-1">
            <MonthPicker month={month} max={currentMonthIst()} />
            <p className="text-xs text-muted-foreground">{monthLabel(month)} is month {fy.monthNumber} of financial year {fy.label}.</p>
          </div>
          <div className="min-w-48 flex-1 sm:max-w-sm">
            <p className="text-sm font-medium">{progress.done} of {progress.total} steps done</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Steps for {monthLabel(month)}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ol className="divide-y divide-border">
            {view.steps.map((s, i) => {
              const b = BADGE[s.status];
              return (
                <li key={s.key} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex gap-2.5">
                      <span className="mt-0.5">{b.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{i + 1}. {s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.help}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${b.cls}`}>
                      {s.status === "recorded" && s.record ? `Recorded by ${s.record.recordedByEmail ?? "a team member"}` : b.label}
                    </span>
                  </div>
                  <div className="space-y-2 pl-6.5">
                    {s.kind === "data" && <p className="text-sm">{s.detail}</p>}
                    {s.record && <p className="text-sm text-muted-foreground">{when(s.record.recordedAt)}{s.record.note ? `: ${s.record.note}` : ""}</p>}
                    <div className="flex flex-wrap items-center gap-3">
                      {s.href && s.key !== "pnl_bs_cf_reviewed" && <Link href={s.href} className="text-sm text-primary hover:underline">{s.hrefLabel ?? "Open"}</Link>}
                      {s.key === "pnl_bs_cf_reviewed" && REPORT_LINKS.map((l) => <Link key={l.href} href={l.href} className="text-sm text-primary hover:underline">{l.label}</Link>)}
                    </div>
                    {s.kind === "person" && !locked && <PersonStepControls month={month} stepKey={s.key} done={s.status === "recorded"} canEdit={canRecord} />}
                  </div>
                </li>
              );
            })}
            <li className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex gap-2.5">
                  <Lock className={`mt-0.5 size-4 ${locked ? "text-green-600" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium">{view.steps.length + 1}. {lockDef.title}</p>
                    <p className="text-xs text-muted-foreground">{lockDef.help}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${locked ? BADGE.passed.cls : BADGE.todo.cls}`}>{locked ? "Locked" : "To do"}</span>
              </div>
              <div className="space-y-3 pl-6.5">
                {view.decision.reason && <p className="text-sm">{view.decision.reason}</p>}
                {view.period.state === "none" || view.period.state === "mismatch" ? <Link href={lockDef.href!} className="text-sm text-primary hover:underline">Go to Fiscal Periods</Link> : null}
                {view.override && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
                    Reason to lock anyway, by {view.override.recordedByEmail ?? "a team member"} on {when(view.override.recordedAt)}: {view.override.reason}
                  </p>
                )}
                {!locked && <LockControls month={month} canLock={canLock} allowed={view.decision.allowed} needsOverride={view.decision.needsOverride} hasOverride={!!view.override} />}
              </div>
            </li>
          </ol>
        </CardContent>
      </GlassCard>
    </div>
  );
}
