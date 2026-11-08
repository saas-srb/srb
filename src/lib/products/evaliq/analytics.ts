import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, round2 } from "@/lib/products/evaliq/db";
import { describeCandidates, type CandidateInfo } from "@/lib/products/evaliq/people";
import { categoryMap } from "@/lib/products/evaliq/categories";
import { effectiveTestStatus, type Test } from "@/lib/products/evaliq/tests";
import { labelOf, CANDIDATE_KINDS, ASSIGNMENT_STATUSES, TEST_STATUSES, QUESTION_DIFFICULTIES, type CandidateKind } from "@/lib/products/evaliq/constants";
import { QUESTION_TYPES } from "@/lib/products/evaliq/question-types";
import type { Assignment, Dispatch } from "@/lib/products/evaliq/assignments";
import type { Attempt } from "@/lib/products/evaliq/attempt-types";
import type { OtsCertificate } from "@/lib/products/evaliq/certificates";

/**
 * Dashboard, reports and department / role analytics. Everything is computed
 * from OTS's own assignments + attempts, joined LIVE to HRMS / Careers / TMS
 * for department, designation, batch and course — so a person who moves
 * department is reported under their current one.
 */

export interface AnalyticsFilter {
  from?: string;
  to?: string;
  testId?: string;
  categoryId?: string;
  kind?: string;
  departmentId?: string;
  designationId?: string;
  status?: string;
}

export interface ChartDatum {
  key: string;
  label: string;
  value: number;
  href?: string;
  color?: string;
}

type LiteAttempt = Pick<Attempt, "_id" | "assignmentId" | "testId" | "candidateKey" | "attemptNo" | "status" | "startedAt" | "submittedAt" | "submitReason" | "result" | "testName" | "violations">;

interface Dataset {
  tests: Map<string, Test>;
  assignments: Assignment[];
  attempts: LiteAttempt[];
  people: Map<string, CandidateInfo>;
}

function dateRange(f: AnalyticsFilter): { $gte?: Date; $lte?: Date } | null {
  if (!f.from && !f.to) return null;
  const r: { $gte?: Date; $lte?: Date } = {};
  if (f.from) r.$gte = new Date(`${f.from}T00:00:00`);
  if (f.to) r.$lte = new Date(`${f.to}T23:59:59.999`);
  return r;
}

async function loadDataset(f: AnalyticsFilter): Promise<Dataset> {
  const db = await getDb();
  const tests = await db.collection<Test>(COLLECTIONS.tests).find({ deletedAt: null }).toArray();
  const testMap = new Map(tests.map((t) => [t._id, t]));
  const aFilter: Record<string, unknown> = { deletedAt: null };
  let testIds: string[] | null = null;
  if (f.testId) testIds = [f.testId];
  if (f.categoryId) testIds = (testIds ?? tests.map((t) => t._id)).filter((id) => testMap.get(id)?.categoryId === f.categoryId);
  if (testIds) aFilter.testId = { $in: testIds };
  if (f.kind) aFilter["candidate.kind"] = f.kind;
  if (f.status) aFilter.status = f.status;
  const range = dateRange(f);
  if (range) aFilter.createdAt = range;
  let assignments = await db.collection<Assignment>(COLLECTIONS.assignments).find(aFilter).limit(20000).toArray();
  const people = await describeCandidates(dedupeRefs(assignments));
  if (f.departmentId) assignments = assignments.filter((a) => people.get(a.candidateKey)?.departmentId === f.departmentId);
  if (f.designationId) assignments = assignments.filter((a) => people.get(a.candidateKey)?.designationId === f.designationId);
  const ids = assignments.map((a) => a._id);
  const attempts = ids.length
    ? await db
        .collection<Attempt>(COLLECTIONS.attempts)
        .find({ assignmentId: { $in: ids } }, { projection: { paper: 0, answers: 0, events: 0, config: 0, sections: 0 } })
        .toArray()
    : [];
  return { tests: testMap, assignments, attempts, people };
}

function dedupeRefs(list: Assignment[]) {
  const seen = new Map<string, Assignment["candidate"]>();
  for (const a of list) seen.set(a.candidateKey, a.candidate);
  return Array.from(seen.values());
}

const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const pct = (n: number, d: number) => (d > 0 ? round2((n / d) * 100) : null);

// ── dashboard ──────────────────────────────────────────────────────────────

export async function getDashboard(f: AnalyticsFilter) {
  const db = await getDb();
  const ds = await loadDataset(f);
  const now = new Date();

  const testCounts = { draft: 0, published: 0, active: 0, closed: 0, archived: 0 };
  for (const t of ds.tests.values()) testCounts[effectiveTestStatus(t, now)] += 1;

  const byStatus: Record<string, number> = Object.fromEntries(ASSIGNMENT_STATUSES.map((s) => [s.value, 0]));
  for (const a of ds.assignments) byStatus[a.status] += 1;
  const graded = ds.assignments.filter((a) => a.result);
  const passed = graded.filter((a) => a.result!.passed).length;
  const failed = graded.length - passed;

  const kinds = (k: CandidateKind) => new Set(ds.assignments.filter((a) => a.candidate.kind === k).map((a) => a.candidateKey)).size;
  const depts = new Set<string>();
  const roles = new Set<string>();
  for (const a of ds.assignments) {
    const p = ds.people.get(a.candidateKey);
    if (p?.departmentId) depts.add(p.departmentId);
    if (p?.designationId) roles.add(p.designationId);
  }

  const evaluated = ds.attempts.filter((x) => x.status === "evaluated" && x.result);
  const range = dateRange(f);
  const inRange = (d: Date | null) => !range || (!!d && (!range.$gte || d >= range.$gte) && (!range.$lte || d <= range.$lte));
  const evaluatedInRange = evaluated.filter((x) => inRange(x.submittedAt));
  const scores = evaluatedInRange.map((x) => x.result!.finalScore);
  const percents = evaluatedInRange.map((x) => x.result!.percentage);
  const times = evaluatedInRange.map((x) => x.result!.timeTakenSec);
  const passedAttempts = evaluatedInRange.filter((x) => x.result!.passed).length;

  // Trend: submitted attempts per week (last 12 weeks).
  const weeks: { label: string; start: Date; value: number; passed: number }[] = [];
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let i = 11; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(start.getDate() - i * 7);
    weeks.push({ label: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), start, value: 0, passed: 0 });
  }
  for (const x of ds.attempts) {
    if (!x.submittedAt) continue;
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (x.submittedAt >= weeks[i].start) {
        weeks[i].value += 1;
        if (x.result?.passed && x.status === "evaluated") weeks[i].passed += 1;
        break;
      }
    }
  }

  // Score distribution (10% buckets).
  const buckets = Array.from({ length: 10 }, (_, i) => ({ key: `b${i}`, label: `${i * 10}–${i === 9 ? 100 : i * 10 + 9}%`, value: 0 }));
  for (const p of percents) buckets[Math.min(9, Math.floor(p / 10))].value += 1;

  // Average % by department and by test.
  const group = (keyOf: (a: Assignment) => string | null, labelOf2: (k: string) => string) => {
    const m = new Map<string, number[]>();
    for (const a of graded) {
      const k = keyOf(a);
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), a.result!.percentage]);
    }
    return Array.from(m, ([k, xs]) => ({ key: k, label: labelOf2(k), value: avg(xs) ?? 0 })).sort((a, b) => b.value - a.value);
  };
  const deptName = new Map<string, string>();
  for (const p of ds.people.values()) if (p.departmentId && p.departmentName) deptName.set(p.departmentId, p.departmentName);
  const byDepartment = group((a) => ds.people.get(a.candidateKey)?.departmentId ?? null, (k) => deptName.get(k) ?? "—").map((d) => ({ ...d, href: `/evaliq/analytics?departmentId=${d.key}` }));
  const byTest = group((a) => a.testId, (k) => ds.tests.get(k)?.name ?? "—").map((d) => ({ ...d, href: `/evaliq/tests/${d.key}` }));

  const passFailByTest = Array.from(
    graded.reduce((m, a) => {
      const cur = m.get(a.testId) ?? { passed: 0, failed: 0 };
      if (a.result!.passed) cur.passed += 1;
      else cur.failed += 1;
      return m.set(a.testId, cur);
    }, new Map<string, { passed: number; failed: number }>()),
    ([k, v]) => ({ key: k, label: ds.tests.get(k)?.name ?? "—", ...v })
  )
    .sort((a, b) => b.passed + b.failed - (a.passed + a.failed))
    .slice(0, 8);

  const byKind = CANDIDATE_KINDS.map((k) => ({ key: k.value, label: `${k.label}s`, value: ds.assignments.filter((a) => a.candidate.kind === k.value).length, href: `/evaliq/assignments?kind=${k.value}` })).filter((d) => d.value > 0);

  const [recentTests, recentDispatches, recentCerts] = await Promise.all([
    db.collection<Test>(COLLECTIONS.tests).find({ deletedAt: null }, { projection: { name: 1, code: 1, status: 1, config: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(5).toArray(),
    db.collection<Dispatch>(COLLECTIONS.dispatches).find({ deletedAt: null }).sort({ createdAt: -1 }).limit(5).toArray(),
    db.collection<OtsCertificate>(COLLECTIONS.certificates).find({ deletedAt: null }).sort({ issuedOn: -1 }).limit(5).toArray(),
  ]);
  const byAssignment = new Map(ds.assignments.map((a) => [a._id, a]));
  const recentCompleted = ds.attempts
    .filter((x) => x.submittedAt)
    .sort((a, b) => b.submittedAt!.getTime() - a.submittedAt!.getTime())
    .slice(0, 6)
    .map((x) => ({ attemptId: x._id, testName: x.testName, who: byAssignment.get(x.assignmentId)?.candidateLabel ?? "—", at: x.submittedAt!, status: x.status, percentage: x.result?.percentage ?? null, passed: x.result?.passed ?? null, reason: x.submitReason }));

  return {
    tests: { total: ds.tests.size, ...testCounts },
    assignments: {
      total: ds.assignments.length,
      pending: byStatus.assigned,
      inProgress: byStatus.in_progress,
      completed: byStatus.completed + byStatus.evaluated + byStatus.submitted,
      awaitingEvaluation: byStatus.submitted,
      expired: byStatus.expired,
      passed,
      failed,
    },
    users: { employees: kinds("employee") + kinds("user"), applicants: kinds("applicant"), students: kinds("student"), departments: depts.size, roles: roles.size },
    performance: {
      attempts: evaluatedInRange.length,
      avgScore: avg(scores),
      avgPercentage: avg(percents),
      passRate: pct(passedAttempts, evaluatedInRange.length),
      failRate: pct(evaluatedInRange.length - passedAttempts, evaluatedInRange.length),
      avgTimeSec: avg(times),
      highest: percents.length ? Math.max(...percents) : null,
      lowest: percents.length ? Math.min(...percents) : null,
    },
    charts: {
      assignmentStatus: ASSIGNMENT_STATUSES.map((s) => ({ key: s.value, label: s.label, value: byStatus[s.value], href: `/evaliq/assignments?status=${s.value}` })).filter((d) => d.value > 0),
      testStatus: TEST_STATUSES.map((s) => ({ key: s.value, label: s.label, value: testCounts[s.value], href: `/evaliq/tests?status=${s.value}` })).filter((d) => d.value > 0),
      trend: weeks.map((w) => ({ label: w.label, value: w.value, passed: w.passed })),
      distribution: buckets,
      byDepartment,
      byTest: byTest.slice(0, 10),
      passFailByTest,
      byKind,
    },
    recent: { tests: recentTests, dispatches: recentDispatches, completed: recentCompleted, certificates: recentCerts },
  };
}

// ── group analytics (department / role / batch / course / candidate type) ─

export const GROUP_BYS = [
  { value: "department", label: "Department" },
  { value: "designation", label: "Role / Designation" },
  { value: "kind", label: "Candidate Type" },
  { value: "employmentType", label: "Employee Type" },
  { value: "batch", label: "Batch" },
  { value: "program", label: "Course / Program" },
  { value: "position", label: "Applied Position" },
  { value: "test", label: "Test" },
  { value: "category", label: "Test Category" },
] as const;
export type GroupBy = (typeof GROUP_BYS)[number]["value"];

export interface GroupRow {
  key: string;
  label: string;
  people: number;
  assigned: number;
  completed: number;
  pending: number;
  inProgress: number;
  expired: number;
  graded: number;
  passed: number;
  avgScore: number | null;
  avgPercentage: number | null;
  passRate: number | null;
  failRate: number | null;
  avgTimeSec: number | null;
}

export async function groupAnalytics(groupBy: GroupBy, f: AnalyticsFilter): Promise<GroupRow[]> {
  const ds = await loadDataset(f);
  const cats = groupBy === "category" ? await categoryMap("test") : new Map<string, string>();
  const keysOf = (a: Assignment): { key: string; label: string }[] => {
    const p = ds.people.get(a.candidateKey);
    switch (groupBy) {
      case "department":
        return p?.departmentId ? [{ key: p.departmentId, label: p.departmentName ?? "—" }] : [{ key: "none", label: a.candidate.kind === "employee" ? "No department" : "Not an employee" }];
      case "designation":
        return p?.designationId ? [{ key: p.designationId, label: p.designationName ?? "—" }] : [{ key: "none", label: a.candidate.kind === "employee" ? "No designation" : "Not an employee" }];
      case "kind":
        return [{ key: a.candidate.kind, label: labelOf(CANDIDATE_KINDS, a.candidate.kind) }];
      case "employmentType":
        return [{ key: p?.employmentType ?? "none", label: p?.employmentType ?? "—" }];
      case "batch":
        return p?.batchIds.length ? p.batchIds.map((b, i) => ({ key: b, label: p.batchNames[i] })) : [{ key: "none", label: "No batch" }];
      case "program":
        return p?.programIds.length ? p.programIds.map((b, i) => ({ key: b, label: p.programNames[i] })) : [{ key: "none", label: "No course" }];
      case "position":
        return [{ key: p?.positionTitle ?? "none", label: p?.positionTitle ?? "Not an applicant" }];
      case "test":
        return [{ key: a.testId, label: ds.tests.get(a.testId)?.name ?? "—" }];
      case "category": {
        const c = ds.tests.get(a.testId)?.categoryId;
        return [{ key: c ?? "none", label: c ? cats.get(c) ?? "—" : "Uncategorised" }];
      }
    }
  };
  const attemptsBy = new Map<string, LiteAttempt[]>();
  for (const x of ds.attempts) attemptsBy.set(x.assignmentId, [...(attemptsBy.get(x.assignmentId) ?? []), x]);
  const rows = new Map<string, GroupRow & { _people: Set<string>; _scores: number[]; _pcts: number[]; _times: number[]; _passed: number; _graded: number }>();
  for (const a of ds.assignments) {
    for (const k of keysOf(a)) {
      if (!rows.has(k.key))
        rows.set(k.key, { key: k.key, label: k.label, people: 0, assigned: 0, completed: 0, pending: 0, inProgress: 0, expired: 0, graded: 0, passed: 0, avgScore: null, avgPercentage: null, passRate: null, failRate: null, avgTimeSec: null, _people: new Set(), _scores: [], _pcts: [], _times: [], _passed: 0, _graded: 0 });
      const r = rows.get(k.key)!;
      r._people.add(a.candidateKey);
      r.assigned += 1;
      if (["completed", "evaluated", "submitted"].includes(a.status)) r.completed += 1;
      if (a.status === "assigned") r.pending += 1;
      if (a.status === "in_progress") r.inProgress += 1;
      if (a.status === "expired") r.expired += 1;
      if (a.result) {
        r._graded += 1;
        if (a.result.passed) r._passed += 1;
        r._scores.push(a.result.score);
        r._pcts.push(a.result.percentage);
      }
      for (const x of attemptsBy.get(a._id) ?? []) if (x.result && x.status === "evaluated") r._times.push(x.result.timeTakenSec);
    }
  }
  return Array.from(rows.values())
    .map(({ _people, _scores, _pcts, _times, _passed, _graded, ...r }) => ({
      ...r,
      people: _people.size,
      graded: _graded,
      passed: _passed,
      avgScore: avg(_scores),
      avgPercentage: avg(_pcts),
      passRate: pct(_passed, _graded),
      failRate: pct(_graded - _passed, _graded),
      avgTimeSec: avg(_times),
    }))
    .sort((a, b) => b.assigned - a.assigned);
}

// ── reports ────────────────────────────────────────────────────────────────

export const REPORT_TYPES = [
  { value: "tests", label: "Test Performance" },
  { value: "candidates", label: "User Performance" },
  { value: "department", label: "Department Performance" },
  { value: "designation", label: "Role Performance" },
  { value: "applicants", label: "Applicant Performance" },
  { value: "students", label: "Student Performance" },
  { value: "questions", label: "Question Performance" },
  { value: "sections", label: "Section Performance" },
  { value: "attempts", label: "Attempt Analysis" },
  { value: "passfail", label: "Pass / Fail Analysis" },
  { value: "time", label: "Time Analysis" },
  { value: "difficulty", label: "Difficulty Analysis" },
] as const;
export type ReportType = (typeof REPORT_TYPES)[number]["value"];

export interface Report {
  title: string;
  columns: { header: string; key: string; width?: number; numeric?: boolean }[];
  rows: Record<string, string | number | null>[];
  note?: string;
}

const d1 = (n: number | null) => (n === null ? null : round2(n));
const secs = (n: number | null) => (n === null ? null : Math.round(n));

function groupReport(title: string, rows: GroupRow[]): Report {
  return {
    title,
    columns: [
      { header: "Group", key: "label", width: 30 },
      { header: "People", key: "people", numeric: true },
      { header: "Assigned", key: "assigned", numeric: true },
      { header: "Completed", key: "completed", numeric: true },
      { header: "Pending", key: "pending", numeric: true },
      { header: "Expired", key: "expired", numeric: true },
      { header: "Avg Score", key: "avgScore", numeric: true },
      { header: "Avg %", key: "avgPercentage", numeric: true },
      { header: "Pass Rate %", key: "passRate", numeric: true },
      { header: "Fail Rate %", key: "failRate", numeric: true },
      { header: "Avg Time (s)", key: "avgTimeSec", numeric: true },
    ],
    rows: rows.map((r) => ({ ...r, avgTimeSec: secs(r.avgTimeSec) })),
  };
}

async function evaluatedWithPaper(f: AnalyticsFilter): Promise<Attempt[]> {
  const ds = await loadDataset(f);
  const ids = ds.assignments.map((a) => a._id);
  if (!ids.length) return [];
  const db = await getDb();
  return db
    .collection<Attempt>(COLLECTIONS.attempts)
    .find({ assignmentId: { $in: ids }, status: { $in: ["evaluated", "pending_evaluation"] } }, { projection: { "paper.definition": 0, "paper.view": 0, "paper.prompt": 0, events: 0, "answers.response": 0 } })
    .limit(5000)
    .toArray();
}

export async function buildReport(type: ReportType, f: AnalyticsFilter): Promise<Report> {
  switch (type) {
    case "department":
      return groupReport("Department Performance", await groupAnalytics("department", { ...f, kind: f.kind || "employee" }));
    case "designation":
      return groupReport("Role Performance", await groupAnalytics("designation", { ...f, kind: f.kind || "employee" }));
    case "tests": {
      const rows = await groupAnalytics("test", f);
      const ds = await loadDataset(f);
      const hi = new Map<string, number[]>();
      for (const x of ds.attempts) if (x.status === "evaluated" && x.result) hi.set(x.testId, [...(hi.get(x.testId) ?? []), x.result.percentage]);
      return {
        title: "Test Performance",
        columns: [
          { header: "Test", key: "label", width: 34 },
          { header: "Assigned", key: "assigned", numeric: true },
          { header: "Completed", key: "completed", numeric: true },
          { header: "Pending", key: "pending", numeric: true },
          { header: "In Progress", key: "inProgress", numeric: true },
          { header: "Expired", key: "expired", numeric: true },
          { header: "Avg %", key: "avgPercentage", numeric: true },
          { header: "Highest %", key: "highest", numeric: true },
          { header: "Lowest %", key: "lowest", numeric: true },
          { header: "Pass Rate %", key: "passRate", numeric: true },
          { header: "Avg Time (s)", key: "avgTimeSec", numeric: true },
        ],
        rows: rows.map((r) => {
          const xs = hi.get(r.key) ?? [];
          return { ...r, avgTimeSec: secs(r.avgTimeSec), highest: xs.length ? Math.max(...xs) : null, lowest: xs.length ? Math.min(...xs) : null };
        }),
      };
    }
    case "candidates":
    case "applicants":
    case "students": {
      const kind = type === "applicants" ? "applicant" : type === "students" ? "student" : f.kind;
      const ds = await loadDataset({ ...f, kind });
      const m = new Map<string, Assignment[]>();
      for (const a of ds.assignments) m.set(a.candidateKey, [...(m.get(a.candidateKey) ?? []), a]);
      const rows = Array.from(m, ([key, list]) => {
        const p = ds.people.get(key);
        const graded = list.filter((a) => a.result);
        return {
          name: p?.name ?? list[0].candidateLabel,
          type: labelOf(CANDIDATE_KINDS, list[0].candidate.kind),
          context: p?.departmentName ?? p?.positionTitle ?? p?.batchNames.join(", ") ?? "",
          role: p?.designationName ?? p?.applicationStatus ?? p?.programNames.join(", ") ?? "",
          assigned: list.length,
          completed: list.filter((a) => ["completed", "evaluated", "submitted"].includes(a.status)).length,
          pending: list.filter((a) => a.status === "assigned" || a.status === "in_progress").length,
          passed: graded.filter((a) => a.result!.passed).length,
          failed: graded.filter((a) => !a.result!.passed).length,
          avgPercentage: avg(graded.map((a) => a.result!.percentage)),
        };
      }).sort((a, b) => (b.avgPercentage ?? -1) - (a.avgPercentage ?? -1));
      return {
        title: type === "applicants" ? "Applicant Performance" : type === "students" ? "Student Performance" : "User Performance",
        columns: [
          { header: "Name", key: "name", width: 26 },
          { header: "Type", key: "type", width: 12 },
          { header: type === "applicants" ? "Position" : type === "students" ? "Batch" : "Department / Context", key: "context", width: 22 },
          { header: type === "applicants" ? "Application Status" : type === "students" ? "Course" : "Role", key: "role", width: 20 },
          { header: "Assigned", key: "assigned", numeric: true },
          { header: "Completed", key: "completed", numeric: true },
          { header: "Pending", key: "pending", numeric: true },
          { header: "Passed", key: "passed", numeric: true },
          { header: "Failed", key: "failed", numeric: true },
          { header: "Avg %", key: "avgPercentage", numeric: true },
        ],
        rows,
      };
    }
    case "questions":
    case "difficulty":
    case "sections": {
      const attempts = await evaluatedWithPaper(f);
      if (type === "sections") {
        const m = new Map<string, { test: string; section: string; pcts: number[]; obtained: number; total: number; n: number }>();
        for (const a of attempts)
          for (const s of a.result?.sections ?? []) {
            const k = `${a.testId}:${s.title}`;
            const cur = m.get(k) ?? { test: a.testName, section: s.title, pcts: [], obtained: 0, total: 0, n: 0 };
            cur.pcts.push(s.percentage);
            cur.obtained += s.obtained;
            cur.total += s.total;
            cur.n += 1;
            m.set(k, cur);
          }
        return {
          title: "Section Performance",
          columns: [
            { header: "Test", key: "test", width: 28 },
            { header: "Section", key: "section", width: 24 },
            { header: "Attempts", key: "n", numeric: true },
            { header: "Avg Score", key: "avgScore", numeric: true },
            { header: "Section Marks", key: "marks", numeric: true },
            { header: "Avg %", key: "avgPct", numeric: true },
            { header: "Lowest %", key: "lowest", numeric: true },
          ],
          rows: Array.from(m.values()).map((r) => ({ test: r.test, section: r.section, n: r.n, avgScore: d1(r.obtained / r.n), marks: d1(r.total / r.n), avgPct: avg(r.pcts), lowest: Math.min(...r.pcts) })),
        };
      }
      const q = new Map<string, { code: string; type: string; difficulty: string; subject: string; served: number; correct: number; incorrect: number; partial: number; skipped: number; pending: number; timeMs: number; awarded: number; marks: number }>();
      for (const a of attempts)
        a.paper.forEach((p, i) => {
          const cur = q.get(p.qid) ?? { code: p.code, type: QUESTION_TYPES[p.type]?.label ?? p.type, difficulty: p.difficulty, subject: p.subject, served: 0, correct: 0, incorrect: 0, partial: 0, skipped: 0, pending: 0, timeMs: 0, awarded: 0, marks: 0 };
          cur.served += 1;
          const st = p.outcome?.status ?? "pending";
          if (st === "unanswered") cur.skipped += 1;
          else cur[st] += 1;
          cur.timeMs += a.answers[i]?.timeMs ?? 0;
          cur.awarded += Math.max(0, p.outcome?.awarded ?? 0);
          cur.marks += p.marks;
          q.set(p.qid, cur);
        });
      if (type === "difficulty") {
        const m = new Map<string, { served: number; correct: number; skipped: number; awarded: number; marks: number; timeMs: number; questions: number }>();
        for (const r of q.values()) {
          const cur = m.get(r.difficulty) ?? { served: 0, correct: 0, skipped: 0, awarded: 0, marks: 0, timeMs: 0, questions: 0 };
          cur.served += r.served;
          cur.correct += r.correct;
          cur.skipped += r.skipped;
          cur.awarded += r.awarded;
          cur.marks += r.marks;
          cur.timeMs += r.timeMs;
          cur.questions += 1;
          m.set(r.difficulty, cur);
        }
        return {
          title: "Difficulty Analysis",
          columns: [
            { header: "Difficulty", key: "difficulty", width: 16 },
            { header: "Questions", key: "questions", numeric: true },
            { header: "Times Served", key: "served", numeric: true },
            { header: "Correct %", key: "correctPct", numeric: true },
            { header: "Skipped %", key: "skippedPct", numeric: true },
            { header: "Marks Earned %", key: "earnedPct", numeric: true },
            { header: "Avg Time / Q (s)", key: "avgTime", numeric: true },
          ],
          rows: QUESTION_DIFFICULTIES.filter((d) => m.has(d.value)).map((d) => {
            const r = m.get(d.value)!;
            return { difficulty: d.label, questions: r.questions, served: r.served, correctPct: pct(r.correct, r.served), skippedPct: pct(r.skipped, r.served), earnedPct: pct(r.awarded, r.marks), avgTime: secs(r.timeMs / 1000 / Math.max(r.served, 1)) };
          }),
          note: "Marks Earned % is the share of available marks candidates actually scored — a check that labelled difficulty matches real difficulty.",
        };
      }
      return {
        title: "Question Performance",
        columns: [
          { header: "Question", key: "code", width: 12 },
          { header: "Type", key: "type", width: 16 },
          { header: "Difficulty", key: "difficulty", width: 12 },
          { header: "Subject", key: "subject", width: 14 },
          { header: "Served", key: "served", numeric: true },
          { header: "Correct %", key: "correctPct", numeric: true },
          { header: "Incorrect %", key: "incorrectPct", numeric: true },
          { header: "Skipped %", key: "skippedPct", numeric: true },
          { header: "Marks Earned %", key: "earnedPct", numeric: true },
          { header: "Avg Time (s)", key: "avgTime", numeric: true },
        ],
        rows: Array.from(q.values())
          .map((r) => ({ ...r, correctPct: pct(r.correct, r.served), incorrectPct: pct(r.incorrect, r.served), skippedPct: pct(r.skipped, r.served), earnedPct: pct(r.awarded, r.marks), avgTime: secs(r.timeMs / 1000 / Math.max(r.served, 1)) }))
          .sort((a, b) => (a.earnedPct ?? 101) - (b.earnedPct ?? 101)),
        note: "Sorted most difficult first (lowest share of marks earned). Sort by the other columns to find the most frequently wrong or skipped questions.",
      };
    }
    case "attempts": {
      const ds = await loadDataset(f);
      const m = new Map<number, { n: number; pcts: number[]; passed: number; timeouts: number; security: number }>();
      for (const x of ds.attempts) {
        const cur = m.get(x.attemptNo) ?? { n: 0, pcts: [], passed: 0, timeouts: 0, security: 0 };
        cur.n += 1;
        if (x.status === "evaluated" && x.result) {
          cur.pcts.push(x.result.percentage);
          if (x.result.passed) cur.passed += 1;
        }
        if (x.submitReason === "TIMEOUT_AUTO_SUBMISSION") cur.timeouts += 1;
        if (x.submitReason === "SECURITY_AUTO_SUBMISSION") cur.security += 1;
        m.set(x.attemptNo, cur);
      }
      return {
        title: "Attempt Analysis",
        columns: [
          { header: "Attempt #", key: "no", numeric: true },
          { header: "Attempts", key: "n", numeric: true },
          { header: "Evaluated", key: "evaluated", numeric: true },
          { header: "Avg %", key: "avg", numeric: true },
          { header: "Pass Rate %", key: "passRate", numeric: true },
          { header: "Timed Out", key: "timeouts", numeric: true },
          { header: "Security Auto-Submits", key: "security", numeric: true },
        ],
        rows: Array.from(m, ([no, r]) => ({ no, n: r.n, evaluated: r.pcts.length, avg: avg(r.pcts), passRate: pct(r.passed, r.pcts.length), timeouts: r.timeouts, security: r.security })).sort((a, b) => a.no - b.no),
      };
    }
    case "passfail": {
      const rows = await groupAnalytics("test", f);
      return {
        title: "Pass / Fail Analysis",
        columns: [
          { header: "Test", key: "label", width: 34 },
          { header: "Results", key: "graded", numeric: true },
          { header: "Passed", key: "passed", numeric: true },
          { header: "Failed", key: "failed", numeric: true },
          { header: "Pass Rate %", key: "passRate", numeric: true },
          { header: "Fail Rate %", key: "failRate", numeric: true },
        ],
        rows: rows.map((r) => ({ label: r.label, graded: r.graded, passed: r.passed, failed: r.graded - r.passed, passRate: r.passRate, failRate: r.failRate })),
        note: "Counts use each assignment's scored result (per the test's latest / highest / average attempt policy).",
      };
    }
    case "time": {
      const ds = await loadDataset(f);
      const m = new Map<string, { name: string; times: number[]; limit: number | null; timeouts: number }>();
      for (const x of ds.attempts) {
        if (!x.result || x.status !== "evaluated") continue;
        const t = ds.tests.get(x.testId);
        const cur = m.get(x.testId) ?? { name: x.testName, times: [], limit: t?.config.durationMinutes ?? null, timeouts: 0 };
        cur.times.push(x.result.timeTakenSec);
        if (x.submitReason === "TIMEOUT_AUTO_SUBMISSION") cur.timeouts += 1;
        m.set(x.testId, cur);
      }
      return {
        title: "Time Analysis",
        columns: [
          { header: "Test", key: "name", width: 34 },
          { header: "Duration (min)", key: "limit", numeric: true },
          { header: "Attempts", key: "n", numeric: true },
          { header: "Avg Time (s)", key: "avg", numeric: true },
          { header: "Fastest (s)", key: "min", numeric: true },
          { header: "Slowest (s)", key: "max", numeric: true },
          { header: "Timed Out", key: "timeouts", numeric: true },
          { header: "Avg Time Used %", key: "used", numeric: true },
        ],
        rows: Array.from(m.values()).map((r) => {
          const a = avg(r.times);
          return { name: r.name, limit: r.limit, n: r.times.length, avg: secs(a), min: Math.min(...r.times), max: Math.max(...r.times), timeouts: r.timeouts, used: r.limit && a !== null ? pct(a, r.limit * 60) : null };
        }),
      };
    }
  }
}
