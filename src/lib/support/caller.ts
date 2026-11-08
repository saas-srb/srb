import "server-only";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { SUPPORT_COLLECTIONS } from "@/lib/support/db";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import type { CompanyCaller } from "@/lib/support/requests";

/**
 * The signed-in company user asking for help. The company always comes from the request's host (never from form
 * input), so the caller can only ever act for — and read — their own company.
 */
export async function getCompanyCaller(): Promise<CompanyCaller | null> {
  const user = await getCurrentHubUser();
  const companyId = await currentCompanyIdOrNull();
  if (!user || !companyId) return null;
  const company = await getCompany(companyId);
  return { companyId, companyName: company?.name ?? "Company", user: { id: user.id, email: user.email } };
}

const AI_PER_HOUR = 60;

/** Every AI call spends the platform's OpenAI budget, so each person gets a modest hourly allowance. */
export async function takeAiAllowance(userId: string): Promise<boolean> {
  const bucket = new Date().toISOString().slice(0, 13);
  const _id = `ai:${userId}:${bucket}`;
  const res = await (await getPlatformDb())
    .collection<{ _id: string; seq: number; at: Date }>(SUPPORT_COLLECTIONS.counters)
    .findOneAndUpdate({ _id }, { $inc: { seq: 1 }, $setOnInsert: { at: new Date() } }, { upsert: true, returnDocument: "after" });
  return (res?.seq ?? 1) <= AI_PER_HOUR;
}
