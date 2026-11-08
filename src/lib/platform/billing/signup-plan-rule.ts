/** Choosing a plan on the pricing page and carrying it through sign-up (pure: used by the pricing cards, the sign-up form and the server). */

/** Used when neither the plan nor the platform settings say how long the trial is. */
export const SIGNUP_TRIAL_FALLBACK_DAYS = 30;

/** Free-trial length of a plan chosen at sign-up: the plan's own days when it sets any, else the platform default, else one month. */
export function signupTrialDays(planTrialDays: number | null | undefined, platformDefault: number): number {
  if (typeof planTrialDays === "number" && planTrialDays > 0) return Math.floor(planTrialDays);
  return platformDefault > 0 ? Math.floor(platformDefault) : SIGNUP_TRIAL_FALLBACK_DAYS;
}

export function parseSignupInterval(v: unknown): "monthly" | "yearly" | null {
  return v === "monthly" || v === "yearly" ? v : null;
}

/** The sign-up link of a paid plan card. */
export function signupPlanHref(planId: string, interval: "monthly" | "yearly"): string {
  return `/signup?plan=${encodeURIComponent(planId)}&interval=${interval}`;
}

/** "30 days" / "1 month" wording for the trial. */
export function trialLabel(days: number): string {
  if (days === 30 || days === 31) return "1 month";
  if (days % 30 === 0) return `${days / 30} months`;
  if (days % 7 === 0) return `${days / 7} week${days === 7 ? "" : "s"}`;
  return `${days} days`;
}
