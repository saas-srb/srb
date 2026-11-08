import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, createStamp, escapeRx, newId, notDeleted, parseDateTime, updateStamp, type AuditFields } from "@/lib/products/evaliq/db";
import { OtsInputError, NotFoundError } from "@/lib/products/evaliq/viewer";
import { notifyCandidates } from "@/lib/products/evaliq/notifications";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  PRIORITIES,
  RESULT_DETAILS,
  RESULT_RELEASES,
  TARGET_TYPES,
  candidateKey,
  type AssignmentStatus,
  type CandidateRef,
  type Priority,
  type ResultDetail,
  type ResultRelease,
  type TargetType,
} from "@/lib/products/evaliq/constants";
import { resolveTargets, type ResolvedCandidate, type Target } from "@/lib/products/evaliq/people";
import { effectiveTestStatus, requireTest, type Test } from "@/lib/products/evaliq/tests";

/**
 * Test assignment. One `ots_dispatches` document records WHAT was assigned
 * to WHOM by rule (e.g. "JavaScript Assessment → Engineering department +
 * Senior Developer role"); the rule is resolved live against HRMS / Careers /
 * TMS into one `ots_assignments` document per person, which is what the
 * candidate sees and attempts. A person who already holds an active
 * assignment of the same test is never assigned it twice.
 */

export interface Dispatch extends AuditFields {
  _id: string;
  testId: string;
  targets: Target[];
  /** Human-readable targets at assignment time (the rules themselves stay live — see `resyncDispatch`). */
  targetSummary: string;
  applicantStatuses: string[];
  startAt: Date | null;
  dueAt: Date | null;
  maxAttempts: number | null;
  priority: Priority;
  instructions: string;
  notify: boolean;
  resultRelease: ResultRelease | null;
  resultDetail: ResultDetail | null;
  certificateEligible: boolean;
  allowLateStart: boolean;
  created: number;
  skipped: number;
}

export interface AggregateResult {
  /** The attempt whose score counts (latest / highest), or null for "average". */
  attemptId: string | null;
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  policy: string;
  attemptsCounted: number;
}

export interface Assignment extends AuditFields {
  _id: string;
  dispatchId: string;
  testId: string;
  candidate: CandidateRef;
  candidateKey: string;
  /** Display cache only — the person is always re-read live from their owning module. */
  candidateLabel: string;
  startAt: Date | null;
  dueAt: Date | null;
  /** null = the test's own maximum. */
  maxAttempts: number | null;
  /** Extra attempts granted individually. */
  extraAttempts: number;
  priority: Priority;
  instructions: string;
  allowLateStart: boolean;
  resultRelease: ResultRelease | null;
  resultDetail: ResultDetail | null;
  certificateEligible: boolean;
  status: AssignmentStatus;
  attemptsUsed: number;
  activeAttemptId: string | null;
  result: AggregateResult | null;
  resultPublishedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  remindedDueAt: Date | null;
  expiredNotifiedAt: Date | null;
}

async function col() {
  const db = await getDb();
  return db.collection<Assignment>(COLLECTIONS.assignments);
}
async function dcol() {
  const db = await getDb();
  return db.collection<Dispatch>(COLLECTIONS.dispatches);
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  return (await col()).findOne({ _id: id, ...notDeleted });
}
export async function requireAssignment(id: string): Promise<Assignment> {
  const a = await getAssignment(id);
  if (!a) throw new NotFoundError();
  return a;
}
export async function getDispatch(id: string): Promise<Dispatch | null> {
  return (await dcol()).findOne({ _id: id, ...notDeleted });
}

/** Maximum attempts for this assignment (override → test default, plus individually granted extras). */
export function attemptLimit(a: Pick<Assignment, "maxAttempts" | "extraAttempts">, t: Pick<Test, "config">): number {
  return (a.maxAttempts ?? t.config.maxAttempts) + (a.extraAttempts ?? 0);
}

export function effectiveRelease(a: Pick<Assignment, "resultRelease">, t: Pick<Test, "config">): ResultRelease {
  return a.resultRelease ?? t.config.resultRelease;
}
export function effectiveDetail(a: Pick<Assignment, "resultDetail">, t: Pick<Test, "config">): ResultDetail {
  return a.resultDetail ?? t.config.resultDetail;
}

/** The window in which THIS candidate may start: the intersection of the test's window and the assignment's. */
export function availability(a: Pick<Assignment, "startAt" | "dueAt" | "allowLateStart">, t: Pick<Test, "config" | "status">, now = new Date()) {
  const opensAt = [a.startAt, t.config.startAt].filter((d): d is Date => !!d).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
  const testEnd = t.config.endAt;
  const dueAt = a.dueAt;
  const testStatus = effectiveTestStatus(t, now);
  let reason: string | null = null;
  if (t.status === "archived" || t.status === "draft") reason = "This test is not available.";
  else if (testStatus === "closed") reason = "This test has closed.";
  else if (opensAt && now < opensAt) reason = "Not open yet.";
  else if (dueAt && now > dueAt && !a.allowLateStart) reason = "The due date has passed.";
  return { opensAt, dueAt, testEnd, late: !!dueAt && now > dueAt, open: reason === null, reason };
}

// ── parsing ────────────────────────────────────────────────────────────────

export interface AssignInput {
  testId: string;
  targets: Target[];
  applicantStatuses: string[];
  startAt: Date | null;
  dueAt: Date | null;
  maxAttempts: number | null;
  priority: Priority;
  instructions: string;
  notify: boolean;
  resultRelease: ResultRelease | null;
  resultDetail: ResultDetail | null;
  certificateEligible: boolean;
  allowLateStart: boolean;
}

export function parseTargets(raw: unknown): Target[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Target[] = [];
  for (const x of list) {
    const r = (x ?? {}) as { type?: unknown; ids?: unknown };
    if (!TARGET_TYPES.some((t) => t.value === r.type)) continue;
    const ids = Array.isArray(r.ids) ? Array.from(new Set(r.ids.filter((i): i is string => typeof i === "string" && !!i))).slice(0, 500) : [];
    if (ids.length) out.push({ type: r.type as TargetType, ids });
  }
  return out;
}

export function parseAssignInput(raw: Record<string, unknown>): AssignInput {
  const testId = String(raw.testId ?? "");
  if (!testId) throw new OtsInputError("Choose a test.");
  const targets = parseTargets(raw.targets);
  if (targets.length === 0) throw new OtsInputError("Choose who to assign the test to.");
  const startAt = parseDateTime(raw.startAt);
  const dueAt = parseDateTime(raw.dueAt);
  if (startAt && dueAt && dueAt <= startAt) throw new OtsInputError("The due date must be after the start date.");
  const max = raw.maxAttempts === "" || raw.maxAttempts === null || raw.maxAttempts === undefined ? null : Math.round(Number(raw.maxAttempts));
  if (max !== null && (!Number.isFinite(max) || max < 1 || max > 50)) throw new OtsInputError("Attempt limit must be between 1 and 50.");
  return {
    testId,
    targets,
    applicantStatuses: Array.isArray(raw.applicantStatuses) ? raw.applicantStatuses.filter((x): x is string => typeof x === "string").slice(0, 10) : [],
    startAt,
    dueAt,
    maxAttempts: max,
    priority: PRIORITIES.some((p) => p.value === raw.priority) ? (raw.priority as Priority) : "normal",
    instructions: String(raw.instructions ?? "").trim().slice(0, 4000),
    notify: raw.notify !== false,
    resultRelease: RESULT_RELEASES.some((r) => r.value === raw.resultRelease) ? (raw.resultRelease as ResultRelease) : null,
    resultDetail: RESULT_DETAILS.some((r) => r.value === raw.resultDetail) ? (raw.resultDetail as ResultDetail) : null,
    certificateEligible: raw.certificateEligible !== false,
    allowLateStart: raw.allowLateStart === true,
  };
}

// ── preview & create ────────────────────────────────────────────────────────

export interface PreviewRow extends ResolvedCandidate {
  existing: { assignmentId: string; status: AssignmentStatus } | null;
  /** Already completed this test before (a new assignment is still allowed, e.g. re-certification). */
  completedBefore: boolean;
}

export async function previewAssignment(input: Pick<AssignInput, "testId" | "targets" | "applicantStatuses">): Promise<{ rows: PreviewRow[]; newCount: number; duplicateCount: number }> {
  const people = await resolveTargets(input.targets, { applicantStatuses: input.applicantStatuses });
  const existing = people.length
    ? await (await col()).find({ testId: input.testId, candidateKey: { $in: people.map((p) => p.key) }, ...notDeleted }, { projection: { candidateKey: 1, status: 1 } }).toArray()
    : [];
  const active = new Map(existing.filter((e) => ACTIVE_ASSIGNMENT_STATUSES.includes(e.status)).map((e) => [e.candidateKey, e]));
  const completed = new Set(existing.filter((e) => e.status === "completed").map((e) => e.candidateKey));
  const rows = people.map((p) => {
    const e = active.get(p.key);
    return { ...p, existing: e ? { assignmentId: e._id, status: e.status } : null, completedBefore: completed.has(p.key) };
  });
  const duplicateCount = rows.filter((r) => r.existing).length;
  return { rows, newCount: rows.length - duplicateCount, duplicateCount };
}

export async function createAssignments(
  input: AssignInput,
  targetSummary: string,
  actorId: string,
  opts: { excludeKeys?: string[] } = {}
): Promise<{ dispatch: Dispatch; created: Assignment[]; skipped: number }> {
  const test = await requireTest(input.testId);
  const st = effectiveTestStatus(test);
  if (st !== "published" && st !== "active") throw new OtsInputError("Only published tests that have not closed can be assigned.");
  if (input.dueAt && test.config.endAt && input.dueAt > test.config.endAt) throw new OtsInputError("The due date is after the test's own end date.");
  const { rows } = await previewAssignment(input);
  const exclude = new Set(opts.excludeKeys ?? []);
  const fresh = rows.filter((r) => !r.existing && !exclude.has(r.key));
  if (rows.length === 0) throw new OtsInputError("Those targets currently match nobody.");
  const dispatch: Dispatch = {
    _id: newId(),
    testId: test._id,
    targets: input.targets,
    targetSummary,
    applicantStatuses: input.applicantStatuses,
    startAt: input.startAt,
    dueAt: input.dueAt,
    maxAttempts: input.maxAttempts,
    priority: input.priority,
    instructions: input.instructions,
    notify: input.notify,
    resultRelease: input.resultRelease,
    resultDetail: input.resultDetail,
    certificateEligible: input.certificateEligible,
    allowLateStart: input.allowLateStart,
    created: fresh.length,
    skipped: rows.length - fresh.length,
    ...createStamp(actorId),
  };
  await (await dcol()).insertOne(dispatch);
  const created = await insertFor(dispatch, fresh, actorId);
  return { dispatch, created, skipped: rows.length - fresh.length };
}

async function insertFor(d: Dispatch, people: ResolvedCandidate[], actorId: string): Promise<Assignment[]> {
  if (people.length === 0) return [];
  const c = await col();
  // Last-moment re-check against assignments created concurrently.
  const clash = new Set(
    (await c.find({ testId: d.testId, candidateKey: { $in: people.map((p) => p.key) }, status: { $in: ACTIVE_ASSIGNMENT_STATUSES }, ...notDeleted }, { projection: { candidateKey: 1 } }).toArray()).map((x) => x.candidateKey)
  );
  const docs: Assignment[] = people
    .filter((p) => !clash.has(p.key))
    .map((p) => ({
      _id: newId(),
      dispatchId: d._id,
      testId: d.testId,
      candidate: p.ref,
      candidateKey: candidateKey(p.ref),
      candidateLabel: p.label,
      startAt: d.startAt,
      dueAt: d.dueAt,
      maxAttempts: d.maxAttempts,
      extraAttempts: 0,
      priority: d.priority,
      instructions: d.instructions,
      allowLateStart: d.allowLateStart,
      resultRelease: d.resultRelease,
      resultDetail: d.resultDetail,
      certificateEligible: d.certificateEligible,
      status: "assigned",
      attemptsUsed: 0,
      activeAttemptId: null,
      result: null,
      resultPublishedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
      remindedDueAt: null,
      expiredNotifiedAt: null,
      ...createStamp(actorId),
    }));
  if (docs.length) await c.insertMany(docs);
  return docs;
}

/** Re-resolves a dispatch's rules and assigns the test to anyone who has joined the department / batch / … since. */
export async function resyncDispatch(id: string, actorId: string): Promise<{ dispatch: Dispatch; created: Assignment[] }> {
  const d = await getDispatch(id);
  if (!d) throw new NotFoundError();
  const test = await requireTest(d.testId);
  const st = effectiveTestStatus(test);
  if (st !== "published" && st !== "active") throw new OtsInputError("The test is no longer open for assignment.");
  const { rows } = await previewAssignment({ testId: d.testId, targets: d.targets, applicantStatuses: d.applicantStatuses });
  const already = new Set((await (await col()).find({ dispatchId: id }, { projection: { candidateKey: 1 } }).toArray()).map((a) => a.candidateKey));
  const fresh = rows.filter((r) => !r.existing && !already.has(r.key));
  const created = await insertFor(d, fresh, actorId);
  if (created.length) await (await dcol()).updateOne({ _id: id }, { $inc: { created: created.length }, $set: updateStamp(actorId) });
  return { dispatch: d, created };
}

// ── edits ──────────────────────────────────────────────────────────────────

export async function updateAssignment(
  id: string,
  raw: Record<string, unknown>,
  actorId: string
): Promise<{ before: Assignment; after: Assignment }> {
  const before = await requireAssignment(id);
  if (before.status === "cancelled") throw new OtsInputError("This assignment was cancelled.");
  const startAt = raw.startAt !== undefined ? parseDateTime(raw.startAt) : before.startAt;
  const dueAt = raw.dueAt !== undefined ? parseDateTime(raw.dueAt) : before.dueAt;
  if (startAt && dueAt && dueAt <= startAt) throw new OtsInputError("The due date must be after the start date.");
  const max = raw.maxAttempts === undefined ? before.maxAttempts : raw.maxAttempts === "" || raw.maxAttempts === null ? null : Math.round(Number(raw.maxAttempts));
  if (max !== null && (!Number.isFinite(max) || max < 1 || max > 50)) throw new OtsInputError("Attempt limit must be between 1 and 50.");
  const extra = raw.extraAttempts === undefined ? before.extraAttempts : Math.min(Math.max(Math.round(Number(raw.extraAttempts) || 0), 0), 20);
  const patch: Partial<Assignment> = {
    startAt,
    dueAt,
    maxAttempts: max,
    extraAttempts: extra,
    priority: PRIORITIES.some((p) => p.value === raw.priority) ? (raw.priority as Priority) : before.priority,
    instructions: raw.instructions !== undefined ? String(raw.instructions).trim().slice(0, 4000) : before.instructions,
    allowLateStart: raw.allowLateStart !== undefined ? raw.allowLateStart === true : before.allowLateStart,
  };
  // Re-open an expired assignment when its window is extended (or late start allowed).
  if (before.status === "expired" && ((patch.dueAt && patch.dueAt > new Date()) || patch.allowLateStart || !patch.dueAt)) {
    patch.status = "assigned";
    patch.expiredNotifiedAt = null;
  }
  // (Extra attempts on a finished assignment make it attemptable again — `startAttempt` checks the limit.)
  const after = { ...before, ...patch };
  await (await col()).updateOne({ _id: id }, { $set: { ...patch, ...updateStamp(actorId) } });
  // The candidate hears when their test window moves or they are given another attempt (from any screen that edits an assignment).
  try {
    const t = (n: Date | null | undefined) => (n ? new Date(n).getTime() : 0);
    const moved = t(before.startAt) !== t(patch.startAt) || t(before.dueAt) !== t(patch.dueAt);
    const extraGiven = (patch.extraAttempts ?? 0) > (before.extraAttempts ?? 0);
    if (moved || extraGiven) {
      const test = await requireTest(before.testId).catch(() => null);
      const when = (d: Date | null | undefined) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "no limit");
      await notifyCandidates([
        {
          ref: before.candidate,
          assignmentId: id,
          type: extraGiven ? "ots_extra_attempt" : "ots_updated",
          title: extraGiven ? `You have another attempt: ${test?.name ?? "your test"}` : `Your test schedule changed: ${test?.name ?? "your test"}`,
          body: extraGiven ? "An extra attempt was added to your assignment." : `Opens ${when(patch.startAt)} · due ${when(patch.dueAt)}.`,
        },
      ]);
    }
  } catch {
    /* a notification never fails the edit */
  }
  return { before, after };
}

export async function cancelAssignment(id: string, reason: string, actorId: string): Promise<Assignment> {
  const a = await requireAssignment(id);
  if (a.status === "in_progress") throw new OtsInputError("The candidate is taking this test right now — wait for them to finish.");
  if (a.status === "completed" || a.status === "evaluated" || a.status === "submitted") throw new OtsInputError("Finished assignments cannot be cancelled.");
  if (a.status === "cancelled") return a;
  const now = new Date();
  const res = await (await col()).updateOne(
    { _id: id, status: { $in: ["assigned", "expired"] } },
    { $set: { status: "cancelled", cancelledAt: now, cancelReason: reason.trim().slice(0, 300) || null, ...updateStamp(actorId) } }
  );
  if (res.modifiedCount === 0) throw new OtsInputError("The assignment changed in the meantime — reload and try again.");
  try {
    const test = await requireTest(a.testId).catch(() => null);
    await notifyCandidates([{ ref: a.candidate, assignmentId: id, type: "ots_cancelled_alert", title: `Test cancelled: ${test?.name ?? "your test"}`, body: reason.trim().slice(0, 200) || "You no longer need to take it." }]);
  } catch {
    /* never fails the cancel */
  }
  return { ...a, status: "cancelled", cancelledAt: now };
}

// ── expiry ─────────────────────────────────────────────────────────────────

/**
 * Persists "Assigned → Expired" for assignments whose window has passed
 * without an attempt: their own due date (unless late starts are allowed),
 * or their test's end date / close / archive. Idempotent and cheap — called
 * from list pages and the cron sweep.
 */
export async function expireOverdue(now = new Date()): Promise<number> {
  const db = await getDb();
  const c = await col();
  const own = await c.updateMany({ status: "assigned", allowLateStart: false, dueAt: { $ne: null, $lte: now }, ...notDeleted }, { $set: { status: "expired", updatedAt: now } });
  const closedTests = await db
    .collection<Test>(COLLECTIONS.tests)
    .find({ $or: [{ status: { $in: ["closed", "archived"] } }, { status: "published", "config.endAt": { $ne: null, $lte: now } }] }, { projection: { _id: 1 } })
    .toArray();
  let viaTest = 0;
  if (closedTests.length) {
    const r = await c.updateMany({ status: "assigned", testId: { $in: closedTests.map((t) => t._id) }, ...notDeleted }, { $set: { status: "expired", updatedAt: now } });
    viaTest = r.modifiedCount;
  }
  return own.modifiedCount + viaTest;
}

// ── lists ──────────────────────────────────────────────────────────────────

export interface AssignmentFilter {
  q?: string;
  testId?: string;
  status?: string;
  kind?: string;
  dispatchId?: string;
  priority?: string;
  candidateKeys?: string[];
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function assignmentFilter(f: AssignmentFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (f.testId) filter.testId = f.testId;
  if (f.status === "open") filter.status = { $in: ["assigned", "in_progress"] };
  else if (f.status === "finished") filter.status = { $in: ["submitted", "evaluated", "completed"] };
  else if (f.status) filter.status = f.status;
  if (f.kind) filter["candidate.kind"] = f.kind;
  if (f.dispatchId) filter.dispatchId = f.dispatchId;
  if (f.priority) filter.priority = f.priority;
  if (f.candidateKeys) filter.candidateKey = { $in: f.candidateKeys };
  if (f.from || f.to) {
    const r: Record<string, Date> = {};
    if (f.from) r.$gte = new Date(`${f.from}T00:00:00`);
    if (f.to) r.$lte = new Date(`${f.to}T23:59:59.999`);
    filter.createdAt = r;
  }
  if (f.q?.trim()) filter.candidateLabel = { $regex: escapeRx(f.q.trim()), $options: "i" };
  return filter;
}

export async function listAssignments(f: AssignmentFilter) {
  const c = await col();
  const page = Math.max(f.page ?? 1, 1);
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 200);
  const filter = assignmentFilter(f);
  const [items, total] = await Promise.all([c.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), c.countDocuments(filter)]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function findAssignments(filter: Record<string, unknown>, cap = 20000): Promise<Assignment[]> {
  return (await col()).find({ ...notDeleted, ...filter }).limit(cap).toArray();
}

export async function listDispatches(testId?: string, limit = 50): Promise<Dispatch[]> {
  return (await dcol()).find({ ...notDeleted, ...(testId ? { testId } : {}) }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function assignmentsForCandidates(refs: CandidateRef[]): Promise<Assignment[]> {
  if (refs.length === 0) return [];
  return (await col()).find({ candidateKey: { $in: refs.map(candidateKey) }, ...notDeleted }).sort({ createdAt: -1 }).limit(500).toArray();
}
