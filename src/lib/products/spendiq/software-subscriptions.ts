import "server-only";
import { getDb } from "@/lib/mongodb";
import { defineResource, type BaseDoc } from "@/lib/products/spendiq/resource";
import { monthlyEquivalent, round2, type ResourceStatus, type BillingCycle } from "@/lib/products/spendiq/constants";

export const SUBSCRIPTIONS_COLLECTION = "prms_software_subscriptions";

export interface SoftwareSubscription extends BaseDoc {
  serviceName: string;
  provider: string;
  licenseCount: number;
  cost: number;
  billingCycle: BillingCycle;
  monthlyCost: number;
  annualCost: number;
  currency: string;
  renewalDate: string | null;
  ownerEmployeeId: string | null;
  ownerName: string | null;
  autoRenew: boolean;
  vendorId: string | null;
  vendorName: string | null;
  status: ResourceStatus;
  notes: string | null;
}

const resource = defineResource<SoftwareSubscription>({
  collection: SUBSCRIPTIONS_COLLECTION,
  searchFields: ["serviceName", "provider", "ownerName"],
  indexes: ["status", "renewalDate", "vendorId"],
});

export const {
  getOne: getSubscription,
  search: searchSubscriptions,
  count: countSubscriptions,
  list: listSubscriptions,
  softDelete: deleteSubscriptionRow,
} = resource;

export interface SubscriptionWriteInput {
  serviceName: string;
  provider: string;
  licenseCount: number;
  cost: number;
  billingCycle: BillingCycle;
  currency: string;
  renewalDate: string | null;
  ownerEmployeeId: string | null;
  ownerName: string | null;
  autoRenew: boolean;
  vendorId: string | null;
  vendorName: string | null;
  status: ResourceStatus;
  notes: string | null;
}

function derived(cost: number, cycle: BillingCycle) {
  const monthlyCost = round2(monthlyEquivalent(cost, cycle));
  return { monthlyCost, annualCost: round2(monthlyCost * 12) };
}

export async function createSubscription(data: SubscriptionWriteInput, actorId: string) {
  return resource.create({ ...data, ...derived(data.cost, data.billingCycle) }, actorId);
}
export async function updateSubscription(id: string, data: SubscriptionWriteInput, actorId: string) {
  return resource.update(id, { ...data, ...derived(data.cost, data.billingCycle) }, actorId);
}

export async function subscriptionMetrics(headcount: number): Promise<{ monthly: number; annual: number; perEmployee: number }> {
  const db = await getDb();
  const res = await db
    .collection(SUBSCRIPTIONS_COLLECTION)
    .aggregate<{ monthly: number; annual: number }>([
      { $match: { deletedAt: null, status: { $in: ["active", "expiring"] } } },
      { $group: { _id: null, monthly: { $sum: "$monthlyCost" }, annual: { $sum: "$annualCost" } } },
    ])
    .toArray();
  const monthly = res[0]?.monthly ?? 0;
  const annual = res[0]?.annual ?? 0;
  return { monthly, annual, perEmployee: headcount > 0 ? round2(monthly / headcount) : 0 };
}
