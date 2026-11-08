import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, ListChecks, CalendarClock } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPLIANCE_SECTIONS, computeProgress } from "@/lib/products/cashflow-ai/compliance/catalog";
import { listItemStates } from "@/lib/products/cashflow-ai/compliance/tracker";
import { listFilings } from "@/lib/products/cashflow-ai/compliance/filings";
import { filingState } from "@/lib/products/cashflow-ai/compliance/filings-core";
import { gatherFacts } from "@/lib/products/cashflow-ai/compliance/facts";
import { doneButIssue, evaluateSignals } from "@/lib/products/cashflow-ai/compliance/auto-core";
import { listOwners } from "@/lib/products/cashflow-ai/compliance/owners";
import { WORKSTREAMS } from "@/lib/products/cashflow-ai/compliance/owners-core";
import { COMPLIANCE_ITEMS } from "@/lib/products/cashflow-ai/compliance/catalog";
import { runHealthChecks } from "@/lib/products/cashflow-ai/compliance/health";
import { overallLevel, type HealthLevel } from "@/lib/products/cashflow-ai/compliance/health-core";
import { todayDateString } from "@/lib/products/talentos/time";

const ICON: Record<HealthLevel, React.ReactNode> = {
  ok: <CheckCircle2 className="size-4 shrink-0 text-green-600" />,
  warn: <AlertTriangle className="size-4 shrink-0 text-amber-600" />,
  bad: <XCircle className="size-4 shrink-0 text-destructive" />,
  unknown: <HelpCircle className="size-4 shrink-0 text-muted-foreground" />,
};
const VERDICT: Record<HealthLevel, string> = {
  ok: "Everything we can check looks fine.",
  warn: "A few things need attention.",
  bad: "Something needs fixing now.",
  unknown: "Some checks could not run.",
};

export default async function CompliancePage() {
  const today = todayDateString();
  const [states, filings, checks, facts, owners] = await Promise.all([listItemStates(), listFilings(), runHealthChecks(today), gatherFacts(today), listOwners()]);
  const reCheck = doneButIssue(evaluateSignals(facts), new Map([...states].map(([k, v]) => [k, v.status])));
  const unnamed = WORKSTREAMS.filter((w) => !owners.get(w.key)?.primary).length;
  const progress = computeProgress(new Map([...states].map(([k, v]) => [k, v.status])));
  const applicable = progress.reduce((n, p) => n + p.applicable, 0);
  const done = progress.reduce((n, p) => n + p.done, 0);
  const overall = applicable === 0 ? 100 : Math.round((done / applicable) * 100);
  const fstates = filings.map((f) => ({ f, s: filingState(f, today) }));
  const attention = fstates.filter((x) => x.s === "overdue" || x.s === "due_soon").sort((a, b) => (a.f.dueDate ?? "").localeCompare(b.f.dueDate ?? ""));
  const noDate = fstates.filter((x) => x.s === "no_date").length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "CA & Compliance" }]}
        title={<>CA &amp; Compliance</>}
        description={<>One place to see whether the books are healthy, what is due, and how far the CA checklist has come. Your CA or CS must confirm what applies to your company and the due dates for the year.</>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Book health — {VERDICT[overallLevel(checks)]}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {checks.map((c) => (
                <li key={c.key} className="flex gap-2.5 text-sm">
                  {ICON[c.level]}
                  <div className="min-w-0">
                    <div className="font-medium">{c.href ? <Link href={c.href} className="hover:text-primary hover:underline">{c.label}</Link> : c.label}</div>
                    <div className="text-xs text-muted-foreground">{c.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarClock className="size-4" /> Needs your attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {attention.length === 0 && <p className="text-muted-foreground">No filing is overdue or due in the next 7 days.</p>}
            {attention.map(({ f, s }) => (
              <div key={f._id} className="flex items-center justify-between gap-3">
                <span>{f.name}{f.form ? ` (${f.form})` : ""}{f.period ? ` · ${f.period}` : ""}</span>
                <span className={s === "overdue" ? "font-medium text-destructive" : "text-amber-700 dark:text-amber-400"}>{s === "overdue" ? "Overdue" : "Due"} {f.dueDate?.split("-").reverse().join("-")}</span>
              </div>
            ))}
            {noDate > 0 && <p className="text-xs text-muted-foreground">{noDate} filing{noDate === 1 ? " has" : "s have"} no due date yet — ask your CA to confirm.</p>}
            {reCheck.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                {reCheck.length} checklist item{reCheck.length === 1 ? " is" : "s are"} marked Done but the books show a problem:{" "}
                {reCheck.map((k) => COMPLIANCE_ITEMS.find((i) => i.key === k)?.title).filter(Boolean).join("; ")}.{" "}
                <Link href="/cashflow-ai/compliance/checklist" className="text-primary hover:underline">Review</Link>
              </div>
            )}
            {unnamed > 0 && (
              <p className="text-xs text-muted-foreground">
                {unnamed} of {WORKSTREAMS.length} kinds of work have no named owner. <Link href="/cashflow-ai/compliance/team" className="text-primary hover:underline">Add names</Link>
              </p>
            )}
            <Link href="/cashflow-ai/compliance/calendar" className="inline-block pt-1 text-xs text-primary hover:underline">Open filing calendar →</Link>
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="size-4" /> CA checklist — {overall}% done ({done} of {applicable})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMPLIANCE_SECTIONS.map((s) => {
              const p = progress.find((x) => x.sectionKey === s.key)!;
              return (
                <Link key={s.key} href={`/cashflow-ai/compliance/checklist?section=${s.key}`} className="rounded-xl border border-border/50 p-3 transition-colors hover:border-primary/50">
                  <div className="text-sm font-medium">{s.number}. {s.title}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-primary" style={{ width: `${p.percent}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{p.done} of {p.applicable} done{p.notApplicable ? ` · ${p.notApplicable} not applicable` : ""}</div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </GlassCard>
    </div>
  );
}
