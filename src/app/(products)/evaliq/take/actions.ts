"use server";

import { resolveTaker, clientInfo, type Channel, type Taker } from "@/lib/products/evaliq/taker";
import {
  AttemptClosedError,
  SessionConflictError,
  loadExamState,
  navigate,
  nextSection,
  reportEvent,
  saveAnswer,
  startOrResume,
  submitAttempt,
  takeOver,
  type ExamState,
} from "@/lib/products/evaliq/attempts";
import { mapError } from "@/lib/products/evaliq/run";

/**
 * Test-taking actions for EVERY candidate type — employees and staff (OTS
 * session) and applicants / students (External Portal session) use the same
 * engine; `channel` only picks which session cookie identifies them. The
 * attempt / assignment is always checked to belong to that identity.
 */

type Fail = { ok: false; error: string; code?: "SESSION" | "CLOSED" | "AUTH"; attemptId?: string };

async function take<T extends object>(channel: Channel, fn: (t: Taker) => Promise<T>): Promise<({ ok: true } & T) | Fail> {
  if (channel !== "staff" && channel !== "portal") return { ok: false, error: "Unknown channel.", code: "AUTH" };
  const taker = await resolveTaker(channel);
  if (!taker) return { ok: false, error: "Your session has expired — please sign in again.", code: "AUTH" };
  try {
    return { ok: true, ...(await fn(taker)) };
  } catch (err) {
    if (err instanceof SessionConflictError) return { ok: false, error: err.message, code: "SESSION" };
    if (err instanceof AttemptClosedError) return { ok: false, error: err.message, code: "CLOSED", attemptId: err.attemptId };
    return mapError(err, "ots take");
  }
}

export async function startTestAction(channel: Channel, assignmentId: string) {
  return take(channel, async (t) => startOrResume(t, String(assignmentId), await clientInfo()));
}

export async function examStateAction(channel: Channel, attemptId: string): Promise<({ ok: true } & { state: ExamState }) | Fail> {
  return take(channel, async (t) => ({ state: await loadExamState(t, String(attemptId)) }));
}

export async function saveAnswerAction(channel: Channel, attemptId: string, sessionId: string, input: { index: number; response: unknown; flagged?: boolean; timeMs?: number; clear?: boolean }) {
  return take(channel, async (t) => saveAnswer(t, String(attemptId), String(sessionId), input, await clientInfo()));
}

export async function navigateAction(channel: Channel, attemptId: string, sessionId: string, input: { from: number; to: number; timeMs?: number }) {
  return take(channel, (t) => navigate(t, String(attemptId), String(sessionId), input));
}

export async function nextSectionAction(channel: Channel, attemptId: string, sessionId: string) {
  return take(channel, (t) => nextSection(t, String(attemptId), String(sessionId)));
}

export async function reportEventAction(channel: Channel, attemptId: string, sessionId: string, type: string, detail: string) {
  return take(channel, (t) => reportEvent(t, String(attemptId), String(sessionId), String(type), String(detail ?? "").slice(0, 200)));
}

export async function takeOverAction(channel: Channel, attemptId: string) {
  return take(channel, (t) => takeOver(t, String(attemptId)));
}

export async function submitTestAction(channel: Channel, attemptId: string, sessionId: string, timedOut: boolean) {
  return take(channel, (t) => submitAttempt(t, String(attemptId), String(sessionId), timedOut === true));
}
