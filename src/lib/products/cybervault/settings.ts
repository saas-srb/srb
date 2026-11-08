import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, updateStamp } from "@/lib/products/cybervault/db";
import { LIMITS } from "@/lib/products/cybervault/constants";

/** Single settings document (`dlms_settings` / `_id: "main"`). */

export interface DlmsSettings {
  _id: string;
  /** Records expiring within this many days count as "expiring soon". */
  warnDays: number;
  /** Send expiry alerts (bell notifications) to DLMS managers/admins from the daily cron. */
  alertsEnabled: boolean;
  updatedAt: Date;
  updatedBy: string | null;
}

const ID = "main";
export const DEFAULT_SETTINGS = { warnDays: LIMITS.defaultWarnDays, alertsEnabled: true };

export async function getSettings(): Promise<DlmsSettings> {
  const db = await getDb();
  const doc = await db.collection<DlmsSettings>(COLLECTIONS.settings).findOne({ _id: ID });
  return { _id: ID, ...DEFAULT_SETTINGS, updatedAt: new Date(0), updatedBy: null, ...(doc ?? {}) };
}

export async function saveSettings(input: { warnDays: number; alertsEnabled: boolean }, actorId: string): Promise<void> {
  const db = await getDb();
  const warnDays = Math.min(Math.max(Math.round(input.warnDays), 1), 365);
  await db
    .collection<DlmsSettings>(COLLECTIONS.settings)
    .updateOne({ _id: ID }, { $set: { warnDays, alertsEnabled: Boolean(input.alertsEnabled), ...updateStamp(actorId) } }, { upsert: true });
}
