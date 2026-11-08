import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/products/playbook-ai/db";

/** Operational knobs for the SOP product — one document in `sop_settings`. */
export interface SopSettings {
  _id: "main";
  /** Days before an expiry / review date that an SOP counts as "expiring soon". */
  expiringSoonDays: number;
  /** Default months between reviews, used to pre-fill a new SOP's review date. */
  defaultReviewMonths: number;
  /** Default days from assignment to due date. */
  defaultDueDays: number;
  /** Pre-ticks "require re-acknowledgement" in the publish dialog. */
  reackOnNewVersion: boolean;
  /** Minimum days between automated reminders to the same person for the same SOP. */
  reminderRepeatDays: number;
  /** New SOPs allow download by default (highly confidential / restricted never do). */
  defaultAllowDownload: boolean;
  updatedAt: Date;
  updatedBy: string | null;
}

export const DEFAULT_SETTINGS: Omit<SopSettings, "updatedAt" | "updatedBy"> = {
  _id: "main",
  expiringSoonDays: 30,
  defaultReviewMonths: 12,
  defaultDueDays: 14,
  reackOnNewVersion: true,
  reminderRepeatDays: 3,
  defaultAllowDownload: true,
};

async function col() {
  const db = await getDb();
  return db.collection<SopSettings>(COLLECTIONS.settings);
}

export async function getSettings(): Promise<SopSettings> {
  const doc = await (await col()).findOne({ _id: "main" });
  return { ...DEFAULT_SETTINGS, updatedAt: new Date(0), updatedBy: null, ...(doc ?? {}) } as SopSettings;
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
}

export async function updateSettings(input: Partial<Omit<SopSettings, "_id" | "updatedAt" | "updatedBy">>, actorId: string): Promise<SopSettings> {
  const current = await getSettings();
  const next = {
    expiringSoonDays: int(input.expiringSoonDays, 1, 365, current.expiringSoonDays),
    defaultReviewMonths: int(input.defaultReviewMonths, 1, 60, current.defaultReviewMonths),
    defaultDueDays: int(input.defaultDueDays, 1, 365, current.defaultDueDays),
    reackOnNewVersion: input.reackOnNewVersion ?? current.reackOnNewVersion,
    reminderRepeatDays: int(input.reminderRepeatDays, 1, 60, current.reminderRepeatDays),
    defaultAllowDownload: input.defaultAllowDownload ?? current.defaultAllowDownload,
  };
  await (await col()).updateOne({ _id: "main" }, { $set: { ...next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
  return getSettings();
}
