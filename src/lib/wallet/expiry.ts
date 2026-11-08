import "server-only";
import { getDb } from "@/lib/mongodb";
import { TRANSACTIONS_COLLECTION, type WalletTransaction } from "@/lib/wallet/transactions";
import { reconcileExpiredLots } from "@/lib/wallet/wallets";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { formatCredits } from "@/lib/wallet/constants";

const WARN_DAYS = 7;

export interface ExpirySweepResult {
  usersReconciled: number;
  warningsSent: number;
}

/**
 * The scheduled counterpart to per-user reconciliation: expires every lapsed
 * lot platform-wide and warns users about lots expiring in the next 7 days.
 * Idempotent — reconciliation only flips lots that are still `active`, and
 * warnings use a per-lot dedupe key, so running it twice (or hourly) is safe.
 */
export async function runExpirySweep(): Promise<ExpirySweepResult> {
  const db = await getDb();
  const c = db.collection<WalletTransaction>(TRANSACTIONS_COLLECTION);
  const now = new Date();

  const lapsedUsers = await c.distinct("userId", { direction: "credit", bucket: "available", status: "active", expiresAt: { $ne: null, $lt: now } });
  for (const userId of lapsedUsers) await reconcileExpiredLots(userId);

  const soon = new Date(now.getTime() + WARN_DAYS * 86400000);
  const expiring = await c.find({ direction: "credit", bucket: "available", status: "active", expiresAt: { $gte: now, $lte: soon } }).toArray();
  for (const lot of expiring) {
    await notifyPortalUser({
      recipientUserId: lot.userId,
      type: "wallet.credits_expiring",
      title: "Credits expiring soon",
      body: `${formatCredits(lot.amount)} expire on ${lot.expiresAt!.toLocaleDateString("en-IN")}. Use them before then.`,
      link: "/clientos/wallet",
      dedupeKey: `wallet.expiring:${lot._id}`,
    });
  }
  return { usersReconciled: lapsedUsers.length, warningsSent: expiring.length };
}
