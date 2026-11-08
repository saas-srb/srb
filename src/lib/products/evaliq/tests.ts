import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, createStamp, escapeRx, newId, nextCode, notDeleted, parseDateTime, round2, updateStamp, type AuditFields } from "@/lib/products/evaliq/db";
import { OtsInputError, NotFoundError } from "@/lib/products/evaliq/viewer";
import {
  ATTEMPT_SCORING,
  DIFFICULTIES,
  QUESTION_DIFFICULTIES,
  RESULT_DETAILS,
  RESULT_RELEASES,
  TEST_TYPES,
  type AttemptScoring,
  type Difficulty,
  type EffectiveTestStatus,
  type ResultDetail,
  type ResultRelease,
  type TestStatus,
  type TestType,
} from "@/lib/products/evaliq/constants";
import { avgPoolMarks, countPool, getQuestionsByIds, type SelectionRule } from "@/lib/products/evaliq/questions";
import { isQuestionType } from "@/lib/products/evaliq/question-types";

/**
 * Test management: information, configuration, sections and question
 * selection (manual picks + automatic rules drawn from the Question Bank at
 * attempt time). Lifecycle: Draft → Published → Active → Completed/Closed →
 * Archived, where "Active" and "Completed" are derived from the availability
 * window of a published test (see `effectiveTestStatus`).
 */

export interface TestSection {
  id: string;
  title: string;
  description: string;
  /** Section-level timer; sections with one are taken in order and lock when their time is up. */
  timeLimitMinutes: number | null;
  /** null = inherit the test's negative-marking switch. */
  negativeMarking: boolean | null;
  /** Fixed marks for every question in the section (section-based marks); null = each question's own marks. */
  marksPerQuestion: number | null;
  /** Manually selected questions, in order. */
  questionIds: string[];
  /** Automatic selection — drawn at random from the bank for every attempt. */
  rules: SelectionRule[];
}

export interface TestSecurity {
  requireFullscreen: boolean;
  detectTabSwitch: boolean;
  blockCopyPaste: boolean;
  blockRightClick: boolean;
  /** Only one open window/device per attempt; a second one must explicitly take over (recorded). */
  singleSession: boolean;
  /** Auto-submit after this many violations (tab hidden, left full screen, second session); null = record only. */
  maxViolations: number | null;
}

export interface TestConfig {
  /** null = untimed. */
  durationMinutes: number | null;
  /** true = hard server-enforced deadline + auto submit; false = timer is advisory and overtime is recorded. */
  autoSubmit: boolean;
  startAt: Date | null;
  endAt: Date | null;
  maxAttempts: number;
  allowRetake: boolean;
  retakeOnlyIfFailed: boolean;
  /** Serve only N questions (random subset) per attempt; null = all. */
  questionsPerAttempt: number | null;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  negativeMarking: boolean;
  passMode: "percentage" | "marks";
  passingPercentage: number;
  passingMarks: number;
  allowNavigation: boolean;
  allowBack: boolean;
  allowReview: boolean;
  resultRelease: ResultRelease;
  resultDetail: ResultDetail;
  showExplanations: boolean;
  attemptScoring: AttemptScoring;
  security: TestSecurity;
}

export interface TestCertificate {
  enabled: boolean;
  title: string;
  /** null = never expires. */
  validityMonths: number | null;
}

export interface Test extends AuditFields {
  _id: string;
  code: string;
  name: string;
  description: string;
  categoryId: string | null;
  testType: TestType;
  subject: string;
  /** HRMS departments / designations this test is FOR (informational + report filters; assignment is separate). */
  departmentIds: string[];
  designationIds: string[];
  difficulty: Difficulty;
  instructions: string;
  tags: string[];
  language: string;
  status: TestStatus;
  config: TestConfig;
  sections: TestSection[];
  certificate: TestCertificate;
  publishedAt: Date | null;
  publishedBy: string | null;
  closedAt: Date | null;
  archivedAt: Date | null;
  /** Cached from `summarizeTest` whenever the test is saved — what candidates see on their test card. */
  paperStats: PaperStats | null;
}

export interface PaperStats {
  questionCount: number;
  servedCount: number;
  totalMarks: number;
  marksVary: boolean;
}

export const DEFAULT_SECURITY: TestSecurity = {
  requireFullscreen: false,
  detectTabSwitch: true,
  blockCopyPaste: true,
  blockRightClick: true,
  singleSession: true,
  maxViolations: null,
};

export const DEFAULT_CONFIG: TestConfig = {
  durationMinutes: 30,
  autoSubmit: true,
  startAt: null,
  endAt: null,
  maxAttempts: 1,
  allowRetake: false,
  retakeOnlyIfFailed: false,
  questionsPerAttempt: null,
  randomizeQuestions: false,
  randomizeOptions: false,
  negativeMarking: false,
  passMode: "percentage",
  passingPercentage: 40,
  passingMarks: 0,
  allowNavigation: true,
  allowBack: true,
  allowReview: true,
  resultRelease: "immediate",
  resultDetail: "responses",
  showExplanations: false,
  attemptScoring: "highest",
  security: DEFAULT_SECURITY,
};

export function effectiveTestStatus(t: Pick<Test, "status" | "config">, now = new Date()): EffectiveTestStatus {
  if (t.status !== "published") return t.status;
  if (t.config.startAt && now < t.config.startAt) return "published";
  if (t.config.endAt && now >= t.config.endAt) return "closed";
  return "active";
}

/** Can new attempts be started on this test right now (ignoring per-assignment windows)? */
export function isTestOpen(t: Pick<Test, "status" | "config">, now = new Date()): boolean {
  return effectiveTestStatus(t, now) === "active";
}

async function col() {
  const db = await getDb();
  return db.collection<Test>(COLLECTIONS.tests);
}

export async function getTest(id: string): Promise<Test | null> {
  return (await col()).findOne({ _id: id, ...notDeleted });
}

export async function requireTest(id: string): Promise<Test> {
  const t = await getTest(id);
  if (!t) throw new NotFoundError();
  return t;
}

// ── parsing ─────────────────────────────────────────────────────────────────

const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const bool = (v: unknown) => v === true || v === "true" || v === "on";
const posInt = (v: unknown, min: number, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : null;
};
const ids = (v: unknown, max = 100) => (Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && !!x))).slice(0, max) : []);

export interface TestInfoInput {
  name: string;
  description: string;
  categoryId: string | null;
  testType: TestType;
  subject: string;
  departmentIds: string[];
  designationIds: string[];
  difficulty: Difficulty;
  instructions: string;
  tags: string[];
  language: string;
  certificate: TestCertificate;
}

export function parseTestInfo(raw: Record<string, unknown>): TestInfoInput {
  const name = s(raw.name, 160);
  if (!name) throw new OtsInputError("Give the test a name.");
  const testType = TEST_TYPES.some((t) => t.value === raw.testType) ? (raw.testType as TestType) : "assessment";
  const cert = (raw.certificate ?? {}) as Record<string, unknown>;
  const certEnabled = testType === "certification" ? true : bool(cert.enabled);
  return {
    name,
    description: s(raw.description, 4000),
    categoryId: typeof raw.categoryId === "string" && raw.categoryId ? raw.categoryId : null,
    testType,
    subject: s(raw.subject, 80),
    departmentIds: ids(raw.departmentIds),
    designationIds: ids(raw.designationIds),
    difficulty: DIFFICULTIES.some((d) => d.value === raw.difficulty) ? (raw.difficulty as Difficulty) : "mixed",
    instructions: s(raw.instructions, 8000),
    tags: Array.from(new Set((Array.isArray(raw.tags) ? raw.tags : String(raw.tags ?? "").split(",")).map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))).slice(0, 20),
    language: s(raw.language, 40) || "English",
    certificate: { enabled: certEnabled, title: s(cert.title, 160), validityMonths: posInt(cert.validityMonths, 1, 240) },
  };
}

export function parseTestConfig(raw: Record<string, unknown>): TestConfig {
  const sec = (raw.security ?? {}) as Record<string, unknown>;
  const startAt = parseDateTime(raw.startAt);
  const endAt = parseDateTime(raw.endAt);
  if (startAt && endAt && endAt <= startAt) throw new OtsInputError("The end date must be after the start date.");
  const passMode = raw.passMode === "marks" ? "marks" : "percentage";
  const passingPercentage = Number(raw.passingPercentage);
  if (passMode === "percentage" && (!Number.isFinite(passingPercentage) || passingPercentage < 0 || passingPercentage > 100)) throw new OtsInputError("Passing percentage must be between 0 and 100.");
  const passingMarks = Number(raw.passingMarks);
  if (passMode === "marks" && (!Number.isFinite(passingMarks) || passingMarks < 0)) throw new OtsInputError("Passing marks must be zero or more.");
  const duration = posInt(raw.durationMinutes, 1, 24 * 60);
  const maxAttempts = posInt(raw.maxAttempts, 1, 50) ?? 1;
  const allowRetake = bool(raw.allowRetake);
  return {
    durationMinutes: duration,
    autoSubmit: duration ? bool(raw.autoSubmit) : false,
    startAt,
    endAt,
    maxAttempts: allowRetake ? Math.max(maxAttempts, 2) : 1,
    allowRetake,
    retakeOnlyIfFailed: allowRetake && bool(raw.retakeOnlyIfFailed),
    questionsPerAttempt: posInt(raw.questionsPerAttempt, 1, 1000),
    randomizeQuestions: bool(raw.randomizeQuestions),
    randomizeOptions: bool(raw.randomizeOptions),
    negativeMarking: bool(raw.negativeMarking),
    passMode,
    passingPercentage: passMode === "percentage" ? round2(passingPercentage) : 0,
    passingMarks: passMode === "marks" ? round2(passingMarks) : 0,
    allowNavigation: bool(raw.allowNavigation),
    allowBack: bool(raw.allowBack),
    allowReview: bool(raw.allowReview),
    resultRelease: RESULT_RELEASES.some((r) => r.value === raw.resultRelease) ? (raw.resultRelease as ResultRelease) : "immediate",
    resultDetail: RESULT_DETAILS.some((r) => r.value === raw.resultDetail) ? (raw.resultDetail as ResultDetail) : "score",
    showExplanations: bool(raw.showExplanations),
    attemptScoring: ATTEMPT_SCORING.some((a) => a.value === raw.attemptScoring) ? (raw.attemptScoring as AttemptScoring) : "highest",
    security: {
      requireFullscreen: bool(sec.requireFullscreen),
      detectTabSwitch: bool(sec.detectTabSwitch),
      blockCopyPaste: bool(sec.blockCopyPaste),
      blockRightClick: bool(sec.blockRightClick),
      singleSession: bool(sec.singleSession),
      maxViolations: posInt(sec.maxViolations, 1, 50),
    },
  };
}

export function parseSections(raw: unknown): TestSection[] {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 20) throw new OtsInputError("A test can have at most 20 sections.");
  return list.map((x, i) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const rules = (Array.isArray(r.rules) ? r.rules : []).slice(0, 20).map((y, j) => {
      const q = (y ?? {}) as Record<string, unknown>;
      const count = posInt(q.count, 1, 500);
      if (!count) throw new OtsInputError(`Section ${i + 1}: every automatic rule needs a question count.`);
      return {
        id: s(q.id, 40) || `r${j + 1}`,
        count,
        difficulty: QUESTION_DIFFICULTIES.some((d) => d.value === q.difficulty) ? String(q.difficulty) : "",
        categoryId: s(q.categoryId, 60),
        type: isQuestionType(q.type) ? String(q.type) : "",
        subject: s(q.subject, 80),
        topic: s(q.topic, 80),
        tag: s(q.tag, 40).toLowerCase(),
      } satisfies SelectionRule;
    });
    const marksPerQuestion = r.marksPerQuestion === "" || r.marksPerQuestion === null || r.marksPerQuestion === undefined ? null : Number(r.marksPerQuestion);
    if (marksPerQuestion !== null && (!Number.isFinite(marksPerQuestion) || marksPerQuestion <= 0)) throw new OtsInputError(`Section ${i + 1}: marks per question must be positive.`);
    return {
      id: s(r.id, 40) || newId(),
      title: s(r.title, 120) || `Section ${i + 1}`,
      description: s(r.description, 2000),
      timeLimitMinutes: posInt(r.timeLimitMinutes, 1, 24 * 60),
      negativeMarking: r.negativeMarking === null || r.negativeMarking === undefined || r.negativeMarking === "" ? null : bool(r.negativeMarking),
      marksPerQuestion: marksPerQuestion === null ? null : round2(marksPerQuestion),
      questionIds: ids(r.questionIds, 500),
      rules,
    };
  });
}

// ── summary / validation ───────────────────────────────────────────────────

export interface SectionSummary {
  id: string;
  title: string;
  manualCount: number;
  ruleCount: number;
  questionCount: number;
  marks: number;
  /** true when marks depend on which questions a rule draws. */
  marksVary: boolean;
  timeLimitMinutes: number | null;
  rules: { id: string; count: number; available: number }[];
}

export interface TestSummary {
  sections: SectionSummary[];
  questionCount: number;
  servedCount: number;
  totalMarks: number;
  marksVary: boolean;
  issues: string[];
}

/** Question count, total marks and every publish blocker — shown live in the builder and enforced on publish. */
export async function summarizeTest(t: Pick<Test, "sections" | "config">): Promise<TestSummary> {
  const manualIds = t.sections.flatMap((x) => x.questionIds);
  const questions = await getQuestionsByIds(manualIds);
  const byId = new Map(questions.map((q) => [q._id, q]));
  const issues: string[] = [];
  const sections: SectionSummary[] = [];
  for (const [i, sec] of t.sections.entries()) {
    let marks = 0;
    let marksVary = false;
    let manualCount = 0;
    for (const qid of sec.questionIds) {
      const q = byId.get(qid);
      if (!q) {
        issues.push(`Section ${i + 1} ("${sec.title}") contains a question that no longer exists — remove it.`);
        continue;
      }
      if (q.status !== "active") issues.push(`Section ${i + 1}: question ${q.code} is ${q.status} — activate it or remove it.`);
      manualCount += 1;
      marks += sec.marksPerQuestion ?? q.marks;
    }
    const rules: SectionSummary["rules"] = [];
    let ruleCount = 0;
    for (const r of sec.rules) {
      const available = await countPool(r, manualIds);
      rules.push({ id: r.id, count: r.count, available });
      if (available < r.count) issues.push(`Section ${i + 1}: a rule wants ${r.count} question${r.count === 1 ? "" : "s"} but only ${available} active match${available === 1 ? "es" : ""} in the bank.`);
      ruleCount += r.count;
      if (sec.marksPerQuestion !== null) marks += r.count * sec.marksPerQuestion;
      else {
        // Draws vary: estimate with the pool's average marks (shown as "≈").
        marks += r.count * (await avgPoolMarks(r, manualIds));
        marksVary = true;
      }
    }
    if (manualCount + ruleCount === 0) issues.push(`Section ${i + 1} ("${sec.title}") has no questions.`);
    sections.push({ id: sec.id, title: sec.title, manualCount, ruleCount, questionCount: manualCount + ruleCount, marks: round2(marks), marksVary, timeLimitMinutes: sec.timeLimitMinutes, rules });
  }
  if (t.sections.length === 0) issues.push("Add at least one section with questions.");
  const questionCount = sections.reduce((a, x) => a + x.questionCount, 0);
  const totalMarks = round2(sections.reduce((a, x) => a + x.marks, 0));
  const marksVary = sections.some((x) => x.marksVary);
  const c = t.config;
  if (c.questionsPerAttempt && c.questionsPerAttempt > questionCount) issues.push(`"Questions per attempt" (${c.questionsPerAttempt}) is more than the test has (${questionCount}).`);
  if (c.questionsPerAttempt && t.sections.some((x) => x.timeLimitMinutes)) issues.push(`"Questions per attempt" cannot be combined with section timers.`);
  if (c.passMode === "marks" && !marksVary && !c.questionsPerAttempt && c.passingMarks > totalMarks) issues.push(`Passing marks (${c.passingMarks}) exceed the total marks (${totalMarks}).`);
  const sectionMinutes = t.sections.reduce((a, x) => a + (x.timeLimitMinutes ?? 0), 0);
  if (c.durationMinutes && t.sections.every((x) => x.timeLimitMinutes) && sectionMinutes > c.durationMinutes)
    issues.push(`Section time limits add up to ${sectionMinutes} min, more than the test duration (${c.durationMinutes} min).`);
  return { sections, questionCount, servedCount: c.questionsPerAttempt ?? questionCount, totalMarks, marksVary, issues };
}

// ── mutations ──────────────────────────────────────────────────────────────

export async function createTest(info: TestInfoInput, actorId: string, config: TestConfig = DEFAULT_CONFIG, sections?: TestSection[]): Promise<Test> {
  const doc: Test = {
    _id: newId(),
    code: await nextCode("TST", "test_code"),
    ...info,
    status: "draft",
    config,
    sections: sections ?? [{ id: newId(), title: "Section 1", description: "", timeLimitMinutes: null, negativeMarking: null, marksPerQuestion: null, questionIds: [], rules: [] }],
    publishedAt: null,
    publishedBy: null,
    closedAt: null,
    archivedAt: null,
    paperStats: null,
    ...createStamp(actorId),
  };
  await (await col()).insertOne(doc);
  await refreshPaperStats(doc._id);
  return doc;
}

/** Recomputes the cached question count / total marks shown on candidate test cards. */
export async function refreshPaperStats(id: string): Promise<PaperStats | null> {
  const t = await getTest(id);
  if (!t) return null;
  const sum = await summarizeTest(t);
  const paperStats: PaperStats = { questionCount: sum.questionCount, servedCount: sum.servedCount, totalMarks: sum.totalMarks, marksVary: sum.marksVary };
  await (await col()).updateOne({ _id: id }, { $set: { paperStats } });
  return paperStats;
}

export async function updateTest(id: string, patch: Partial<Pick<Test, keyof TestInfoInput | "config" | "sections">>, actorId: string): Promise<{ before: Test; after: Test }> {
  const before = await requireTest(id);
  if (before.status === "archived") throw new OtsInputError("Restore the test before editing it.");
  const after = { ...before, ...patch, ...updateStamp(actorId) };
  await (await col()).updateOne({ _id: id }, { $set: { ...patch, ...updateStamp(actorId) } });
  if (patch.sections || patch.config) await refreshPaperStats(id);
  return { before, after };
}

export async function publishTest(id: string, actorId: string): Promise<Test> {
  const t = await requireTest(id);
  if (t.status !== "draft" && t.status !== "closed") throw new OtsInputError("Only draft or closed tests can be published.");
  const summary = await summarizeTest(t);
  if (summary.issues.length) throw new OtsInputError(`Fix before publishing: ${summary.issues[0]}${summary.issues.length > 1 ? ` (+${summary.issues.length - 1} more)` : ""}`);
  if (t.config.endAt && t.config.endAt <= new Date()) throw new OtsInputError("The end date is in the past — move it before publishing.");
  const now = new Date();
  const paperStats: PaperStats = { questionCount: summary.questionCount, servedCount: summary.servedCount, totalMarks: summary.totalMarks, marksVary: summary.marksVary };
  await (await col()).updateOne({ _id: id }, { $set: { status: "published", publishedAt: now, publishedBy: actorId, closedAt: null, paperStats, ...updateStamp(actorId) } });
  return { ...t, status: "published", publishedAt: now };
}

export async function setTestStatus(id: string, status: "closed" | "archived" | "draft", actorId: string): Promise<Test> {
  const t = await requireTest(id);
  const now = new Date();
  const patch: Partial<Test> = { status };
  if (status === "closed") {
    if (t.status !== "published") throw new OtsInputError("Only a published test can be closed.");
    patch.closedAt = now;
  }
  if (status === "archived") patch.archivedAt = now;
  if (status === "draft") {
    // Restore from archive → back to draft (re-publish to reuse).
    if (t.status !== "archived") throw new OtsInputError("Only archived tests can be restored.");
    patch.archivedAt = null;
  }
  await (await col()).updateOne({ _id: id }, { $set: { ...patch, ...updateStamp(actorId) } });
  return { ...t, ...patch };
}

export async function duplicateTest(id: string, actorId: string): Promise<Test> {
  const src = await requireTest(id);
  const info: TestInfoInput = {
    name: `${src.name} (copy)`.slice(0, 160),
    description: src.description,
    categoryId: src.categoryId,
    testType: src.testType,
    subject: src.subject,
    departmentIds: src.departmentIds,
    designationIds: src.designationIds,
    difficulty: src.difficulty,
    instructions: src.instructions,
    tags: src.tags,
    language: src.language,
    certificate: src.certificate,
  };
  return createTest(info, actorId, { ...src.config, startAt: null, endAt: null }, src.sections.map((x) => ({ ...x, id: newId() })));
}

/** Only drafts that were never assigned can be deleted; anything else is archived. */
export async function deleteTest(id: string, actorId: string): Promise<Test> {
  const t = await requireTest(id);
  if (t.status !== "draft") throw new OtsInputError("Only draft tests can be deleted — archive published tests instead.");
  const db = await getDb();
  const assigned = await db.collection(COLLECTIONS.assignments).countDocuments({ testId: id });
  if (assigned > 0) throw new OtsInputError("This test has assignments — archive it instead.");
  await (await col()).updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return t;
}

// ── lists ──────────────────────────────────────────────────────────────────

export interface TestFilter {
  q?: string;
  status?: string;
  categoryId?: string;
  testType?: string;
  difficulty?: string;
  departmentId?: string;
  page?: number;
  pageSize?: number;
}

export function testStatusFilter(status: string | undefined, now = new Date()): Record<string, unknown> {
  switch (status) {
    case "draft":
    case "archived":
      return { status };
    case "published": // upcoming
      return { status: "published", "config.startAt": { $gt: now } };
    case "active":
      return { status: "published", $and: [{ $or: [{ "config.startAt": null }, { "config.startAt": { $lte: now } }] }, { $or: [{ "config.endAt": null }, { "config.endAt": { $gt: now } }] }] };
    case "closed":
      return { $or: [{ status: "closed" }, { status: "published", "config.endAt": { $lte: now } }] };
    case "all":
      return {};
    default:
      return { status: { $ne: "archived" } };
  }
}

export async function listTests(f: TestFilter) {
  const c = await col();
  const page = Math.max(f.page ?? 1, 1);
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 1), 100);
  const and: Record<string, unknown>[] = [notDeleted, testStatusFilter(f.status)];
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.testType) and.push({ testType: f.testType });
  if (f.difficulty) and.push({ difficulty: f.difficulty });
  if (f.departmentId) and.push({ departmentIds: f.departmentId });
  if (f.q?.trim()) {
    const rx = new RegExp(escapeRx(f.q.trim()), "i");
    and.push({ $or: [{ name: rx }, { code: rx }, { subject: rx }, { tags: rx }] });
  }
  const filter = { $and: and };
  const [items, total] = await Promise.all([c.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), c.countDocuments(filter)]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function listTestOptions(opts: { assignableOnly?: boolean } = {}): Promise<{ value: string; label: string; sub: string }[]> {
  const rows = await (await col())
    .find({ ...notDeleted, ...(opts.assignableOnly ? { status: "published" } : { status: { $ne: "archived" } }) }, { projection: { name: 1, code: 1, status: 1, config: 1 } })
    .sort({ name: 1 })
    .toArray();
  return rows
    .filter((t) => !opts.assignableOnly || effectiveTestStatus(t) !== "closed")
    .map((t) => ({ value: t._id, label: t.name, sub: t.code }));
}

export async function testNames(testIds: string[]): Promise<Map<string, { name: string; code: string }>> {
  if (testIds.length === 0) return new Map();
  const rows = await (await col()).find({ _id: { $in: Array.from(new Set(testIds)) } }, { projection: { name: 1, code: 1 } }).toArray();
  return new Map(rows.map((r) => [r._id, { name: r.name, code: r.code }]));
}
