import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, notDeleted } from "@/lib/products/evaliq/db";
import { NotFoundError, ForbiddenError } from "@/lib/products/evaliq/viewer";
import { attemptLimit, availability, effectiveRelease, expireOverdue, type Assignment } from "@/lib/products/evaliq/assignments";
import { effectiveTestStatus, type Test } from "@/lib/products/evaliq/tests";
import { categoryMap } from "@/lib/products/evaliq/categories";
import { startCheck } from "@/lib/products/evaliq/attempts";
import { certificateState, type OtsCertificate } from "@/lib/products/evaliq/certificates";
import { labelOf, TEST_TYPES, SUBMIT_REASONS, type AssignmentStatus, type Priority, type SubmitReason } from "@/lib/products/evaliq/constants";
import type { Attempt } from "@/lib/products/evaliq/attempt-types";
import type { Taker } from "@/lib/products/evaliq/taker";

/**
 * Everything a candidate sees about their own tests — identical for
 * employees (OTS "My Tests") and applicants / students (Portal "Tests"), so
 * both are powered by the same data and the same engine.
 */

export type Bucket = "upcoming" | "open" | "in_progress" | "completed" | "expired";

export interface CandidateCard {
  assignmentId: string;
  testId: string;
  testName: string;
  testType: string;
  category: string | null;
  description: string;
  durationMinutes: number | null;
  autoSubmit: boolean;
  questions: number | null;
  totalMarks: number | null;
  marksVary: boolean;
  passing: string;
  opensAt: string | null;
  dueAt: string | null;
  testEndsAt: string | null;
  status: AssignmentStatus;
  bucket: Bucket;
  priority: Priority;
  attemptsUsed: number;
  attemptsAllowed: number;
  canStart: boolean;
  canResume: boolean;
  blockedReason: string | null;
  late: boolean;
  activeAttemptId: string | null;
  latestAttemptId: string | null;
  /** Aggregated result — only when the result has been released to the candidate. */
  result: { score: number; total: number; percentage: number; passed: boolean; policy: string } | null;
  resultHiddenReason: string | null;
  certificate: { id: string; number: string; state: "valid" | "revoked" | "expired" } | null;
  assignedAt: string;
}

const ISO = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function load(keys: string[], assignmentId?: string) {
  await expireOverdue();
  const db = await getDb();
  const filter: Record<string, unknown> = { candidateKey: { $in: keys }, status: { $ne: "cancelled" }, ...notDeleted };
  if (assignmentId) filter._id = assignmentId;
  const assignments = await db.collection<Assignment>(COLLECTIONS.assignments).find(filter).sort({ createdAt: -1 }).limit(300).toArray();
  const testIds = Array.from(new Set(assignments.map((a) => a.testId)));
  const [tests, attempts, certs, cats] = await Promise.all([
    db.collection<Test>(COLLECTIONS.tests).find({ _id: { $in: testIds } }).toArray(),
    db
      .collection<Attempt>(COLLECTIONS.attempts)
      .find({ assignmentId: { $in: assignments.map((a) => a._id) } }, { projection: { paper: 0, answers: 0, events: 0 } })
      .sort({ attemptNo: 1 })
      .toArray(),
    db.collection<OtsCertificate>(COLLECTIONS.certificates).find({ assignmentId: { $in: assignments.map((a) => a._id) }, ...notDeleted }).toArray(),
    categoryMap("test"),
  ]);
  return { assignments, tests: new Map(tests.map((t) => [t._id, t])), attempts, certs: new Map(certs.map((c) => [c.assignmentId, c])), cats };
}

function hiddenReason(a: Assignment, t: Test): string | null {
  const policy = effectiveRelease(a, t);
  if (a.resultPublishedAt && policy !== "never") return null;
  if (policy === "never") return "Results are shared with the organisers only.";
  if (policy === "after_close") return "Results are released after the test closes.";
  if (policy === "manual") return "Results will be published by the organisers.";
  return a.status === "submitted" ? "Awaiting evaluation." : null;
}

async function toCard(a: Assignment, t: Test, attempts: Attempt[], cert: OtsCertificate | undefined, cats: Map<string, string>): Promise<CandidateCard> {
  const check = await startCheck(a, t);
  const av = availability(a, t);
  const now = new Date();
  let bucket: Bucket;
  if (a.status === "in_progress") bucket = "in_progress";
  else if (a.status === "expired") bucket = "expired";
  else if (a.status === "assigned") bucket = av.opensAt && now < av.opensAt ? "upcoming" : effectiveTestStatus(t) === "closed" ? "expired" : "open";
  else bucket = "completed";
  const hidden = hiddenReason(a, t);
  const mine = attempts.filter((x) => x.assignmentId === a._id);
  const pass = t.config.passMode === "percentage" ? `${t.config.passingPercentage}%` : `${t.config.passingMarks} marks`;
  return {
    assignmentId: a._id,
    testId: t._id,
    testName: t.name,
    testType: labelOf(TEST_TYPES, t.testType),
    category: t.categoryId ? cats.get(t.categoryId) ?? null : null,
    description: t.description,
    durationMinutes: t.config.durationMinutes,
    autoSubmit: t.config.autoSubmit,
    questions: t.paperStats?.servedCount ?? null,
    totalMarks: t.paperStats?.totalMarks ?? null,
    marksVary: t.paperStats?.marksVary ?? false,
    passing: pass,
    opensAt: ISO(av.opensAt),
    dueAt: ISO(a.dueAt),
    testEndsAt: ISO(t.config.endAt),
    status: a.status,
    bucket,
    priority: a.priority,
    attemptsUsed: a.attemptsUsed,
    attemptsAllowed: attemptLimit(a, t),
    canStart: check.canStart,
    canResume: check.canResume,
    blockedReason: check.canStart || check.canResume ? null : check.reason,
    late: check.late,
    activeAttemptId: a.activeAttemptId,
    latestAttemptId: mine.length ? mine[mine.length - 1]._id : null,
    result: !hidden && a.result ? { score: a.result.score, total: a.result.total, percentage: a.result.percentage, passed: a.result.passed, policy: a.result.policy } : null,
    resultHiddenReason: a.attemptsUsed > 0 ? hidden : null,
    certificate: cert ? { id: cert._id, number: cert.certificateNumber, state: certificateState(cert) } : null,
    assignedAt: a.createdAt.toISOString(),
  };
}

export async function candidateCards(taker: Taker): Promise<CandidateCard[]> {
  const { assignments, tests, attempts, certs, cats } = await load(taker.keys);
  const out: CandidateCard[] = [];
  for (const a of assignments) {
    const t = tests.get(a.testId);
    if (!t) continue;
    out.push(await toCard(a, t, attempts, certs.get(a._id), cats));
  }
  const order: Record<Bucket, number> = { in_progress: 0, open: 1, upcoming: 2, completed: 3, expired: 4 };
  const prio: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  return out.sort((x, y) => order[x.bucket] - order[y.bucket] || prio[x.priority] - prio[y.priority] || (x.dueAt ?? "9").localeCompare(y.dueAt ?? "9"));
}

export interface AttemptRow {
  attemptId: string;
  attemptNo: number;
  status: Attempt["status"];
  startedAt: string;
  submittedAt: string | null;
  submitReason: SubmitReason | null;
  reasonLabel: string | null;
  timeTakenSec: number | null;
  /** Only when released to the candidate. */
  score: number | null;
  total: number | null;
  percentage: number | null;
  passed: boolean | null;
  provisional: boolean;
  visible: boolean;
}

function attemptRow(x: Attempt, a: Assignment, t: Test): AttemptRow {
  const visible = !!x.resultPublishedAt && effectiveRelease(a, t) !== "never";
  const r = visible ? x.result : null;
  return {
    attemptId: x._id,
    attemptNo: x.attemptNo,
    status: x.status,
    startedAt: x.startedAt.toISOString(),
    submittedAt: ISO(x.submittedAt),
    submitReason: x.submitReason,
    reasonLabel: x.submitReason ? SUBMIT_REASONS[x.submitReason] : null,
    timeTakenSec: x.result?.timeTakenSec ?? null,
    score: r?.finalScore ?? null,
    total: r?.totalMarks ?? null,
    percentage: r?.percentage ?? null,
    passed: r && !r.provisional ? r.passed : null,
    provisional: !!r?.provisional,
    visible,
  };
}

export async function candidateAssignment(taker: Taker, assignmentId: string): Promise<{ card: CandidateCard; attempts: AttemptRow[]; instructions: string; assignmentInstructions: string; security: Test["config"]["security"]; rules: string[] }> {
  const { assignments, tests, attempts, certs, cats } = await load(taker.keys, assignmentId);
  const a = assignments[0];
  if (!a) {
    const db = await getDb();
    const exists = await db.collection<{ _id: string }>(COLLECTIONS.assignments).countDocuments({ _id: assignmentId });
    throw exists ? new ForbiddenError() : new NotFoundError();
  }
  const t = tests.get(a.testId);
  if (!t) throw new NotFoundError();
  const card = await toCard(a, t, attempts, certs.get(a._id), cats);
  const c = t.config;
  const rules = [
    c.durationMinutes ? `${c.durationMinutes} minutes${c.autoSubmit ? " — the test submits automatically when time runs out, and the timer keeps running if you close the page." : " (advisory — time over the limit is recorded)."}` : "No time limit.",
    t.sections.some((s) => s.timeLimitMinutes) ? "Some sections have their own timer; once a section's time is up (or you move on) it locks." : null,
    !c.allowBack ? "You cannot go back to earlier questions." : null,
    !c.allowNavigation ? "Questions must be answered in order." : null,
    c.negativeMarking ? "Wrong answers can lose marks (negative marking). Skipped questions never do." : null,
    c.allowRetake ? `You may attempt this test up to ${attemptLimit(a, t)} times; your ${c.attemptScoring === "average" ? "average" : c.attemptScoring === "latest" ? "latest" : "highest"} score counts.` : "One attempt only.",
    `Pass mark: ${card.passing}.`,
  ].filter((x): x is string => !!x);
  return {
    card,
    attempts: attempts.filter((x) => x.assignmentId === a._id).map((x) => attemptRow(x, a, t)),
    instructions: t.instructions,
    assignmentInstructions: a.instructions,
    security: c.security,
    rules,
  };
}

export interface HistoryRow extends AttemptRow {
  assignmentId: string;
  testId: string;
  testName: string;
  category: string | null;
  certificate: { id: string; number: string; state: string } | null;
}

export async function candidateHistory(taker: Taker, f: { q?: string; testId?: string; status?: string; from?: string; to?: string; categoryId?: string }): Promise<HistoryRow[]> {
  const { assignments, tests, attempts, certs, cats } = await load(taker.keys);
  const byA = new Map(assignments.map((a) => [a._id, a]));
  const from = f.from ? new Date(`${f.from}T00:00:00`) : null;
  const to = f.to ? new Date(`${f.to}T23:59:59.999`) : null;
  const rows: HistoryRow[] = [];
  for (const x of attempts) {
    if (x.status === "in_progress") continue;
    const a = byA.get(x.assignmentId);
    const t = a && tests.get(a.testId);
    if (!a || !t) continue;
    if (f.testId && t._id !== f.testId) continue;
    if (f.categoryId && t.categoryId !== f.categoryId) continue;
    if (f.q && !t.name.toLowerCase().includes(f.q.toLowerCase())) continue;
    if (from && x.startedAt < from) continue;
    if (to && x.startedAt > to) continue;
    const row = attemptRow(x, a, t);
    if (f.status === "passed" && row.passed !== true) continue;
    if (f.status === "failed" && row.passed !== false) continue;
    if (f.status === "pending" && (row.visible && !row.provisional)) continue;
    const c = certs.get(a._id);
    rows.push({ ...row, assignmentId: a._id, testId: t._id, testName: t.name, category: t.categoryId ? cats.get(t.categoryId) ?? null : null, certificate: c && (c.attemptId === x._id || !c.attemptId) ? { id: c._id, number: c.certificateNumber, state: certificateState(c) } : null });
  }
  return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function candidateCertificates(taker: Taker): Promise<OtsCertificate[]> {
  const db = await getDb();
  return db.collection<OtsCertificate>(COLLECTIONS.certificates).find({ candidateKey: { $in: taker.keys }, ...notDeleted }).sort({ issuedOn: -1 }).toArray();
}

