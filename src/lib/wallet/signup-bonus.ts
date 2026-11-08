import "server-only";
import { creditWallet } from "@/lib/wallet/wallets";
import { resolveActiveRewardRule } from "@/lib/wallet/reward-rules";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { formatCredits } from "@/lib/wallet/constants";
import type { RewardRuleAudience } from "@/lib/wallet/constants";
import { getCompanyBrand } from "@/lib/platform/branding";

/**
 * Called from both real account-creation hook points — `provisionLeadAndAccount()`
 * (the primary path) and `registerExternalUser()` (the secondary path) — so a
 * signup reward is awarded exactly once per account regardless of which path
 * created it. Idempotency key is deterministic on `userId` alone, so calling
 * this twice for the same account (should never happen, but costs nothing to
 * guard) is a safe no-op.
 */
export async function awardSignupBonus(userId: string, role: RewardRuleAudience): Promise<void> {
  const rule = await resolveActiveRewardRule("signup", role);
  if (!rule) return;

  const tx = await creditWallet({
    userId,
    role,
    type: "signup_bonus",
    amount: rule.amount,
    idempotencyKey: `signup_bonus:${userId}`,
    expiresInDays: rule.expiresInDays,
    referenceType: "signup",
    referenceId: rule._id,
  });
  if (!tx) return; // already awarded

  await notifyPortalUser({
    recipientUserId: userId,
    type: "wallet.credit_earned",
    title: "🎉 Welcome credits added",
    body: `You earned ${formatCredits(rule.amount)} for joining ${(await getCompanyBrand()).name}.`,
    link: "/clientos/wallet",
    dedupeKey: `wallet.signup_bonus:${userId}`,
  });
}
