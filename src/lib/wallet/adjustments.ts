import "server-only";
import { randomUUID } from "node:crypto";
import { creditWallet, applyBalanceDelta, insertLedgerRow, claimIdempotencyKey } from "@/lib/wallet/wallets";
import { externalUsers } from "@/lib/portal-auth";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { formatCredits } from "@/lib/wallet/constants";

/**
 * Admin manual adjustment — the only sanctioned way to change a balance by
 * hand. A mandatory reason and the acting admin's id are stored on the
 * ledger row itself (never a silent balance edit); removals can never drive
 * `available` negative (guarded atomic decrement).
 */
export async function adjustWalletManually(input: {
  userId: string;
  direction: "credit" | "debit";
  amount: number;
  reason: string;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (reason.length < 5) return { ok: false, error: "A reason of at least 5 characters is required." };
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000) return { ok: false, error: "Enter an amount between 1 and 1,000,000." };
  const amount = Math.round(input.amount);

  const users = await externalUsers();
  const user = await users.findOne({ _id: input.userId });
  if (!user) return { ok: false, error: "Unknown portal user." };

  const key = `manual_adjustment:${randomUUID()}`;

  if (input.direction === "credit") {
    const tx = await creditWallet({
      userId: user._id,
      role: user.role,
      type: "manual_adjustment",
      amount,
      idempotencyKey: key,
      referenceType: "admin_adjustment",
      reason,
      actorId: input.actorId,
    });
    if (!tx) return { ok: false, error: "Adjustment was already processed." };
    await notifyPortalUser({ recipientUserId: user._id, type: "wallet.credit_earned", title: "Credits added", body: `${formatCredits(amount)} were added to your wallet.`, link: "/clientos/wallet" });
    return { ok: true };
  }

  if (!(await claimIdempotencyKey(key))) return { ok: false, error: "Adjustment was already processed." };
  const result = await applyBalanceDelta(user._id, { available: -amount }, { "balances.available": { $gte: amount } });
  if (!result) return { ok: false, error: "Insufficient available balance to remove that amount." };
  await insertLedgerRow(
    {
      userId: user._id,
      type: "manual_adjustment",
      direction: "debit",
      bucket: "available",
      amount,
      status: "active",
      expiresAt: null,
      idempotencyKey: key,
      referenceType: "admin_adjustment",
      referenceId: null,
      reason,
      metadata: {},
      createdBy: input.actorId,
    },
    result.before.balances.available,
    result.after.balances.available
  );
  return { ok: true };
}
