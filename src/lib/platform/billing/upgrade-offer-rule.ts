/** Which plan the "Upgrade plan" strip offers (pure). */

export interface PlanStep {
  id: string;
  name: string;
  /** Monthly price, smallest unit; 0 = Free; null = not sold online ("contact us"). */
  monthly: number | null;
  currency: string;
  active: boolean;
}

export interface UpgradeOffer {
  fromName: string;
  toId: string;
  toName: string;
  monthly: number;
  currency: string;
}

/**
 * The next plan up from `currentId`, by price, among the plans that can be bought online. A current plan the list doesn't know (an old or
 * custom one) is treated as Free, so it is offered the first paid plan. Null at the top.
 */
export function nextPlanIn(plans: PlanStep[], currentId: string): UpgradeOffer | null {
  const buyable = plans.filter((p) => p.active && p.monthly !== null).sort((a, b) => (a.monthly as number) - (b.monthly as number));
  const current = plans.find((p) => p.id === currentId);
  const currentMonthly = current ? (current.monthly ?? Number.POSITIVE_INFINITY) : 0;
  const next = buyable.find((p) => (p.monthly as number) > currentMonthly);
  if (!next) return null;
  return { fromName: current?.name ?? "Your plan", toId: next.id, toName: next.name, monthly: next.monthly as number, currency: next.currency };
}
