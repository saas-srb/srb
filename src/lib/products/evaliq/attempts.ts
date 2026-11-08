import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, newId, notDeleted } from "@/lib/products/evaliq/db";
import { OtsInputError, NotFoundError, ForbiddenError } from "@/lib/products/evaliq/viewer";
import { QUESTION_TYPES, type PublicDefinition, type QuestionResponse } from "@/lib/products/evaliq/question-types";
import { SECURITY_EVENT_TYPES, VIOLATION_EVENTS, type SecurityEventType, type SubmitReason } from "@/lib/products/evaliq/constants";
import { attemptLimit, availability, effectiveDetail, effectiveRelease, type Assignment } from "@/lib/products/evaliq/assignments";
import { getTest, type Test } from "@/lib/products/evaliq/tests";
import { buildPaper } from "@/lib/products/evaliq/paper";
import { gradeAndSettle } from "@/lib/products/evaliq/evaluation";
import { recordAudit } from "@/lib/products/evaliq/audit";
import { getOtsSettings } from "@/lib/products/evaliq/settings";
import { notifyCandidates } from "@/lib/products/evaliq/notifications";
import type { Taker } from "@/lib/products/evaliq/taker";
import type { Answer, Attempt, SectionState } from "@/lib/products/evaliq/attempt-types";
import type { QuestionMedia } from "@/lib/products/evaliq/questions";

/**
 * The single test-taking engine behind every candidate type. Timing is
 * server-authoritative: the deadline is fixed on the attempt when it starts,
 * every save is checked against it (plus a small network grace), and an
 * expired attempt is finalised as TIMEOUT_AUTO_SUBMISSION on the next read
 * or by the cron sweep — so a closed tab, a reload or a tampered client
 * clock cannot extend the time. Submission is idempotent (a conditional
 * status transition), so a double click or a race between the client timer
 * and the sweep can never submit twice.
 *
 * These controls make cheating harder and visible; they do NOT make a
 * browser-based exam cheat-proof.
 */

const MAX_EVENTS = 300;
const MAX_AUDITED_EVENTS = 100;

async function attemptsCol() {
  const db = await getDb();
  return db.collection<Attempt>(COLLECTIONS.attempts);
}
async function assignmentsCol() {
  const db = await getDb();
  return db.collection<Assignment>(COLLECTIONS.assignments);
}

function assertOwner(taker: Taker, candidateKey: string) {
  if (!taker.keys.includes(candidateKey)) throw new ForbiddenError();
}

export class SessionConflictError extends Error {
  constructor() {
    super("This test is open in another window or device.");
  }
}
export class AttemptClosedError extends Error {
  constructor(public attemptId: string) {
    super("This attempt has been submitted.");
  }
}

// ── start / resume ─────────────────────────────────────────────────────────

export interface StartCheck {
  canStart: boolean;
  canResume: boolean;
  reason: string | null;
  attemptsUsed: number;
  attemptsAllowed: number;
  opensAt: Date | null;
  late: boolean;
}

/** Whether this candidate can start (or resume) this assignment right now, and why not. */
export async function startCheck(a: Assignment, t: Test): Promise<StartCheck> {
  const allowed = attemptLimit(a, t);
  const base = { attemptsUsed: a.attemptsUsed, attemptsAllowed: allowed, opensAt: null as Date | null, late: false };
  if (a.activeAttemptId) return { ...base, canStart: false, canResume: true, reason: null };
  if (a.status === "cancelled") return { ...base, canStart: false, canResume: false, reason: "This assignment was cancelled." };
  const av = availability(a, t);
  base.opensAt = av.opensAt;
  base.late = av.late;
  if (!av.open) return { ...base, canStart: false, canResume: false, reason: av.reason };
  if (a.status === "expired" && !a.allowLateStart) return { ...base, canStart: false, canResume: false, reason: "This assignment has expired." };
  if (a.attemptsUsed >= allowed) return { ...base, canStart: false, canResume: false, reason: a.attemptsUsed === 0 ? "No attempts allowed." : "You have used all your attempts." };
  if (a.attemptsUsed > 0) {
    if (!t.config.allowRetake && a.extraAttempts === 0) return { ...base, canStart: false, canResume: false, reason: "Retakes are not allowed for this test." };
    const col = await attemptsCol();
    const last = await col.find({ assignmentId: a._id }, { projection: { status: 1, result: 1 } }).sort({ attemptNo: -1 }).limit(1).next();
    if (last?.status === "pending_evaluation") return { ...base, canStart: false, canResume: false, reason: "Your last attempt is still being evaluated." };
    if (t.config.retakeOnlyIfFailed && last?.result?.passed && a.extraAttempts === 0) return { ...base, canStart: false, canResume: false, reason: "You have already passed this test." };
  }
  return { ...base, canStart: true, canResume: false, reason: null };
}

export async function startOrResume(taker: Taker, assignmentId: string, client: { ip: string | null; userAgent: string | null }): Promise<{ attemptId: string; sessionId: string; resumed: boolean }> {
  const aCol = await assignmentsCol();
  const a = await aCol.findOne({ _id: assignmentId, ...notDeleted });
  if (!a) throw new NotFoundError();
  assertOwner(taker, a.candidateKey);
  const t = await getTest(a.testId);
  if (!t) throw new NotFoundError();

  if (a.activeAttemptId) {
    const cur = await (await attemptsCol()).findOne({ _id: a.activeAttemptId });
    if (cur && cur.status === "in_progress") {
      const fresh = await finalizeIfExpired(cur);
      if (fresh.status === "in_progress") {
        // Resuming from this call hands out a NEW session token (takeover), recorded as such.
        const sessionId = randomBytes(16).toString("hex");
        await (await attemptsCol()).updateOne({ _id: cur._id }, { $set: { sessionId, updatedAt: new Date() }, $push: { events: { $each: [{ type: "session_takeover", at: new Date(), detail: "Resumed from the test page" }], $slice: -MAX_EVENTS } } });
        await recordAudit({ actorId: taker.actorId, actorEmail: taker.actorEmail, action: "resume", entity: "attempt", entityId: cur._id, entityLabel: `${a.candidateLabel} · ${t.name}`, testId: t._id, summary: `Attempt ${cur.attemptNo} resumed` });
        return { attemptId: cur._id, sessionId, resumed: true };
      }
    }
  }

  const check = await startCheck({ ...a, activeAttemptId: null }, t);
  if (!check.canStart) throw new OtsInputError(check.reason ?? "This test cannot be started now.");

  // Claim the attempt slot atomically so two tabs can't both start.
  const attemptId = newId();
  const claimed = await aCol.findOneAndUpdate(
    { _id: a._id, activeAttemptId: null, attemptsUsed: a.attemptsUsed, status: { $ne: "cancelled" } },
    { $set: { activeAttemptId: attemptId, status: "in_progress", startedAt: a.startedAt ?? new Date(), updatedAt: new Date() }, $inc: { attemptsUsed: 1 } },
    { returnDocument: "after" }
  );
  if (!claimed) throw new OtsInputError("This test was just started in another window — reload the page.");

  const seed = randomInt(1, 2 ** 31 - 1);
  let paper;
  try {
    paper = await buildPaper(t, seed);
  } catch (err) {
    await aCol.updateOne({ _id: a._id, activeAttemptId: attemptId }, { $set: { activeAttemptId: null, status: a.status }, $inc: { attemptsUsed: -1 } });
    throw err;
  }

  const now = new Date();
  const { deadlineAt, softDeadlineAt } = deadlines(t, now);
  const sectionMode = t.sections.some((s) => s.timeLimitMinutes) && !t.config.questionsPerAttempt ? "sequential" : "free";
  const present = new Set(paper.map((p) => p.section));
  const sections: SectionState[] = t.sections.map((s, i) => ({ title: s.title, timeLimitSec: s.timeLimitMinutes ? s.timeLimitMinutes * 60 : null, startedAt: null, deadlineAt: null, locked: !present.has(i) }));
  const first = sections.findIndex((s) => !s.locked);
  if (sectionMode === "sequential" && first >= 0) startSection(sections, first, now, deadlineAt);
  const sessionId = randomBytes(16).toString("hex");
  const att: Attempt = {
    _id: attemptId,
    assignmentId: a._id,
    testId: t._id,
    candidate: a.candidate,
    candidateKey: a.candidateKey,
    attemptNo: a.attemptsUsed + 1,
    status: "in_progress",
    startedAt: now,
    deadlineAt,
    softDeadlineAt,
    submittedAt: null,
    submitReason: null,
    sessionId,
    seed,
    config: t.config,
    testName: t.name,
    sectionMode,
    sections,
    currentSection: Math.max(first, 0),
    cursor: sectionMode === "sequential" ? paper.findIndex((p) => p.section === Math.max(first, 0)) : 0,
    paper,
    answers: paper.map(() => ({ response: null, flagged: false, visited: false, timeMs: 0, savedAt: null })),
    events: [],
    violations: 0,
    client: { startIp: client.ip, startUserAgent: client.userAgent, lastIp: client.ip, channel: taker.channel },
    result: null,
    evaluatedAt: null,
    resultPublishedAt: null,
    takenBy: taker.actorId,
    createdAt: now,
    updatedAt: now,
  };
  if (att.answers[att.cursor]) att.answers[att.cursor].visited = true;
  try {
    await (await attemptsCol()).insertOne(att);
  } catch (err) {
    await aCol.updateOne({ _id: a._id, activeAttemptId: attemptId }, { $set: { activeAttemptId: null, status: a.status }, $inc: { attemptsUsed: -1 } });
    throw err;
  }
  await recordAudit({
    actorId: taker.actorId,
    actorEmail: taker.actorEmail,
    action: "start",
    entity: "attempt",
    entityId: attemptId,
    entityLabel: `${a.candidateLabel} · ${t.name}`,
    testId: t._id,
    summary: `Attempt ${att.attemptNo} started${check.late ? " (late start)" : ""}`,
    metadata: { ip: client.ip, channel: taker.channel, questions: paper.length },
  });
  return { attemptId, sessionId, resumed: false };
}

function deadlines(t: Test, now: Date): { deadlineAt: Date | null; softDeadlineAt: Date | null } {
  const byDuration = t.config.durationMinutes ? new Date(now.getTime() + t.config.durationMinutes * 60_000) : null;
  // The test's own end date is always a hard stop.
  const hardEnd = t.config.endAt;
  if (t.config.autoSubmit && byDuration) {
    const d = hardEnd && hardEnd < byDuration ? hardEnd : byDuration;
    return { deadlineAt: d, softDeadlineAt: null };
  }
  return { deadlineAt: hardEnd, softDeadlineAt: byDuration };
}

function startSection(sections: SectionState[], i: number, now: Date, overall: Date | null) {
  const s = sections[i];
  s.startedAt = now;
  if (s.timeLimitSec) {
    const d = new Date(now.getTime() + s.timeLimitSec * 1000);
    s.deadlineAt = overall && overall < d ? overall : d;
  } else s.deadlineAt = overall;
}

// ── expiry / finalisation ──────────────────────────────────────────────────

/** Submits an attempt (idempotent). Returns false when it had already been submitted. */
export async function finalizeAttempt(attemptId: string, reason: SubmitReason, actor: { id: string; email: string | null }): Promise<boolean> {
  const col = await attemptsCol();
  const now = new Date();
  const res = await col.findOneAndUpdate({ _id: attemptId, status: "in_progress" }, { $set: { status: "pending_evaluation", submittedAt: now, submitReason: reason, updatedAt: now } }, { returnDocument: "after" });
  if (!res) return false;
  await (await assignmentsCol()).updateOne({ _id: res.assignmentId, activeAttemptId: attemptId }, { $set: { activeAttemptId: null, updatedAt: now } });
  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: reason === "MANUAL" ? "submit" : "auto_submit",
    entity: "attempt",
    entityId: attemptId,
    entityLabel: `${res.testName} · attempt ${res.attemptNo}`,
    testId: res.testId,
    summary: reason,
    metadata: { answered: res.answers.filter((x) => x.response).length, total: res.paper.length, violations: res.violations },
  });
  await gradeAndSettle(attemptId, actor);
  await notifyCandidates([
    {
      ref: res.candidate,
      assignmentId: res.assignmentId,
      type: "ots_completed",
      title: `Test submitted: ${res.testName}`,
      body: reason === "MANUAL" ? `Attempt ${res.attemptNo} was submitted.` : `Attempt ${res.attemptNo} was submitted automatically (${reason === "TIMEOUT_AUTO_SUBMISSION" ? "time ran out" : reason === "SECURITY_AUTO_SUBMISSION" ? "security violations" : "the test window closed"}).`,
      dedupeKey: `ots_completed:${attemptId}`,
    },
  ]);
  return true;
}

/**
 * Applies the passage of time to an in-progress attempt: locks timed-out
 * sections (sequential mode) and finalises the attempt when its hard deadline
 * (+ grace) has passed or its test window / due date has closed.
 */
export async function finalizeIfExpired(att: Attempt, now = new Date()): Promise<Attempt> {
  if (att.status !== "in_progress") return att;
  const { graceSeconds } = await getOtsSettings();
  const grace = graceSeconds * 1000;
  const system = { id: "system", email: null };
  if (att.deadlineAt && now.getTime() > att.deadlineAt.getTime() + grace) {
    const t = await getTest(att.testId);
    const reason: SubmitReason = t?.config.endAt && att.deadlineAt.getTime() === t.config.endAt.getTime() ? "DEADLINE_AUTO_SUBMISSION" : "TIMEOUT_AUTO_SUBMISSION";
    await finalizeAttempt(att._id, reason, system);
    return (await (await attemptsCol()).findOne({ _id: att._id }))!;
  }
  if (att.sectionMode === "sequential") {
    const sections = att.sections.map((s) => ({ ...s }));
    let cur = att.currentSection;
    let changed = false;
    while (sections[cur] && sections[cur].deadlineAt && now.getTime() > sections[cur].deadlineAt!.getTime() + grace) {
      sections[cur].locked = true;
      changed = true;
      const next = sections.findIndex((s, i) => i > cur && !s.locked);
      if (next < 0) {
        await (await attemptsCol()).updateOne({ _id: att._id }, { $set: { sections } });
        await finalizeAttempt(att._id, "TIMEOUT_AUTO_SUBMISSION", system);
        return (await (await attemptsCol()).findOne({ _id: att._id }))!;
      }
      startSection(sections, next, now, att.deadlineAt);
      cur = next;
    }
    if (changed) {
      const cursor = att.paper.findIndex((p) => p.section === cur);
      await (await attemptsCol()).updateOne({ _id: att._id, status: "in_progress" }, { $set: { sections, currentSection: cur, cursor, updatedAt: now } });
      return { ...att, sections, currentSection: cur, cursor };
    }
  }
  return att;
}

/** Cron sweep: finalise every in-progress attempt that has run out of time (tab closed, device lost…). */
export async function sweepExpiredAttempts(now = new Date()): Promise<number> {
  const col = await attemptsCol();
  const { graceSeconds } = await getOtsSettings();
  const cutoff = new Date(now.getTime() - graceSeconds * 1000);
  const due = await col.find({ status: "in_progress", $or: [{ deadlineAt: { $ne: null, $lt: cutoff } }, { sectionMode: "sequential" }] }).limit(500).toArray();
  let n = 0;
  for (const a of due) {
    const after = await finalizeIfExpired(a, now);
    if (after.status !== "in_progress") n += 1;
  }
  return n;
}

// ── candidate state ────────────────────────────────────────────────────────

export interface ExamItem {
  index: number;
  section: number;
  /** false for questions in sections that are locked or not reached yet (sequential mode). */
  available: boolean;
  type?: string;
  typeLabel?: string;
  prompt?: string;
  media?: QuestionMedia | null;
  marks?: number;
  negativeMarks?: number;
  view?: PublicDefinition;
  response?: QuestionResponse | null;
  flagged: boolean;
  visited: boolean;
  answered: boolean;
}

export interface ExamState {
  attemptId: string;
  assignmentId: string;
  testName: string;
  attemptNo: number;
  status: Attempt["status"];
  instructions: string;
  serverNow: string;
  deadlineAt: string | null;
  softDeadlineAt: string | null;
  sectionMode: "free" | "sequential";
  sections: { title: string; timeLimitSec: number | null; deadlineAt: string | null; locked: boolean; count: number }[];
  currentSection: number;
  cursor: number;
  allowBack: boolean;
  allowNavigation: boolean;
  allowReview: boolean;
  security: Test["config"]["security"];
  violations: number;
  singleSession: boolean;
  items: ExamItem[];
}

export async function loadExamState(taker: Taker, attemptId: string): Promise<ExamState> {
  const col = await attemptsCol();
  let att = await col.findOne({ _id: attemptId });
  if (!att) throw new NotFoundError();
  assertOwner(taker, att.candidateKey);
  att = await finalizeIfExpired(att);
  if (att.status !== "in_progress") throw new AttemptClosedError(att._id);
  const a = await (await assignmentsCol()).findOne({ _id: att.assignmentId });
  const test = await getTest(att.testId);
  return toExamState(att, [a?.instructions, test?.instructions].filter(Boolean).join("\n\n"));
}

function toExamState(att: Attempt, instructions: string): ExamState {
  const sequential = att.sectionMode === "sequential";
  return {
    attemptId: att._id,
    assignmentId: att.assignmentId,
    testName: att.testName,
    attemptNo: att.attemptNo,
    status: att.status,
    instructions,
    serverNow: new Date().toISOString(),
    deadlineAt: att.deadlineAt?.toISOString() ?? null,
    softDeadlineAt: att.softDeadlineAt?.toISOString() ?? null,
    sectionMode: att.sectionMode,
    sections: att.sections.map((s, i) => ({ title: s.title, timeLimitSec: s.timeLimitSec, deadlineAt: s.deadlineAt?.toISOString() ?? null, locked: s.locked, count: att.paper.filter((p) => p.section === i).length })),
    currentSection: att.currentSection,
    cursor: att.cursor,
    allowBack: att.config.allowBack,
    allowNavigation: att.config.allowNavigation,
    allowReview: att.config.allowReview,
    security: att.config.security,
    violations: att.violations,
    singleSession: att.config.security.singleSession,
    items: att.paper.map((p, i) => {
      const ans = att.answers[i];
      const available = !sequential || p.section === att.currentSection;
      const base = { index: i, section: p.section, available, flagged: ans.flagged, visited: ans.visited, answered: !!ans.response };
      if (!available) return base;
      return {
        ...base,
        type: p.type,
        typeLabel: QUESTION_TYPES[p.type].label,
        prompt: p.prompt,
        media: p.media,
        marks: p.marks,
        negativeMarks: p.negativeMarks,
        view: p.view,
        response: ans.response,
      };
    }),
  };
}

/** Loads an in-progress attempt for a write from THIS session, applying expiry first. */
async function forWrite(taker: Taker, attemptId: string, sessionId: string): Promise<Attempt> {
  const col = await attemptsCol();
  let att = await col.findOne({ _id: attemptId });
  if (!att) throw new NotFoundError();
  assertOwner(taker, att.candidateKey);
  att = await finalizeIfExpired(att);
  if (att.status !== "in_progress") throw new AttemptClosedError(att._id);
  if (att.config.security.singleSession && att.sessionId !== sessionId) {
    await pushEvent(att, "multiple_session", "A second window/device tried to write to this attempt", taker);
    throw new SessionConflictError();
  }
  return att;
}

function checkIndex(att: Attempt, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= att.paper.length) throw new OtsInputError("Unknown question.");
  if (att.sectionMode === "sequential" && att.paper[index].section !== att.currentSection) throw new OtsInputError("That section is not open.");
}

export async function saveAnswer(
  taker: Taker,
  attemptId: string,
  sessionId: string,
  input: { index: number; response: unknown; flagged?: boolean; timeMs?: number; clear?: boolean },
  client: { ip: string | null }
): Promise<{ ok: true; answered: boolean }> {
  const att = await forWrite(taker, attemptId, sessionId);
  checkIndex(att, input.index);
  if (!att.config.allowBack && input.index < att.cursor) throw new OtsInputError("Going back to earlier questions is not allowed in this test.");
  const item = att.paper[input.index];
  const response = input.clear ? null : QUESTION_TYPES[item.type].normalizeResponse(input.response, item.definition);
  const prev = att.answers[input.index];
  const answer: Answer = {
    response,
    flagged: typeof input.flagged === "boolean" ? input.flagged : prev.flagged,
    visited: true,
    timeMs: prev.timeMs + clampDelta(input.timeMs),
    savedAt: new Date(),
  };
  const set: Record<string, unknown> = { [`answers.${input.index}`]: answer, updatedAt: new Date() };
  if (client.ip && client.ip !== att.client.lastIp) set["client.lastIp"] = client.ip;
  await (await attemptsCol()).updateOne({ _id: att._id, status: "in_progress" }, { $set: set });
  if (client.ip && att.client.lastIp && client.ip !== att.client.lastIp) await pushEvent(att, "ip_changed", `${att.client.lastIp} → ${client.ip}`, taker);
  return { ok: true, answered: !!response };
}

function clampDelta(ms: unknown): number {
  const n = Math.round(Number(ms) || 0);
  return Math.min(Math.max(n, 0), 15 * 60_000);
}

/** Moves the candidate to question `index` (enforces forward-only / no-jump rules) and books time spent on `from`. */
export async function navigate(taker: Taker, attemptId: string, sessionId: string, input: { from: number; to: number; timeMs?: number }): Promise<{ ok: true }> {
  const att = await forWrite(taker, attemptId, sessionId);
  checkIndex(att, input.to);
  if (!att.config.allowBack && input.to < att.cursor) throw new OtsInputError("Going back is not allowed in this test.");
  if (!att.config.allowNavigation && input.to > att.cursor + 1) throw new OtsInputError("Answer the questions in order.");
  const set: Record<string, unknown> = { [`answers.${input.to}.visited`]: true, cursor: Math.max(att.cursor, input.to), updatedAt: new Date() };
  const inc: Record<string, number> = {};
  if (Number.isInteger(input.from) && input.from >= 0 && input.from < att.paper.length) inc[`answers.${input.from}.timeMs`] = clampDelta(input.timeMs);
  await (await attemptsCol()).updateOne({ _id: att._id, status: "in_progress" }, { $set: set, ...(Object.keys(inc).length ? { $inc: inc } : {}) });
  return { ok: true };
}

/** Sequential sections: finish the current section early and move on. It locks for good. */
export async function nextSection(taker: Taker, attemptId: string, sessionId: string): Promise<{ ok: true; finished: boolean }> {
  const att = await forWrite(taker, attemptId, sessionId);
  if (att.sectionMode !== "sequential") throw new OtsInputError("This test has no timed sections.");
  const sections = att.sections.map((s) => ({ ...s }));
  sections[att.currentSection].locked = true;
  const next = sections.findIndex((s, i) => i > att.currentSection && !s.locked);
  if (next < 0) {
    await (await attemptsCol()).updateOne({ _id: att._id }, { $set: { sections } });
    await finalizeAttempt(att._id, "MANUAL", { id: taker.actorId, email: taker.actorEmail });
    return { ok: true, finished: true };
  }
  const now = new Date();
  startSection(sections, next, now, att.deadlineAt);
  const cursor = att.paper.findIndex((p) => p.section === next);
  await (await attemptsCol()).updateOne({ _id: att._id, status: "in_progress" }, { $set: { sections, currentSection: next, cursor, [`answers.${cursor}.visited`]: true, updatedAt: now } });
  return { ok: true, finished: false };
}

async function pushEvent(att: Attempt, type: SecurityEventType, detail: string, taker: Taker): Promise<number> {
  const isViolation = VIOLATION_EVENTS.includes(type);
  const res = await (await attemptsCol()).findOneAndUpdate(
    { _id: att._id },
    { $push: { events: { $each: [{ type, at: new Date(), detail: detail.slice(0, 200) }], $slice: -MAX_EVENTS } }, ...(isViolation ? { $inc: { violations: 1 } } : {}) },
    { returnDocument: "after", projection: { violations: 1, events: 1 } }
  );
  if ((res?.events.length ?? 0) <= MAX_AUDITED_EVENTS) {
    await recordAudit({ actorId: taker.actorId, actorEmail: taker.actorEmail, action: "security_event", entity: "attempt", entityId: att._id, entityLabel: `${att.testName} · attempt ${att.attemptNo}`, testId: att.testId, summary: `${SECURITY_EVENT_TYPES[type]}${detail ? ` — ${detail.slice(0, 120)}` : ""}` });
  }
  return res?.violations ?? att.violations;
}

/** Client-reported proctoring events (tab switch, copy attempt, full-screen exit…). May auto-submit. */
export async function reportEvent(taker: Taker, attemptId: string, sessionId: string, type: string, detail: string): Promise<{ ok: true; violations: number; autoSubmitted: boolean }> {
  if (!(type in SECURITY_EVENT_TYPES) || type === "multiple_session" || type === "session_takeover" || type === "ip_changed") throw new OtsInputError("Unknown event.");
  const att = await forWrite(taker, attemptId, sessionId);
  const violations = await pushEvent(att, type as SecurityEventType, String(detail ?? ""), taker);
  const max = att.config.security.maxViolations;
  if (max && violations >= max) {
    await finalizeAttempt(att._id, "SECURITY_AUTO_SUBMISSION", { id: taker.actorId, email: taker.actorEmail });
    return { ok: true, violations, autoSubmitted: true };
  }
  return { ok: true, violations, autoSubmitted: false };
}

/** Continue this attempt in the current window; the old window's next write is rejected and recorded. */
export async function takeOver(taker: Taker, attemptId: string): Promise<{ sessionId: string }> {
  const col = await attemptsCol();
  let att = await col.findOne({ _id: attemptId });
  if (!att) throw new NotFoundError();
  assertOwner(taker, att.candidateKey);
  att = await finalizeIfExpired(att);
  if (att.status !== "in_progress") throw new AttemptClosedError(att._id);
  const sessionId = randomBytes(16).toString("hex");
  await col.updateOne({ _id: att._id, status: "in_progress" }, { $set: { sessionId, updatedAt: new Date() } });
  await pushEvent(att, "session_takeover", "Continued in a new window", taker);
  return { sessionId };
}

export async function submitAttempt(taker: Taker, attemptId: string, sessionId: string, clientSaysTimeout: boolean): Promise<{ submitted: boolean }> {
  const col = await attemptsCol();
  const att = await col.findOne({ _id: attemptId });
  if (!att) throw new NotFoundError();
  assertOwner(taker, att.candidateKey);
  if (att.status !== "in_progress") return { submitted: false }; // already submitted — duplicate submit is a no-op
  if (att.config.security.singleSession && att.sessionId !== sessionId) {
    await pushEvent(att, "multiple_session", "A second window tried to submit", taker);
    throw new SessionConflictError();
  }
  // The server decides the reason: a client timer can say "timeout" only if the deadline really has passed (±5s clock slack).
  const timedOut = clientSaysTimeout && att.deadlineAt && Date.now() >= att.deadlineAt.getTime() - 5000;
  const submitted = await finalizeAttempt(att._id, timedOut ? "TIMEOUT_AUTO_SUBMISSION" : "MANUAL", { id: taker.actorId, email: taker.actorEmail });
  return { submitted };
}

// ── candidate result view ──────────────────────────────────────────────────

export interface ResultItemView {
  index: number;
  section: number;
  code: string;
  type: string;
  typeLabel: string;
  prompt: string;
  media: QuestionMedia | null;
  view: PublicDefinition;
  response: QuestionResponse | null;
  responseText: string;
  marks: number;
  awarded: number | null;
  status: string;
  comment: string;
  correctAnswer: string | null;
  explanation: string | null;
  timeSec: number;
}

export interface ResultView {
  attemptId: string;
  assignmentId: string;
  testId: string;
  testName: string;
  attemptNo: number;
  status: Attempt["status"];
  startedAt: string;
  submittedAt: string | null;
  submitReason: SubmitReason | null;
  visible: boolean;
  hiddenReason: string | null;
  result: Attempt["result"];
  sections: string[];
  detail: "score" | "responses" | "correct";
  showExplanations: boolean;
  items: ResultItemView[];
}

/** What a result page may show. Staff (`asStaff`) always see everything; candidates see what the test's visibility allows. */
export function buildResultView(att: Attempt, a: Assignment, t: Test | null, asStaff: boolean): ResultView {
  const policy = t ? effectiveRelease(a, t) : "manual";
  const visible = asStaff || (!!att.resultPublishedAt && policy !== "never");
  const detail = asStaff ? "correct" : t ? effectiveDetail(a, t) : "score";
  const showExplanations = asStaff || (detail !== "score" && att.config.showExplanations && att.status === "evaluated");
  const hiddenReason = visible
    ? null
    : policy === "never"
      ? "Results for this test are shared with the organisers only."
      : policy === "after_close"
        ? "Results are released after the test closes."
        : policy === "after_evaluation"
          ? "Results are released once every answer has been evaluated."
          : "Results will be published by the organisers.";
  const items: ResultItemView[] = visible
    ? att.paper.map((p, i) => {
        const ans = att.answers[i];
        const spec = QUESTION_TYPES[p.type];
        return {
          index: i,
          section: p.section,
          code: p.code,
          type: p.type,
          typeLabel: spec.label,
          prompt: p.prompt,
          media: p.media,
          view: p.view,
          response: ans?.response ?? null,
          responseText: spec.describeResponse(p.definition, ans?.response ?? null),
          marks: p.marks,
          awarded: p.outcome?.awarded ?? null,
          status: p.outcome?.status ?? "pending",
          comment: p.outcome?.comment ?? "",
          correctAnswer: spec.correctAnswer(p.definition),
          explanation: (showExplanations || asStaff || att.status === "evaluated") && p.explanation ? p.explanation : null,
          timeSec: ans ? Math.round(ans.timeMs / 1000) : 0,
        };
      })
    : [];
  return {
    attemptId: att._id,
    assignmentId: att.assignmentId,
    testId: att.testId,
    testName: att.testName,
    attemptNo: att.attemptNo,
    status: att.status,
    startedAt: att.startedAt.toISOString(),
    submittedAt: att.submittedAt?.toISOString() ?? null,
    submitReason: att.submitReason,
    visible,
    hiddenReason,
    result: visible ? att.result : null,
    sections: att.sections.map((s) => s.title),
    detail,
    showExplanations,
    items,
  };
}

export async function candidateResult(taker: Taker, attemptId: string): Promise<ResultView> {
  const att = await (await attemptsCol()).findOne({ _id: attemptId });
  if (!att) throw new NotFoundError();
  assertOwner(taker, att.candidateKey);
  if (att.status === "in_progress") throw new OtsInputError("This attempt is still in progress.");
  const a = await (await assignmentsCol()).findOne({ _id: att.assignmentId });
  if (!a) throw new NotFoundError();
  return buildResultView(att, a, await getTest(att.testId), false);
}

export async function getAttempt(id: string): Promise<Attempt | null> {
  return (await attemptsCol()).findOne({ _id: id });
}

export async function attemptsForAssignments(ids: string[]): Promise<Attempt[]> {
  if (ids.length === 0) return [];
  return (await attemptsCol()).find({ assignmentId: { $in: ids } }, { projection: { paper: 0, answers: 0, events: 0 } }).sort({ attemptNo: 1 }).toArray();
}
