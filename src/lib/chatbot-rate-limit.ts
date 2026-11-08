import "server-only";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ChatbotRateLimit } from "@/lib/chatbot-config";

export const CHAT_RATE_LIMITS_COLLECTION = "chat_rate_limits";

interface RateLimitDoc {
  /** `${ipHash}:${window}:${bucket}` */
  _id: string;
  count: number;
  expiresAt: Date;
}

let indexEnsured = false;

async function getRateLimitCollection(): Promise<Collection<RateLimitDoc>> {
  const db = await getDb();
  const collection = db.collection<RateLimitDoc>(CHAT_RATE_LIMITS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
  }
  return collection;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry (only meaningful when `ok` is false). */
  retryAfter: number;
  /** Which window tripped: `"minute"` or `"day"`. */
  scope?: "minute" | "day";
}

/**
 * Fixed-window rate limiter keyed by hashed IP. Two windows are enforced
 * (per-minute and per-day). Increments happen atomically via `$inc` + upsert;
 * expired docs are reaped by a TTL index. When the client IP can't be
 * determined (`ipHash` null) the request is allowed — we never want a proxy
 * misconfiguration to take the bot fully offline.
 */
export async function checkRateLimit(
  ipHash: string | null,
  limits: ChatbotRateLimit
): Promise<RateLimitResult> {
  if (!ipHash) return { ok: true, retryAfter: 0 };

  const collection = await getRateLimitCollection();
  const now = Date.now();

  const minuteBucket = Math.floor(now / 60_000);
  const dayBucket = Math.floor(now / 86_400_000);

  const windows: { scope: "minute" | "day"; key: string; limit: number; resetMs: number }[] = [
    {
      scope: "minute",
      key: `${ipHash}:m:${minuteBucket}`,
      limit: limits.perMinute,
      resetMs: (minuteBucket + 1) * 60_000,
    },
    {
      scope: "day",
      key: `${ipHash}:d:${dayBucket}`,
      limit: limits.perDay,
      resetMs: (dayBucket + 1) * 86_400_000,
    },
  ];

  for (const w of windows) {
    const doc = await collection.findOneAndUpdate(
      { _id: w.key },
      { $inc: { count: 1 }, $set: { expiresAt: new Date(w.resetMs) } },
      { upsert: true, returnDocument: "after" }
    );
    const count = doc?.count ?? 1;
    if (count > w.limit) {
      return {
        ok: false,
        scope: w.scope,
        retryAfter: Math.max(1, Math.ceil((w.resetMs - now) / 1000)),
      };
    }
  }

  return { ok: true, retryAfter: 0 };
}
