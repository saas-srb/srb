import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { Check, Circle, Clock, Coins, Flag, Route, Sparkles, Target } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { PortalPageHeader, PortalStat } from "@/components/products/clientos/widgets";
import { EarnNav, HowItWorks, RewardHistory } from "@/components/products/clientos/rewards/parts";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getJourneyRewards } from "@/lib/products/clientos/rewards";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Journey rewards · {brand} {product:portal}");

export default async function JourneyRewardsPage() {
  const user = await guardPortalPage();
  const j = await getJourneyRewards(user);

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Journey rewards" subtitle="Earn credits every time you complete a stage of your journey." />
      <PanelListFilters>
<EarnNav current="journey" />

      {!j.hasJourney ? (
        <GlassCard interactive={false}>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Your journey starts when you submit an application or inquiry. Stage rewards will appear here.</CardContent>
        </GlassCard>
      ) : (
        <>
          <GlassCard interactive={false}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex items-center gap-4">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Route className="size-7" /></span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Where you are · {j.code}</p>
                  <p className="text-2xl font-black tracking-tight text-foreground">{j.currentLabel}</p>
                </div>
              </div>
              <div className="text-right text-sm">
                {j.next ? (
                  <>
                    <p className="text-xs text-muted-foreground">Next reward</p>
                    <p className="font-semibold text-foreground">{j.next.label} <span className="text-primary">+{j.next.amount.toLocaleString("en-IN")}</span></p>
                  </>
                ) : (
                  <p className="font-semibold text-green-600 dark:text-green-400">All stage rewards collected 🎉</p>
                )}
              </div>
            </CardContent>
          </GlassCard>

          <HowItWorks
            steps={[
              { icon: Flag, title: "1 · Progress", body: "Do what each stage needs — attend, submit, pay, deliver." },
              { icon: Check, title: "2 · Team confirms", body: "When our team marks the stage complete, it moves on your journey." },
              { icon: Sparkles, title: "3 · Credits land", body: "The stage's credits are added instantly and you get a notification." },
            ]}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PortalStat icon={Check} label="Stages rewarded" value={`${j.stats.done}/${j.stats.total}`} />
            <PortalStat icon={Coins} label="Earned from stages" value={j.stats.earned.toLocaleString("en-IN")} />
            <PortalStat icon={Target} label="Still to earn" value={j.stats.remaining.toLocaleString("en-IN")} hint="from remaining stages" />
            <PortalStat icon={Clock} label="Current stage" value={j.currentLabel} />
          </div>

          <GlassCard interactive={false}>
            <CardHeader>
              <CardTitle className="text-base">Stage-by-stage rewards</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {j.stages.map((s) => {
                  const Icon = s.earned || s.state === "done" ? Check : s.state === "current" ? Clock : Circle;
                  return (
                    <li key={s.key} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5">
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${s.earned ? "bg-green-500/15 text-green-600 dark:text-green-400" : s.state === "current" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}><Icon className="size-3.5" /></span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${s.state === "upcoming" ? "text-muted-foreground" : "text-foreground"}`}>{s.label}</p>
                        <p className="text-[11px] text-muted-foreground">{s.isStart ? "Starting point" : s.earned ? "Reward collected" : s.state === "current" ? "In progress" : s.state === "done" ? "Completed" : "Upcoming"}</p>
                      </div>
                      {!s.isStart && s.amount > 0 && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${s.earned ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-primary/10 text-primary"}`}>{s.earned ? "✓ " : "+"}{s.amount.toLocaleString("en-IN")}</span>}
                    </li>
                  );
                })}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">Stages that end in rejection, dropping out or closure never pay. Follow your progress in <Link href="/clientos/journey" className="text-primary hover:underline">My Journey</Link>.</p>
            </CardContent>
          </GlassCard>
        </>
      )}

      <RewardHistory title="Stage reward history" rows={j.history} empty="No stage rewards yet — they appear here as you progress." />
</PanelListFilters>
    </div>
  );
}
