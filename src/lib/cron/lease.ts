import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";

/**
 * A named lease in the platform database (`cron_locks`). The database is shared by every deployment of the app (for example the old and
 * the new Vercel project during a move), so whoever holds the lease is the only one running that job, whichever deployment it is on.
 */
interface Lock {
  _id: string;
  until: Date;
  holder: string;
}
async function locks() {
  return (await getPlatformDb()).collection<Lock>("cron_locks");
}

/** Takes the lease for `seconds`; false when another holder has it. */
export async function acquireLease(key: string, seconds: number, holder: string): Promise<boolean> {
  const now = new Date();
  try {
    const res = await (await locks()).updateOne({ _id: key, until: { $lte: now } }, { $set: { until: new Date(now.getTime() + seconds * 1000), holder } });
    if (res.matchedCount) return true;
    await (await locks()).insertOne({ _id: key, until: new Date(now.getTime() + seconds * 1000), holder });
    return true;
  } catch {
    return false; // the lease exists and is still held (duplicate key)
  }
}

/** Extends a lease you hold (long jobs). */
export async function renewLease(key: string, seconds: number, holder: string): Promise<boolean> {
  const res = await (await locks()).updateOne({ _id: key, holder }, { $set: { until: new Date(Date.now() + seconds * 1000) } }).catch(() => null);
  return Boolean(res?.matchedCount);
}

export async function releaseLease(key: string, holder: string): Promise<void> {
  await (await locks()).updateOne({ _id: key, holder }, { $set: { until: new Date(0) } }).catch(() => {});
}
