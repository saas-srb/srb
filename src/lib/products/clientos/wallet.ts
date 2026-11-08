import "server-only";
import { resolveActiveRewardRule } from "@/lib/wallet/reward-rules";
import { getDb } from "@/lib/mongodb";
import { getWallet, reconcileExpiredLots, type WalletBalances } from "@/lib/wallet/wallets";
import { listWalletTransactions, serializeWalletTx, TRANSACTIONS_COLLECTION, type SerializedWalletTransaction } from "@/lib/wallet/transactions";
import { getOrCreateReferralCode, listReferralsForReferrer } from "@/lib/wallet/referrals";
import { externalUsers } from "@/lib/portal-auth";

const ZERO: WalletBalances = { available: 0, pending: 0, locked: 0, lifetimeEarned: 0, lifetimeRedeemed: 0, lifetimeExpired: 0, lifetimeReversed: 0 };

export interface WalletOverview {
  balances: WalletBalances;
  status: "active" | "frozen";
  expiringSoon: number;
  earnedThisMonth: number;
  recent: SerializedWalletTransaction[];
}

/** Read model for the portal dashboard card + /clientos/wallet. Reconciles this user's expired lots first so the numbers shown are never stale. */
export async function getWalletOverview(userId: string): Promise<WalletOverview> {
  await reconcileExpiredLots(userId);
  const wallet = await getWallet(userId);
  const db = await getDb();
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [expiring, earned, recent] = await Promise.all([
    db
      .collection(TRANSACTIONS_COLLECTION)
      .aggregate<{ total: number }>([
        { $match: { userId, direction: "credit", bucket: "available", status: "active", expiresAt: { $gt: now, $lte: soon } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    db
      .collection(TRANSACTIONS_COLLECTION)
      .aggregate<{ total: number }>([
        { $match: { userId, direction: "credit", bucket: "available", createdAt: { $gte: monthStart }, type: { $nin: ["redemption_released"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    listWalletTransactions({ userId, pageSize: 5 }),
  ]);

  return {
    balances: wallet?.balances ?? ZERO,
    status: wallet?.status ?? "active",
    expiringSoon: expiring[0]?.total ?? 0,
    earnedThisMonth: earned[0]?.total ?? 0,
    recent: recent.items.map(serializeWalletTx),
  };
}

export async function getWalletHistory(userId: string, page: number) {
  const res = await listWalletTransactions({ userId, page, pageSize: 20 });
  return { ...res, items: res.items.map(serializeWalletTx) };
}

export interface ReferralRow {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  reward: number;
}

export interface ReferralOverview {
  code: string;
  link: string;
  totalReferred: number;
  rewarded: number;
  creditsEarned: number;
  /** Credits the referrer will receive once currently-pending referrals qualify. */
  pendingCredits: number;
  rows: ReferralRow[];
}

function maskName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "User";
  return `${first.slice(0, 1).toUpperCase()}${first.slice(1)} •••`;
}

export async function getReferralOverview(userId: string, origin: string): Promise<ReferralOverview> {
  const code = await getOrCreateReferralCode(userId);
  const referrals = await listReferralsForReferrer(userId);
  const users = await externalUsers();
  const refs = await users.find({ _id: { $in: referrals.map((r) => r.refereeUserId) } }, { projection: { displayName: 1 } }).toArray();
  const names = new Map(refs.map((u) => [u._id, u.displayName]));
  const db = await getDb();
  const txIds = referrals.map((r) => r.rewardTransactionId.referrer).filter((x): x is string => !!x);
  const txs = txIds.length ? await db.collection<{ _id: string; amount: number }>(TRANSACTIONS_COLLECTION).find({ _id: { $in: txIds } }).toArray() : [];
  const amountById = new Map(txs.map((t) => [t._id, t.amount]));
  const me = await users.findOne({ _id: userId }, { projection: { role: 1 } });
  const rule = me ? await resolveActiveRewardRule("referral_referrer", me.role) : null;
  const pendingCount = referrals.filter((r) => r.status === "REGISTERED").length;

  const rows: ReferralRow[] = referrals.map((r) => ({
    id: r._id,
    name: maskName(names.get(r.refereeUserId) ?? "User"),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reward: r.rewardTransactionId.referrer ? (amountById.get(r.rewardTransactionId.referrer) ?? 0) : 0,
  }));

  return {
    code,
    link: `${origin}/register?ref=${code}`,
    totalReferred: referrals.length,
    rewarded: referrals.filter((r) => r.status === "REWARDED").length,
    creditsEarned: rows.reduce((sum, r) => sum + r.reward, 0),
    pendingCredits: pendingCount * (rule?.amount ?? 0),
    rows,
  };
}
