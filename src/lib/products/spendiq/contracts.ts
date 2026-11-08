import "server-only";
import { defineResource, type BaseDoc } from "@/lib/products/spendiq/resource";
import { type ResourceStatus } from "@/lib/products/spendiq/constants";

export const CONTRACTS_COLLECTION = "prms_contracts";

export interface Contract extends BaseDoc {
  contractCode: string;
  title: string;
  contractType: string;
  vendorId: string | null;
  vendorName: string | null;
  startDate: string;
  endDate: string;
  renewalDate: string | null;
  value: number;
  currency: string;
  slaSummary: string | null;
  autoRenew: boolean;
  documentStorageKey: string | null;
  documentFilename: string | null;
  status: ResourceStatus;
  notes: string | null;
}

const resource = defineResource<Contract>({
  collection: CONTRACTS_COLLECTION,
  codePrefix: "CTR",
  codeCounter: "contract_code",
  codeField: "contractCode",
  searchFields: ["contractCode", "title", "contractType", "vendorName"],
  indexes: ["status", "endDate", "vendorId"],
});

export const {
  getOne: getContract,
  search: searchContracts,
  count: countContracts,
  list: listContracts,
  softDelete: deleteContractRow,
} = resource;

export interface ContractWriteInput {
  title: string;
  contractType: string;
  vendorId: string | null;
  vendorName: string | null;
  startDate: string;
  endDate: string;
  renewalDate: string | null;
  value: number;
  currency: string;
  slaSummary: string | null;
  autoRenew: boolean;
  status: ResourceStatus;
  notes: string | null;
}

export async function createContract(data: ContractWriteInput, actorId: string) {
  return resource.create({ ...data, documentStorageKey: null, documentFilename: null }, actorId);
}
export async function updateContract(id: string, data: ContractWriteInput, actorId: string) {
  return resource.update(id, { ...data }, actorId);
}
export async function attachContractDocument(id: string, storageKey: string, filename: string, actorId: string) {
  return resource.update(id, { documentStorageKey: storageKey, documentFilename: filename }, actorId);
}
