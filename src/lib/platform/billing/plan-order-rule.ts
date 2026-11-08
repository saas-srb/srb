/** Which plan is "higher": by monthly price (pure: used by the plan cards and the server). A "contact us" plan has no price and counts as the highest. */

export const DOWNGRADE_MESSAGE = "You can't move to a lower plan. Choose a higher plan to upgrade, or cancel at the end of your period.";

const rank = (monthly: number | null | undefined): number => (monthly === null || monthly === undefined ? Number.POSITIVE_INFINITY : monthly);

/** True when `target` is a lower plan than `current`. The same plan, and any plan from the Free plan, are not downgrades. */
export function isPlanDowngrade(currentMonthly: number | null | undefined, targetMonthly: number | null | undefined): boolean {
  return rank(targetMonthly) < rank(currentMonthly);
}

/** Subscription states in which a company has a plan it could be said to be leaving. A suspended or canceled company may start again on any plan. */
export function downgradeGuarded(status: string): boolean {
  return status === "trialing" || status === "active" || status === "past_due" || status === "grace";
}
