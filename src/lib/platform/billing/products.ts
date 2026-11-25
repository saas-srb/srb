import "server-only";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { getPlan } from "@/lib/platform/billing/plans";
import { getCompanySubscription, updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { changePlan, hasLiveSubscription, priceSubscription, type StartCheckoutResult } from "@/lib/platform/billing/subscriptions";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { ALL_PRODUCTS_VALUE, billableCount, ownedModules, parseSelection, type ProductSelection } from "@/lib/platform/products/selection";
import type { PriceSummary } from "@/lib/platform/billing/billing-details";
import type { CompanySubscription, Plan } from "@/lib/platform/billing/types";

/**
 * A company changing its own products (Settings → Billing).
 *  - Nothing being charged (free, trial before payment): it applies at once.
 *  - Paid subscription: added products open at once and the new price starts with the next renewal; an added product
 *    stays until it has been billed once. Removed products stay until the paid period ends (the price drops then).
 */

const ALL: ProductSelection = { mode: "all" };
const value = (s: ProductSelection) => (s.mode === "all" ? ALL_PRODUCTS_VALUE : s.keys);
const same = (a: ProductSelection, b: ProductSelection) => JSON.stringify(a) === JSON.stringify(b);

/** Why `plan` doesn't allow these products, or null. */
export function planProductLimit(plan: Pick<Plan, "name" | "maxProducts"> | null, selection: ProductSelection): string | null {
  const max = plan?.maxProducts;
  if (typeof max !== "number" || max <= 0) return null;
  const count = billableCount(selection);
  return count === null || count > max ? `The ${plan!.name} plan includes ${max === 1 ? "one product" : `${max} products`}. Choose a bigger plan for more.` : null;
}

/** Products in `a` that `b` doesn't have (null = something outside a list, i.e. "all of it"). */
function extra(a: ProductSelection, b: ProductSelection): string[] | "all" {
  const inA = ownedModules(a);
  const inB = ownedModules(b);
  if (inB === null) return [];
  if (inA === null) return "all";
  return [...inA].filter((k) => !inB.has(k));
}
const some = (x: string[] | "all") => x === "all" || x.length > 0;

/** Access while a removal is waiting for the paid period to end: everything either side has. */
function union(a: ProductSelection, b: ProductSelection): ProductSelection {
  if (a.mode === "all" || b.mode === "all") return ALL;
  return parseSelection([...new Set([...a.keys, ...b.keys])]) ?? ALL;
}

const billing = (sub: CompanySubscription | null) => Boolean(sub && hasLiveSubscription(sub) && sub.status !== "trialing");

export interface ProductState {
  /** What the company can use now. */
  current: ProductSelection;
  /** What it will have after the current period, when a change is waiting. */
  next: { products: ProductSelection; effectiveAt: Date | null } | null;
  /** Added since the last charge: can't be removed yet. */
  held: string[];
  maxProducts: number | null;
}

export async function productState(companyId: string): Promise<ProductState> {
  const [company, sub] = await Promise.all([getCompany(companyId), getCompanySubscription(companyId)]);
  const current = company?.products ?? ALL;
  const pending = sub?.pendingChange?.pricing?.products;
  const plan = sub?.planId ? await getPlan(sub.planId) : null;
  return {
    current,
    next: pending && !same(pending, current) ? { products: pending, effectiveAt: sub!.pendingChange!.effectiveAt } : null,
    held: sub?.productHold?.keys ?? [],
    maxProducts: plan?.maxProducts ?? null,
  };
}

type Checked = { ok: true; sub: CompanySubscription; target: ProductSelection; current: ProductSelection } | { ok: false; error: string };

async function check(companyId: string, input: string | readonly string[]): Promise<Checked> {
  const target = parseSelection(input);
  if (!target) return { ok: false, error: "Choose at least one product, or All products." };
  const [company, sub] = await Promise.all([getCompany(companyId), getCompanySubscription(companyId)]);
  if (!company || !sub) return { ok: false, error: "Unknown workspace." };
  if (company.isPlatformOwner || sub.status === "internal") return { ok: false, error: "This workspace has every product." };
  const limit = planProductLimit(await getPlan(sub.planId), target);
  if (limit) return { ok: false, error: limit };
  return { ok: true, sub, target, current: company.products ?? ALL };
}

/** The price of a choice on the company's current plan and cycle (nothing is changed). Null price = nothing to pay on this plan. */
export async function previewProducts(companyId: string, input: string | readonly string[]): Promise<{ ok: true; summary: PriceSummary | null; when: "now" | "renewal" } | { ok: false; error: string }> {
  const c = await check(companyId, input);
  if (!c.ok) return c;
  const plan = await getPlan(c.sub.planId);
  const when = billing(c.sub) ? "renewal" : "now";
  if (!plan || plan.lifetimeFree || plan.contactSales) return { ok: true, summary: null, when };
  const priced = await priceSubscription({ companyId, planId: c.sub.planId, interval: c.sub.interval, priceVersion: c.sub.priceVersion, products: c.target });
  return priced.ok ? { ok: true, summary: priced.summary, when } : priced;
}

export type ChangeProductsResult = { ok: true; message: string; checkout?: Extract<StartCheckoutResult, { ok: true }>["checkout"] } | { ok: false; error: string };

export async function changeCompanyProducts(companyId: string, input: string | readonly string[], actorId: string): Promise<ChangeProductsResult> {
  const c = await check(companyId, input);
  if (!c.ok) return c;
  const { sub, target, current } = c;
  const apply = async (products: ProductSelection, reason: string) => setCompanyProducts(companyId, { products: value(products) }, { id: actorId, reason });
  if (same(target, current) && !sub.pendingChange) return { ok: false, error: "Those are your products already." };

  const live = hasLiveSubscription(sub);
  const priced = live ? await priceSubscription({ companyId, planId: sub.planId, interval: sub.interval, priceVersion: sub.priceVersion, products: target }) : null;
  if (priced && !priced.ok) return priced;
  const samePrice = priced?.ok ? priced.pricing.total === sub.pricing?.total : false;

  // The same money for different products: swap at once, dropping any change that was waiting.
  const swap = async (): Promise<ChangeProductsResult> => {
    if (sub.pendingChange) {
      const undone = await changePlan(companyId, { planId: sub.planId, interval: sub.interval, products: sub.pricing?.products }, actorId, "subscription.products", true);
      if (!undone.ok) return undone;
    }
    const saved = await apply(target, "Same price");
    if (!saved.ok) return saved;
    if (sub.pricing) await updateCompanySubscription(companyId, { pricing: { ...sub.pricing, products: target } });
    return { ok: true, message: "Your products are updated. The price stays the same." };
  };

  // Nothing is being charged yet: the choice applies as it is. A subscription waiting for its first charge is re-priced.
  if (!billing(sub)) {
    if (live && samePrice) return swap();
    const saved = await apply(target, "Changed in Billing");
    if (!saved.ok) return saved;
    if (!live) return { ok: true, message: "Your products are updated." };
    const moved = await changePlan(companyId, { planId: sub.planId, interval: sub.interval, products: target }, actorId, "subscription.products", true);
    if (!moved.ok) {
      await apply(current, "Billing change failed");
      return moved;
    }
    return { ok: true, message: "Your products are updated.", ...(moved.checkout ? { checkout: moved.checkout } : {}) };
  }

  const removed = extra(current, target);
  const held = sub.productHold?.keys ?? [];
  // "all" held = the company moved to All products since the last charge: nothing can be dropped until that is billed.
  const early = held.includes("all") ? (some(removed) ? held : []) : removed === "all" ? held : removed.filter((k) => held.includes(k));
  if (early.length > 0) return { ok: false, error: "A product you just added can be removed after it has been billed once." };

  // Keeping everything and paying what is paid today (this also undoes a waiting change).
  if (samePrice) return swap();

  const added = extra(target, current);
  const moved = await changePlan(companyId, { planId: sub.planId, interval: sub.interval, products: target, when: "cycle_end" }, actorId, "subscription.products", true);
  if (!moved.ok) return moved;
  // A UPI autopay has to be approved again first: access follows once that payment is confirmed.
  if (moved.checkout) return { ok: true, checkout: moved.checkout, message: "Approve the new payment to finish." };
  if (some(added)) {
    const saved = await apply(union(current, target), "Added in Billing");
    if (!saved.ok) return saved;
    await updateCompanySubscription(companyId, { productHold: { keys: [...new Set([...held, ...(added === "all" ? ["all"] : added)])], since: new Date() } });
  }
  const after = await getCompanySubscription(companyId);
  const on = after?.pendingChange?.effectiveAt ? ` on ${after.pendingChange.effectiveAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}` : " at your next renewal";
  return {
    ok: true,
    message: some(added) ? `Your new products are open now. The new price starts${on}.` : `Your products and price change${on}. Until then you keep everything you have paid for.`,
  };
}
