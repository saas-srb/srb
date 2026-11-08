import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/wallet/db";
import type { UsageModule } from "@/lib/wallet/constants";
import type { UsageRuleWriteInput } from "@/lib/wallet/usage-rule-validation";

export const USAGE_RULES_COLLECTION = "wallet_usage_rules";

export interface UsageRule extends AuditFields, UsageRuleWriteInput {
  _id: string;
}

export interface SerializedUsageRule extends Omit<UsageRule, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeUsageRule(r: UsageRule): SerializedUsageRule {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null };
}

async function getCollection() {
  const db = await getDb();
  return db.collection<UsageRule>(USAGE_RULES_COLLECTION);
}

export async function listUsageRules(): Promise<UsageRule[]> {
  return (await getCollection()).find(notDeleted).sort({ module: 1, appliesToRole: 1 }).toArray();
}
export async function getUsageRule(id: string): Promise<UsageRule | null> {
  return (await getCollection()).findOne({ _id: id, ...notDeleted });
}
export async function createUsageRule(data: UsageRuleWriteInput, actorId: string): Promise<UsageRule> {
  const doc: UsageRule = { _id: newId(), ...data, ...createStamp(actorId) };
  await (await getCollection()).insertOne(doc);
  return doc;
}
export async function updateUsageRule(id: string, data: UsageRuleWriteInput, actorId: string): Promise<UsageRule | null> {
  return (await getCollection()).findOneAndUpdate({ _id: id, ...notDeleted }, { $set: { ...data, ...updateStamp(actorId) } }, { returnDocument: "after" });
}
export async function deleteUsageRule(id: string, actorId: string): Promise<void> {
  await (await getCollection()).updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
}

export interface UsagePolicy {
  enabled: boolean;
  maxPercentOfPrice: number;
  maxCreditsPerTransaction: number | null;
  minOrderValue: number | null;
}

/**
 * How many credits may be applied to a payable `price` in `module` for a
 * user of `role`. Exact-role rule beats "ALL". With no rule configured the
 * Festival Offers module keeps its original behaviour (up to 100%); every
 * other module is closed until an admin explicitly enables it — credits are
 * never spendable somewhere nobody opted in.
 */
export async function resolveUsagePolicy(module: UsageModule, role: string): Promise<UsagePolicy> {
  const c = await getCollection();
  const rule =
    (await c.findOne({ ...notDeleted, module, appliesToRole: role as UsageRule["appliesToRole"] })) ??
    (await c.findOne({ ...notDeleted, module, appliesToRole: "ALL" }));
  if (!rule) return { enabled: module === "offers", maxPercentOfPrice: 100, maxCreditsPerTransaction: null, minOrderValue: null };
  return { enabled: rule.isEnabled, maxPercentOfPrice: rule.maxPercentOfPrice, maxCreditsPerTransaction: rule.maxCreditsPerTransaction, minOrderValue: rule.minOrderValue };
}

/** Pure: the most credits this policy allows against `price`, capped by `available`. */
export function maxUsableCredits(policy: UsagePolicy, price: number, available: number): number {
  if (!policy.enabled || price <= 0 || available <= 0) return 0;
  if (policy.minOrderValue && price < policy.minOrderValue) return 0;
  let cap = Math.floor((price * policy.maxPercentOfPrice) / 100);
  if (policy.maxCreditsPerTransaction) cap = Math.min(cap, policy.maxCreditsPerTransaction);
  return Math.max(0, Math.min(cap, Math.floor(available)));
}
