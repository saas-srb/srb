import "server-only";
import { COLLECTIONS, smmsCollection, updateStamp } from "@/lib/products/viralpulse-ai/db";
import { DEFAULT_TIMEZONE, isValidTimezone } from "./schedule";

/** Company-level publishing switches, kept in their own document of `smms_settings` (`_id: "publishing"`). */
export interface PublishSettings {
  /** IANA zone used to show and enter schedule times. India-first default. */
  timezone: string;
  /** Business Profile posting is enabled only after Google approved API access. */
  gbpEnabled: boolean;
  /** Company chose to drop the AI caption note where that is allowed (never for AI video). */
  aiDisclosureOff: boolean;
  /** Max posts the 5-minute job starts per run for this company. */
  batchCap: number;
}

export const DEFAULT_PUBLISH_SETTINGS: PublishSettings = { timezone: DEFAULT_TIMEZONE, gbpEnabled: false, aiDisclosureOff: false, batchCap: 10 };

type Doc = Partial<PublishSettings> & { _id: string };

export async function getPublishSettings(): Promise<PublishSettings> {
  const col = await smmsCollection<Doc>(COLLECTIONS.settings);
  const d = await col.findOne({ _id: "publishing" });
  return {
    timezone: d?.timezone && isValidTimezone(d.timezone) ? d.timezone : DEFAULT_PUBLISH_SETTINGS.timezone,
    gbpEnabled: d?.gbpEnabled === true,
    aiDisclosureOff: d?.aiDisclosureOff === true,
    batchCap: Math.min(Math.max(Math.round(d?.batchCap ?? DEFAULT_PUBLISH_SETTINGS.batchCap), 1), 50),
  };
}

export async function savePublishSettings(patch: Partial<PublishSettings>, actorId: string): Promise<PublishSettings> {
  const col = await smmsCollection<Doc>(COLLECTIONS.settings);
  const set: Partial<PublishSettings> = {};
  if (patch.timezone !== undefined) {
    if (!isValidTimezone(patch.timezone)) throw new Error("That time zone isn't recognised.");
    set.timezone = patch.timezone;
  }
  if (patch.gbpEnabled !== undefined) set.gbpEnabled = patch.gbpEnabled === true;
  if (patch.aiDisclosureOff !== undefined) set.aiDisclosureOff = patch.aiDisclosureOff === true;
  if (patch.batchCap !== undefined) set.batchCap = Math.min(Math.max(Math.round(patch.batchCap), 1), 50);
  await col.updateOne({ _id: "publishing" }, { $set: { ...set, ...updateStamp(actorId) } as never }, { upsert: true });
  return getPublishSettings();
}
