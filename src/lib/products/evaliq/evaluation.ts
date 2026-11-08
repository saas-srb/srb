import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, round2, updateStamp } from "@/lib/products/evaliq/db";
import { OtsInputError, NotFoundError } from "@/lib/products/evaliq/viewer";
import { QUESTION_TYPES } from "@/lib/products/evaliq/question-types";
import { effectiveRelease, type AggregateResult, type Assignment } from "@/lib/products/evaliq/assignments";
import { effectiveTestStatus, getTest, type Test, type TestConfig } from "@/lib/products/evaliq/tests";
import { recordAudit } from "@/lib/products/evaliq/audit";
import { notifyCandidates, notifyStaff } from "@/lib/products/evaliq/notifications";
import { getOtsSettings } from "@/lib/products/evaliq/settings";
import { issueCertificateIfEligible } from "@/lib/products/evaliq/certificates";
import type { Answer, Attempt, AttemptResult, Outcome, PaperItem, SectionResult } from "@/lib/products/evaliq/attempt-types";
import type { AssignmentStatus } from "@/lib/products/evaliq/constants";

/**
 * The evaluation engine. Objective answers are graded automatically on
 * submit through the question-type registry; subjective ones wait as
 * "Pending Manual Evaluation" until an evaluator marks them. Every change
 * recomputes the attempt result, the assignment's aggregate (latest /
 * highest / average attempt), the result-release state and certificate
 * issuance — in that order, from one place.
 */

const SYSTEM = "system";

async function attempts() {
  const db = await getDb();
  return db.collection<Attempt>(COLLECTIONS.attempts);
}
async function assignmentsCol() {
  const db = await getDb();
  return db.collection<Assignment>(COLLECTIONS.assignments);
}

/** Auto-grades one item; subjective items without an auto key come back "pending". */
export function gradeItem(item: PaperItem, answer: Answer | undefined): Outcome {
  const base = { evaluatedBy: null, evaluatedAt: new Date(), comment: "", overridden: false };
  const response = answer?.response ?? null;
  if (!response) return { ...base, status: "unanswered", awarded: 0, auto: true };
  const g = QUESTION_TYPES[item.type].evaluate(item.definition, response);
  if (g.status === "manual") return { ...base, status: "pending", awarded: null, auto: false, evaluatedAt: null };
  if (g.status === "incorrect") return { ...base, status: "incorrect", awarded: item.negativeMarks ? -item.negativeMarks : 0, auto: true };
  return { ...base, status: g.status, awarded: round2(item.marks * g.fraction), auto: true };
}

export function isPassed(score: number, total: number, config: Pick<TestConfig, "passMode" | "passingPercentage" | "passingMarks">): boolean {
  if (config.passMode === "marks") return score >= config.passingMarks;
  const pct = total > 0 ? (score / total) * 100 : 0;
  return pct + 1e-9 >= config.passingPercentage;
}

export function computeResult(a: Pick<Attempt, "paper" | "answers" | "sections" | "config" | "startedAt" | "submittedAt">): AttemptResult {
  const secs = new Map<number, SectionResult>();
  a.sections.forEach((s, i) => secs.set(i, { index: i, title: s.title, total: 0, obtained: 0, percentage: 0, questions: 0, correct: 0, incorrect: 0, partial: 0, unanswered: 0, pending: 0 }));
  let total = 0;
  let pos = 0;
  let neg = 0;
  const counts = { correct: 0, incorrect: 0, partial: 0, unanswered: 0, pending: 0 };
  a.paper.forEach((item) => {
    const o = item.outcome;
    const s = secs.get(item.section)!;
    total += item.marks;
    s.total += item.marks;
    s.questions += 1;
    const status = o?.status ?? "pending";
    counts[status] += 1;
    s[status] += 1;
    const awarded = o?.awarded ?? 0;
    if (awarded >= 0) pos += awarded;
    else neg += awarded;
    s.obtained += awarded;
  });
  const finalScore = round2(Math.max(0, pos + neg));
  const percentage = total > 0 ? round2((finalScore / total) * 100) : 0;
  const sections = Array.from(secs.values())
    .filter((s) => s.questions > 0)
    .map((s) => ({ ...s, total: round2(s.total), obtained: round2(Math.max(0, s.obtained)), percentage: s.total > 0 ? round2((Math.max(0, s.obtained) / s.total) * 100) : 0 }));
  const end = a.submittedAt ?? new Date();
  return {
    totalQuestions: a.paper.length,
    attempted: a.paper.length - counts.unanswered,
    ...counts,
    totalMarks: round2(total),
    marksObtained: round2(pos),
    negativeMarks: round2(neg),
    finalScore,
    percentage,
    passed: counts.pending === 0 && isPassed(finalScore, total, a.config),
    provisional: counts.pending > 0,
    timeTakenSec: Math.max(0, Math.round((end.getTime() - a.startedAt.getTime()) / 1000)),
    sections,
  };
}

/** Assignment aggregate across its evaluated attempts, per the test's attempt-scoring policy. */
export function aggregate(list: Attempt[], config: TestConfig): AggregateResult | null {
  const done = list.filter((x) => x.status === "evaluated" && x.result).sort((x, y) => x.attemptNo - y.attemptNo);
  if (done.length === 0) return null;
  const policy = config.attemptScoring;
  if (policy === "average") {
    const score = round2(done.reduce((s, x) => s + x.result!.finalScore, 0) / done.length);
    const total = round2(done.reduce((s, x) => s + x.result!.totalMarks, 0) / done.length);
    const percentage = round2(done.reduce((s, x) => s + x.result!.percentage, 0) / done.length);
    const passed = config.passMode === "marks" ? score >= config.passingMarks : percentage + 1e-9 >= config.passingPercentage;
    return { attemptId: null, score, total, percentage, passed, policy, attemptsCounted: done.length };
  }
  const pick = policy === "latest" ? done[done.length - 1] : [...done].sort((x, y) => y.result!.percentage - x.result!.percentage || x.attemptNo - y.attemptNo)[0];
  const r = pick.result!;
  return { attemptId: pick._id, score: r.finalScore, total: r.totalMarks, percentage: r.percentage, passed: r.passed, policy, attemptsCounted: done.length };
}

/** Should this attempt's result be visible to the candidate now (per the release policy)? */
function releaseNow(test: Test, asg: Assignment, att: Pick<Attempt, "status">): boolean {
  const policy = effectiveRelease(asg, test);
  if (policy === "immediate") return true;
  if (policy === "after_evaluation") return att.status === "evaluated";
  if (policy === "after_close") return att.status === "evaluated" && effectiveTestStatus(test) === "closed";
  return false; // manual / never
}

/**
 * Recomputes everything downstream of an attempt change: the attempt's own
 * result + status, release, the assignment aggregate + status, notifications
 * and certificate. Safe to call repeatedly.
 */
export async function settleAttempt(attemptId: string, actor: { id: string; email: string | null }, opts: { notify?: boolean } = {}): Promise<Attempt> {
  const col = await attempts();
  const att = await col.findOne({ _id: attemptId });
  if (!att) throw new NotFoundError();
  if (att.status === "in_progress") return att;
  const test = await getTest(att.testId);
  const asg = await (await assignmentsCol()).findOne({ _id: att.assignmentId });
  if (!test || !asg) return att;

  const result = computeResult(att);
  const status = result.pending > 0 ? "pending_evaluation" : "evaluated";
  const wasPublished = !!att.resultPublishedAt;
  const publish = !wasPublished && releaseNow(test, asg, { status });
  const now = new Date();
  const attPatch: Partial<Attempt> = { result, status, updatedAt: now };
  if (status === "evaluated" && !att.evaluatedAt) attPatch.evaluatedAt = now;
  if (publish) attPatch.resultPublishedAt = now;
  await col.updateOne({ _id: attemptId }, { $set: attPatch });
  const updated = { ...att, ...attPatch } as Attempt;

  // Assignment aggregate + status.
  const all = await col.find({ assignmentId: asg._id }).toArray();
  const merged = all.map((x) => (x._id === attemptId ? updated : x));
  const agg = aggregate(merged, test.config);
  const inProgress = merged.some((x) => x.status === "in_progress");
  const pending = merged.some((x) => x.status === "pending_evaluation");
  const policy = effectiveRelease(asg, test);
  const released = merged.some((x) => x.status === "evaluated" && x.resultPublishedAt);
  let aStatus: AssignmentStatus;
  if (inProgress) aStatus = "in_progress";
  else if (pending) aStatus = "submitted";
  else if (released || policy === "never") aStatus = "completed";
  else aStatus = "evaluated";
  const aPatch: Partial<Assignment> = { result: agg, status: aStatus, ...updateStamp(actor.id) };
  if (aStatus === "completed" && !asg.completedAt) aPatch.completedAt = now;
  if (released && !asg.resultPublishedAt) aPatch.resultPublishedAt = now;
  await (await assignmentsCol()).updateOne({ _id: asg._id }, { $set: aPatch });

  if (status === "evaluated" && att.status !== "evaluated") {
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "result_generated", entity: "result", entityId: attemptId, entityLabel: `${asg.candidateLabel} · ${test.name}`, testId: test._id, summary: `Attempt ${att.attemptNo}: ${result.finalScore}/${result.totalMarks} (${result.percentage}%) — ${result.passed ? "passed" : "not passed"}` });
  }
  if (publish) {
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "result_published", entity: "result", entityId: attemptId, entityLabel: `${asg.candidateLabel} · ${test.name}`, testId: test._id, summary: `Released (${policy})` });
    if (opts.notify !== false && policy !== "never")
      await notifyCandidates([{ ref: asg.candidate, assignmentId: asg._id, type: "ots_result", title: `Result available: ${test.name}`, body: status === "evaluated" ? `Attempt ${att.attemptNo} has been evaluated.` : "Your objective answers are marked; subjective answers are still being evaluated.", dedupeKey: `ots_result:${attemptId}:${status}` }]);
  } else if (wasPublished && status === "evaluated" && att.status === "pending_evaluation" && opts.notify !== false && policy !== "never") {
    await notifyCandidates([{ ref: asg.candidate, assignmentId: asg._id, type: "ots_result", title: `Final result available: ${test.name}`, body: "All your answers have now been evaluated.", dedupeKey: `ots_result:${attemptId}:final` }]);
  }

  if ((publish || (wasPublished && status === "evaluated")) && (asg.candidate.kind as string) === "lead") {
    try {
      const { sendActivityChatMessage } = await import("@/lib/lead-management/activity-notifier");
      await sendActivityChatMessage({
        leadId: asg.candidate.id,
        activityType: "test_result",
        title: `Test Results Available: ${test.name}`,
        details: `Attempt #${att.attemptNo} score is ${result.finalScore}/${result.totalMarks} (${result.percentage}%). You can review your submitted answers in the Tests & Assessments tab.`,
        actorStaffId: actor.id,
      });
    } catch {
      /* non-blocking */
    }
  }

  await issueCertificateIfEligible(asg._id, actor);
  return updated;
}

/** Grades every item on submit and settles. Items already marked (e.g. manual overrides) are kept. */
export async function gradeAndSettle(attemptId: string, actor: { id: string; email: string | null }): Promise<Attempt> {
  const col = await attempts();
  const att = await col.findOne({ _id: attemptId });
  if (!att) throw new NotFoundError();
  const paper = att.paper.map((item, i) => ({ ...item, outcome: item.outcome ?? gradeItem(item, att.answers[i]) }));
  await col.updateOne({ _id: attemptId }, { $set: { paper } });
  const settled = await settleAttempt(attemptId, actor);
  if (settled.status === "pending_evaluation") {
    const [test, settings] = await Promise.all([getTest(att.testId), getOtsSettings()]);
    const to = Array.from(new Set([...(settings.evaluatorUserIds ?? []), ...(test?.createdBy ? [test.createdBy] : [])]));
    await notifyStaff(to, { type: "ots_evaluation_needed", title: `Answers to evaluate: ${test?.name ?? "test"}`, body: `${settled.result?.pending ?? 0} answer(s) from attempt ${att.attemptNo} need manual marks.`, link: `/evaliq/results/${attemptId}`, dedupeKey: `ots_eval:${attemptId}` });
  }
  return settled;
}

/** Manual marking (EVALUATE_ANSWERS for pending items; OVERRIDE_MARKS to change any already-marked item). */
export async function markItem(
  attemptId: string,
  index: number,
  input: { marks: number; comment: string },
  actor: { id: string; email: string | null },
  allow: { override: boolean }
): Promise<Attempt> {
  const col = await attempts();
  const att = await col.findOne({ _id: attemptId });
  if (!att) throw new NotFoundError();
  if (att.status === "in_progress") throw new OtsInputError("This attempt is still in progress.");
  const item = att.paper[index];
  if (!item) throw new NotFoundError();
  const marks = Number(input.marks);
  if (!Number.isFinite(marks)) throw new OtsInputError("Enter the marks.");
  const min = item.negativeMarks ? -item.negativeMarks : 0;
  if (marks < min || marks > item.marks) throw new OtsInputError(`Marks must be between ${min} and ${item.marks}.`);
  const prev = item.outcome;
  const isOverride = !!prev && prev.status !== "pending";
  if (isOverride && !allow.override) throw new OtsInputError("Changing marks that are already set needs the Override Marks permission.");
  const answered = !!att.answers[index]?.response;
  const status: Outcome["status"] = !answered && marks === 0 ? "unanswered" : marks >= item.marks ? "correct" : marks <= 0 ? "incorrect" : "partial";
  const outcome: Outcome = { status, awarded: round2(marks), auto: false, evaluatedBy: actor.id, evaluatedAt: new Date(), comment: String(input.comment ?? "").trim().slice(0, 2000), overridden: isOverride };
  await col.updateOne({ _id: attemptId }, { $set: { [`paper.${index}.outcome`]: outcome, updatedAt: new Date() } });
  const test = await getTest(att.testId);
  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: isOverride ? "marks_modified" : "evaluate",
    entity: "attempt",
    entityId: attemptId,
    entityLabel: `${item.code} · attempt ${att.attemptNo}`,
    testId: att.testId,
    summary: isOverride ? `${test?.name ?? ""} Q${index + 1}: ${prev?.awarded ?? "—"} → ${round2(marks)}${outcome.comment ? ` (${outcome.comment.slice(0, 80)})` : ""}` : `${test?.name ?? ""} Q${index + 1}: ${round2(marks)}/${item.marks}`,
  });
  return settleAttempt(attemptId, actor);
}

/** Releases held results (policy "manual" or early release) for the given attempts. */
export async function publishResults(attemptIds: string[], actor: { id: string; email: string | null }): Promise<{ published: number; skipped: number }> {
  const col = await attempts();
  const list = await col.find({ _id: { $in: attemptIds } }).toArray();
  let published = 0;
  let skipped = 0;
  for (const att of list) {
    if (att.status !== "evaluated" || att.resultPublishedAt) {
      skipped += 1;
      continue;
    }
    const asg = await (await assignmentsCol()).findOne({ _id: att.assignmentId });
    const test = await getTest(att.testId);
    if (!asg || !test) {
      skipped += 1;
      continue;
    }
    if (effectiveRelease(asg, test) === "never") {
      skipped += 1;
      continue;
    }
    await col.updateOne({ _id: att._id }, { $set: { resultPublishedAt: new Date() } });
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "result_published", entity: "result", entityId: att._id, entityLabel: `${asg.candidateLabel} · ${test.name}`, testId: test._id, summary: "Published by staff" });
    await notifyCandidates([{ ref: asg.candidate, assignmentId: asg._id, type: "ots_result", title: `Result available: ${test.name}`, body: `Attempt ${att.attemptNo} result has been published.`, dedupeKey: `ots_result:${att._id}:published` }]);
    await settleAttempt(att._id, actor, { notify: false });
    published += 1;
  }
  return { published, skipped };
}

/** Sweep: releases "after test closes" results once their test has closed. */
export async function releaseAfterClose(): Promise<number> {
  const db = await getDb();
  const col = await attempts();
  const held = await col.find({ status: "evaluated", resultPublishedAt: null }, { projection: { _id: 1, testId: 1, assignmentId: 1 } }).limit(2000).toArray();
  let n = 0;
  const tests = new Map<string, Test | null>();
  for (const h of held) {
    if (!tests.has(h.testId)) tests.set(h.testId, await getTest(h.testId));
    const t = tests.get(h.testId);
    if (!t || effectiveTestStatus(t) !== "closed") continue;
    const asg = await db.collection<Assignment>(COLLECTIONS.assignments).findOne({ _id: h.assignmentId });
    if (!asg || effectiveRelease(asg, t) !== "after_close") continue;
    await settleAttempt(h._id, { id: SYSTEM, email: null });
    n += 1;
  }
  return n;
}
