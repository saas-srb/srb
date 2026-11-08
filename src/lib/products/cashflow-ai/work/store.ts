import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getComplianceProfile } from "@/lib/products/cashflow-ai/compliance/filings";
import { listBankAccounts } from "@/lib/products/cashflow-ai/bank-accounts";
import { cashFlowAccountsExist } from "@/lib/products/cashflow-ai/work/facts-loader";
import { loadRulebook } from "@/lib/products/cashflow-ai/rulebook/rules-store";
import { calendarFor } from "@/lib/products/cashflow-ai/rulebook/rules";
import { canonicalPeriod } from "@/lib/products/cashflow-ai/work/grouping";
import { taskById } from "@/lib/products/cashflow-ai/work/catalog";
import { buildInstances, canComplete, skipProblem, type CompanyFacts, type LogEntry, type Rulebooks, type WorkInstance } from "@/lib/products/cashflow-ai/work/engine";

/**
 * "My work": what the company has ticked, skipped or finished, and when it began. The list of work itself is the catalog (code); only the
 * company's own progress is stored here.
 */
export const WORK_LOG_COLLECTION = "fms_work_log";
export const WORK_PLAN_COLLECTION = "fms_work_plan";

export interface WorkLogDoc extends AuditFields {
  _id: string;
  taskId: string;
  periodKey: string;
  status: "open" | "done" | "skipped";
  steps: boolean[];
  skipReason: string | null;
  doneAt: Date | null;
  doneBy: string | null;
  note: string | null;
}

export interface WorkPlanDoc {
  _id: string;
  /** The day the company switched "My work" on: nothing earlier is demanded. */
  startDate: string;
  startedAt: Date;
  startedBy: string;
}

type Actor = { id: string; email: string | null };
let indexed = false;
async function logCol() {
  const db = await getDb();
  const col = db.collection<WorkLogDoc>(WORK_LOG_COLLECTION);
  if (!indexed) {
    indexed = true;
    await col.createIndex({ taskId: 1, periodKey: 1 }, { unique: true }).catch(() => {});
  }
  return col;
}

export async function getPlan(): Promise<WorkPlanDoc | null> {
  const db = await getDb();
  return db.collection<WorkPlanDoc>(WORK_PLAN_COLLECTION).findOne({ _id: "main" });
}

/** Switches the plan on from `startDate` (today in India). Only once; the start day never moves. */
export async function startPlan(startDate: string, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: "Choose a start date." };
  const db = await getDb();
  const res = await db.collection<WorkPlanDoc>(WORK_PLAN_COLLECTION).updateOne({ _id: "main" }, { $setOnInsert: { _id: "main", startDate, startedAt: new Date(), startedBy: actor.id } }, { upsert: true });
  if (res.upsertedCount !== 1) return { ok: false, error: "Your work plan has already started." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: "compliance_item", entityId: "work-plan", entityLabel: "My work", summary: `plan started from ${startDate}` });
  return { ok: true };
}

export async function loadLogs(): Promise<LogEntry[]> {
  const rows = await (await logCol()).find({ ...notDeleted }).toArray();
  return rows.map((r) => ({ taskId: r.taskId, periodKey: r.periodKey, status: r.status, steps: r.steps, skipReason: r.skipReason, doneAt: r.doneAt?.toISOString() ?? null }));
}

export async function loadCompanyFacts(): Promise<CompanyFacts> {
  const [profile, hasCash] = await Promise.all([getComplianceProfile(), cashFlowAccountsExist()]);
  return { ...profile, hasCashAccounts: hasCash };
}

const rulebookCache = new Map<string, { calendar: ReturnType<typeof calendarFor>; advanceTax: Awaited<ReturnType<typeof loadRulebook>>["advanceTax"] }>();
/** The rulebooks the engine needs, loaded up front for the years in play (the engine itself is synchronous). */
export async function loadRulebooks(fys: string[]): Promise<Rulebooks> {
  const map = new Map<string, { calendar: ReturnType<typeof calendarFor>; advanceTax: Awaited<ReturnType<typeof loadRulebook>>["advanceTax"] }>();
  for (const fy of new Set(fys)) {
    const rb = await loadRulebook(fy);
    map.set(fy, { calendar: calendarFor(rb), advanceTax: rb.advanceTax });
  }
  void rulebookCache;
  return { forFy: (fy) => map.get(fy) ?? { calendar: [], advanceTax: [] } };
}

/** Every financial year the plan can touch between its start and a little after today. */
function yearsBetween(startDate: string, today: string): string[] {
  const fy = (d: string) => { const y = Number(d.slice(0, 4)); const s = Number(d.slice(5, 7)) >= 4 ? y : y - 1; return s; };
  const out: string[] = [];
  for (let y = fy(startDate) - 1; y <= fy(today) + 1; y++) out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  return out;
}

/** All the pieces of work for the company today. `null` plan = not started. */
export async function loadWork(today: string): Promise<{ plan: WorkPlanDoc | null; instances: WorkInstance[]; facts: CompanyFacts }> {
  const [plan, facts, logs] = await Promise.all([getPlan(), loadCompanyFacts(), loadLogs()]);
  if (!plan) return { plan: null, instances: [], facts };
  const books = await loadRulebooks(yearsBetween(plan.startDate, today));
  return { plan, instances: buildInstances({ today, startDate: plan.startDate, facts, logs, books }), facts };
}

// ───────────────────────────── ticking ─────────────────────────────

async function ensureKnown(taskId: string, periodKey: string): Promise<{ ok: true; steps: number } | { ok: false; error: string }> {
  const task = taskById(taskId);
  if (!task) return { ok: false, error: "That piece of work does not exist." };
  if (!canonicalPeriod(task.frequency, periodKey)) return { ok: false, error: "Unknown period." };
  return { ok: true, steps: task.steps.length };
}

/** Ticks or un-ticks one step. A finished piece of work cannot be changed; reopen it first. */
export async function setStep(taskId: string, periodKey: string, stepIndex: number, value: boolean, actor: Actor): Promise<{ ok: true; steps: boolean[] } | { ok: false; error: string }> {
  const known = await ensureKnown(taskId, periodKey);
  if (!known.ok) return known;
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= known.steps) return { ok: false, error: "No such step." };
  const col = await logCol();
  const existing = await col.findOne({ taskId, periodKey, ...notDeleted });
  if (existing && existing.status !== "open") return { ok: false, error: existing.status === "done" ? "This is already marked done. Reopen it to change a step." : "This was skipped. Reopen it to change a step." };
  const res = await col.updateOne({ taskId, periodKey, ...notDeleted, status: "open" }, { $set: { [`steps.${stepIndex}`]: value, ...updateStamp(actor.id) } });
  if (res.matchedCount === 0) {
    const steps = Array.from({ length: known.steps }, (_, i) => i === stepIndex && value);
    try {
      await col.insertOne({ _id: newId(), taskId, periodKey, status: "open", steps, skipReason: null, doneAt: null, doneBy: null, note: null, ...createStamp(actor.id) });
    } catch {
      await col.updateOne({ taskId, periodKey, status: "open" }, { $set: { [`steps.${stepIndex}`]: value, ...updateStamp(actor.id) } });
    }
  }
  const now = await col.findOne({ taskId, periodKey, ...notDeleted });
  const steps = Array.from({ length: known.steps }, (_, i) => now?.steps?.[i] === true);
  return { ok: true, steps };
}

/** Marks the piece of work done. Every step has to be ticked (a step the system proved itself counts only if the caller passes it as ticked). */
export async function markDone(taskId: string, periodKey: string, autoTicked: boolean[], actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const known = await ensureKnown(taskId, periodKey);
  if (!known.ok) return known;
  const col = await logCol();
  const existing = await col.findOne({ taskId, periodKey, ...notDeleted });
  if (existing?.status === "done") return { ok: true };
  const steps = Array.from({ length: known.steps }, (_, i) => existing?.steps?.[i] === true || autoTicked[i] === true);
  if (!canComplete(steps)) return { ok: false, error: `${steps.filter((s) => !s).length} step${steps.filter((s) => !s).length === 1 ? " is" : "s are"} still not ticked.` };
  const set = { status: "done" as const, steps, skipReason: null, doneAt: new Date(), doneBy: actor.id, ...updateStamp(actor.id) };
  const res = await col.updateOne({ taskId, periodKey, ...notDeleted }, { $set: set });
  if (res.matchedCount === 0) {
    try {
      await col.insertOne({ _id: newId(), taskId, periodKey, note: null, ...set, ...createStamp(actor.id) });
    } catch {
      await col.updateOne({ taskId, periodKey }, { $set: set });
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "status_change", entity: "compliance_item", entityId: `work:${taskId}:${periodKey}`, entityLabel: taskById(taskId)?.title ?? taskId, summary: "marked done" });
  return { ok: true };
}

/** Skips a piece of work with a reason. It stays on record, with who skipped it. */
export async function skipWork(taskId: string, periodKey: string, reason: string, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const known = await ensureKnown(taskId, periodKey);
  if (!known.ok) return known;
  const bad = skipProblem(reason);
  if (bad) return { ok: false, error: bad };
  const col = await logCol();
  const current = await col.findOne({ taskId, periodKey, ...notDeleted });
  if (current?.status === "done") return { ok: false, error: "This is already marked done. Reopen it first." };
  const set = { status: "skipped" as const, skipReason: reason.trim(), doneAt: new Date(), doneBy: actor.id, ...updateStamp(actor.id) };
  const res = await col.updateOne({ taskId, periodKey, ...notDeleted, status: { $ne: "done" } }, { $set: set });
  if (res.matchedCount === 0 && !(await col.findOne({ taskId, periodKey, ...notDeleted }))) {
    try {
      await col.insertOne({ _id: newId(), taskId, periodKey, steps: Array.from({ length: known.steps }, () => false), note: null, ...set, ...createStamp(actor.id) });
    } catch {
      await col.updateOne({ taskId, periodKey }, { $set: set });
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "status_change", entity: "compliance_item", entityId: `work:${taskId}:${periodKey}`, entityLabel: taskById(taskId)?.title ?? taskId, summary: `skipped: ${reason.trim()}` });
  return { ok: true };
}

/** Brings a done or skipped piece of work back to open (steps kept). */
export async function reopenWork(taskId: string, periodKey: string, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const known = await ensureKnown(taskId, periodKey);
  if (!known.ok) return known;
  const res = await (await logCol()).updateOne({ taskId, periodKey, ...notDeleted, status: { $ne: "open" } }, { $set: { status: "open", skipReason: null, doneAt: null, doneBy: null, ...updateStamp(actor.id) } });
  if (res.matchedCount === 0) return { ok: false, error: "Nothing to reopen." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "status_change", entity: "compliance_item", entityId: `work:${taskId}:${periodKey}`, entityLabel: taskById(taskId)?.title ?? taskId, summary: "reopened" });
  return { ok: true };
}

export { listBankAccounts };
