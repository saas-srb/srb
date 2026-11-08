import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";

/** Companies with a reactivation request waiting for a decision (kept apart from `reactivation.ts`, which imports the company list). */
export async function pendingReactivationIds(): Promise<string[]> {
  const rows = await (await getPlatformDb()).collection<{ companyId: string }>("reactivation_requests").find({ status: "pending" }, { projection: { companyId: 1 } }).limit(500).toArray();
  return [...new Set(rows.map((r) => r.companyId))];
}
