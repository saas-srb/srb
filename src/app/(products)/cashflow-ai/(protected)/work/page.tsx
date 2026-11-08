import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, ListTodo } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StartPlanForm from "@/components/products/cashflow-ai/work/StartPlanForm";
import WorkTabs from "@/components/products/cashflow-ai/work/WorkTabs";
import { WorkItemCard, dmy } from "@/components/products/cashflow-ai/work/WorkItemCard";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance, canManageTransactions } from "@/lib/fms-roles";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { getComplianceProfile } from "@/lib/products/cashflow-ai/compliance/filings";
import { summarise, type WorkInstance } from "@/lib/products/cashflow-ai/work/engine";
import { dailyBacklogDays, groupWork, WORK_VIEWS } from "@/lib/products/cashflow-ai/work/grouping";
import { loadWork } from "@/lib/products/cashflow-ai/work/store";

const EMPTY: Record<string, string> = {
  today: "Nothing to do today. Well done.",
  week: "Nothing waiting this week.",
  month: "Nothing waiting this month.",
  quarter: "Nothing waiting this quarter.",
  year: "Nothing waiting this year.",
};

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-3">
      <span className={tone}>{icon}</span>
      <div>
        <div className="text-2xl font-semibold leading-none">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function CardList({ items }: { items: WorkInstance[] }) {
  return (
    <div className="space-y-3">
      {items.map((i) => <WorkItemCard key={`${i.task.id}|${i.period.key}`} instance={i} />)}
    </div>
  );
}

export default async function WorkPage() {
  const today = istToday();
  const user = await getCurrentFmsUser();
  const canWrite = !!user && (canManageCompliance(user) || canManageTransactions(user));
  const { plan, instances } = await loadWork(today);

  if (!plan) {
    const profile = await getComplianceProfile();
    return (
      <div className="space-y-4">
        <PanelPageHeader breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "My work" }]} title="My work" description="Run your company's accounts and filings yourself, one short list at a time." />
        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="size-5" /> Start my work plan</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              <li>My work tells you what to do every day, every week, every month, every quarter and every year to keep your accounts right.</li>
              <li>Each job is a short list of steps. A step opens the exact screen where you do it.</li>
              <li>Anything you have not finished stays on your list and turns red, so nothing is forgotten.</li>
              <li>Work starts from today. Nothing from before today is demanded.</li>
            </ul>
            <StartPlanForm profile={profile} canStart={canWrite} />
          </CardContent>
        </GlassCard>
      </div>
    );
  }

  const g = groupWork(instances);
  const sum = summarise(instances);
  const backlog = dailyBacklogDays(g.overdueDaily);
  const counts = Object.fromEntries(WORK_VIEWS.map((v) => [v.key, g.sections[v.key].length]));
  const overdueCount = g.overdueDaily.length + g.overdueOther.length;

  return (
    <div className="space-y-4">
      <PanelPageHeader breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "My work" }]} title="My work" description={<>What to do to keep your accounts and filings right. Started {dmy(plan.startDate)}. Today is {dmy(today)}.</>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<AlertTriangle className="size-6" />} tone="text-destructive" label="Overdue" value={sum.overdue} />
        <Stat icon={<CalendarClock className="size-6" />} tone="text-amber-600" label="Due today" value={sum.dueToday} />
        <Stat icon={<ListTodo className="size-6" />} tone="text-primary" label="To do" value={sum.todo} />
        <Stat icon={<CheckCircle2 className="size-6" />} tone="text-green-600" label="Done" value={sum.done} />
      </div>

      <WorkTabs counts={counts} />

      {overdueCount > 0 && (
        <section className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4" aria-labelledby="catch-up">
          <h2 id="catch-up" className="flex items-center gap-2 text-base font-semibold text-destructive"><AlertTriangle className="size-5" /> Not done yet — catch up</h2>
          {g.overdueOther.length > 0 && <CardList items={g.overdueOther} />}
          {g.overdueDaily.length > 0 && (
            <details className="rounded-xl border border-destructive/30 bg-card/60">
              <summary className="cursor-pointer select-none p-3 text-sm font-medium">
                {backlog.days} day{backlog.days === 1 ? "" : "s"} of daily work not marked done
                {backlog.oldest && backlog.newest && <span className="font-normal text-muted-foreground"> ({dmy(backlog.oldest)}{backlog.oldest !== backlog.newest ? ` to ${dmy(backlog.newest)}` : ""}), oldest first</span>}
              </summary>
              <div className="p-3 pt-0"><CardList items={g.overdueDaily} /></div>
            </details>
          )}
        </section>
      )}

      {WORK_VIEWS.map((v) => (
        <section key={v.key} id={v.key} className="scroll-mt-16 space-y-3" aria-labelledby={`h-${v.key}`}>
          <h2 id={`h-${v.key}`} className="text-lg font-semibold">{v.label}</h2>
          {g.sections[v.key].length === 0 ? <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">{EMPTY[v.key]}</p> : <CardList items={g.sections[v.key]} />}
        </section>
      ))}

      {g.upcoming.length > 0 && (
        <section className="space-y-3 opacity-90" aria-labelledby="h-upcoming">
          <h2 id="h-upcoming" className="text-base font-semibold text-muted-foreground">Coming up</h2>
          <CardList items={g.upcoming} />
        </section>
      )}

      {g.finished.length > 0 && (
        <details className="rounded-xl border border-border/50">
          <summary className="cursor-pointer select-none p-3 text-sm font-medium">Show finished ({g.finished.length})</summary>
          <div className="p-3 pt-0"><CardList items={g.finished} /></div>
        </details>
      )}
    </div>
  );
}
