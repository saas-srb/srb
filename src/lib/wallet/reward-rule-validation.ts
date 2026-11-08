import {
  isValidRewardRuleType,
  isValidRewardRuleAudience,
  type RewardRuleType,
  type RewardRuleAudience,
} from "@/lib/wallet/constants";

export interface RewardRuleWriteInput {
  type: RewardRuleType;
  appliesToRole: RewardRuleAudience;
  amount: number;
  expiresInDays: number | null;
  isActive: boolean;
  subKey: string | null;
}

export function validateRewardRuleInput(
  input: Partial<RewardRuleWriteInput>
): { valid: true; data: RewardRuleWriteInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!isValidRewardRuleType(input.type)) errors.type = "Choose a valid reward type.";
  if (!isValidRewardRuleAudience(input.appliesToRole)) errors.appliesToRole = "Choose a valid audience.";

  const amount = typeof input.amount === "number" ? input.amount : Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    errors.amount = "Enter a credit amount between 0 and 1,000,000.";
  }

  let expiresInDays: number | null = null;
  if (input.expiresInDays !== null && input.expiresInDays !== undefined && input.expiresInDays !== ("" as unknown)) {
    const n = typeof input.expiresInDays === "number" ? input.expiresInDays : Number(input.expiresInDays);
    if (!Number.isFinite(n) || n <= 0 || n > 3650) {
      errors.expiresInDays = "Enter a number of days between 1 and 3650, or leave blank for never.";
    } else {
      expiresInDays = Math.round(n);
    }
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      type: input.type as RewardRuleType,
      appliesToRole: input.appliesToRole as RewardRuleAudience,
      amount,
      expiresInDays,
      isActive: Boolean(input.isActive ?? true),
      subKey: typeof input.subKey === "string" && input.subKey.trim() ? input.subKey.trim().slice(0, 60) : null,
    },
  };
}
