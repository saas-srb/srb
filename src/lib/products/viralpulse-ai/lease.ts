import "server-only";
import { randomUUID } from "node:crypto";
import { COLLECTIONS, smmsCollection } from "@/lib/products/viralpulse-ai/db";

/**
 * A short-lived, per-company mutual-exclusion lease for check-then-spend decisions (ad spend caps, the Image Studio daily cap). The lease is
 * one document in the company's own settings collection: acquired atomically (a duplicate key means someone else holds it), expiring on its
 * own if the holder dies, and released when the work ends. Waits for a busy lease; gives up with `busy()` after `waitMs`.
 */
export async function withCompanyLease<T>(name: string, o: { now?: () => Date; sleep?: (ms: number) => Promise<void>; waitMs: number; leaseMs: number; busy: () => Error }, fn: () => Promise<T>): Promise<T> {
  const col = await smmsCollection<{ _id: string; holder: string; until: Date }>(COLLECTIONS.settings);
  const now = o.now ?? (() => new Date());
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const holder = randomUUID();
  const started = Date.now();
  for (;;) {
    const at = now();
    try {
      const r = await col.updateOne({ _id: name, $or: [{ until: { $lt: at } }, { until: null }] } as never, { $set: { holder, until: new Date(at.getTime() + o.leaseMs) } }, { upsert: true });
      if (r.matchedCount + r.upsertedCount > 0) break;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e; // 11000: the lease exists and is still live
    }
    if (Date.now() - started > o.waitMs) throw o.busy();
    await sleep(100);
  }
  try {
    return await fn();
  } finally {
    await col.updateOne({ _id: name, holder } as never, { $set: { until: new Date(0) } }).catch(() => {});
  }
}
