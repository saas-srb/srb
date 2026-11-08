import "server-only";
import { getDb } from "@/lib/mongodb";
import { creditWallet } from "@/lib/wallet/wallets";
import { TRANSACTIONS_COLLECTION, type WalletTransaction } from "@/lib/wallet/transactions";
import { resolveActiveRewardRule, listRewardRules } from "@/lib/wallet/reward-rules";
import { externalUsers, type CurrentPortalUser } from "@/lib/portal-auth";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { stageMeta } from "@/lib/lead-management/workflows";
import {
  REWARD_RULE_TYPE_LABELS,
  EARN_WAY_META,
  formatCredits,
  type ActivityRuleType,
  type RewardRuleAudience,
  type RewardRuleType,
} from "@/lib/wallet/constants";

/**
 * One entry point for every "do something, earn credits" reward. The caller
 * passes the real event and a key that is unique per occurrence (so a retry,
 * double-click or re-run can never pay twice); the amount, expiry and whether
 * it pays at all come from the admin-configured reward rules for the user's
 * account type. Never throws — an earning hook must not break the action that
 * triggered it.
 */
export async function awardActivity(input: {
  userId: string;
  role?: string;
  type: ActivityRuleType;
  key: string;
  subKey?: string | null;
  detail?: string | null;
}): Promise<boolean> {
  try {
    let role = input.role;
    if (!role) {
      const u = await (await externalUsers()).findOne({ _id: input.userId }, { projection: { role: 1 } });
      if (!u) return false;
      role = u.role;
    }
    const rule = await resolveActiveRewardRule(input.type, role as RewardRuleAudience, input.subKey ?? null);
    if (!rule) return false;

    const label = input.type === "stage_complete" && input.subKey ? `Stage completed: ${stageMeta(role as never, input.subKey)?.label ?? input.subKey}` : REWARD_RULE_TYPE_LABELS[input.type];
    const tx = await creditWallet({
      userId: input.userId,
      role,
      type: "activity_reward",
      amount: rule.amount,
      idempotencyKey: `activity:${input.type}:${input.key}`,
      expiresInDays: rule.expiresInDays,
      referenceType: "activity",
      referenceId: rule._id,
      reason: input.detail ?? label,
      metadata: { activity: input.type, label, subKey: input.subKey ?? null },
    });
    if (!tx) return false; // already paid for this exact event
    await notifyPortalUser({
      recipientUserId: input.userId,
      type: "wallet.credit_earned",
      title: `🪙 +${rule.amount.toLocaleString("en-IN")} credits`,
      body: `${label} — you earned ${formatCredits(rule.amount)}.`,
      link: "/clientos/wallet",
      dedupeKey: `wallet.activity:${input.type}:${input.key}`,
    });
    return true;
  } catch (err) {
    console.error("awardActivity failed", input.type, err);
    return false;
  }
}

/** Convenience for TMS hooks, which only know the student id. */
export async function awardActivityForStudent(studentId: string, type: ActivityRuleType, key: string): Promise<boolean> {
  const user = await (await externalUsers()).findOne({ studentId }, { projection: { _id: 1, role: 1 } });
  return user ? awardActivity({ userId: user._id, role: user.role, type, key }) : false;
}

// ---------------------------------------------------------------------------
// Daily visit + 7-day streak
// ---------------------------------------------------------------------------

interface StreakDoc {
  _id: string;
  lastDay: string;
  streak: number;
  best: number;
}

const istDay = (offsetDays = 0) => new Date(Date.now() + 5.5 * 3600_000 - offsetDays * 86400_000).toISOString().slice(0, 10);

/** Called once per portal page load; only the first call each (IST) day does anything. */
export async function recordDailyVisit(user: Pick<CurrentPortalUser, "id" | "role">): Promise<void> {
  try {
    const db = await getDb();
    const streaks = db.collection<StreakDoc>("wallet_streaks");
    const today = istDay();
    const existing = await streaks.findOne({ _id: user.id });
    if (existing?.lastDay === today) return;

    const streak = existing?.lastDay === istDay(1) ? existing.streak + 1 : 1;
    // Guarded on lastDay so two simultaneous first-loads of the day can't both count.
    const res = await streaks.updateOne(
      { _id: user.id, lastDay: { $ne: today } },
      { $set: { lastDay: today, streak, best: Math.max(existing?.best ?? 0, streak) } },
      { upsert: !existing }
    ).catch(() => null);
    if (!res || (res.modifiedCount === 0 && res.upsertedCount === 0)) return;

    await awardActivity({ userId: user.id, role: user.role, type: "daily_visit", key: `${user.id}:${today}` });
    if (streak % 7 === 0) await awardActivity({ userId: user.id, role: user.role, type: "streak_7", key: `${user.id}:${today}`, detail: `${streak}-day visit streak` });
  } catch (err) {
    console.error("recordDailyVisit failed", err);
  }
}

export async function getStreak(userId: string): Promise<{ streak: number; best: number; visitedToday: boolean }> {
  const db = await getDb();
  const doc = await db.collection<StreakDoc>("wallet_streaks").findOne({ _id: userId });
  if (!doc) return { streak: 0, best: 0, visitedToday: false };
  const alive = doc.lastDay === istDay() || doc.lastDay === istDay(1);
  return { streak: alive ? doc.streak : 0, best: doc.best, visitedToday: doc.lastDay === istDay() };
}

// ---------------------------------------------------------------------------
// "Ways to earn" — what's on offer to this user right now, and what they've already earned from each
// ---------------------------------------------------------------------------

export interface EarnWay {
  id: string;
  type: RewardRuleType;
  title: string;
  description: string;
  amount: number;
  repeat: "once" | "each" | "daily";
  href: string;
  cta: string;
  earnedCount: number;
  earnedTotal: number;
  done: boolean;
}

const LEGACY_TX_FOR: Partial<Record<RewardRuleType, WalletTransaction["type"]>> = {
  signup: "signup_bonus",
  referral_referrer: "referral_bonus_referrer",
  referral_referee: "referral_bonus_referee",
};

export async function getEarnWays(user: Pick<CurrentPortalUser, "id" | "role">): Promise<EarnWay[]> {
  const [rules, db] = await Promise.all([listRewardRules(), getDb()]);
  const mine = rules.filter((r) => r.isActive && r.amount > 0 && (r.appliesToRole === user.role || r.appliesToRole === "ALL"));
  // One row per (type, subKey): the role-specific rule beats the ALL rule.
  const chosen = new Map<string, (typeof mine)[number]>();
  for (const r of mine) {
    const k = `${r.type}:${r.subKey ?? ""}`;
    if (!chosen.has(k) || r.appliesToRole === user.role) chosen.set(k, r);
  }

  const txs = await db.collection<WalletTransaction>(TRANSACTIONS_COLLECTION).find({ userId: user.id, direction: "credit", status: { $ne: "reversed" } }).project<Pick<WalletTransaction, "type" | "amount" | "metadata">>({ type: 1, amount: 1, metadata: 1 }).toArray();

  return [...chosen.values()]
    .map((r): EarnWay => {
      const meta = EARN_WAY_META[r.type];
      const legacy = LEGACY_TX_FOR[r.type];
      const hit = txs.filter((t) => (legacy ? t.type === legacy : t.type === "activity_reward" && t.metadata?.activity === r.type && (r.subKey ? t.metadata?.subKey === r.subKey : true)));
      const stageLabel = r.type === "stage_complete" && r.subKey ? stageMeta(user.role as never, r.subKey)?.label ?? r.subKey : null;
      const title = stageLabel ? `Reach “${stageLabel}”` : r.type === "referral_milestone" && r.subKey ? `${r.subKey} rewarded referrals` : r.type === "stage_complete" ? "Complete each journey stage" : REWARD_RULE_TYPE_LABELS[r.type];
      return {
        id: r._id,
        type: r.type,
        title,
        description: meta.description,
        amount: r.amount,
        repeat: meta.repeat,
        href: meta.href,
        cta: meta.cta,
        earnedCount: hit.length,
        earnedTotal: hit.reduce((s, t) => s + t.amount, 0),
        done: meta.repeat === "once" && hit.length > 0,
      };
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || b.amount - a.amount);
}
