import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import { getOrgSettings } from "@/lib/products/talentos/settings";

export const HOLIDAYS_COLLECTION = "hrms_holidays";

export { HOLIDAY_TYPES, isValidHolidayType } from "@/lib/products/talentos/holiday-types";
import type { HolidayType } from "@/lib/products/talentos/holiday-types";
export type { HolidayType };

export interface Holiday extends AuditFields {
  _id: string;
  date: string; // "yyyy-mm-dd"
  year: number;
  name: string;
  type: HolidayType;
  /** States this holiday applies to. Empty = everywhere (a national holiday). */
  states: string[];
}

export interface SerializedHoliday extends Omit<Holiday, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Holiday>(HOLIDAYS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      // Several states can have different holidays on one date, so a date is unique per name, not on its own.
      collection.dropIndex("date_1").catch(() => {}),
      collection.createIndex({ date: 1, name: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ year: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export function serializeHoliday(h: Holiday): SerializedHoliday {
  return {
    ...h,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    deletedAt: h.deletedAt ? h.deletedAt.toISOString() : null,
  };
}

export async function listHolidays(year?: number): Promise<Holiday[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (year) filter.year = year;
  return collection.find(filter).sort({ date: 1 }).toArray();
}

export async function listHolidayYears(): Promise<number[]> {
  const collection = await getCollection();
  const years = await collection.distinct("year", notDeleted);
  return (years as number[]).sort((a, b) => b - a);
}

/**
 * Set of days off for holidays between `from` and `to` inclusive. Restricted (optional) holidays are not days off for everyone, so they are
 * left out unless asked for. A holiday limited to some states counts only for someone who works in one of them: `state` is the work state
 * of the person (default: the office's state from the work schedule); with no state known, only national holidays count.
 */
export async function holidaySetInRange(from: string, to: string, opts: { state?: string | null; includeOptional?: boolean } = {}): Promise<Set<string>> {
  const collection = await getCollection();
  const docs = await collection.find({ date: { $gte: from, $lte: to }, ...notDeleted }, { projection: { date: 1, type: 1, states: 1 } }).toArray();
  const state = (opts.state === undefined ? (await getOrgSettings()).state : opts.state)?.toLowerCase() ?? null;
  return new Set(
    docs
      .filter((d) => (opts.includeOptional || d.type !== "optional") && (!d.states?.length || (state !== null && d.states.some((s) => s.toLowerCase() === state))))
      .map((d) => d.date),
  );
}

export async function getHoliday(id: string): Promise<Holiday | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function createHoliday(
  data: { date: string; name: string; type: HolidayType; states?: string[] },
  actorId: string
): Promise<{ ok: true; holiday: Holiday } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const clash = await collection.findOne({ date: data.date, name: data.name, ...notDeleted });
  if (clash) return { ok: false, reason: `"${data.name}" already exists on ${data.date}.` };

  const doc: Holiday = {
    _id: newId(),
    date: data.date,
    year: Number(data.date.slice(0, 4)),
    name: data.name,
    type: data.type,
    states: data.states ?? [],
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return { ok: true, holiday: doc };
}

export async function updateHoliday(
  id: string,
  data: { date: string; name: string; type: HolidayType; states?: string[] },
  actorId: string
): Promise<{ ok: true; holiday: Holiday } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const clash = await collection.findOne({ date: data.date, name: data.name, _id: { $ne: id }, ...notDeleted });
  if (clash) return { ok: false, reason: `"${data.name}" already exists on ${data.date}.` };

  const updated = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { date: data.date, year: Number(data.date.slice(0, 4)), name: data.name, type: data.type, states: data.states ?? [], ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  if (!updated) return { ok: false, reason: "Holiday not found." };
  return { ok: true, holiday: updated };
}

export async function deleteHoliday(id: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return res.modifiedCount === 1;
}
