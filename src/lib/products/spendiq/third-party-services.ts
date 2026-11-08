import "server-only";
import { defineResource, type BaseDoc } from "@/lib/products/spendiq/resource";
import { monthlyEquivalent, round2, type ResourceStatus, type BillingCycle } from "@/lib/products/spendiq/constants";

export const THIRD_PARTY_COLLECTION = "prms_third_party_services";

export interface ThirdPartyService extends BaseDoc {
  name: string;
  serviceType: string;
  provider: string;
  cost: number;
  billingCycle: BillingCycle;
  monthlyCost: number;
  currency: string;
  slaSummary: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  vendorId: string | null;
  vendorName: string | null;
  status: ResourceStatus;
  notes: string | null;
}

const resource = defineResource<ThirdPartyService>({
  collection: THIRD_PARTY_COLLECTION,
  searchFields: ["name", "serviceType", "provider"],
  indexes: ["status", "renewalDate", "vendorId"],
});

export const {
  getOne: getThirdPartyService,
  search: searchThirdPartyServices,
  count: countThirdPartyServices,
  list: listThirdPartyServices,
  softDelete: deleteThirdPartyRow,
} = resource;

export interface ThirdPartyWriteInput {
  name: string;
  serviceType: string;
  provider: string;
  cost: number;
  billingCycle: BillingCycle;
  currency: string;
  slaSummary: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  vendorId: string | null;
  vendorName: string | null;
  status: ResourceStatus;
  notes: string | null;
}

export async function createThirdPartyService(data: ThirdPartyWriteInput, actorId: string) {
  return resource.create({ ...data, monthlyCost: round2(monthlyEquivalent(data.cost, data.billingCycle)) }, actorId);
}
export async function updateThirdPartyService(id: string, data: ThirdPartyWriteInput, actorId: string) {
  return resource.update(id, { ...data, monthlyCost: round2(monthlyEquivalent(data.cost, data.billingCycle)) }, actorId);
}
