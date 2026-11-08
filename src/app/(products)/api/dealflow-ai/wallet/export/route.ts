import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { getDb } from "@/lib/mongodb";
import { toCsv, csvResponse } from "@/lib/wallet/csv";
import { TRANSACTIONS_COLLECTION, type WalletTransaction } from "@/lib/wallet/transactions";
import { getReferralsCollection } from "@/lib/wallet/referrals";
import { WALLETS_COLLECTION, type Wallet } from "@/lib/wallet/wallets";
import { externalUsers } from "@/lib/portal-auth";

const LIMIT = 50_000;

/** LMS-only CSV exports: `?kind=ledger|referrals|wallets`. Every export is capped and read-only. */
async function handleGET(req: NextRequest) {
  if (!(await requireLms("MANAGE_WALLET"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind");
  const db = await getDb();
  const users = await externalUsers();
  const stamp = new Date().toISOString().slice(0, 10);

  if (kind === "ledger") {
    const txs = await db.collection<WalletTransaction>(TRANSACTIONS_COLLECTION).find({}).sort({ createdAt: -1 }).limit(LIMIT).toArray();
    const names = new Map((await users.find({ _id: { $in: [...new Set(txs.map((t) => t.userId))] } }, { projection: { email: 1 } }).toArray()).map((u) => [u._id, u.email]));
    return csvResponse(
      `wallet-ledger-${stamp}.csv`,
      toCsv(
        ["Date", "Transaction ID", "User ID", "Email", "Type", "Direction", "Bucket", "Amount", "Balance before", "Balance after", "Status", "Expires", "Reference type", "Reference ID", "Reason", "Actor"],
        txs.map((t) => [t.createdAt, t._id, t.userId, names.get(t.userId) ?? "", t.type, t.direction, t.bucket, t.amount, t.balanceBefore, t.balanceAfter, t.status, t.expiresAt, t.referenceType, t.referenceId, t.reason, t.createdBy ?? "system"])
      )
    );
  }

  if (kind === "referrals") {
    const refs = await (await getReferralsCollection()).find({}).sort({ createdAt: -1 }).limit(LIMIT).toArray();
    const ids = [...new Set(refs.flatMap((r) => [r.referrerUserId, r.refereeUserId]))];
    const emails = new Map((await users.find({ _id: { $in: ids } }, { projection: { email: 1 } }).toArray()).map((u) => [u._id, u.email]));
    return csvResponse(
      `referrals-${stamp}.csv`,
      toCsv(
        ["Date", "Referral ID", "Code", "Referrer email", "Referred email", "Status", "Reason", "Flags", "Qualifying event", "Referrer reward", "Referee reward", "Rewarded at", "Reviewed by"],
        refs.map((r) => [r.createdAt, r._id, r.referralCode, emails.get(r.referrerUserId) ?? "", emails.get(r.refereeUserId) ?? "", r.status, r.statusReason, (r.flags ?? []).join(" "), r.qualifyingEvent, r.rewardAmounts?.referrer ?? 0, r.rewardAmounts?.referee ?? 0, r.rewardedAt, r.reviewedBy])
      )
    );
  }

  if (kind === "wallets") {
    const wallets = await db.collection<Wallet>(WALLETS_COLLECTION).find({ deletedAt: null }).sort({ "balances.available": -1 }).limit(LIMIT).toArray();
    const byId = new Map((await users.find({ _id: { $in: wallets.map((w) => w._id) } }, { projection: { email: 1, displayName: 1 } }).toArray()).map((u) => [u._id, u]));
    return csvResponse(
      `wallet-balances-${stamp}.csv`,
      toCsv(
        ["User ID", "Name", "Email", "Role", "Status", "Available", "Locked", "Lifetime earned", "Lifetime redeemed", "Lifetime expired", "Lifetime reversed"],
        wallets.map((w) => [w._id, byId.get(w._id)?.displayName ?? "", byId.get(w._id)?.email ?? "", w.role, w.status, w.balances.available, w.balances.locked, w.balances.lifetimeEarned, w.balances.lifetimeRedeemed, w.balances.lifetimeExpired, w.balances.lifetimeReversed])
      )
    );
  }

  return NextResponse.json({ error: "Unknown export kind." }, { status: 400 });
}

export const GET = withTransport(handleGET);
