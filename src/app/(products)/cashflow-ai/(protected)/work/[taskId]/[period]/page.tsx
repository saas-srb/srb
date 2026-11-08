import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import StepChecklist from "@/components/products/cashflow-ai/work/StepChecklist";
import WorkTabs from "@/components/products/cashflow-ai/work/WorkTabs";
import { DueLine, WorkStateBadge, dmy } from "@/components/products/cashflow-ai/work/WorkItemCard";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance, canManageTransactions } from "@/lib/fms-roles";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { autoTicks, loadAutoFacts } from "@/lib/products/cashflow-ai/work/auto";
import { loadWorkLogMeta } from "@/lib/products/cashflow-ai/work/log-meta";
import { loadWork } from "@/lib/products/cashflow-ai/work/store";

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

export default async function WorkTaskPage({ params }: { params: Promise<{ taskId: string; period: string }> }) {
  const { taskId, period } = await params;
  const today = istToday();
  const { plan, instances } = await loadWork(today);
  // an unknown task, a made-up period, or work that does not apply to this company is simply not in the list
  const instance = plan ? instances.find((i) => i.task.id === taskId && i.period.key === safeDecode(period)) : undefined;
  if (!instance) notFound();

  const user = await getCurrentFmsUser();
  const canWrite = !!user && (canManageCompliance(user) || canManageTransactions(user));
  const { task } = instance;
  const status = instance.log?.status ?? "open";
  const auto = await autoTicks(task.steps.map((s) => s.auto), await loadAutoFacts(today), task.frequency === "monthly" ? instance.period.key : null, instance.period.end < today);
  const meta = status === "open" ? null : await loadWorkLogMeta(task.id, instance.period.key);
  const finishedBy = meta ? [meta.by, meta.at ? `on ${dmy(meta.at.slice(0, 10))}` : null].filter(Boolean).join(" ") || null : null;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "My work", href: "/cashflow-ai/work" }, { label: task.title }]}
        title={task.title}
        description={task.why}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{instance.period.label}</span>·<span><DueLine instance={instance} /></span>
            <WorkStateBadge instance={instance} />
          </div>
        }
      />
      <WorkTabs />
      <Link href="/cashflow-ai/work" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="size-3.5" /> Back to My work</Link>
      <GlassCard interactive={false}>
        <CardContent className="pt-4">
          <StepChecklist
            key={status}
            taskId={task.id}
            period={instance.period.key}
            steps={task.steps.map((s, i) => ({ text: s.text, hint: s.hint, href: s.href, built: s.built, auto: auto[i] === true }))}
            ticked={instance.steps}
            status={status}
            canWrite={canWrite}
            skipReason={instance.log?.skipReason ?? null}
            finishedBy={finishedBy}
          />
        </CardContent>
      </GlassCard>
    </div>
  );
}
