import "server-only";
import { getDb } from "@/lib/mongodb";
import { updateStamp } from "@/lib/products/talentos/db";
import { dayOfWeek } from "@/lib/products/talentos/time";

/**
 * Org-wide HRMS configuration (single document). The startup runs one office in
 * one timezone, so attendance math is done entirely on `"yyyy-mm-dd"` date
 * strings and `"HH:mm"` clock strings — see `src/lib/talentos/time.ts` for the pure
 * (client-safe) date/time helpers.
 */

export const SETTINGS_COLLECTION = "hrms_settings";
const ORG_SETTINGS_ID = "org";

export interface OrgSettings {
  _id: string;
  /** 0 = Sunday … 6 = Saturday. */
  workingDays: number[];
  shiftStart: string; // "HH:mm"
  shiftEnd: string; // "HH:mm"
  graceMinutes: number;
  earlyDepartureMinutes: number;
  halfDayHours: number;
  fullDayHours: number;
  /** Display label only (e.g. shown next to times). */
  timezone: string;
  /** Which Saturdays of the month are off when Saturday is a working day (1 = first, 2 = second …): the "2nd and 4th Saturday off" pattern. */
  saturdayOffs: number[];
  /** The state the office is in: state-specific holidays and professional tax are read for it unless an employee works in another state. */
  state: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

const DEFAULTS: Omit<OrgSettings, "_id" | "updatedAt" | "updatedBy"> = {
  workingDays: [1, 2, 3, 4, 5],
  shiftStart: "09:30",
  shiftEnd: "18:30",
  graceMinutes: 15,
  earlyDepartureMinutes: 15,
  halfDayHours: 4,
  fullDayHours: 8,
  timezone: "Asia/Kolkata",
  saturdayOffs: [],
  state: null,
};

export async function getOrgSettings(): Promise<OrgSettings> {
  const db = await getDb();
  const collection = db.collection<OrgSettings>(SETTINGS_COLLECTION);
  const existing = await collection.findOne({ _id: ORG_SETTINGS_ID });
  if (existing) return { ...DEFAULTS, ...existing };

  const doc: OrgSettings = { _id: ORG_SETTINGS_ID, ...DEFAULTS, updatedAt: new Date(), updatedBy: null };
  await collection.updateOne({ _id: ORG_SETTINGS_ID }, { $setOnInsert: doc }, { upsert: true });
  return doc;
}

export type OrgSettingsInput = Omit<OrgSettings, "_id" | "updatedAt" | "updatedBy">;

export async function updateOrgSettings(data: OrgSettingsInput, actorId: string): Promise<OrgSettings> {
  const db = await getDb();
  const collection = db.collection<OrgSettings>(SETTINGS_COLLECTION);
  const result = await collection.findOneAndUpdate(
    { _id: ORG_SETTINGS_ID },
    { $set: { ...data, ...updateStamp(actorId) } },
    { upsert: true, returnDocument: "after" }
  );
  return { ...DEFAULTS, ...(result as OrgSettings) };
}

export function isWorkingDay(date: string, settings: Pick<OrgSettings, "workingDays">): boolean {
  return settings.workingDays.includes(dayOfWeek(date));
}

export type DayClass = "working" | "weekly_off" | "holiday";

/** Which Saturday of its month a date is (1 to 5), or 0 when it is not a Saturday. */
export function saturdayOfMonth(date: string): number {
  return dayOfWeek(date) === 6 ? Math.ceil(Number(date.slice(8, 10)) / 7) : 0;
}

export function classifyDay(
  date: string,
  settings: Pick<OrgSettings, "workingDays"> & { saturdayOffs?: number[] },
  holidaySet: Set<string>
): DayClass {
  if (holidaySet.has(date)) return "holiday";
  if (!isWorkingDay(date, settings)) return "weekly_off";
  const sat = saturdayOfMonth(date);
  if (sat > 0 && settings.saturdayOffs?.includes(sat)) return "weekly_off";
  return "working";
}

// Re-export the pure helpers so existing server imports from "settings" keep working.
export {
  isDateString,
  isTimeString,
  parseHHmm,
  formatMinutesAsDuration,
  dateStringToUtc,
  utcToDateString,
  todayDateString,
  dayOfWeek,
  eachDateString,
  addDays,
  monthBounds,
  WEEKDAY_LABELS,
} from "@/lib/products/talentos/time";
