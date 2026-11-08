import "server-only";
import { randomUUID } from "node:crypto";
import {
  isValidProgramCategory,
  isValidProgramStatus,
  isValidTrainingMode,
  isValidBatchStatus,
  isValidStudentStatus,
  isValidLiveProjectStatus,
  isValidCertificateType,
  DEFAULT_PROGRAM_CATEGORY,
  DEFAULT_PROGRAM_STATUS,
  DEFAULT_TRAINING_MODE,
  DEFAULT_BATCH_STATUS,
  DEFAULT_STUDENT_STATUS,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
} from "@/lib/products/cohort-ai/constants";
import type { ProgramWriteData } from "@/lib/products/cohort-ai/programs";
import type { BatchWriteData } from "@/lib/products/cohort-ai/batches";
import type { StudentWriteData } from "@/lib/products/cohort-ai/students";
import type { ClassWriteData } from "@/lib/products/cohort-ai/classes";
import type { LiveProjectWriteData, Milestone } from "@/lib/products/cohort-ai/projects";
import type { AssignmentWriteData } from "@/lib/products/cohort-ai/assignments";
import type { CertificateIssueData } from "@/lib/products/cohort-ai/certificates";
import type { PaymentPlanWriteData, InstallmentInput, PaymentMethod } from "@/lib/products/cohort-ai/payments";
import { PAYMENT_METHODS } from "@/lib/products/cohort-ai/payments";
import type { PlacementWriteData, PlacementType } from "@/lib/products/cohort-ai/placements";
import { isValidPlacementType } from "@/lib/products/cohort-ai/placements";

/**
 * Hand-rolled server-side validators. Same `{ valid, data } | { valid, errors }`
 * contract as `src/lib/sprintos/validation.ts`.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-()]{7,20}$/;
const URL_RE = /^https?:\/\/[^\s.]+\.\S{2,}$/;

type Ok<T> = { valid: true; data: T };
type Err = { valid: false; errors: Record<string, string> };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function optStr(v: unknown, max = 2000): string | null {
  const s = str(v);
  return s ? s.slice(0, max) : null;
}
function optNum(
  v: unknown,
  errors: Record<string, string>,
  key: string,
  { min = 0 }: { min?: number } = {}
): number | null {
  const s = str(v);
  if (s === "" && typeof v !== "number") return null;
  const n = typeof v === "number" ? v : Number(s);
  if (!Number.isFinite(n)) {
    errors[key] = "Enter a valid number.";
    return null;
  }
  if (n < min) {
    errors[key] = `Must be ${min} or more.`;
    return null;
  }
  return n;
}
function lines(v: unknown, max = 40): string[] {
  if (Array.isArray(v)) return Array.from(new Set(v.map((x) => String(x).trim()).filter(Boolean))).slice(0, max);
  return str(v)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, a) => a.indexOf(s) === i)
    .slice(0, max);
}
function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === "1";
}
function currency(v: unknown): string {
  const c = str(v).toUpperCase() || DEFAULT_CURRENCY;
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c) ? c : DEFAULT_CURRENCY;
}

// Re-exported for callers that need the plain date guard (later phases).
export function optDate(v: unknown, errors: Record<string, string>, key: string): string | null {
  const s = str(v);
  if (!s) return null;
  if (!DATE_RE.test(s) || Number.isNaN(new Date(s).getTime())) {
    errors[key] = "Enter a valid date.";
    return null;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

export function validateProgram(input: Record<string, unknown>): Ok<ProgramWriteData> | Err {
  const errors: Record<string, string> = {};

  const name = str(input.name);
  if (!name) errors.name = "Program name is required.";
  if (name.length > 200) errors.name = "Program name is too long.";

  const categoryRaw = str(input.category) || DEFAULT_PROGRAM_CATEGORY;
  if (!isValidProgramCategory(categoryRaw)) errors.category = "Unknown category.";

  const modeRaw = str(input.mode) || DEFAULT_TRAINING_MODE;
  if (!isValidTrainingMode(modeRaw)) errors.mode = "Unknown mode.";

  const statusRaw = str(input.status) || DEFAULT_PROGRAM_STATUS;
  if (!isValidProgramStatus(statusRaw)) errors.status = "Unknown status.";

  const durationWeeks = optNum(input.durationWeeks, errors, "durationWeeks", { min: 0 });
  const fees = optNum(input.fees, errors, "fees", { min: 0 });
  const liveProjectCount = optNum(input.liveProjectCount, errors, "liveProjectCount", { min: 0 }) ?? 0;

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      name,
      category: isValidProgramCategory(categoryRaw) ? categoryRaw : DEFAULT_PROGRAM_CATEGORY,
      technology: optStr(input.technology, 160),
      durationWeeks: durationWeeks !== null ? Math.round(durationWeeks) : null,
      mode: isValidTrainingMode(modeRaw) ? modeRaw : DEFAULT_TRAINING_MODE,
      fees,
      currency: currency(input.currency),
      description: optStr(input.description, 8000),
      learningOutcomes: lines(input.learningOutcomes),
      tools: lines(input.tools, 60),
      liveProjectCount: Math.round(liveProjectCount),
      certificateIncluded: input.certificateIncluded === undefined ? true : bool(input.certificateIncluded),
      placementAssistance: bool(input.placementAssistance),
      status: isValidProgramStatus(statusRaw) ? statusRaw : DEFAULT_PROGRAM_STATUS,
    },
  };
}

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

export function validateBatch(input: Record<string, unknown>): Ok<BatchWriteData> | Err {
  const errors: Record<string, string> = {};

  const programId = str(input.programId);
  if (!programId) errors.programId = "Select a program.";

  const name = str(input.name);
  if (!name) errors.name = "Batch name is required.";
  if (name.length > 200) errors.name = "Batch name is too long.";

  const modeRaw = str(input.mode) || DEFAULT_TRAINING_MODE;
  if (!isValidTrainingMode(modeRaw)) errors.mode = "Unknown mode.";

  const statusRaw = str(input.status) || DEFAULT_BATCH_STATUS;
  if (!isValidBatchStatus(statusRaw)) errors.status = "Unknown status.";

  const startDate = optDate(input.startDate, errors, "startDate");
  const endDate = optDate(input.endDate, errors, "endDate");
  if (startDate && endDate && endDate < startDate) errors.endDate = "End date is before the start date.";

  const capacity = optNum(input.capacity, errors, "capacity", { min: 1 });
  if (capacity === null && !errors.capacity) errors.capacity = "Enter the seat capacity.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      programId,
      name,
      startDate,
      endDate,
      timing: optStr(input.timing, 200),
      mentorId: str(input.mentorId) || null,
      capacity: Math.round(capacity as number),
      mode: isValidTrainingMode(modeRaw) ? modeRaw : DEFAULT_TRAINING_MODE,
      status: isValidBatchStatus(statusRaw) ? statusRaw : DEFAULT_BATCH_STATUS,
      notes: optStr(input.notes, 4000),
    },
  };
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export function validateStudent(input: Record<string, unknown>): Ok<StudentWriteData> | Err {
  const errors: Record<string, string> = {};

  const fullName = str(input.fullName);
  if (!fullName) errors.fullName = "Full name is required.";
  if (fullName.length > 200) errors.fullName = "Name is too long.";

  const email = str(input.email);
  if (email && !EMAIL_RE.test(email)) errors.email = "Enter a valid email.";

  const mobile = str(input.mobile);
  if (mobile && !PHONE_RE.test(mobile)) errors.mobile = "Enter a valid phone number.";

  const linkedin = str(input.linkedin);
  if (linkedin && !URL_RE.test(linkedin)) errors.linkedin = "Enter a full URL (https://…).";
  const github = str(input.github);
  if (github && !URL_RE.test(github)) errors.github = "Enter a full URL (https://…).";
  const resumeUrl = str(input.resumeUrl);
  if (resumeUrl && !URL_RE.test(resumeUrl)) errors.resumeUrl = "Enter a full URL (https://…).";

  const graduationYear = optNum(input.graduationYear, errors, "graduationYear", { min: 1950 });

  const statusRaw = str(input.status) || DEFAULT_STUDENT_STATUS;
  if (!isValidStudentStatus(statusRaw)) errors.status = "Unknown status.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      fullName,
      email: email || null,
      mobile: mobile || null,
      address: optStr(input.address, 500),
      education: {
        college: optStr(input.college, 200),
        university: optStr(input.university, 200),
        branch: optStr(input.branch, 160),
        semester: optStr(input.semester, 40),
        graduationYear: graduationYear !== null ? Math.round(graduationYear) : null,
      },
      guardian: {
        name: optStr(input.guardianName, 160),
        phone: optStr(input.guardianPhone, 40),
        relation: optStr(input.guardianRelation, 60),
      },
      links: {
        resumeUrl: resumeUrl || null,
        linkedin: linkedin || null,
        github: github || null,
        photoUrl: optStr(input.photoUrl, 500),
      },
      status: isValidStudentStatus(statusRaw) ? statusRaw : DEFAULT_STUDENT_STATUS,
      notes: optStr(input.notes, 4000),
    },
  };
}

// ---------------------------------------------------------------------------
// Class schedule
// ---------------------------------------------------------------------------

const CLASS_STATUSES = ["scheduled", "completed", "cancelled"] as const;

export function validateClass(input: Record<string, unknown>): Ok<ClassWriteData> | Err {
  const errors: Record<string, string> = {};

  const batchId = str(input.batchId);
  if (!batchId) errors.batchId = "Select a batch.";

  const topic = str(input.topic);
  if (!topic) errors.topic = "Topic is required.";
  if (topic.length > 300) errors.topic = "Topic is too long.";

  const date = optDate(input.date, errors, "date");
  if (!date && !errors.date) errors.date = "Select a date.";

  const startTime = str(input.startTime);
  if (startTime && !TIME_RE.test(startTime)) errors.startTime = "Use HH:MM.";

  const durationMinutes = optNum(input.durationMinutes, errors, "durationMinutes", { min: 15 }) ?? 90;
  if (durationMinutes > 600) errors.durationMinutes = "That's more than 10 hours.";

  const meetingLink = str(input.meetingLink);
  if (meetingLink && !URL_RE.test(meetingLink)) errors.meetingLink = "Enter a full URL (https://…).";
  const recordingUrl = str(input.recordingUrl);
  if (recordingUrl && !URL_RE.test(recordingUrl)) errors.recordingUrl = "Enter a full URL (https://…).";

  const statusRaw = str(input.status) || "scheduled";
  const status = (CLASS_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as ClassWriteData["status"])
    : "scheduled";

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      batchId,
      mentorId: str(input.mentorId) || null,
      topic,
      date: date as string,
      startTime: startTime || null,
      durationMinutes: Math.round(durationMinutes),
      meetingLink: meetingLink || null,
      recordingUrl: recordingUrl || null,
      notes: optStr(input.notes, 4000),
      status,
    },
  };
}

// ---------------------------------------------------------------------------
// Live project
// ---------------------------------------------------------------------------

function idList(v: unknown, max = 100): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.map((x) => String(x).trim()).filter(Boolean))).slice(0, max);
}

function parseMilestones(v: unknown): Milestone[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      const m = raw as Record<string, unknown>;
      const title = str(m.title);
      if (!title) return null;
      return {
        id: str(m.id) || randomUUID(),
        title: title.slice(0, 200),
        done: m.done === true || m.done === "true",
        dueDate: DATE_RE.test(str(m.dueDate)) ? str(m.dueDate) : null,
      } as Milestone;
    })
    .filter((m): m is Milestone => m !== null)
    .slice(0, 40);
}

export function validateLiveProject(input: Record<string, unknown>): Ok<LiveProjectWriteData> | Err {
  const errors: Record<string, string> = {};

  const title = str(input.title);
  if (!title) errors.title = "Project title is required.";
  if (title.length > 200) errors.title = "Title is too long.";

  const programId = str(input.programId);
  if (!programId) errors.programId = "Select a program.";

  const statusRaw = str(input.status) || "planned";
  if (!isValidLiveProjectStatus(statusRaw)) errors.status = "Unknown status.";

  const repoUrl = str(input.repoUrl);
  if (repoUrl && !URL_RE.test(repoUrl)) errors.repoUrl = "Enter a full URL (https://…).";
  const demoUrl = str(input.demoUrl);
  if (demoUrl && !URL_RE.test(demoUrl)) errors.demoUrl = "Enter a full URL (https://…).";

  const startDate = optDate(input.startDate, errors, "startDate");
  const dueDate = optDate(input.dueDate, errors, "dueDate");
  if (startDate && dueDate && dueDate < startDate) errors.dueDate = "Due date is before the start date.";

  const progressPercent = optNum(input.progressPercent, errors, "progressPercent", { min: 0 }) ?? 0;
  if (progressPercent > 100) errors.progressPercent = "Progress cannot exceed 100%.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      title,
      description: optStr(input.description, 8000),
      programId,
      batchId: str(input.batchId) || null,
      mentorId: str(input.mentorId) || null,
      studentIds: idList(input.studentIds),
      milestones: parseMilestones(input.milestones),
      repoUrl: repoUrl || null,
      demoUrl: demoUrl || null,
      status: isValidLiveProjectStatus(statusRaw) ? statusRaw : "planned",
      progressPercent: Math.min(100, Math.max(0, Math.round(progressPercent))),
      startDate,
      dueDate,
    },
  };
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export function validateAssignment(input: Record<string, unknown>): Ok<AssignmentWriteData> | Err {
  const errors: Record<string, string> = {};

  const title = str(input.title);
  if (!title) errors.title = "Title is required.";
  if (title.length > 300) errors.title = "Title is too long.";

  const batchId = str(input.batchId);
  if (!batchId) errors.batchId = "Select a batch.";

  const dueDate = optDate(input.dueDate, errors, "dueDate");
  const maxMarks = optNum(input.maxMarks, errors, "maxMarks", { min: 1 }) ?? 100;

  const attachmentUrl = str(input.attachmentUrl);
  if (attachmentUrl && !URL_RE.test(attachmentUrl)) errors.attachmentUrl = "Enter a full URL (https://…).";

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      title,
      description: optStr(input.description, 8000),
      batchId,
      dueDate,
      maxMarks: Math.round(maxMarks),
      attachmentUrl: attachmentUrl || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Certificate
// ---------------------------------------------------------------------------

export function validateCertificate(input: Record<string, unknown>): Ok<CertificateIssueData> | Err {
  const errors: Record<string, string> = {};

  const typeRaw = str(input.type);
  if (!isValidCertificateType(typeRaw)) errors.type = "Select a certificate type.";

  const studentId = str(input.studentId);
  if (!studentId) errors.studentId = "Select a student.";

  const programId = str(input.programId);
  if (!programId) errors.programId = "Select a program.";

  const issuedOn = optDate(input.issuedOn, errors, "issuedOn") ?? new Date().toISOString().slice(0, 10);

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      type: typeRaw as CertificateIssueData["type"],
      studentId,
      programId,
      batchId: str(input.batchId) || null,
      title: optStr(input.title, 300),
      issuedOn,
      grade: optStr(input.grade, 40),
    },
  };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export function validatePaymentPlan(input: Record<string, unknown>): Ok<PaymentPlanWriteData> | Err {
  const errors: Record<string, string> = {};

  const studentId = str(input.studentId);
  if (!studentId) errors.studentId = "Select a student.";
  const programId = str(input.programId);
  if (!programId) errors.programId = "Select a program.";

  const totalFees = optNum(input.totalFees, errors, "totalFees", { min: 0 });
  if (totalFees === null && !errors.totalFees) errors.totalFees = "Enter the total fees.";
  const discount = optNum(input.discount, errors, "discount", { min: 0 }) ?? 0;
  if (totalFees !== null && discount > totalFees) errors.discount = "Discount cannot exceed the total fees.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      studentId,
      programId,
      batchId: str(input.batchId) || null,
      enrollmentId: str(input.enrollmentId) || null,
      totalFees: Math.round(totalFees as number),
      currency: currency(input.currency),
      discount: Math.round(discount),
      notes: optStr(input.notes, 2000),
    },
  };
}

export function validateInstallment(input: Record<string, unknown>): Ok<InstallmentInput> | Err {
  const errors: Record<string, string> = {};

  const amount = optNum(input.amount, errors, "amount", { min: 1 });
  if (amount === null && !errors.amount) errors.amount = "Enter the amount received.";

  const methodRaw = str(input.method) || "UPI";
  const method = (PAYMENT_METHODS as readonly string[]).includes(methodRaw) ? (methodRaw as PaymentMethod) : "Other";

  const paidOn = optDate(input.paidOn, errors, "paidOn") ?? new Date().toISOString().slice(0, 10);

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      amount: Math.round(amount as number),
      method,
      transactionId: optStr(input.transactionId, 120),
      paidOn,
      note: optStr(input.note, 500),
    },
  };
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export function validatePlacement(input: Record<string, unknown>): Ok<PlacementWriteData> | Err {
  const errors: Record<string, string> = {};

  const studentId = str(input.studentId);
  if (!studentId) errors.studentId = "Select a student.";

  const company = str(input.company);
  if (!company) errors.company = "Company is required.";
  const role = str(input.role);
  if (!role) errors.role = "Role is required.";

  const typeRaw = str(input.type) || "campus";
  const type: PlacementType = isValidPlacementType(typeRaw) ? typeRaw : "campus";

  const placedOn = optDate(input.placedOn, errors, "placedOn") ?? new Date().toISOString().slice(0, 10);
  const packageLpa = optNum(input.packageLpa, errors, "packageLpa", { min: 0 });

  const offerLetterUrl = str(input.offerLetterUrl);
  if (offerLetterUrl && !URL_RE.test(offerLetterUrl)) errors.offerLetterUrl = "Enter a full URL (https://…).";

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      studentId,
      programId: str(input.programId) || null,
      company,
      role,
      packageLpa,
      location: optStr(input.location, 160),
      type,
      placedOn,
      offerLetterUrl: offerLetterUrl || null,
      notes: optStr(input.notes, 2000),
    },
  };
}
