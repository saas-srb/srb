import "server-only";
import { applyBalanceDelta, insertLedgerRow, reconcileExpiredLots, claimIdempotencyKey, creditWallet, getWallet } from "@/lib/wallet/wallets";
import { resolveUsagePolicy, maxUsableCredits } from "@/lib/wallet/usage-rules";
import { formatCredits, type UsageModule } from "@/lib/wallet/constants";
import type { WalletTransaction } from "@/lib/wallet/transactions";
import { externalUsers } from "@/lib/portal-auth";

/**
 * THE integration surface every product uses to touch credits — there is one
 * wallet per user and no product keeps its own balance. Earning goes through
 * `awardCredits`; spending goes through `quoteCredits` (how much may be
 * applied) then `chargeCredits` (apply it). Both honour the admin-configured
 * usage rules for the user's account type and the module.
 */

/** How many credits could be applied to `price` right now — for showing a toggle/preview before charging. */
export async function quoteCredits(userId: string, module: UsageModule, price: number): Promise<{ usable: number; available: number }> {
  const user = await (await externalUsers()).findOne({ _id: userId });
  if (!user) return { usable: 0, available: 0 };
  await reconcileExpiredLots(userId);
  const wallet = await getWallet(userId);
  const available = wallet?.status === "active" ? (wallet.balances.available ?? 0) : 0;
  const policy = await resolveUsagePolicy(module, user.role);
  return { usable: maxUsableCredits(policy, price, available), available };
}

export type ChargeResult = { ok: true; charged: number; transactionId: string } | { ok: false; error: string };

/**
 * Immediately spends `amount` credits against `referenceId` (an invoice,
 * enrolment, order…). `idempotencyKey` must be unique per business event so a
 * retried request never double-charges. Rejected if the module's usage rule
 * disallows it, the amount exceeds what the rule allows for `price`, the
 * wallet is frozen, or the balance is short.
 */
export async function chargeCredits(input: {
  userId: string;
  module: UsageModule;
  amount: number;
  price: number;
  referenceId: string;
  idempotencyKey: string;
}): Promise<ChargeResult> {
  const amount = Math.floor(input.amount);
  if (amount <= 0) return { ok: false, error: "Amount must be greater than zero." };
  const { usable } = await quoteCredits(input.userId, input.module, input.price);
  if (amount > usable) return { ok: false, error: usable === 0 ? "Credits can't be used for this purchase." : `You can use at most ${formatCredits(usable)} here.` };
  if (!(await claimIdempotencyKey(input.idempotencyKey))) return { ok: false, error: "This charge was already processed." };

  const result = await applyBalanceDelta(input.userId, { available: -amount, lifetimeRedeemed: amount }, { "balances.available": { $gte: amount }, status: "active" });
  if (!result) return { ok: false, error: "Insufficient wallet balance, or the wallet is frozen." };
  const tx: WalletTransaction = await insertLedgerRow(
    {
      userId: input.userId,
      type: "redemption_confirmed",
      direction: "debit",
      bucket: "available",
      amount,
      status: "active",
      expiresAt: null,
      idempotencyKey: input.idempotencyKey,
      referenceType: "module_charge",
      referenceId: input.referenceId,
      reason: null,
      metadata: { module: input.module, price: input.price },
      createdBy: null,
    },
    result.before.balances.available,
    result.after.balances.available
  );
  return { ok: true, charged: amount, transactionId: tx._id };
}

export { creditWallet as awardCredits };
