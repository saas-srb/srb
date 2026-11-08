import "server-only";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";

export const VOICE_ANALYTICS_COLLECTION = "voice_analytics";

export interface VoiceDailyRollup {
  /** `YYYY-MM-DD` (UTC). */
  _id: string;
  conversations: number;
  voiceMessages: number;
  durationMsTotal: number;
  responseMsTotal: number;
  responseCount: number;
  visitorIds: string[];
  byHour: Record<string, number>;
  byVoice: Record<string, number>;
  byDevice: Record<string, number>;
  updatedAt: Date;
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function getRollupCollection(): Promise<Collection<VoiceDailyRollup>> {
  const db = await getDb();
  return db.collection<VoiceDailyRollup>(VOICE_ANALYTICS_COLLECTION);
}

interface VoiceRollupBump {
  conversations?: number;
  voiceMessages?: number;
  durationMs?: number;
  responseMs?: number;
  visitorId?: string;
  hour?: number;
  voiceId?: string;
  device?: string;
}

/**
 * Per-day rollup for the voice dashboard's time-series and histograms.
 * Detailed KPIs are still computed live from `voice_conversations` /
 * `voice_messages`. Best-effort — never throws into the caller.
 */
export async function bumpVoiceRollup(bump: VoiceRollupBump): Promise<void> {
  try {
    const collection = await getRollupCollection();
    const key = todayKey();

    const inc: Record<string, number> = {};
    if (bump.conversations) inc.conversations = bump.conversations;
    if (bump.voiceMessages) inc.voiceMessages = bump.voiceMessages;
    if (typeof bump.durationMs === "number" && bump.durationMs > 0) inc.durationMsTotal = bump.durationMs;
    if (typeof bump.responseMs === "number" && bump.responseMs >= 0) {
      inc.responseMsTotal = bump.responseMs;
      inc.responseCount = 1;
    }
    if (typeof bump.hour === "number" && bump.hour >= 0 && bump.hour < 24) {
      inc[`byHour.${bump.hour}`] = 1;
    }
    if (bump.voiceId) inc[`byVoice.${bump.voiceId.replace(/\./g, "_")}`] = 1;
    if (bump.device) inc[`byDevice.${bump.device}`] = 1;

    const update: Record<string, unknown> = { $set: { updatedAt: new Date() } };
    if (Object.keys(inc).length > 0) update.$inc = inc;
    if (bump.visitorId) update.$addToSet = { visitorIds: bump.visitorId };

    await collection.updateOne({ _id: key }, update, { upsert: true });
  } catch (err) {
    console.error("bumpVoiceRollup failed", err);
  }
}
