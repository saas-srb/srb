import "server-only";
import { getDb } from "@/lib/mongodb";
import { TRANSACTIONS_COLLECTION, type WalletTransaction } from "@/lib/wallet/transactions";
import { getStreak, getEarnWays } from "@/lib/wallet/earn";
import { listRewardRules } from "@/lib/wallet/reward-rules";
import { pick } from "@/lib/wallet/guide";
import { listReferralsForReferrer } from "@/lib/wallet/referrals";
import { EARN_GUIDE, APPLIES_TO, type GuideAudience } from "@/lib/wallet/earn-guide";
import { getActivePortalLead } from "@/lib/products/clientos/lead";
import { txLabel, type ActivityRuleType } from "@/lib/wallet/constants";
import type { CurrentPortalUser } from "@/lib/portal-auth";

export interface HistoryRow {
  id: string;
  date: string;
  label: string;
  amount: number;
  balanceAfter: number;
}

const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

async function activityTxs(userId: string, activities: ActivityRuleType[], limit = 200): Promise<WalletTransaction[]> {
  const db = await getDb();
  return db
    .collection<WalletTransaction>(TRANSACTIONS_COLLECTION)
    .find({ userId, type: "activity_reward", status: { $ne: "reversed" }, "metadata.activity": { $in: activities } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

function toHistory(txs: WalletTransaction[]): HistoryRow[] {
  return txs.slice(0, 25).map((t) => ({ id: t._id, date: t.createdAt.toISOString(), label: txLabel(t.type, t.metadata), amount: t.amount, balanceAfter: t.balanceAfter }));
}

// ---------------------------------------------------------------------------
export async function getDailyRewards(user: Pick<CurrentPortalUser, "id" | "role">) {
  const [streakInfo, txs, rules] = await Promise.all([getStreak(user.id), activityTxs(user.id, ["daily_visit", "streak_7"]), listRewardRules()]);
  const role = user.role as GuideAudience;
  const dailyAmount = pick(rules, "daily_visit", role)?.amount ?? 0;
  const streakAmount = pick(rules, "streak_7", role)?.amount ?? 0;

  const visited = new Set(txs.filter((t) => t.metadata?.activity === "daily_visit").map((t) => ist(t.createdAt)));
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = ist(new Date(Date.now() - (13 - i) * 86400000));
    return { date, visited: visited.has(date) };
  });
  const sum = (a: string) => txs.filter((t) => t.metadata?.activity === a).reduce((s, t) => s + t.amount, 0);
  const cycle = streakInfo.streak % 7;
  return {
    dailyAmount,
    streakAmount,
    streak: streakInfo.streak,
    best: streakInfo.best,
    visitedToday: streakInfo.visitedToday,
    daysToBonus: streakInfo.streak === 0 || cycle === 0 ? 7 : 7 - cycle,
    days,
    totals: { visits: visited.size, visitCredits: sum("daily_visit"), streakCredits: sum("streak_7"), streakBonuses: txs.filter((t) => t.metadata?.activity === "streak_7").length },
    history: toHistory(txs),
  };
}

// ---------------------------------------------------------------------------
export async function getJourneyRewards(user: CurrentPortalUser) {
  const [leadView, rules] = await Promise.all([getActivePortalLead(user), listRewardRules()]);
  const txs = await activityTxs(user.id, ["stage_complete"]);
  if (!leadView) return { hasJourney: false as const, history: toHistory(txs) };

  const type = leadView.lead.type as GuideAudience;
  const earnedKeys = new Set(txs.map((t) => (typeof t.metadata?.subKey === "string" ? t.metadata.subKey : "")));
  const workflow = leadView.workflow.filter((s) => s.terminal !== "lost");
  const stages = workflow.map((s, i) => {
    const amount = pick(rules, "stage_complete", type, s.key)?.amount ?? 0;
    const tl = leadView.stageTimeline.find((x) => x.key === s.key);
    return { key: s.key, label: s.portalLabel, amount, state: (tl?.state ?? "upcoming") as "done" | "current" | "upcoming" | "skipped", earned: earnedKeys.has(s.key), isStart: i === 0 };
  });
  // The first stage is where you begin, not something you complete — it never pays.
  const payable = stages.filter((s) => !s.isStart && s.amount > 0);
  const next = payable.find((s) => s.state !== "done" && !s.earned) ?? null;
  return {
    hasJourney: true as const,
    code: leadView.lead.code,
    currentLabel: leadView.currentStagePortalLabel,
    stages,
    stats: {
      done: payable.filter((s) => s.earned).length,
      total: payable.length,
      earned: txs.reduce((s, t) => s + t.amount, 0),
      remaining: payable.filter((s) => !s.earned).reduce((s, x) => s + x.amount, 0),
    },
    next: next ? { label: next.label, amount: next.amount } : null,
    history: toHistory(txs),
  };
}

// ---------------------------------------------------------------------------
const TASK_TYPES: ActivityRuleType[] = ["profile_complete", "first_offer_claim", "first_payment", "assignment_submit", "assignment_approved", "interview_completed"];

export interface TaskCard {
  id: string;
  title: string;
  amount: number;
  frequency: string;
  when: string;
  steps: string[];
  href: string;
  cta: string;
  done: boolean;
  earnedCount: number;
  earnedTotal: number;
  progress?: { current: number; target: number };
}

export async function getTaskRewards(user: Pick<CurrentPortalUser, "id" | "role">) {
  const role = user.role as GuideAudience;
  const [ways, txs, referrals] = await Promise.all([getEarnWays(user), activityTxs(user.id, [...TASK_TYPES, "referral_milestone"]), listReferralsForReferrer(user.id)]);
  const applicable = new Set(APPLIES_TO[role] ?? []);
  const rewarded = referrals.filter((r) => r.status === "REWARDED").length;

  const tasks: TaskCard[] = ways
    .filter((w) => (TASK_TYPES as readonly string[]).includes(w.type) || w.type === "referral_milestone")
    .filter((w) => applicable.has(w.type))
    .map((w) => {
      const g = EARN_GUIDE[w.type];
      const target = w.type === "referral_milestone" ? Number(w.title.split(" ")[0]) : null;
      return {
        id: w.id,
        title: w.title,
        amount: w.amount,
        frequency: g.frequency,
        when: g.when,
        steps: g.steps,
        href: w.href,
        cta: w.cta,
        done: w.done || (target !== null && w.earnedCount > 0),
        earnedCount: w.earnedCount,
        earnedTotal: w.earnedTotal,
        progress: target ? { current: Math.min(rewarded, target), target } : undefined,
      };
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || b.amount - a.amount);

  const oneTime = tasks.filter((t) => t.frequency === "One time" || t.progress);
  return {
    tasks,
    stats: {
      completed: oneTime.filter((t) => t.done).length,
      total: oneTime.length,
      earned: tasks.reduce((s, t) => s + t.earnedTotal, 0),
      remaining: oneTime.filter((t) => !t.done).reduce((s, t) => s + t.amount, 0),
    },
    history: toHistory(txs),
  };
}
