import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/cashflow-ai/db";

export const IDEMPOTENCY_COLLECTION = "fms_idempotency_keys";

export interface IdempotencyRecord {
  _id: string;
  key: string;
  action: string;
  responsePayload: Record<string, unknown> | null;
  status: "LOCKED" | "COMPLETED";
  createdAt: Date;
  expiresAt: Date;
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<IdempotencyRecord>(IDEMPOTENCY_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ key: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function acquireIdempotencyLock(
  key: string,
  action: string,
  ttlSeconds = 300
): Promise<{ acquired: boolean; cachedResponse?: Record<string, unknown> }> {
  const collection = await getCollection();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  try {
    const doc: IdempotencyRecord = {
      _id: newId(),
      key,
      action,
      responsePayload: null,
      status: "LOCKED",
      createdAt: now,
      expiresAt,
    };
    await collection.insertOne(doc);
    return { acquired: true };
  } catch {
    const existing = await collection.findOne({ key });
    if (existing && existing.status === "COMPLETED" && existing.responsePayload) {
      return { acquired: false, cachedResponse: existing.responsePayload };
    }
    return { acquired: false };
  }
}

export async function releaseIdempotencyLock(
  key: string,
  responsePayload: Record<string, unknown>
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    { key },
    {
      $set: {
        status: "COMPLETED",
        responsePayload,
      },
    }
  );
}
