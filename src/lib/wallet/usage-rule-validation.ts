import { isValidRewardRuleAudience, isValidUsageModule, type RewardRuleAudience, type UsageModule } from "@/lib/wallet/constants";

export interface UsageRuleWriteInput {
  module: UsageModule;
  appliesToRole: RewardRuleAudience;
  isEnabled: boolean;
  /** Max share of the payable amount credits may cover, 1–100. */
  maxPercentOfPrice: number;
  /** Optional hard cap per single redemption. */
  maxCreditsPerTransaction: number | null;
  /** Optional minimum payable amount before credits may be used. */
  minOrderValue: number | null;
}

export function validateUsageRuleInput(
  input: Partial<UsageRuleWriteInput>
): { valid: true; data: UsageRuleWriteInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!isValidUsageModule(input.module)) errors.module = "Choose a module.";
  if (!isValidRewardRuleAudience(input.appliesToRole)) errors.appliesToRole = "Choose an account type.";
  const pct = Number(input.maxPercentOfPrice);
  if (!Number.isFinite(pct) || pct < 1 || pct > 100) errors.maxPercentOfPrice = "Enter a percentage between 1 and 100.";
  const opt = (v: unknown, key: string): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
      errors[key] = "Enter a non-negative number, or leave blank.";
      return null;
    }
    return n === 0 ? null : n;
  };
  const maxCredits = opt(input.maxCreditsPerTransaction, "maxCreditsPerTransaction");
  const minOrder = opt(input.minOrderValue, "minOrderValue");
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      module: input.module as UsageModule,
      appliesToRole: input.appliesToRole as RewardRuleAudience,
      isEnabled: Boolean(input.isEnabled ?? true),
      maxPercentOfPrice: pct,
      maxCreditsPerTransaction: maxCredits,
      minOrderValue: minOrder,
    },
  };
}
