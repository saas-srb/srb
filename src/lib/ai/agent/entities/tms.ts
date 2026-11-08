import "server-only";
import { getProgram, createProgram, updateProgram, deleteProgram, type Program } from "@/lib/products/cohort-ai/programs";
import { getBatch, createBatch, updateBatch, deleteBatch, type Batch } from "@/lib/products/cohort-ai/batches";
import { getStudent, createStudent, updateStudent, type Student } from "@/lib/products/cohort-ai/students";
import { enrollStudent, updateEnrollment, getEnrollment } from "@/lib/products/cohort-ai/enrollments";
import { getClass, createClass, updateClass, deleteClass, markAttendance, isValidAttendanceStatus, batchAttendanceSummary, type ClassSchedule } from "@/lib/products/cohort-ai/classes";
import { getAssignment, createAssignment, updateAssignment, deleteAssignment, reviewSubmission, type Assignment } from "@/lib/products/cohort-ai/assignments";
import { getLiveProject, createLiveProject, updateLiveProject, deleteLiveProject, toggleMilestone, type LiveProject } from "@/lib/products/cohort-ai/projects";
import { getPlacement, createPlacement, updatePlacement, deletePlacement, type PlacementRecord } from "@/lib/products/cohort-ai/placements";
import { getCertificate, issueCertificate, reissueCertificate, setCertificateRevoked, deleteCertificate } from "@/lib/products/cohort-ai/certificates";
import { getPaymentPlan, createPaymentPlan, updatePaymentPlan, deletePaymentPlan, addInstallment, removeInstallment, getPaymentAnalytics } from "@/lib/products/cohort-ai/payments";
import { getTmsSettings, normalizeSettingsInput, updateTmsSettings } from "@/lib/products/cohort-ai/settings";
import { getTmsDashboardStats } from "@/lib/products/cohort-ai/dashboard";
import { buildReport, REPORT_TYPES } from "@/lib/products/cohort-ai/reports";
import { notifyStudent, notifyBatchStudents } from "@/lib/products/cohort-ai/notifications";
import { recordAudit } from "@/lib/products/cohort-ai/audit";
import {
  validateProgram, validateBatch, validateStudent, validateClass, validateLiveProject, validateAssignment, validateCertificate, validatePaymentPlan, validateInstallment, validatePlacement,
} from "@/lib/products/cohort-ai/validation";
import {
  PROGRAM_CATEGORIES, PROGRAM_STATUSES, TRAINING_MODES, BATCH_STATUSES, STUDENT_STATUSES, CLASS_STATUSES, ATTENDANCE_STATUSES, LIVE_PROJECT_STATUSES, CERTIFICATE_TYPES, PAYMENT_METHODS, PLACEMENT_TYPES, SUPPORTED_CURRENCIES,
  isValidStudentStatus,
} from "@/lib/products/cohort-ai/constants";
import { canManageTraining, canManageProgramsBatches, canManageStudents, canIssueCertificates, canManagePayments, canManageSettings, canViewAuditLog } from "@/lib/tms-roles";
import { check, crudOps, f, fail, values, str } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * Training (TMS) for the agent: programs, batches and students, enrolment, classes and attendance, assignments, live projects,
 * fees and installments, certificates and placements. Students see their own enrolment, fees and certificates.
 */

const soft = { deletedAt: null };
const audit = (u: AgentUser, e: { action: string; entity: string; entityId: string; entityLabel?: string | null; summary?: string | null }) => recordAudit({ actorId: u.id, actorEmail: u.email, ...e } as never);
const L = (k: string) => (r: Json) => String(r[k] ?? r._id ?? "");
const CATEGORY = values(PROGRAM_CATEGORIES); const PSTATUS = values(PROGRAM_STATUSES); const MODE = values(TRAINING_MODES); const BSTATUS = values(BATCH_STATUSES);
const SSTATUS = values(STUDENT_STATUSES); const CSTATUS = values(CLASS_STATUSES); const ATT = values(ATTENDANCE_STATUSES); const LPSTATUS = values(LIVE_PROJECT_STATUSES);
const CERT = values(CERTIFICATE_TYPES); const PTYPE = values(PLACEMENT_TYPES); const METHODS = [...PAYMENT_METHODS] as string[]; const CURRENCIES = [...SUPPORTED_CURRENCIES] as string[];
const mine = (u: AgentUser): Json | null => (u.studentId ? { studentId: u.studentId } : null);

export const TMS_ENTITIES: EntityDef[] = [
  {
    key: "tms.program", panel: "tms", label: "Program", description: "Training programs (category, mode, duration, fees, outcomes, status).", collection: "training_programs", idType: "string", baseFilter: soft, titleField: "name", search: ["name", "programCode", "technology"],
    read: "any", write: "staff", allow: canManageProgramsBatches, canDelete: true,
    fields: [f.str("name", "Name", true), f.enum("category", "Category", CATEGORY, true), f.enum("mode", "Mode", MODE), f.enum("status", "Status", PSTATUS), f.num("durationWeeks", "Duration (weeks)"), f.num("fees", "Fees"), f.enum("currency", "Currency", CURRENCIES), f.num("liveProjectCount", "Live projects"), f.str("technology", "Technology / track"), f.text("description", "Description"), f.list("learningOutcomes", "Learning outcomes"), f.list("tools", "Tools"), f.bool("certificateIncluded", "Certificate included"), f.bool("placementAssistance", "Placement assistance")],
    ops: crudOps<Program>({
      entity: "program", validate: validateProgram, get: getProgram, label: L("name"), audit,
      create: (d, u) => createProgram(d, u.id), update: (id, d, u) => updateProgram(id, d, u.id), remove: (id, u) => deleteProgram(id, u.id),
    }),
  },
  {
    key: "tms.batch", panel: "tms", label: "Batch", description: "Batches of a program: dates, timing, mentor, capacity, status.", collection: "training_batches", idType: "string", baseFilter: soft, titleField: "name", search: ["name", "batchCode"],
    read: "any", write: "staff", allow: canManageProgramsBatches, canDelete: true,
    fields: [f.ref("programId", "Program (tms.program id)", "tms.program", true), f.str("name", "Name", true), f.enum("mode", "Mode", MODE), f.enum("status", "Status", BSTATUS), f.date("startDate", "Start date"), f.date("endDate", "End date"), f.num("capacity", "Capacity (seats)"), f.str("timing", "Timing (e.g. Mon–Fri 7–9 PM)"), f.ref("mentorId", "Mentor (hrms.employee id)", "hrms.employee"), f.text("notes", "Notes")],
    ops: crudOps<Batch>({
      entity: "batch", validate: validateBatch, get: getBatch, label: L("name"), audit,
      pre: async (d: Json) => ((await getProgram(String(d.programId))) ? null : fail("That program no longer exists.")),
      create: (d, u) => createBatch(d, u.id), update: (id, d, u) => updateBatch(id, d, u.id), remove: (id, u) => deleteBatch(id, u.id),
    }),
  },
  {
    key: "tms.student", panel: "tms", label: "Student", description: "Enrolled training students: contact, education, guardian, links and status.", collection: "training_students", idType: "string", baseFilter: soft, titleField: "fullName", search: ["fullName", "email", "mobile", "studentCode"],
    read: "staff", write: "staff", allow: canManageStudents, hide: ["links", "guardian"],
    self: (u) => (u.studentId ? { _id: u.studentId } : null),
    fields: [f.str("fullName", "Full name", true), f.email("email", "Email"), f.str("mobile", "Mobile"), f.str("address", "Address"), f.str("college", "College"), f.str("university", "University"), f.str("branch", "Branch"), f.str("semester", "Semester"), f.num("graduationYear", "Graduation year"), f.str("guardianName", "Guardian name"), f.str("guardianPhone", "Guardian phone"), f.str("guardianRelation", "Guardian relation"), f.str("linkedin", "LinkedIn URL"), f.str("github", "GitHub URL"), f.str("resumeUrl", "Resume URL"), f.str("photoUrl", "Photo URL"), f.enum("status", "Status", SSTATUS), f.text("notes", "Notes")],
    ops: crudOps<Student>({
      entity: "student", validate: validateStudent, get: getStudent, label: L("fullName"), audit,
      toInput: (s) => ({ fullName: s.fullName, email: s.email, mobile: s.mobile, address: s.address, college: s.education.college, university: s.education.university, branch: s.education.branch, semester: s.education.semester, graduationYear: s.education.graduationYear, guardianName: s.guardian.name, guardianPhone: s.guardian.phone, guardianRelation: s.guardian.relation, linkedin: s.links.linkedin, github: s.links.github, resumeUrl: s.links.resumeUrl, photoUrl: s.links.photoUrl, status: s.status, notes: s.notes }),
      create: (d, u) => createStudent(d, u.id), update: (id, d, u) => updateStudent(id, d, u.id),
    }),
  },
  { key: "tms.enrollment", panel: "tms", label: "Enrollment", description: "Which student is in which batch, with status and progress.", collection: "student_enrollments", idType: "string", baseFilter: soft, read: "staff", self: mine },
  {
    key: "tms.class", panel: "tms", label: "Class", description: "Scheduled classes per batch (topic, date, time, mentor, status).", collection: "class_schedules", idType: "string", baseFilter: soft, titleField: "topic", search: ["topic"],
    read: "staff", write: "staff", allow: canManageTraining, canDelete: true,
    fields: [f.ref("batchId", "Batch (tms.batch id)", "tms.batch", true), f.str("topic", "Topic", true), f.date("date", "Date", true), f.str("startTime", "Start time HH:MM"), f.num("durationMinutes", "Duration (minutes)"), f.str("meetingLink", "Meeting link"), f.str("recordingUrl", "Recording URL"), f.enum("status", "Status", CSTATUS), f.ref("mentorId", "Mentor (hrms.employee id)", "hrms.employee"), f.text("notes", "Notes")],
    ops: crudOps<ClassSchedule>({
      entity: "class", validate: validateClass, get: getClass, label: L("topic"), audit,
      pre: async (d: Json) => ((await getBatch(String(d.batchId))) ? null : fail("That batch no longer exists.")),
      create: async (d, u) => createClass(d, (await getBatch(String((d as Json).batchId)))!.programId, u.id), update: (id, d, u) => updateClass(id, d, u.id), remove: (id, u) => deleteClass(id, u.id),
      post: async (rec, _u, mode) => { if (mode === "create") await notifyBatchStudents(rec.batchId, { type: "class_scheduled", title: "Class scheduled", body: `${rec.topic} · ${rec.date}${rec.startTime ? ` ${rec.startTime}` : ""}`, link: "/cohort-ai/me/schedule", dedupeKey: `class_scheduled:${rec._id}` } as never); },
    }),
  },
  {
    key: "tms.assignment", panel: "tms", label: "Assignment", description: "Assignments set for a batch (title, due date, max marks).", collection: "assignments", idType: "string", baseFilter: soft, titleField: "title", search: ["title"],
    read: "staff", write: "staff", allow: canManageTraining, canDelete: true,
    fields: [f.ref("batchId", "Batch (tms.batch id)", "tms.batch", true), f.str("title", "Title", true), f.date("dueDate", "Due date"), f.num("maxMarks", "Maximum marks"), f.str("attachmentUrl", "Attachment URL"), f.text("description", "Description")],
    ops: crudOps<Assignment>({
      entity: "assignment", validate: validateAssignment, get: getAssignment, label: L("title"), audit,
      pre: async (d: Json) => ((await getBatch(String(d.batchId))) ? null : fail("That batch no longer exists.")),
      create: async (d, u) => createAssignment(d, (await getBatch(String((d as Json).batchId)))!.programId, u.id), update: (id, d, u) => updateAssignment(id, d, u.id), remove: (id, u) => deleteAssignment(id, u.id),
      post: async (rec, _u, mode) => { if (mode === "create") await notifyBatchStudents(rec.batchId, { type: "assignment_posted", title: "New assignment", body: `${rec.title}${rec.dueDate ? ` · due ${rec.dueDate}` : ""}`, link: "/cohort-ai/me/assignments", dedupeKey: `assignment_posted:${rec._id}` } as never); },
    }),
  },
  {
    key: "tms.live_project", panel: "tms", label: "Live project", description: "Live projects students work on (status, repo, milestones, mentor).", collection: "live_projects", idType: "string", baseFilter: soft, titleField: "title", search: ["title", "projectCode"],
    read: "staff", write: "staff", allow: canManageTraining, canDelete: true,
    fields: [f.str("title", "Title", true), f.ref("programId", "Program (tms.program id)", "tms.program", true), f.enum("status", "Status", LPSTATUS), f.str("repoUrl", "Repo URL"), f.str("demoUrl", "Demo URL"), f.date("startDate", "Start date"), f.date("dueDate", "Due date"), f.num("progressPercent", "Progress %"), f.text("description", "Description"), f.ref("batchId", "Batch (tms.batch id)", "tms.batch"), f.ref("mentorId", "Mentor (hrms.employee id)", "hrms.employee"), f.list("studentIds", "Student ids (tms.student)"), f.json("milestones", "Milestones: [{id?, title, done, dueDate}]")],
    ops: crudOps<LiveProject>({
      entity: "project", validate: validateLiveProject, get: getLiveProject, label: L("title"), audit,
      pre: async (d: Json) => ((await getProgram(String(d.programId))) ? null : fail("That program no longer exists.")),
      create: (d, u) => createLiveProject(d, u.id), update: (id, d, u) => updateLiveProject(id, d, u.id), remove: (id, u) => deleteLiveProject(id, u.id),
    }),
  },
  {
    key: "tms.placement", panel: "tms", label: "Placement", description: "Students placed in jobs/internships: company, role, package.", collection: "placement_records", idType: "string", baseFilter: soft, titleField: "company", search: ["company", "role"],
    read: "staff", write: "staff", allow: canManageTraining, canDelete: true, self: mine,
    fields: [f.ref("studentId", "Student (tms.student id)", "tms.student", true), f.str("company", "Company", true), f.str("role", "Role", true), f.enum("type", "Type", PTYPE), f.date("placedOn", "Placed on"), f.num("packageLpa", "Package (LPA)"), f.str("offerLetterUrl", "Offer letter URL"), f.ref("programId", "Program (tms.program id)", "tms.program"), f.str("location", "Location"), f.text("notes", "Notes")],
    ops: crudOps<PlacementRecord>({
      entity: "placement", validate: validatePlacement, get: getPlacement, label: L("company"), audit,
      pre: async (d: Json) => ((await getStudent(String(d.studentId))) ? null : fail("Student not found.")),
      create: (d, u) => createPlacement(d, u.id), update: (id, d, u) => updatePlacement(id, d, u.id), remove: (id, u) => deletePlacement(id, u.id),
    }),
  },
  {
    key: "tms.payment_plan", panel: "tms", label: "Fee plan", description: "A student's fees: total, discount, installments paid and balance.", collection: "payments", idType: "string", baseFilter: soft, search: ["notes"],
    read: "staff", allowRead: canManagePayments, write: "staff", allow: canManagePayments, canDelete: true, self: mine,
    fields: [f.ref("studentId", "Student (tms.student id)", "tms.student", true, true), f.ref("programId", "Program (tms.program id)", "tms.program", true, true), f.num("totalFees", "Total fees", true), f.num("discount", "Discount"), f.ref("batchId", "Batch (tms.batch id)", "tms.batch"), f.str("enrollmentId", "Enrollment id"), f.enum("currency", "Currency", CURRENCIES), f.text("notes", "Notes")],
    ops: {
      create: async (v, u) => {
        const c = check(validatePaymentPlan(v));
        if (!c.ok) return c.error;
        const [student, program] = await Promise.all([getStudent(c.data.studentId), getProgram(c.data.programId)]);
        if (!student) return fail("Student not found.");
        if (!program) return fail("Program not found.");
        const plan = await createPaymentPlan(c.data, u.id);
        await audit(u, { action: "create", entity: "payment", entityId: plan._id, entityLabel: `${student.fullName} · ${program.name}`, summary: `fees ${plan.totalFees} ${plan.currency}` });
        return { ok: true, id: plan._id, record: plan };
      },
      update: async (id, v, u) => {
        const before = await getPaymentPlan(id);
        if (!before) return fail("Payment plan not found.");
        const c = check(validatePaymentPlan({ studentId: before.studentId, programId: before.programId, totalFees: before.totalFees, discount: before.discount, currency: before.currency, notes: before.notes, ...v }));
        if (!c.ok) return c.error;
        await updatePaymentPlan(id, { totalFees: c.data.totalFees, discount: c.data.discount, notes: c.data.notes, currency: c.data.currency }, u.id);
        await audit(u, { action: "update", entity: "payment", entityId: id, summary: `fees ${before.totalFees} → ${c.data.totalFees}` });
        return { ok: true, id, result: "Fee plan updated." };
      },
      remove: async (id, u) => {
        if (!(await deletePaymentPlan(id, u.id))) return fail("Could not delete.");
        await audit(u, { action: "delete", entity: "payment", entityId: id });
        return { ok: true, id };
      },
    },
  },
  { key: "tms.certificate", panel: "tms", label: "Certificate", description: "Certificates issued to students (number, type, program, revoked or not).", collection: "certificates", idType: "string", baseFilter: soft, titleField: "certificateNumber", search: ["certificateNumber", "title"], read: "staff", self: mine },
  { key: "tms.class_attendance", panel: "tms", label: "Class attendance", description: "Attendance of students per class.", collection: "class_attendance", read: "staff", self: mine },
  { key: "tms.submission", panel: "tms", label: "Assignment submission", description: "Student submissions with marks and feedback.", collection: "assignment_submissions", read: "staff", self: mine },
  { key: "tms.activity", panel: "tms", label: "Audit log", description: "Who changed what in Cohort AI.", collection: "training_audit_logs", idType: "string", search: ["entityLabel", "summary", "actorEmail"], read: "admin", allowRead: canViewAuditLog },
];

export const TMS_ACTIONS: ActionDef[] = [
  {
    key: "tms.assign_batch", panel: "tms", label: "Enrol a student in a batch", description: "Put a student into a batch of a program (uses a seat).", level: "staff", allow: canManageStudents,
    params: [f.ref("studentId", "Student id", "tms.student", true), f.ref("batchId", "Batch id", "tms.batch", true)],
    run: async (v, u) => {
      const student = await getStudent(String(v.studentId));
      if (!student) return fail("Student not found.");
      const batch = await getBatch(String(v.batchId));
      if (!batch) return fail("Select a valid batch.");
      const r = await enrollStudent({ studentId: student._id, programId: batch.programId, batchId: batch._id }, u.id);
      if (!r.ok) return fail(r.reason);
      await audit(u, { action: "enroll", entity: "enrollment", entityId: r.enrollment._id, entityLabel: `${student.fullName} → ${batch.name}` });
      return { ok: true, id: r.enrollment._id, result: `${student.fullName} enrolled in ${batch.name}.` };
    },
  },
  {
    key: "tms.update_enrollment", panel: "tms", label: "Update a student's status or progress in a batch", description: "Set the enrolment status and/or progress %.", level: "staff", allow: canManageStudents,
    params: [f.ref("studentId", "Student id", "tms.student", true), f.ref("batchId", "Batch id", "tms.batch", true), f.enum("status", "Status", SSTATUS), f.num("progressPercent", "Progress %")],
    run: async (v, u) => {
      const enrollment = await getEnrollment(String(v.studentId), String(v.batchId));
      if (!enrollment) return fail("Enrolment not found.");
      if (v.status !== undefined && !isValidStudentStatus(String(v.status))) return fail("Unknown status.", { allowed: SSTATUS });
      const patch = { ...(v.status !== undefined ? { status: String(v.status) } : {}), ...(v.progressPercent !== undefined ? { progressPercent: Number(v.progressPercent) } : {}) };
      await updateEnrollment(enrollment._id, patch, u.id);
      await audit(u, { action: "update", entity: "enrollment", entityId: enrollment._id, summary: [patch.status ? `status → ${patch.status}` : null, patch.progressPercent !== undefined ? `progress → ${patch.progressPercent}%` : null].filter(Boolean).join(", ") });
      return { ok: true, id: enrollment._id, result: "Enrolment updated." };
    },
  },
  {
    key: "tms.mark_attendance", panel: "tms", label: "Mark class attendance", description: "Record each student's attendance for a class: entries [{studentId, status}].", level: "staff", allow: canManageTraining,
    params: [f.ref("classId", "Class id (tms.class)", "tms.class", true), f.json("entries", `Entries: [{studentId, status: ${ATT.join("|")}}]`, true)],
    run: async (v, u) => {
      const cls = await getClass(String(v.classId));
      if (!cls) return fail("Class not found.");
      const entries = (Array.isArray(v.entries) ? (v.entries as Json[]) : []).filter((e) => e.studentId && isValidAttendanceStatus(String(e.status))).map((e) => ({ studentId: String(e.studentId), status: String(e.status) as never }));
      if (!entries.length) return fail("No valid attendance entries.", { allowed: ATT });
      await markAttendance(cls._id, cls.batchId, entries, u.id);
      await audit(u, { action: "record", entity: "class", entityId: cls._id, entityLabel: cls.topic, summary: `attendance marked for ${entries.length} student(s)` });
      return { ok: true, id: cls._id, result: `Attendance marked for ${entries.length} student(s).` };
    },
  },
  {
    key: "tms.review_submission", panel: "tms", label: "Review a student's assignment submission", description: "Give marks and feedback, or send it back for rework.", level: "staff", allow: canManageTraining,
    params: [f.ref("assignmentId", "Assignment id", "tms.assignment", true), f.ref("studentId", "Student id", "tms.student", true), f.num("marks", "Marks"), f.text("feedback", "Feedback"), f.bool("approved", "Approved (false = send back)")],
    run: async (v, u) => {
      const a = await getAssignment(String(v.assignmentId));
      if (!a) return fail("Assignment not found.");
      const marks = v.marks === undefined || v.marks === null || v.marks === "" ? null : Number(v.marks);
      if (marks !== null && (!Number.isFinite(marks) || marks < 0 || marks > a.maxMarks)) return fail(`Marks must be between 0 and ${a.maxMarks}.`);
      const approved = v.approved !== false;
      const r = await reviewSubmission(a._id, String(v.studentId), { marks, feedback: str(v.feedback), approved }, u.id);
      if (!r) return fail("No submission to review yet.");
      await audit(u, { action: "record", entity: "assignment", entityId: a._id, entityLabel: a.title, summary: approved ? `reviewed (${marks ?? "no"} marks)` : "sent back for rework" });
      return { ok: true, id: a._id, result: approved ? "Submission reviewed." : "Sent back for rework." };
    },
  },
  {
    key: "tms.toggle_milestone", panel: "tms", label: "Tick or untick a live-project milestone", description: "Mark a milestone done or reopen it. Students can do this on their own project.", level: "any",
    params: [f.ref("projectId", "Live project id (tms.live_project)", "tms.live_project", true), f.str("milestoneId", "Milestone id", true), f.bool("done", "Done")],
    run: async (v, u) => {
      const p = await getLiveProject(String(v.projectId));
      if (!p) return fail("Project not found.");
      const staff = canManageTraining(u);
      if (!staff && !(u.studentId && p.studentIds.includes(u.studentId))) return fail("You're not assigned to this project.");
      await toggleMilestone(p._id, String(v.milestoneId), v.done === true, u.id);
      await audit(u, { action: "update", entity: "project", entityId: p._id, entityLabel: p.title, summary: `milestone ${v.done === true ? "completed" : "reopened"}` });
      return { ok: true, id: p._id, result: v.done === true ? "Milestone completed." : "Milestone reopened." };
    },
  },
  {
    key: "tms.record_installment", panel: "tms", label: "Record a fee payment (installment)", description: "Record money received from a student against their fee plan; notifies the student and issues a receipt number.", level: "staff", allow: canManagePayments,
    params: [f.ref("planId", "Fee plan id (tms.payment_plan)", "tms.payment_plan", true), f.num("amount", "Amount", true), f.enum("method", "Method", METHODS, true), f.date("paidOn", "Paid on"), f.str("transactionId", "Transaction / reference id"), f.str("note", "Note")],
    run: async (v, u) => {
      const c = check(validateInstallment(v));
      if (!c.ok) return c.error;
      const r = await addInstallment(String(v.planId), c.data, u.id);
      if (!r.ok) return fail(r.reason);
      const plan = await getPaymentPlan(String(v.planId));
      if (plan) await notifyStudent(plan.studentId, { type: "payment_recorded", title: "Payment received", body: `${c.data.amount} ${plan.currency} · receipt ${r.invoiceNumber}`, link: "/cohort-ai/me/payments", dedupeKey: `payment_recorded:${r.invoiceNumber}` } as never);
      await audit(u, { action: "record", entity: "payment", entityId: String(v.planId), entityLabel: r.invoiceNumber, summary: `${c.data.amount} received via ${c.data.method}` });
      return { ok: true, id: String(v.planId), result: `Payment recorded, receipt ${r.invoiceNumber}.` };
    },
  },
  {
    key: "tms.remove_installment", panel: "tms", label: "Remove a recorded fee payment", description: "Delete an installment from a fee plan.", level: "staff", allow: canManagePayments, destructive: true,
    params: [f.ref("planId", "Fee plan id", "tms.payment_plan", true), f.str("installmentId", "Installment id (inside the plan)", true)],
    run: async (v, u) => {
      if (!(await removeInstallment(String(v.planId), String(v.installmentId), u.id))) return fail("Could not remove that payment.");
      await audit(u, { action: "update", entity: "payment", entityId: String(v.planId), summary: "installment removed" });
      return { ok: true, result: "Payment removed." };
    },
  },
  {
    key: "tms.issue_certificate", panel: "tms", label: "Issue a certificate to a student", description: "Issue a completion/participation/project certificate (numbered, verifiable); notifies the student.", level: "staff", allow: canIssueCertificates,
    params: [f.enum("type", "Type", CERT, true), f.ref("studentId", "Student id", "tms.student", true), f.ref("programId", "Program id", "tms.program", true), f.date("issuedOn", "Issued on"), f.ref("batchId", "Batch id", "tms.batch"), f.str("title", "Title (e.g. project name)"), f.str("grade", "Grade")],
    run: async (v, u) => {
      const c = check(validateCertificate(v));
      if (!c.ok) return c.error;
      const [student, program] = await Promise.all([getStudent(c.data.studentId), getProgram(c.data.programId)]);
      if (!student) return fail("Student not found.");
      if (!program) return fail("Program not found.");
      const cert = await issueCertificate(c.data, u.id);
      await audit(u, { action: "issue", entity: "certificate", entityId: cert._id, entityLabel: `${cert.certificateNumber} · ${student.fullName}`, summary: `${c.data.type} for ${program.name}` });
      await notifyStudent(c.data.studentId, { type: "certificate_issued", title: "A certificate was issued to you", body: `${cert.certificateNumber} · ${program.name}`, link: "/cohort-ai/me/certificates", dedupeKey: `certificate_issued:${cert._id}` } as never);
      return { ok: true, id: cert._id, result: `Certificate ${cert.certificateNumber} issued to ${student.fullName}.` };
    },
  },
  {
    key: "tms.reissue_certificate", panel: "tms", label: "Reissue a certificate", description: "Replace a certificate with a fresh one (the old one is superseded).", level: "staff", allow: canIssueCertificates,
    params: [f.ref("certificateId", "Certificate id", "tms.certificate", true)],
    run: async (v, u) => {
      const before = await getCertificate(String(v.certificateId));
      const cert = await reissueCertificate(String(v.certificateId), u.id);
      if (!cert) return fail("Certificate not found.");
      await audit(u, { action: "reissue", entity: "certificate", entityId: cert._id, entityLabel: cert.certificateNumber, summary: `reissued from ${before?.certificateNumber ?? "?"}` });
      return { ok: true, id: cert._id, result: `Reissued as ${cert.certificateNumber}.` };
    },
  },
  {
    key: "tms.revoke_certificate", panel: "tms", label: "Revoke or reinstate a certificate", description: "Revoke a certificate (it stops verifying) or reinstate it.", level: "staff", allow: canIssueCertificates, destructive: true,
    params: [f.ref("certificateId", "Certificate id", "tms.certificate", true), f.bool("revoked", "Revoked (false = reinstate)"), f.str("reason", "Reason")],
    run: async (v, u) => {
      const revoked = v.revoked !== false;
      const cert = await setCertificateRevoked(String(v.certificateId), revoked, str(v.reason), u.id);
      if (!cert) return fail("Certificate not found.");
      await audit(u, { action: revoked ? "revoke" : "update", entity: "certificate", entityId: String(v.certificateId), entityLabel: cert.certificateNumber, summary: revoked ? `revoked: ${str(v.reason) ?? "no reason"}` : "reinstated" });
      return { ok: true, id: String(v.certificateId), result: revoked ? "Certificate revoked." : "Certificate reinstated." };
    },
  },
  {
    key: "tms.delete_certificate", panel: "tms", label: "Delete a certificate", description: "Permanently delete a certificate record.", level: "staff", allow: canIssueCertificates, destructive: true,
    params: [f.ref("certificateId", "Certificate id", "tms.certificate", true)],
    run: async (v, u) => {
      const before = await getCertificate(String(v.certificateId));
      if (!(await deleteCertificate(String(v.certificateId), u.id))) return fail("Could not delete the certificate.");
      await audit(u, { action: "delete", entity: "certificate", entityId: String(v.certificateId), entityLabel: before?.certificateNumber ?? null });
      return { ok: true, result: "Certificate deleted." };
    },
  },
  {
    key: "tms.save_settings", panel: "tms", label: "Change Cohort AI settings", description: "Track/technology suggestions and the default currency.", level: "admin", allow: canManageSettings,
    params: [f.list("technologySuggestions", "Track suggestions"), f.enum("defaultCurrency", "Default currency", CURRENCIES)],
    run: async (v, u) => {
      const cur = await getTmsSettings();
      const data = normalizeSettingsInput({ ...(cur as unknown as Json), ...v });
      await updateTmsSettings(data, u.id);
      await audit(u, { action: "update", entity: "settings", entityId: "config", entityLabel: "TMS settings", summary: `${data.technologySuggestions.length} track suggestions · default ${data.defaultCurrency}` });
      return { ok: true, result: "Settings saved." };
    },
  },
];

const D = (v: unknown) => (v ? new Date(String(v)) : undefined);
export const TMS_REPORTS: ReportDef[] = [
  { key: "tms.dashboard", panel: "tms", label: "Training dashboard numbers", description: "Students, programs, batches, enrolments, revenue and trends.", level: "staff", params: [f.date("dateFrom", "From"), f.date("dateTo", "To"), f.ref("programId", "Program id", "tms.program")], run: async (v) => (await getTmsDashboardStats({ dateFrom: D(v.dateFrom), dateTo: v.dateTo ? new Date(`${String(v.dateTo)}T23:59:59`) : undefined, programId: str(v.programId) ?? undefined })) as unknown as Json },
  { key: "tms.fees_summary", panel: "tms", label: "Fee collection summary", description: "Total fees, collected, pending and the collection trend.", level: "staff", allow: canManagePayments, params: [], run: async () => (await getPaymentAnalytics()) as unknown as Json },
  { key: "tms.batch_attendance", panel: "tms", label: "Attendance rate of a batch", description: "Attendance summary across all classes of a batch.", level: "staff", params: [f.ref("batchId", "Batch id", "tms.batch", true)], run: async (v) => ({ summary: await batchAttendanceSummary(String(v.batchId)) }) as unknown as Json },
  { key: "tms.report", panel: "tms", label: "Full report", description: `One of the product's reports: ${REPORT_TYPES.map((r) => r.value).join(", ")}.`, level: "staff", params: [f.enum("type", "Report", REPORT_TYPES.map((r) => r.value as string), true)], run: async (v) => { const r = await buildReport(String(v.type) as never); return { title: r.title, meta: r.meta, rows: r.rows.slice(0, 200), totalRows: r.rows.length } as unknown as Json; } },
];
