import "server-only";
import { defineResource, type BaseDoc } from "@/lib/products/spendiq/resource";
import { monthlyEquivalent, type ResourceStatus, type BillingCycle } from "@/lib/products/spendiq/constants";
import { getDb } from "@/lib/mongodb";

export const INFRASTRUCTURE_COLLECTION = "prms_infrastructure";

export interface InfrastructureResource extends BaseDoc {
  name: string;
  provider: string;
  resourceType: string;
  region: string | null;
  cost: number;
  billingCycle: BillingCycle;
  monthlyCost: number;
  currency: string;
  renewalDate: string | null;
  autoRenew: boolean;
  vendorId: string | null;
  vendorName: string | null;
  status: ResourceStatus;
  notes: string | null;
}

const resource = defineResource<InfrastructureResource>({
  collection: INFRASTRUCTURE_COLLECTION,
  searchFields: ["name", "provider", "resourceType", "region"],
  indexes: ["status", "renewalDate", "vendorId"],
});

export const {
  getOne: getInfrastructureResource,
  search: searchInfrastructure,
  count: countInfrastructure,
  list: listInfrastructure,
  softDelete: deleteInfrastructureRow,
} = resource;

export interface InfraWriteInput {
  name: string;
  provider: string;
  resourceType: string;
  region: string | null;
  cost: number;
  billingCycle: BillingCycle;
  currency: string;
  renewalDate: string | null;
  autoRenew: boolean;
  vendorId: string | null;
  vendorName: string | null;
  status: ResourceStatus;
  notes: string | null;
}

export async function createInfrastructure(data: InfraWriteInput, actorId: string) {
  return resource.create({ ...data, monthlyCost: round2(monthlyEquivalent(data.cost, data.billingCycle)) }, actorId);
}
export async function updateInfrastructure(id: string, data: InfraWriteInput, actorId: string) {
  return resource.update(id, { ...data, monthlyCost: round2(monthlyEquivalent(data.cost, data.billingCycle)) }, actorId);
}

function round2(n: number) {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export async function infrastructureMonthlyTotal(): Promise<number> {
  const db = await getDb();
  const res = await db
    .collection(INFRASTRUCTURE_COLLECTION)
    .aggregate<{ total: number }>([
      { $match: { deletedAt: null, status: { $in: ["active", "expiring"] } } },
      { $group: { _id: null, total: { $sum: "$monthlyCost" } } },
    ])
    .toArray();
  return res[0]?.total ?? 0;
}
