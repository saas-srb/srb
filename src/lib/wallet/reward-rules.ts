import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/wallet/db";
import type { RewardRuleType, RewardRuleAudience } from "@/lib/wallet/constants";
import type { RewardRuleWriteInput } from "@/lib/wallet/reward-rule-validation";

export const REWARD_RULES_COLLECTION = "wallet_reward_rules";

export interface RewardRule extends AuditFields {
  _id: string;
  type: RewardRuleType;
  appliesToRole: RewardRuleAudience;
  amount: number;
  expiresInDays: number | null;
  isActive: boolean;
  /** Narrows a rule to one sub-event (e.g. a lead stage key, or a referral milestone count). null = applies to the whole type. */
  subKey?: string | null;
}

export interface SerializedRewardRule extends Omit<RewardRule, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeRewardRule(r: RewardRule): SerializedRewardRule {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<RewardRule>(REWARD_RULES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([collection.createIndex({ type: 1, appliesToRole: 1 }).catch(() => {})]);
  }
  return collection;
}

export async function getRewardRule(id: string): Promise<RewardRule | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listRewardRules(): Promise<RewardRule[]> {
  const collection = await getCollection();
  return collection.find(notDeleted).sort({ type: 1, appliesToRole: 1 }).toArray();
}

/**
 * The one function every earning call site actually uses: resolves the
 * active, best-matching rule for a role — an exact-role rule wins over an
 * "ALL"-audience rule; returns null (no reward) when nothing configured or
 * the matching rule is inactive/zero. Never hardcodes an amount.
 */
export async function resolveActiveRewardRule(type: RewardRuleType, role: RewardRuleAudience, subKey?: string | null): Promise<RewardRule | null> {
  const collection = await getCollection();
  // Most specific first: (role + subKey) → (ALL + subKey) → (role) → (ALL). A more specific rule with amount 0 deliberately switches that case off.
  const candidates: Record<string, unknown>[] = [];
  if (subKey) {
    candidates.push({ appliesToRole: role, subKey }, { appliesToRole: "ALL", subKey });
  }
  candidates.push({ appliesToRole: role, subKey: { $in: [null, undefined] } }, { appliesToRole: "ALL", subKey: { $in: [null, undefined] } });
  for (const c of candidates) {
    const rule = await collection.findOne({ ...notDeleted, type, isActive: true, ...c });
    if (rule) return rule.amount > 0 ? rule : null;
  }
  return null;
}

export async function createRewardRule(data: RewardRuleWriteInput, actorId: string): Promise<RewardRule> {
  const collection = await getCollection();
  const doc: RewardRule = { _id: newId(), ...data, ...createStamp(actorId) };
  await collection.insertOne(doc);
  return doc;
}

export async function updateRewardRule(id: string, data: RewardRuleWriteInput, actorId: string): Promise<RewardRule | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: { ...data, ...updateStamp(actorId) } }, { returnDocument: "after" });
}

export async function deleteRewardRule(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}
