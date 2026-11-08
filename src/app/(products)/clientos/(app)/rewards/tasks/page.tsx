import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { CheckCircle2, Coins, ListChecks, Repeat, Target, Trophy } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { PortalPageHeader, PortalStat } from "@/components/products/clientos/widgets";
import { EarnNav, HowItWorks, RewardHistory } from "@/components/products/clientos/rewards/parts";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getTaskRewards } from "@/lib/products/clientos/rewards";

import { brandify } from "@/lib/brand";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Bonus tasks · {brand} {product:portal}");

export default async function TaskRewardsPage() {
  const user = await guardPortalPage();
  const t = await getTaskRewards(user);

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Bonus tasks" subtitle="Quick wins and milestones that pay extra credits." />
      <PanelListFilters>
<EarnNav current="tasks" />

      <HowItWorks
        steps={[
          { icon: ListChecks, title: "1 · Pick a task", body: "Each card shows what to do and how many credits it pays." },
          { icon: CheckCircle2, title: "2 · Complete it", body: "Follow the steps — most tasks are a couple of clicks." },
          { icon: Coins, title: "3 · Get paid", body: "Credits are added automatically, once per task or event." },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStat icon={CheckCircle2} label="Tasks completed" value={`${t.stats.completed}/${t.stats.total}`} />
        <PortalStat icon={Coins} label="Earned from tasks" value={t.stats.earned.toLocaleString("en-IN")} />
        <PortalStat icon={Target} label="Still to earn" value={t.stats.remaining.toLocaleString("en-IN")} hint="from one-time tasks" />
        <PortalStat icon={Trophy} label="Referral milestones" value={t.tasks.filter((x) => x.progress && x.done).length} />
      </div>

      {t.tasks.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No bonus tasks are available for your account type right now.</CardContent>
        </GlassCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {t.tasks.map((task) => (
            <GlassCard key={task.id} interactive={false}>
              <CardContent className="flex h-full flex-col gap-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{task.title}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Repeat className="size-3" /> {task.frequency}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${task.done ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-primary/10 text-primary"}`}>{task.done ? "✓ " : "+"}{task.amount.toLocaleString("en-IN")}</span>
                </div>
                <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">When: </span>{brandify(task.when)}</p>
                <ol className="space-y-1 text-xs text-muted-foreground">
                  {task.steps.map((s, i) => <li key={i} className="flex gap-1.5"><span className="font-semibold text-primary">{i + 1}.</span> {brandify(s)}</li>)}
                </ol>
                {task.progress && <ProgressBar value={(task.progress.current / task.progress.target) * 100} showLabel={false} />}
                {task.progress && <p className="-mt-1 text-[11px] text-muted-foreground">{task.progress.current} of {task.progress.target} rewarded referrals</p>}
                <div className="mt-auto flex items-center justify-between pt-1 text-xs">
                  {task.done ? <span className="inline-flex items-center gap-1 font-medium text-green-600 dark:text-green-400"><CheckCircle2 className="size-3.5" /> Completed{task.earnedCount > 1 ? ` ×${task.earnedCount}` : ""}</span> : <span className="text-muted-foreground">{task.earnedCount > 0 ? `Earned ×${task.earnedCount}` : "Not yet done"}</span>}
                  {(!task.done || task.frequency === "Every time") && <Link href={task.href} className="font-semibold text-primary hover:underline">{task.cta} →</Link>}
                </div>
              </CardContent>
            </GlassCard>
          ))}
        </div>
      )}

      <RewardHistory title="Task reward history" rows={t.history} empty="Completed tasks and their rewards will appear here." />
</PanelListFilters>
    </div>
  );
}
