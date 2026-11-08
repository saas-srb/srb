import type { Test } from "@/lib/products/evaliq/tests";

/** Test → builder form values. Pure (server pages build these; client forms consume them). Dates stay ISO — forms localise them. */

export function testInfoValues(t: Test | null) {
  return {
    name: t?.name ?? "",
    description: t?.description ?? "",
    categoryId: t?.categoryId ?? "",
    testType: t?.testType ?? "assessment",
    subject: t?.subject ?? "",
    departmentIds: t?.departmentIds ?? [],
    designationIds: t?.designationIds ?? [],
    difficulty: t?.difficulty ?? "mixed",
    instructions: t?.instructions ?? "",
    tags: (t?.tags ?? []).join(", "),
    language: t?.language ?? "English",
    certificate: { enabled: t?.certificate.enabled ?? false, title: t?.certificate.title ?? "", validityMonths: t?.certificate.validityMonths ? String(t.certificate.validityMonths) : "" },
  };
}

export function testConfigValues(t: Test) {
  const c = t.config;
  const str = (n: number | null) => (n === null ? "" : String(n));
  return {
    durationMinutes: str(c.durationMinutes),
    autoSubmit: c.autoSubmit,
    startAt: c.startAt ? c.startAt.toISOString() : "",
    endAt: c.endAt ? c.endAt.toISOString() : "",
    maxAttempts: String(c.maxAttempts),
    allowRetake: c.allowRetake,
    retakeOnlyIfFailed: c.retakeOnlyIfFailed,
    questionsPerAttempt: str(c.questionsPerAttempt),
    randomizeQuestions: c.randomizeQuestions,
    randomizeOptions: c.randomizeOptions,
    negativeMarking: c.negativeMarking,
    passMode: c.passMode,
    passingPercentage: String(c.passingPercentage),
    passingMarks: String(c.passingMarks),
    allowNavigation: c.allowNavigation,
    allowBack: c.allowBack,
    allowReview: c.allowReview,
    resultRelease: c.resultRelease,
    resultDetail: c.resultDetail,
    showExplanations: c.showExplanations,
    attemptScoring: c.attemptScoring,
    security: { ...c.security, maxViolations: str(c.security.maxViolations) },
  };
}

export function sectionDrafts(t: Test) {
  return t.sections.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    timeLimitMinutes: s.timeLimitMinutes ? String(s.timeLimitMinutes) : "",
    negativeMarking: (s.negativeMarking === null ? "" : s.negativeMarking ? "on" : "off") as "" | "on" | "off",
    marksPerQuestion: s.marksPerQuestion ? String(s.marksPerQuestion) : "",
    questionIds: s.questionIds,
    rules: s.rules.map((r) => ({ ...r, count: String(r.count) })),
  }));
}
