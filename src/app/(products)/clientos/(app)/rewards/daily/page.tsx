import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { CalendarCheck, Coins, Flame, LogIn, Trophy, Zap } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { PortalPageHeader, PortalStat } from "@/components/products/clientos/widgets";
import { EarnNav, HowItWorks, RewardHistory } from "@/components/products/clientos/rewards/parts";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getDailyRewards } from "@/lib/products/clientos/rewards";
import { getPublicPage } from "@/lib/products/sitecraft-ai/public";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Daily rewards · {brand} {product:portal}");

export default async function DailyRewardsPage() {
  const user = await guardPortalPage();
  const d = await getDailyRewards(user);
  const guidePublished = Boolean(await getPublicPage("/rewards"));

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Daily rewards" subtitle="Visit every day to keep your streak alive and earn bonus credits." />
      <PanelListFilters>
<EarnNav current="daily" />

      <GlassCard interactive={false}>
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Flame className="size-7" /></span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Current streak</p>
                <p className="text-4xl font-black tracking-tight text-foreground">{d.streak} <span className="text-base font-semibold text-muted-foreground">day{d.streak === 1 ? "" : "s"}</span></p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className={d.visitedToday ? "font-semibold text-green-600 dark:text-green-400" : "font-semibold text-foreground"}>
                {d.visitedToday ? "✓ Today's reward collected" : "Visit today to collect your reward"}
              </p>
              {d.streakAmount > 0 && <p className="text-xs text-muted-foreground">{d.daysToBonus} more day{d.daysToBonus === 1 ? "" : "s"} to a +{d.streakAmount.toLocaleString("en-IN")} streak bonus</p>}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Last 14 days</p>
            <div className="grid grid-cols-7 gap-2 sm:grid-cols-14" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
              {d.days.map((day) => (
                <div key={day.date} title={`${day.date}${day.visited ? " — visited" : ""}`} className={`flex aspect-square items-center justify-center rounded-lg border text-[10px] ${day.visited ? "border-primary/40 bg-primary/15 font-bold text-primary" : "border-border/50 text-muted-foreground/60"}`}>
                  {day.visited ? "✓" : day.date.slice(8)}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </GlassCard>

      <HowItWorks
        steps={[
          { icon: LogIn, title: "1 · Visit", body: `Open any portal page once a day${d.dailyAmount > 0 ? ` and earn +${d.dailyAmount.toLocaleString("en-IN")}` : ""}.` },
          { icon: Flame, title: "2 · Build a streak", body: "Consecutive days grow your streak. Missing a day resets it to 1." },
          { icon: Trophy, title: "3 · Bonus every 7 days", body: d.streakAmount > 0 ? `Every 7th day adds a +${d.streakAmount.toLocaleString("en-IN")} bonus.` : "Streak bonuses appear here when enabled." },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStat icon={Zap} label="Best streak" value={`${d.best} days`} />
        <PortalStat icon={CalendarCheck} label="Days visited" value={d.totals.visits.toLocaleString("en-IN")} hint="last 200 rewards" />
        <PortalStat icon={Coins} label="Daily credits earned" value={d.totals.visitCredits.toLocaleString("en-IN")} />
        <PortalStat icon={Trophy} label="Streak bonuses" value={`${d.totals.streakBonuses} · ${d.totals.streakCredits.toLocaleString("en-IN")}`} />
      </div>

      <RewardHistory title="Daily reward history" rows={d.history} empty="Your daily rewards will appear here after your first visit." />
      <p className="text-xs text-muted-foreground">Days count in India time. {guidePublished && <>See the <Link href="/rewards" className="text-primary hover:underline">rewards guide</Link> for every way to earn.</>}</p>
</PanelListFilters>
    </div>
  );
}
