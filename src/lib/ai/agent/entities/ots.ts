import "server-only";
import * as A from "@/app/(products)/evaliq/(protected)/actions";
import { otsCan, type OtsPermission } from "@/lib/ots-roles";
import { TEST_TYPES, DIFFICULTIES, QUESTION_DIFFICULTIES, QUESTION_STATUSES, PRIORITIES, RESULT_RELEASES, RESULT_DETAILS, ATTEMPT_SCORING, TARGET_TYPES } from "@/lib/products/evaliq/constants";
import { QUESTION_TYPE_LIST } from "@/lib/products/evaliq/question-types";
import { getDashboard } from "@/lib/products/evaliq/analytics";
import { peek } from "@/lib/ai/agent/records";
import { viaAction, f, fail, str, values } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, FieldDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * Online tests (OTS) for the agent: build the question bank, assemble and publish tests, assign them to employees, applicants and students,
 * evaluate answers, publish results and issue certificates — through the product's own actions and permission rules.
 */

const ctx = (u: AgentUser) => ({ roles: u.roles, permissionOverrides: u.permissionOverrides });
const can = (p: OtsPermission) => (u: AgentUser) => otsCan(ctx(u), p);
const soft = { deletedAt: null };
const QT = QUESTION_TYPE_LIST.map((q) => q.value as string);
const jsonRound = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? {})) as Json;

const ro = (key: string, label: string, description: string, collection: string, perm: OtsPermission, extra: Partial<EntityDef> = {}): EntityDef => ({ key, panel: "ots", label, description, collection, idType: "string", read: "staff", allowRead: can(perm), ...extra });
export const OTS_ENTITIES: EntityDef[] = [
  ro("ots.test", "Test", "Online tests: name, code, type, status (draft / published / closed / archived), configuration and sections.", "ots_tests", "VIEW_TESTS", { baseFilter: soft, titleField: "name", search: ["name", "code", "subject"] }),
  ro("ots.question", "Question", "Question bank: type, prompt, difficulty, marks, subject, status (answer keys are included for authors).", "ots_questions", "VIEW_QUESTIONS", { baseFilter: soft, titleField: "prompt", search: ["prompt", "code", "subject", "topic", "tags"] }),
  ro("ots.category", "Category", "Question and test categories.", "ots_categories", "VIEW_TESTS", { baseFilter: soft, titleField: "name", read: "any" }),
  ro("ots.assignment", "Test assignment", "Who was given which test: status, due date, attempts used.", "ots_assignments", "VIEW_ASSIGNMENTS", { search: ["candidateLabel"] }),
  ro("ots.dispatch", "Assignment batch", "Groups of assignments made together.", "ots_dispatches", "VIEW_ASSIGNMENTS"),
  ro("ots.attempt", "Attempt & result", "Attempts with score, percentage, pass/fail and evaluation state.", "ots_attempts", "VIEW_REPORTS", {}),
  ro("ots.certificate", "Certificate", "Certificates issued for passed tests.", "ots_certificates", "VIEW_CERTIFICATES", {}),
  ro("ots.activity", "Audit log", "Who changed what in OTS.", "ots_activity_logs", "VIEW_AUDIT_LOG", { search: ["entityLabel", "summary", "actorEmail"], read: "admin" }),
];

const act = (key: string, label: string, description: string, params: FieldDef[], perm: OtsPermission, run: (v: Json) => Promise<unknown>, success: string, destructive = false): ActionDef => ({
  key, panel: "ots", label, description, params, level: "any", allow: can(perm), destructive, run: (v) => viaAction(() => run(v), success),
});

const Q = (required: boolean): FieldDef[] => [
  f.enum("type", "Question type", QT, required), f.text("prompt", "The question text (for fill-in-the-blank use [[1]], [[2]] for blanks)", required),
  f.json("definition", "Answer definition by type — choice types: {options:[{id,text}], correct:[id]} · short/long answer: {acceptedAnswers:[…], caseSensitive?, rubric?} · fill_blank: {blanks:[{id, accepted:[…]}]} · match: {pairs:[{id,left,right}]} · ordering: {items:[{id,text}]} in the CORRECT order · code: {language, code, acceptedAnswers?, testCases?, rubric?}", required),
  f.num("marks", "Marks", required), f.num("negativeMarks", "Negative marks"), f.enum("difficulty", "Difficulty", values(QUESTION_DIFFICULTIES)), f.str("subject", "Subject"), f.str("topic", "Topic"), f.ref("categoryId", "Category (ots.category id)", "ots.category"), f.list("tags", "Tags"), f.text("explanation", "Explanation shown with results"), f.enum("status", "Status", values(QUESTION_STATUSES)),
];
const TEST_INFO: FieldDef[] = [f.str("name", "Test name", true), f.text("description", "Description"), f.enum("testType", "Type", values(TEST_TYPES)), f.ref("categoryId", "Category (ots.category id)", "ots.category"), f.str("subject", "Subject"), f.enum("difficulty", "Difficulty", values(DIFFICULTIES)), f.text("instructions", "Instructions for candidates"), f.list("tags", "Tags"), f.str("language", "Language"), f.list("departmentIds", "Departments it is for"), f.list("designationIds", "Designations it is for"), f.json("certificate", "Certificate: {enabled, title, validityMonths}")];
const TEST_CONFIG: FieldDef[] = [f.num("durationMinutes", "Duration (minutes)"), f.bool("autoSubmit", "Auto-submit when time ends"), f.str("startAt", "Opens at (ISO date-time)"), f.str("endAt", "Closes at (ISO date-time)"), f.bool("allowRetake", "Allow retakes"), f.num("maxAttempts", "Max attempts"), f.bool("retakeOnlyIfFailed", "Retake only if failed"), f.num("questionsPerAttempt", "Questions per attempt"), f.bool("randomizeQuestions", "Shuffle questions"), f.bool("randomizeOptions", "Shuffle options"), f.bool("negativeMarking", "Negative marking"), f.enum("passMode", "Pass by", ["percentage", "marks"]), f.num("passingPercentage", "Passing percentage"), f.num("passingMarks", "Passing marks"), f.bool("allowNavigation", "Allow moving between questions"), f.bool("allowBack", "Allow going back"), f.bool("allowReview", "Allow marking for review"), f.enum("resultRelease", "When results are released", values(RESULT_RELEASES)), f.enum("resultDetail", "How much detail results show", values(RESULT_DETAILS)), f.bool("showExplanations", "Show explanations"), f.enum("attemptScoring", "Score used across attempts", values(ATTEMPT_SCORING)), f.json("security", "Security: {requireFullscreen, detectTabSwitch, blockCopyPaste, blockRightClick, singleSession, maxViolations}")];

async function mergeQuestion(id: unknown, v: Json): Promise<Json> {
  const cur = jsonRound(await peek({ key: "ots.question", panel: "ots", label: "", description: "", collection: "ots_questions", idType: "string" }, String(id)));
  const keys = ["type", "prompt", "media", "categoryId", "subject", "topic", "difficulty", "marks", "negativeMarks", "explanation", "status", "tags", "definition"];
  return { ...Object.fromEntries(keys.filter((k) => cur[k] !== undefined).map((k) => [k, cur[k]])), ...v };
}
async function mergeTest(id: unknown, v: Json, keys: string[], from: "root" | "config"): Promise<Json> {
  const cur = jsonRound(await peek({ key: "ots.test", panel: "ots", label: "", description: "", collection: "ots_tests", idType: "string" }, String(id)));
  const base = from === "config" ? ((cur.config as Json) ?? {}) : cur;
  return { ...Object.fromEntries(keys.filter((k) => base[k] !== undefined).map((k) => [k, base[k]])), ...v };
}

export const OTS_ACTIONS: ActionDef[] = [
  act("ots.save_category", "Create or rename a category", "A category for questions or tests.", [f.enum("kind", "For", ["question", "test"], true), f.str("categoryId", "Category id to edit (leave out to create)"), f.str("name", "Name", true), f.text("description", "Description")], "MANAGE_SETTINGS", (v) => A.saveCategoryAction(v.kind as "test", str(v.categoryId), { name: String(v.name ?? ""), description: String(v.description ?? "") }), "Category saved."),
  act("ots.delete_category", "Delete a category", "Delete a category.", [f.ref("categoryId", "Category id", "ots.category", true)], "MANAGE_SETTINGS", (v) => A.deleteCategoryAction(String(v.categoryId)), "Category deleted.", true),
  act("ots.create_question", "Add a question to the bank", "Create a question of any type with its answer key.", Q(true), "CREATE_QUESTION", (v) => A.saveQuestionAction(null, v), "Question added."),
  act("ots.update_question", "Edit a question", "Change a question (other fields stay as they are).", [f.ref("questionId", "Question id", "ots.question", true), ...Q(false)], "EDIT_QUESTION", async (v) => { const { questionId, ...changes } = v; return A.saveQuestionAction(String(questionId), await mergeQuestion(questionId, changes)); }, "Question updated."),
  act("ots.bulk_create_questions", "Add many questions at once", "Create several questions in one go (each like ots.create_question).", [f.json("rows", "Questions: [{type, prompt, definition, marks, …}]", true)], "CREATE_QUESTION", (v) => A.bulkCreateQuestionsAction(Array.isArray(v.rows) ? (v.rows as Json[]) : []), "Questions added."),
  act("ots.duplicate_question", "Duplicate a question", "Copy a question.", [f.ref("questionId", "Question id", "ots.question", true)], "CREATE_QUESTION", (v) => A.duplicateQuestionAction(String(v.questionId)), "Question duplicated."),
  act("ots.set_question_status", "Activate, draft or archive a question", "Change a question's status.", [f.ref("questionId", "Question id", "ots.question", true), f.enum("status", "Status", ["active", "draft", "archived"], true)], "EDIT_QUESTION", (v) => A.setQuestionStatusAction(String(v.questionId), v.status as "active"), "Status changed."),
  act("ots.delete_question", "Delete a question", "Delete a question from the bank.", [f.ref("questionId", "Question id", "ots.question", true)], "DELETE_QUESTION", (v) => A.deleteQuestionAction(String(v.questionId)), "Question deleted.", true),
  act("ots.create_test", "Create a test", "Start a new test (draft) with its basic information.", TEST_INFO, "CREATE_TEST", (v) => A.createTestAction(v), "Test created."),
  act("ots.save_test_info", "Edit a test's information", "Change name, type, instructions etc. (others stay).", [f.ref("testId", "Test id", "ots.test", true), ...TEST_INFO.map((p) => ({ ...p, required: false }))], "EDIT_TEST", async (v) => { const { testId, ...changes } = v; return A.saveTestInfoAction(String(testId), await mergeTest(testId, changes, ["name", "description", "categoryId", "testType", "subject", "difficulty", "instructions", "tags", "language", "departmentIds", "designationIds", "certificate"], "root")); }, "Test information saved."),
  act("ots.save_test_config", "Change a test's rules (time, attempts, passing, security, results)", "Duration, schedule, attempts, shuffling, passing mark, navigation, result release and proctoring options (others stay).", [f.ref("testId", "Test id", "ots.test", true), ...TEST_CONFIG], "EDIT_TEST", async (v) => { const { testId, ...changes } = v; return A.saveTestConfigAction(String(testId), await mergeTest(testId, changes, TEST_CONFIG.map((p) => p.key), "config")); }, "Test configuration saved."),
  act("ots.save_test_sections", "Set a test's sections and questions", "Sections with the questions in them: [{title, description?, timeLimitMinutes?, marksPerQuestion?, questionIds:[…] and/or rules:[{count, difficulty?, categoryId?, type?, subject?, topic?, tag?}]}]. Replaces the sections — read the test first.", [f.ref("testId", "Test id", "ots.test", true), f.json("sections", "Sections", true)], "EDIT_TEST", (v) => A.saveTestSectionsAction(String(v.testId), v.sections), "Test sections saved."),
  act("ots.publish_test", "Publish a test", "Make a test available for assignment.", [f.ref("testId", "Test id", "ots.test", true)], "PUBLISH_TEST", (v) => A.publishTestAction(String(v.testId)), "Test published.", true),
  act("ots.close_test", "Close a test", "Stop a published test from taking new attempts.", [f.ref("testId", "Test id", "ots.test", true)], "PUBLISH_TEST", (v) => A.closeTestAction(String(v.testId)), "Test closed.", true),
  act("ots.archive_test", "Archive or restore a test", "Archive a test (or restore it).", [f.ref("testId", "Test id", "ots.test", true), f.bool("archive", "Archive (false = restore)")], "ARCHIVE_TEST", (v) => A.archiveTestAction(String(v.testId), v.archive !== false), "Done."),
  act("ots.duplicate_test", "Duplicate a test", "Copy a test.", [f.ref("testId", "Test id", "ots.test", true)], "CREATE_TEST", (v) => A.duplicateTestAction(String(v.testId)), "Test duplicated."),
  act("ots.delete_test", "Delete a test", "Delete a test.", [f.ref("testId", "Test id", "ots.test", true)], "DELETE_TEST", (v) => A.deleteTestAction(String(v.testId)), "Test deleted.", true),
  act("ots.assign_test", "Assign a test to people", `Give a published test to groups or individuals, with dates and notifications. targets: [{type, ids}] where type is one of ${values(TARGET_TYPES).join(", ")}.`, [f.ref("testId", "Test id", "ots.test", true), f.json("targets", "Targets: [{type, ids:[…]}]", true), f.str("startAt", "Opens at (ISO)"), f.str("dueAt", "Due at (ISO)"), f.num("maxAttempts", "Attempt limit"), f.enum("priority", "Priority", values(PRIORITIES)), f.text("instructions", "Instructions"), f.bool("notify", "Notify them (default yes)"), f.enum("resultRelease", "Result release", values(RESULT_RELEASES)), f.enum("resultDetail", "Result detail", values(RESULT_DETAILS)), f.bool("certificateEligible", "Certificate eligible"), f.bool("allowLateStart", "Allow starting after the due date")], "ASSIGN_TEST", (v) => A.assignTestAction(v), "Test assigned."),
  act("ots.resync_dispatch", "Add newly eligible people to an assignment batch", "Assign the test to people who have since joined the target group.", [f.ref("dispatchId", "Assignment batch id (ots.dispatch)", "ots.dispatch", true)], "ASSIGN_TEST", (v) => A.resyncDispatchAction(String(v.dispatchId)), "Resynced."),
  act("ots.update_assignment", "Change one person's assignment", "Dates, attempts, extra attempts, priority.", [f.ref("assignmentId", "Assignment id", "ots.assignment", true), f.str("startAt", "Opens at (ISO)"), f.str("dueAt", "Due at (ISO)"), f.num("maxAttempts", "Attempt limit"), f.num("extraAttempts", "Extra attempts"), f.enum("priority", "Priority", values(PRIORITIES)), f.bool("allowLateStart", "Allow late start")], "EDIT_ASSIGNMENT", (v) => { const { assignmentId, ...rest } = v; return A.updateAssignmentAction(String(assignmentId), rest); }, "Assignment updated."),
  act("ots.grant_attempt", "Give someone one more attempt", "Add one extra attempt to an assignment.", [f.ref("assignmentId", "Assignment id", "ots.assignment", true)], "EDIT_ASSIGNMENT", (v) => A.grantAttemptAction(String(v.assignmentId)), "Extra attempt granted."),
  act("ots.cancel_assignment", "Cancel an assignment", "Cancel someone's assignment with a reason.", [f.ref("assignmentId", "Assignment id", "ots.assignment", true), f.str("reason", "Reason")], "CANCEL_ASSIGNMENT", (v) => A.cancelAssignmentAction(String(v.assignmentId), String(v.reason ?? "")), "Assignment cancelled.", true),
  act("ots.mark_answer", "Mark a written answer", "Give marks and a comment to one answer of an attempt (by question index, from 0).", [f.ref("attemptId", "Attempt id", "ots.attempt", true), f.num("index", "Answer index (0-based)", true), f.num("marks", "Marks", true), f.text("comment", "Comment")], "EVALUATE_ANSWERS", (v) => A.markAnswerAction(String(v.attemptId), Number(v.index), Number(v.marks), String(v.comment ?? "")), "Answer marked."),
  act("ots.publish_results", "Publish results", "Release evaluated attempts' results to the candidates.", [f.list("attemptIds", "Attempt ids (ots.attempt)")], "PUBLISH_RESULTS", (v) => A.publishResultsAction((v.attemptIds as string[]) ?? []), "Results published.", true),
  act("ots.generate_certificate", "Generate a certificate", "Issue a certificate for a passed assignment.", [f.ref("assignmentId", "Assignment id", "ots.assignment", true)], "GENERATE_CERTIFICATE", (v) => A.generateCertificateAction(String(v.assignmentId)), "Certificate generated."),
  act("ots.revoke_certificate", "Revoke or reinstate a certificate", "Revoke a certificate (or reinstate).", [f.ref("certificateId", "Certificate id", "ots.certificate", true), f.bool("revoke", "Revoke (false = reinstate)"), f.str("reason", "Reason")], "REVOKE_CERTIFICATE", (v) => A.revokeCertificateAction(String(v.certificateId), v.revoke !== false, String(v.reason ?? "")), "Certificate updated.", true),
  act("ots.save_settings", "Change OTS settings", "Organisation name, certificate number format (needs {n}), signatory, default validity, reminders, grace seconds and evaluators.", [f.str("organizationName", "Organisation name"), f.str("certificateNumberFormat", "Certificate number format, e.g. CERT-{yyyy}-{n}"), f.str("signatoryName", "Signatory name"), f.str("signatoryTitle", "Signatory title"), f.num("defaultValidityMonths", "Default validity (months)"), f.num("reminderHoursBeforeDue", "Remind this many hours before due"), f.num("graceSeconds", "Grace seconds"), f.list("evaluatorUserIds", "Evaluator user ids")], "MANAGE_SETTINGS", (v) => A.saveSettingsAction(v), "Settings saved."),
];

export const OTS_REPORTS: ReportDef[] = [
  { key: "ots.dashboard", panel: "ots", label: "Test dashboard numbers", description: "Tests, assignments, attempts, pass rate, pending evaluations and trends.", level: "staff", allow: can("VIEW_REPORTS"), params: [f.date("dateFrom", "From"), f.date("dateTo", "To")], run: async (v) => (await getDashboard({ from: str(v.dateFrom) ?? undefined, to: str(v.dateTo) ?? undefined } as never)) as unknown as Json },
];
void fail;
