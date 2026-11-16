import "server-only";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { publishConfigChange } from "@/lib/platform/config-events";
import { STEPS } from "@/lib/platform/setup-progress/registry";
import type { Marks } from "@/lib/platform/setup-progress/types";

/**
 * The only things setup progress stores (company database): "Not applicable" marks, "Reviewed" marks (for steps that cannot be derived), the reminder state
 * and one snapshot per day of the percentage (a small trend). The live percentage is never stored as truth: it is always derived.
 */
export const SETUP_COLLECTION = "setup_progress"; // _id "marks" | "reminders"
export const SNAPSHOTS_COLLECTION = "setup_progress_snapshots"; // _id "yyyy-mm-dd"
export const SETUP_SCOPE = "setup-progress";

interface MarksDoc extends Marks { _id: "marks"; updatedAt: Date }
export interface ReminderState { _id: "reminders"; lastInApp?: Date | null; lastDigest?: Date | null; stuckSince?: Date | null; lastPercent?: number | null; optOut?: boolean }

async function col<T extends { _id: string }>() { return (await getDb()).collection<T>(SETUP_COLLECTION); }

export async function getMarks(): Promise<Marks> {
  const doc = await (await col<MarksDoc>()).findOne({ _id: "marks" });
  return { reviewed: doc?.reviewed ?? {}, notApplicable: doc?.notApplicable ?? {} };
}

export type MarkResult = { ok: true } | { ok: false; error: string };
const def = (id: string) => STEPS.find((s) => s.id === id);

/** A Director says a step that cannot be derived has been looked at (or undoes it). Audited. */
export async function setReviewed(stepId: string, on: boolean, actorId: string): Promise<MarkResult> {
  const d = def(stepId);
  if (!d) return { ok: false, error: "Unknown step." };
  if (!d.manual) return { ok: false, error: "This step is worked out from your data; it cannot be marked by hand." };
  const c = await col<MarksDoc>();
  if (on) await c.updateOne({ _id: "marks" }, { $set: { [`reviewed.${stepId}`]: { at: new Date().toISOString(), by: actorId }, updatedAt: new Date() } }, { upsert: true });
  else await c.updateOne({ _id: "marks" }, { $unset: { [`reviewed.${stepId}`]: "" }, $set: { updatedAt: new Date() } }, { upsert: true });
  await afterMark(on ? "setup.reviewed" : "setup.unreviewed", stepId, actorId, {});
  return { ok: true };
}

/** A Director marks an OPTIONAL step "not applicable" with a short reason (or undoes it). Required and recommended steps can never be. Audited. */
export async function setNotApplicable(stepId: string, on: boolean, reason: string, actorId: string): Promise<MarkResult> {
  const d = def(stepId);
  if (!d) return { ok: false, error: "Unknown step." };
  if (d.tier !== "optional") return { ok: false, error: "Only optional steps can be marked not applicable." };
  const why = reason.trim().replace(/\s+/g, " ").slice(0, 160);
  if (on && why.length < 3) return { ok: false, error: "Give a short reason." };
  const c = await col<MarksDoc>();
  if (on) await c.updateOne({ _id: "marks" }, { $set: { [`notApplicable.${stepId}`]: { reason: why, at: new Date().toISOString(), by: actorId }, updatedAt: new Date() } }, { upsert: true });
  else await c.updateOne({ _id: "marks" }, { $unset: { [`notApplicable.${stepId}`]: "" }, $set: { updatedAt: new Date() } }, { upsert: true });
  await afterMark(on ? "setup.not_applicable" : "setup.applicable", stepId, actorId, on ? { reason: why } : {});
  return { ok: true };
}

async function afterMark(action: string, stepId: string, actorId: string, details: Record<string, unknown>) {
  await recordPlatformAudit({ actorId, action, target: { type: "setup_step", id: stepId }, companyId: await currentCompanyId(), details });
  await publishConfigChange(SETUP_SCOPE);
}

// ── Reminder state and daily snapshot ─────────────────────────────────────────────────────────────────────────────────────────────
export async function getReminderState(): Promise<ReminderState> {
  return (await (await col<ReminderState>()).findOne({ _id: "reminders" })) ?? { _id: "reminders" };
}
export async function saveReminderState(patch: Partial<Omit<ReminderState, "_id">>): Promise<void> {
  await (await col<ReminderState>()).updateOne({ _id: "reminders" }, { $set: patch }, { upsert: true });
}

const day = (d: Date) => d.toISOString().slice(0, 10);
/** Writes today's percentage once per day (a later call the same day overwrites it). */
export async function recordSnapshot(percent: number, now: Date = new Date()): Promise<void> {
  await (await getDb()).collection<{ _id: string; percent: number; at: Date }>(SNAPSHOTS_COLLECTION).updateOne({ _id: day(now) }, { $set: { percent, at: now } }, { upsert: true });
}
export async function listSnapshots(limit = 30): Promise<{ day: string; percent: number }[]> {
  const rows = await (await getDb()).collection<{ _id: string; percent: number }>(SNAPSHOTS_COLLECTION).find({}).sort({ _id: -1 }).limit(limit).toArray();
  return rows.map((r) => ({ day: r._id, percent: r.percent })).reverse();
}
