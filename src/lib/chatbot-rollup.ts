import "server-only";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";

export const CHAT_DAILY_ROLLUP_COLLECTION = "chat_daily_rollup";

export interface ChatDailyRollup {
  /** `YYYY-MM-DD` (UTC). */
  _id: string;
  sessions: number;
  userMessages: number;
  assistantMessages: number;
  errors: number;
  flaggedInjections: number;
  responseTimeMsTotal: number;
  responseCount: number;
  visitorIds: string[];
  updatedAt: Date;
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function getRollupCollection(): Promise<Collection<ChatDailyRollup>> {
  const db = await getDb();
  return db.collection<ChatDailyRollup>(CHAT_DAILY_ROLLUP_COLLECTION);
}

interface RollupBump {
  sessions?: number;
  userMessages?: number;
  assistantMessages?: number;
  errors?: number;
  flaggedInjections?: number;
  responseTimeMs?: number;
  visitorId?: string;
}

/**
 * Opportunistically maintains a per-day rollup so the LMS dashboard can plot
 * trends without scanning every message. Detailed KPIs are still computed live
 * from `chat_sessions` / `chat_messages`; this is only for fast time-series.
 * Best-effort — never throws into the caller's hot path.
 */
export async function bumpDailyRollup(bump: RollupBump): Promise<void> {
  try {
    const collection = await getRollupCollection();
    const key = todayKey();

    const inc: Record<string, number> = {};
    if (bump.sessions) inc.sessions = bump.sessions;
    if (bump.userMessages) inc.userMessages = bump.userMessages;
    if (bump.assistantMessages) inc.assistantMessages = bump.assistantMessages;
    if (bump.errors) inc.errors = bump.errors;
    if (bump.flaggedInjections) inc.flaggedInjections = bump.flaggedInjections;
    if (typeof bump.responseTimeMs === "number" && bump.responseTimeMs >= 0) {
      inc.responseTimeMsTotal = bump.responseTimeMs;
      inc.responseCount = 1;
    }

    // No `$setOnInsert` for the counters: `$inc` on a missing field already
    // starts from 0, and setting the same paths in both operators is a conflict.
    // The `_id` is supplied by the upsert filter. Dashboard reads `$ifNull` them.
    const update: Record<string, unknown> = { $set: { updatedAt: new Date() } };
    if (Object.keys(inc).length > 0) update.$inc = inc;
    if (bump.visitorId) update.$addToSet = { visitorIds: bump.visitorId };

    await collection.updateOne({ _id: key }, update, { upsert: true });
  } catch (err) {
    console.error("bumpDailyRollup failed", err);
  }
}
