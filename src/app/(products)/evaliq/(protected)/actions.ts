"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentOtsUser } from "@/lib/ots-auth";
import { signOutThisDevice } from "@/lib/security/sessions";
import { run } from "@/lib/products/evaliq/run";
import { can, OtsInputError, type OtsViewer } from "@/lib/products/evaliq/viewer";
import { recordAudit, diffSummary } from "@/lib/products/evaliq/audit";
import { markOtsNotificationsRead, notifyCandidates } from "@/lib/products/evaliq/notifications";
import { createCategory, deleteCategory, updateCategory, type CategoryKind } from "@/lib/products/evaliq/categories";
import { createQuestion, deleteQuestion, duplicateQuestion, listQuestions, parseQuestionInput, setQuestionStatus, updateQuestion } from "@/lib/products/evaliq/questions";
import {
  createTest,
  deleteTest,
  duplicateTest,
  parseSections,
  parseTestConfig,
  parseTestInfo,
  publishTest,
  requireTest,
  setTestStatus,
  summarizeTest,
  updateTest,
  type TestSummary,
} from "@/lib/products/evaliq/tests";
import { cancelAssignment, createAssignments, parseAssignInput, previewAssignment, requireAssignment, resyncDispatch, updateAssignment, type PreviewRow } from "@/lib/products/evaliq/assignments";
import { describeTarget, getDirectory } from "@/lib/products/evaliq/people";
import { markItem, publishResults } from "@/lib/products/evaliq/evaluation";
import { generateCertificate, setRevoked } from "@/lib/products/evaliq/certificates";
import { saveOtsSettings } from "@/lib/products/evaliq/settings";
import { QUESTION_TYPES } from "@/lib/products/evaliq/question-types";
import { labelOf, TARGET_TYPES } from "@/lib/products/evaliq/constants";

/**
 * Every staff-side OTS mutation. Each resolves the viewer from the session
 * cookie via `run` and re-checks the permission it needs. Candidate
 * (test-taking) actions live in `src/app/evaliq/take/actions.ts`, shared with the
 * External Portal.
 */

const who = (v: OtsViewer) => ({ actorId: v.userId, actorEmail: v.email });

export async function otsLogoutAction(): Promise<void> {
  const user = await getCurrentOtsUser();
  if (user && ObjectId.isValid(user.id)) await signOutThisDevice(new ObjectId(user.id));
  redirect("/commandos/login");
}

export async function markNotificationsReadAction(ids?: string[]) {
  const v = await getCurrentOtsUser().catch(() => null);
  if (!v) return;
  await markOtsNotificationsRead(v.id, ids?.filter((i) => typeof i === "string"));
}

// ── Categories ─────────────────────────────────────────────────────────────

export async function saveCategoryAction(kind: CategoryKind, id: string | null, input: { name: string; description: string }) {
  return run(["MANAGE_SETTINGS"], async (v) => {
    const c = id ? await updateCategory(id, input, v.userId) : await createCategory(kind, input, v.userId);
    await recordAudit({ ...who(v), action: id ? "update" : "create", entity: "category", entityId: c._id, entityLabel: c.name, summary: `${kind} category` });
    return { id: c._id };
  });
}

export async function deleteCategoryAction(id: string) {
  return run(["MANAGE_SETTINGS"], async (v) => {
    const c = await deleteCategory(id, v.userId);
    await recordAudit({ ...who(v), action: "delete", entity: "category", entityId: id, entityLabel: c.name, summary: `${c.kind} category` });
    return {};
  });
}

// ── Questions ──────────────────────────────────────────────────────────────

const Q_FIELDS = ["type", "prompt", "categoryId", "subject", "topic", "difficulty", "marks", "negativeMarks", "status", "tags"];

export async function saveQuestionAction(id: string | null, raw: Record<string, unknown>) {
  return run([id ? "EDIT_QUESTION" : "CREATE_QUESTION"], async (v) => {
    const input = parseQuestionInput(raw);
    if (!id) {
      const q = await createQuestion(input, v.userId);
      await recordAudit({ ...who(v), action: "create", entity: "question", entityId: q._id, entityLabel: q.code, summary: `${QUESTION_TYPES[q.type].label} · ${q.prompt.slice(0, 80)}` });
      return { id: q._id };
    }
    const { before, after } = await updateQuestion(id, input, v.userId);
    const flat = (q: typeof before) => ({ ...q, tags: q.tags.join(",") }) as unknown as Record<string, unknown>;
    const changed = diffSummary(flat(before), flat(after), Q_FIELDS);
    const defChanged = JSON.stringify(before.definition) !== JSON.stringify(after.definition);
    await recordAudit({ ...who(v), action: "update", entity: "question", entityId: id, entityLabel: after.code, summary: [changed, defChanged ? "options / answer key changed" : null].filter(Boolean).join("; ") || "Saved without changes", metadata: { version: after.version } });
    return { id };
  });
}

/** Bulk creation: several questions from one form. Each row is validated independently. */
export async function bulkCreateQuestionsAction(rows: Record<string, unknown>[]) {
  return run(["CREATE_QUESTION"], async (v) => {
    const list = rows.slice(0, 50);
    const errors: { row: number; error: string }[] = [];
    const inputs = list.map((r, i) => {
      try {
        return parseQuestionInput(r);
      } catch (err) {
        errors.push({ row: i + 1, error: err instanceof OtsInputError ? err.message : "Invalid question." });
        return null;
      }
    });
    if (errors.length) throw new OtsInputError(`Question ${errors[0].row}: ${errors[0].error}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}`);
    const created: string[] = [];
    for (const input of inputs) {
      const q = await createQuestion(input!, v.userId);
      created.push(q._id);
    }
    await recordAudit({ ...who(v), action: "create", entity: "question", entityId: created[0] ?? "bulk", entityLabel: `${created.length} questions`, summary: "Bulk creation" });
    return { created: created.length };
  });
}

export async function duplicateQuestionAction(id: string) {
  return run(["CREATE_QUESTION"], async (v) => {
    const q = await duplicateQuestion(id, v.userId);
    await recordAudit({ ...who(v), action: "duplicate", entity: "question", entityId: q._id, entityLabel: q.code, summary: `Copied from ${id}` });
    return { id: q._id };
  });
}

export async function setQuestionStatusAction(id: string, status: "active" | "draft" | "archived") {
  return run(["EDIT_QUESTION"], async (v) => {
    const q = await setQuestionStatus(id, status, v.userId);
    await recordAudit({ ...who(v), action: status === "archived" ? "archive" : status === "active" ? "restore" : "update", entity: "question", entityId: id, entityLabel: q.code, summary: `Status → ${status}` });
    return {};
  });
}

export async function deleteQuestionAction(id: string) {
  return run(["DELETE_QUESTION"], async (v) => {
    const q = await deleteQuestion(id, v.userId);
    await recordAudit({ ...who(v), action: "delete", entity: "question", entityId: id, entityLabel: q.code, summary: q.prompt.slice(0, 80) });
    return {};
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

export async function createTestAction(raw: Record<string, unknown>) {
  return run(["CREATE_TEST"], async (v) => {
    const t = await createTest(parseTestInfo(raw), v.userId);
    await recordAudit({ ...who(v), action: "create", entity: "test", entityId: t._id, entityLabel: t.name, summary: `${t.code} · ${t.testType}` });
    return { id: t._id };
  });
}

const INFO_FIELDS = ["name", "testType", "categoryId", "subject", "difficulty", "language", "tags", "departmentIds", "designationIds"];

export async function saveTestInfoAction(id: string, raw: Record<string, unknown>) {
  return run(["EDIT_TEST"], async (v) => {
    const info = parseTestInfo(raw);
    const { before, after } = await updateTest(id, info, v.userId);
    await recordAudit({ ...who(v), action: "update", entity: "test", entityId: id, entityLabel: after.name, summary: diffSummary(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, INFO_FIELDS) ?? "Information saved" });
    return {};
  });
}

const CONFIG_FIELDS = ["durationMinutes", "autoSubmit", "startAt", "endAt", "maxAttempts", "allowRetake", "questionsPerAttempt", "randomizeQuestions", "randomizeOptions", "negativeMarking", "passMode", "passingPercentage", "passingMarks", "allowNavigation", "allowBack", "allowReview", "resultRelease", "resultDetail", "showExplanations", "attemptScoring", "security"];

export async function saveTestConfigAction(id: string, raw: Record<string, unknown>) {
  return run(["EDIT_TEST"], async (v) => {
    const config = parseTestConfig(raw);
    const { before, after } = await updateTest(id, { config }, v.userId);
    await recordAudit({ ...who(v), action: "update", entity: "test", entityId: id, entityLabel: after.name, summary: `Configuration: ${diffSummary(before.config as unknown as Record<string, unknown>, config as unknown as Record<string, unknown>, CONFIG_FIELDS) ?? "no changes"}` });
    return {};
  });
}

export async function saveTestSectionsAction(id: string, rawSections: unknown) {
  return run(["EDIT_TEST"], async (v) => {
    const sections = parseSections(rawSections);
    const { after } = await updateTest(id, { sections }, v.userId);
    const summary = await summarizeTest(after);
    await recordAudit({ ...who(v), action: "update", entity: "test", entityId: id, entityLabel: after.name, summary: `Sections & questions: ${sections.length} section(s), ${summary.questionCount} question(s), ${summary.marksVary ? "≈" : ""}${summary.totalMarks} marks` });
    return { summary };
  });
}

/** Live builder preview — no write. */
export async function previewSectionsAction(id: string, rawSections: unknown): Promise<{ ok: true; summary: TestSummary } | { ok: false; error: string }> {
  return run(
    ["VIEW_TESTS"],
    async () => {
      const t = await requireTest(id);
      return { summary: await summarizeTest({ config: t.config, sections: parseSections(rawSections) }) };
    },
    { revalidate: false }
  );
}

export async function publishTestAction(id: string) {
  return run(["PUBLISH_TEST"], async (v) => {
    const t = await publishTest(id, v.userId);
    await recordAudit({ ...who(v), action: "publish", entity: "test", entityId: id, entityLabel: t.name, summary: t.code });
    return {};
  });
}

export async function closeTestAction(id: string) {
  return run(["PUBLISH_TEST"], async (v) => {
    const t = await setTestStatus(id, "closed", v.userId);
    await recordAudit({ ...who(v), action: "close", entity: "test", entityId: id, entityLabel: t.name, summary: "Closed — no new attempts" });
    return {};
  });
}

export async function archiveTestAction(id: string, archive: boolean) {
  return run(["ARCHIVE_TEST"], async (v) => {
    const t = await setTestStatus(id, archive ? "archived" : "draft", v.userId);
    await recordAudit({ ...who(v), action: archive ? "archive" : "restore", entity: "test", entityId: id, entityLabel: t.name, summary: archive ? "Archived" : "Restored as draft" });
    return {};
  });
}

export async function duplicateTestAction(id: string) {
  return run(["CREATE_TEST"], async (v) => {
    const t = await duplicateTest(id, v.userId);
    await recordAudit({ ...who(v), action: "duplicate", entity: "test", entityId: t._id, entityLabel: t.name, summary: `Copied from ${id}` });
    return { id: t._id };
  });
}

export async function deleteTestAction(id: string) {
  return run(["DELETE_TEST"], async (v) => {
    const t = await deleteTest(id, v.userId);
    await recordAudit({ ...who(v), action: "delete", entity: "test", entityId: id, entityLabel: t.name, summary: t.code });
    return {};
  });
}

// ── Assignments ────────────────────────────────────────────────────────────

export async function previewAssignmentAction(raw: Record<string, unknown>): Promise<{ ok: true; rows: PreviewRow[]; newCount: number; duplicateCount: number } | { ok: false; error: string }> {
  return run(
    ["ASSIGN_TEST"],
    async () => {
      const input = parseAssignInput({ ...raw, testId: raw.testId || "x" });
      const r = await previewAssignment({ testId: String(raw.testId ?? ""), targets: input.targets, applicantStatuses: input.applicantStatuses });
      return { rows: r.rows.slice(0, 2000), newCount: r.newCount, duplicateCount: r.duplicateCount };
    },
    { revalidate: false }
  );
}

export async function assignTestAction(raw: Record<string, unknown>) {
  return run(["ASSIGN_TEST"], async (v) => {
    const input = parseAssignInput(raw);
    const dir = await getDirectory();
    const targetSummary = input.targets.map((t) => `${labelOf(TARGET_TYPES, t.type)}: ${describeTarget(t, dir)}`).join(" · ");
    const excludeKeys = Array.isArray(raw.excludeKeys) ? raw.excludeKeys.filter((x): x is string => typeof x === "string") : [];
    const { dispatch, created, skipped } = await createAssignments(input, targetSummary, v.userId, { excludeKeys });
    const test = await requireTest(input.testId);
    await recordAudit({ ...who(v), action: "assign", entity: "assignment", entityId: dispatch._id, entityLabel: test.name, testId: test._id, summary: `${created.length} assigned, ${skipped} skipped (already assigned / excluded) → ${targetSummary}` });
    if (input.notify && created.length)
      await notifyCandidates(
        created.map((a) => ({
          ref: a.candidate,
          assignmentId: a._id,
          type: "ots_assigned" as const,
          title: `New test assigned: ${test.name}`,
          body: a.dueAt ? `Due ${a.dueAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.` : "Open it from My Tests when you are ready.",
          dedupeKey: `ots_assigned:${a._id}`,
        }))
      );
    return { dispatchId: dispatch._id, created: created.length, skipped };
  });
}

export async function resyncDispatchAction(id: string) {
  return run(["ASSIGN_TEST"], async (v) => {
    const { dispatch, created } = await resyncDispatch(id, v.userId);
    const test = await requireTest(dispatch.testId);
    await recordAudit({ ...who(v), action: "resync", entity: "assignment", entityId: id, entityLabel: test.name, testId: test._id, summary: `${created.length} newly eligible people assigned` });
    if (dispatch.notify && created.length)
      await notifyCandidates(created.map((a) => ({ ref: a.candidate, assignmentId: a._id, type: "ots_assigned" as const, title: `New test assigned: ${test.name}`, dedupeKey: `ots_assigned:${a._id}` })));
    return { created: created.length };
  });
}

export async function updateAssignmentAction(id: string, raw: Record<string, unknown>) {
  return run(["EDIT_ASSIGNMENT"], async (v) => {
    const { before, after } = await updateAssignment(id, raw, v.userId);
    await recordAudit({
      ...who(v),
      action: "assignment_update",
      entity: "assignment",
      entityId: id,
      entityLabel: after.candidateLabel,
      testId: after.testId,
      summary: diffSummary(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, ["startAt", "dueAt", "maxAttempts", "extraAttempts", "priority", "allowLateStart", "status"]) ?? "No changes",
    });
    return {};
  });
}

export async function cancelAssignmentAction(id: string, reason: string) {
  return run(["CANCEL_ASSIGNMENT"], async (v) => {
    const a = await cancelAssignment(id, String(reason ?? ""), v.userId);
    await recordAudit({ ...who(v), action: "cancel", entity: "assignment", entityId: id, entityLabel: a.candidateLabel, testId: a.testId, summary: reason || null });
    return {};
  });
}

// ── Evaluation & results ───────────────────────────────────────────────────

export async function markAnswerAction(attemptId: string, index: number, marks: number, comment: string) {
  return run(
    ["EVALUATE_ANSWERS", "OVERRIDE_MARKS"],
    async (v) => {
      await markItem(attemptId, index, { marks, comment }, { id: v.userId, email: v.email }, { override: can(v, "OVERRIDE_MARKS") });
      return {};
    },
    { any: true }
  );
}

export async function publishResultsAction(attemptIds: string[]) {
  return run(["PUBLISH_RESULTS"], async (v) => {
    const r = await publishResults(attemptIds.filter((x) => typeof x === "string").slice(0, 500), { id: v.userId, email: v.email });
    return r;
  });
}

export async function grantAttemptAction(assignmentId: string) {
  return run(["EDIT_ASSIGNMENT"], async (v) => {
    const a = await requireAssignment(assignmentId);
    await updateAssignment(assignmentId, { extraAttempts: (a.extraAttempts ?? 0) + 1 }, v.userId);
    await recordAudit({ ...who(v), action: "assignment_update", entity: "assignment", entityId: assignmentId, entityLabel: a.candidateLabel, testId: a.testId, summary: "Granted one extra attempt" });
    return {};
  });
}

// ── Certificates ───────────────────────────────────────────────────────────

export async function generateCertificateAction(assignmentId: string) {
  return run(["GENERATE_CERTIFICATE"], async (v) => {
    const c = await generateCertificate(assignmentId, { id: v.userId, email: v.email });
    return { id: c._id };
  });
}

export async function revokeCertificateAction(id: string, revoke: boolean, reason: string) {
  return run(["REVOKE_CERTIFICATE"], async (v) => {
    await setRevoked(id, revoke, String(reason ?? ""), { id: v.userId, email: v.email });
    return {};
  });
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function saveSettingsAction(raw: Record<string, unknown>) {
  return run(["MANAGE_SETTINGS"], async (v) => {
    const { before, after } = await saveOtsSettings(raw, v.userId);
    await recordAudit({ ...who(v), action: "settings", entity: "settings", entityId: "global", entityLabel: "EvalIQ settings", summary: diffSummary(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, ["organizationName", "certificateNumberFormat", "signatoryName", "signatoryTitle", "defaultValidityMonths", "reminderHoursBeforeDue", "graceSeconds", "evaluatorUserIds"]) });
    return {};
  });
}

// ── Builder helpers ────────────────────────────────────────────────────────

export interface QuestionLite {
  id: string;
  code: string;
  prompt: string;
  type: string;
  typeLabel: string;
  difficulty: string;
  marks: number;
  subject: string;
  status: string;
}

export async function searchQuestionsAction(f: { q?: string; type?: string; difficulty?: string; categoryId?: string; subject?: string; exclude?: string[] }) {
  return run(
    ["VIEW_QUESTIONS"],
    async () => {
      const r = await listQuestions({ q: f.q, type: f.type, difficulty: f.difficulty, categoryId: f.categoryId, subject: f.subject, status: "active", pageSize: 60 });
      const ex = new Set(f.exclude ?? []);
      const items: QuestionLite[] = r.items
        .filter((q) => !ex.has(q._id))
        .map((q) => ({ id: q._id, code: q.code, prompt: q.prompt.slice(0, 200), type: q.type, typeLabel: QUESTION_TYPES[q.type].label, difficulty: q.difficulty, marks: q.marks, subject: q.subject, status: q.status }));
      return { items, total: r.total };
    },
    { revalidate: false }
  );
}
