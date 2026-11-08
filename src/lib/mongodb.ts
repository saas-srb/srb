import type { Db } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { scopeDb } from "@/lib/platform/tenancy/scoped-db";

export { clientPromise, getPlatformDb };

/**
 * The database, scoped to the current company (see `src/lib/platform/tenancy/`).
 * Every collection it hands out only ever reads and writes the current
 * company's documents, so callers don't pass a company around. For
 * deliberate cross-company access use `getPlatformDb()`.
 */
export async function getDb(): Promise<Db> {
  const [client, companyId] = await Promise.all([clientPromise, currentCompanyId()]);
  return scopeDb(client.db(), companyId);
}
