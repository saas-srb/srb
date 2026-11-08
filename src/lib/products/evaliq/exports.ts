import "server-only";
import { buildReport, REPORT_TYPES, type AnalyticsFilter, type ReportType } from "@/lib/products/evaliq/analytics";
import { exportAudit, AUDIT_ACTION_LABEL } from "@/lib/products/evaliq/audit";
import { exportQuestionDocs, IO_COLUMNS, questionToRow } from "@/lib/products/evaliq/questions";
import { categoryMap } from "@/lib/products/evaliq/categories";
import { findAssignments, assignmentFilter } from "@/lib/products/evaliq/assignments";
import { describeCandidates } from "@/lib/products/evaliq/people";
import { testNames } from "@/lib/products/evaliq/tests";
import { certificatesForAssignments } from "@/lib/products/evaliq/certificates";
import { labelOf, ASSIGNMENT_STATUSES, CANDIDATE_KINDS, PRIORITIES } from "@/lib/products/evaliq/constants";
import type { OtsPermission } from "@/lib/ots-roles";

/** Tabular exports (CSV / XLSX). Each dataset maps to the permission that gates it. */

export interface ExportSet {
  title: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
}

export const EXPORT_KINDS: Record<string, OtsPermission> = {
  questions: "EXPORT_QUESTIONS",
  "question-template": "IMPORT_QUESTIONS",
  results: "EXPORT_REPORTS",
  audit: "VIEW_AUDIT_LOG",
  ...Object.fromEntries(REPORT_TYPES.map((r) => [`report-${r.value}`, "EXPORT_REPORTS" as OtsPermission])),
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "");

export async function buildExport(kind: string, sp: Record<string, string | undefined>): Promise<ExportSet> {
  if (kind === "questions" || kind === "question-template") {
    const cats = await categoryMap("question");
    const rows =
      kind === "question-template"
        ? [
            { type: "Single Choice", question: "Which keyword declares a block-scoped constant in JavaScript?", option_a: "var", option_b: "let", option_c: "const", option_d: "static", correct_answer: "C", subject: "JavaScript", topic: "Variables", difficulty: "beginner", marks: 1, negative_marks: 0, explanation: "const declares a block-scoped binding that cannot be reassigned.", tags: "javascript, basics", status: "active" },
            { type: "True / False", question: "React components must return a single root element (or a fragment).", correct_answer: "True", subject: "React", difficulty: "beginner", marks: 1, status: "active" },
            { type: "Fill in the Blank", question: "HTTP status [[1]] means Not Found.", correct_answer: "404", subject: "Web", difficulty: "beginner", marks: 1, status: "active" },
          ]
        : (await exportQuestionDocs({ q: sp.q, type: sp.type, categoryId: sp.categoryId, difficulty: sp.difficulty, status: sp.status, subject: sp.subject })).map((q) => questionToRow(q, q.categoryId ? cats.get(q.categoryId) ?? "" : ""));
    return { title: kind === "questions" ? "Question Bank" : "Question Import Template", columns: IO_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })), rows };
  }
  if (kind === "results") {
    const list = await findAssignments(assignmentFilter({ q: sp.q, testId: sp.testId, status: sp.status, kind: sp.kind, from: sp.from, to: sp.to }));
    const [people, names, certs] = await Promise.all([describeCandidates(list.map((a) => a.candidate)), testNames(list.map((a) => a.testId)), certificatesForAssignments(list.map((a) => a._id))]);
    return {
      title: "Results",
      columns: [
        { header: "Test", key: "test", width: 30 },
        { header: "Candidate", key: "name", width: 24 },
        { header: "Type", key: "kind", width: 12 },
        { header: "Email", key: "email", width: 26 },
        { header: "Department", key: "dept", width: 18 },
        { header: "Role", key: "role", width: 18 },
        { header: "Status", key: "status", width: 16 },
        { header: "Priority", key: "priority", width: 10 },
        { header: "Attempts", key: "attempts", width: 9 },
        { header: "Score", key: "score", width: 9 },
        { header: "Total", key: "total", width: 9 },
        { header: "Percentage", key: "pct", width: 11 },
        { header: "Result", key: "result", width: 10 },
        { header: "Certificate", key: "cert", width: 18 },
        { header: "Assigned", key: "assigned", width: 16 },
        { header: "Due", key: "due", width: 16 },
        { header: "Completed", key: "completed", width: 16 },
      ],
      rows: list.map((a) => {
        const p = people.get(a.candidateKey);
        return {
          test: names.get(a.testId)?.name ?? "",
          name: p?.name ?? a.candidateLabel,
          kind: labelOf(CANDIDATE_KINDS, a.candidate.kind),
          email: p?.email ?? "",
          dept: p?.departmentName ?? p?.positionTitle ?? p?.batchNames.join(", ") ?? "",
          role: p?.designationName ?? p?.programNames.join(", ") ?? "",
          status: labelOf(ASSIGNMENT_STATUSES, a.status),
          priority: labelOf(PRIORITIES, a.priority),
          attempts: a.attemptsUsed,
          score: a.result?.score ?? "",
          total: a.result?.total ?? "",
          pct: a.result?.percentage ?? "",
          result: a.result ? (a.result.passed ? "Pass" : "Fail") : "",
          cert: certs.get(a._id)?.certificateNumber ?? "",
          assigned: iso(a.createdAt),
          due: iso(a.dueAt),
          completed: iso(a.completedAt),
        };
      }),
    };
  }
  if (kind === "audit") {
    const rows = await exportAudit({ action: sp.action, entity: sp.entity, from: sp.from, to: sp.to, q: sp.search });
    return {
      title: "EvalIQ Activity Log",
      columns: [
        { header: "When", key: "when", width: 18 },
        { header: "Actor", key: "actor", width: 26 },
        { header: "Action", key: "action", width: 20 },
        { header: "Entity", key: "entity", width: 12 },
        { header: "Record", key: "record", width: 34 },
        { header: "Details", key: "summary", width: 50 },
      ],
      rows: rows.map((r) => ({ when: iso(r.createdAt), actor: r.actorEmail ?? r.actorId, action: AUDIT_ACTION_LABEL[r.action] ?? r.action, entity: r.entity, record: r.entityLabel ?? r.entityId, summary: r.summary ?? "" })),
    };
  }
  if (kind.startsWith("report-")) {
    const type = kind.slice(7) as ReportType;
    const f: AnalyticsFilter = { from: sp.from, to: sp.to, testId: sp.testId, categoryId: sp.categoryId, kind: sp.kind, departmentId: sp.departmentId, designationId: sp.designationId };
    const r = await buildReport(type, f);
    return { title: r.title, columns: r.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14 })), rows: r.rows };
  }
  throw new Error("Unknown export");
}
