import "server-only";
import { getDb } from "@/lib/mongodb";
import { REFERRALS_COLLECTION } from "@/lib/wallet/referrals";
import { TRANSACTIONS_COLLECTION } from "@/lib/wallet/transactions";
import { WALLETS_COLLECTION } from "@/lib/wallet/wallets";
import { REFERRAL_STATUSES, type ReferralStatus } from "@/lib/wallet/constants";

export interface WalletAnalytics {
  wallets: { count: number; available: number; locked: number; earned: number; redeemed: number; expired: number; reversed: number };
  referralFunnel: Record<ReferralStatus, number> & { total: number };
  conversionPct: number;
  creditsByType: { type: string; credits: number; count: number }[];
  topReferrers: { userId: string; name: string; email: string; rewarded: number; credits: number }[];
  referralsByDay: { day: string; count: number }[];
}

/** Read-only aggregates for the LMS overview — computed live from the ledger and referral collections, no separate counters to drift. */
export async function getWalletAnalytics(): Promise<WalletAnalytics> {
  const db = await getDb();
  const since = new Date(Date.now() - 13 * 86400000);
  since.setHours(0, 0, 0, 0);

  const [walletAgg, statusAgg, typeAgg, topAgg, dayAgg] = await Promise.all([
    db
      .collection(WALLETS_COLLECTION)
      .aggregate<{ count: number; available: number; locked: number; earned: number; redeemed: number; expired: number; reversed: number }>([
        { $group: { _id: null, count: { $sum: 1 }, available: { $sum: "$balances.available" }, locked: { $sum: "$balances.locked" }, earned: { $sum: "$balances.lifetimeEarned" }, redeemed: { $sum: "$balances.lifetimeRedeemed" }, expired: { $sum: "$balances.lifetimeExpired" }, reversed: { $sum: "$balances.lifetimeReversed" } } },
      ])
      .toArray(),
    db.collection(REFERRALS_COLLECTION).aggregate<{ _id: ReferralStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    db
      .collection(TRANSACTIONS_COLLECTION)
      .aggregate<{ _id: string; credits: number; count: number }>([
        { $match: { direction: "credit", type: { $in: ["signup_bonus", "referral_bonus_referrer", "referral_bonus_referee", "activity_reward", "manual_adjustment"] } } },
        { $group: { _id: "$type", credits: { $sum: "$amount" }, count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection(REFERRALS_COLLECTION)
      .aggregate<{ _id: string; rewarded: number; credits: number }>([
        { $match: { status: "REWARDED" } },
        { $group: { _id: "$referrerUserId", rewarded: { $sum: 1 }, credits: { $sum: { $ifNull: ["$rewardAmounts.referrer", 0] } } } },
        { $sort: { rewarded: -1, credits: -1 } },
        { $limit: 5 },
      ])
      .toArray(),
    db
      .collection(REFERRALS_COLLECTION)
      .aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const funnel = Object.fromEntries(REFERRAL_STATUSES.map((s) => [s, 0])) as Record<ReferralStatus, number>;
  for (const row of statusAgg) if (row._id in funnel) funnel[row._id] = row.n;
  const total = Object.values(funnel).reduce((a, b) => a + b, 0);

  const ids = topAgg.map((t) => t._id);
  const users = ids.length ? await db.collection<{ _id: string; displayName: string; email: string }>("external_users").find({ _id: { $in: ids } }).toArray() : [];
  const byId = new Map(users.map((u) => [u._id, u]));

  const dayCounts = new Map(dayAgg.map((d) => [d._id, d.count]));
  const referralsByDay = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since.getTime() + i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { day: key, count: dayCounts.get(key) ?? 0 };
  });

  const w = walletAgg[0] ?? { count: 0, available: 0, locked: 0, earned: 0, redeemed: 0, expired: 0, reversed: 0 };
  return {
    wallets: w,
    referralFunnel: { ...funnel, total },
    conversionPct: total ? Math.round((funnel.REWARDED / total) * 100) : 0,
    creditsByType: typeAgg.map((t) => ({ type: t._id, credits: t.credits, count: t.count })),
    topReferrers: topAgg.map((t) => ({ userId: t._id, name: byId.get(t._id)?.displayName ?? "Unknown", email: byId.get(t._id)?.email ?? "", rewarded: t.rewarded, credits: t.credits })),
    referralsByDay,
  };
}
