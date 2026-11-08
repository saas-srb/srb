import {
  isValidQualifyingEvent,
  isValidRewardRuleAudience,
  type ReferralQualifyingEvent,
  type RewardRuleAudience,
} from "@/lib/wallet/constants";

export interface ReferralCampaignWriteInput {
  name: string;
  isActive: boolean;
  qualifyingEvent: ReferralQualifyingEvent;
  /** Which account types may refer people under this campaign. */
  referrerAudience: RewardRuleAudience;
  maxReferralsPerReferrer: number;
  startsAt: string | null; // ISO date or null = immediately
  endsAt: string | null; // ISO date or null = no end
}

export function validateCampaignInput(
  input: Partial<ReferralCampaignWriteInput>
): { valid: true; data: ReferralCampaignWriteInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = (input.name ?? "").trim();
  if (name.length < 3 || name.length > 80) errors.name = "Give the campaign a name (3–80 characters).";
  if (!isValidQualifyingEvent(input.qualifyingEvent)) errors.qualifyingEvent = "Choose a qualifying event.";
  if (!isValidRewardRuleAudience(input.referrerAudience)) errors.referrerAudience = "Choose who can refer.";
  const max = Number(input.maxReferralsPerReferrer);
  if (!Number.isInteger(max) || max < 1 || max > 10_000) errors.maxReferralsPerReferrer = "Enter a whole number between 1 and 10,000.";

  const parse = (v: string | null | undefined, key: string): string | null => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      errors[key] = "Enter a valid date.";
      return null;
    }
    return d.toISOString();
  };
  const startsAt = parse(input.startsAt, "startsAt");
  const endsAt = parse(input.endsAt, "endsAt");
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) errors.endsAt = "End must be after the start.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      name,
      isActive: Boolean(input.isActive ?? true),
      qualifyingEvent: input.qualifyingEvent as ReferralQualifyingEvent,
      referrerAudience: input.referrerAudience as RewardRuleAudience,
      maxReferralsPerReferrer: max,
      startsAt,
      endsAt,
    },
  };
}
