import "server-only";
import {
  isValidClientStatus,
  isValidProjectStatus,
  isValidPriority,
  isValidMemberRole,
  isValidTaskStatus,
  isValidMilestoneStatus,
  parseHHmm,
  MAX_TIMESHEET_HOURS_PER_DAY,
  DEFAULT_CLIENT_STATUS,
  DEFAULT_PROJECT_STATUS,
  DEFAULT_PRIORITY,
  DEFAULT_MEMBER_ROLE,
  DEFAULT_TASK_STATUS,
  DEFAULT_MILESTONE_STATUS,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
} from "@/lib/products/sprintos/constants";
import type { ClientWriteData } from "@/lib/products/sprintos/clients";
import type { ProjectWriteData } from "@/lib/products/sprintos/projects";
import type { MemberWriteData } from "@/lib/products/sprintos/project-members";
import type { TaskWriteData } from "@/lib/products/sprintos/tasks";
import type { MilestoneWriteData } from "@/lib/products/sprintos/milestones";
import type { EntryWriteData } from "@/lib/products/sprintos/timesheets";
import type { CostingConfigInput } from "@/lib/products/sprintos/costing";

/**
 * Hand-rolled server-side validators. Same `{ valid, data } | { valid, errors }`
 * contract as `src/lib/talentos/validation.ts`.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-()]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
function optDate(v: unknown, errors: Record<string, string>, key: string): string | null {
  const s = str(v);
  if (!s) return null;
  if (!DATE_RE.test(s) || Number.isNaN(new Date(s).getTime())) {
    errors[key] = "Enter a valid date.";
    return null;
  }
  return s;
}
function optNum(v: unknown, errors: Record<string, string>, key: string, { min = 0 }: { min?: number } = {}): number | null {
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
function tags(v: unknown): string[] {
  if (Array.isArray(v)) return Array.from(new Set(v.map((x) => String(x).trim()).filter(Boolean))).slice(0, 30);
  return str(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, a) => a.indexOf(s) === i)
    .slice(0, 30);
}
function currency(v: unknown): string {
  const c = str(v).toUpperCase() || DEFAULT_CURRENCY;
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c) ? c : DEFAULT_CURRENCY;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function validateClient(input: Record<string, unknown>): Ok<ClientWriteData> | Err {
  const errors: Record<string, string> = {};

  const companyName = str(input.companyName);
  if (!companyName) errors.companyName = "Company name is required.";
  if (companyName.length > 200) errors.companyName = "Company name is too long.";

  const website = str(input.website);
  if (website && !URL_RE.test(website)) errors.website = "Enter a full URL (https://…).";

  const statusRaw = str(input.status) || DEFAULT_CLIENT_STATUS;
  if (!isValidClientStatus(statusRaw)) errors.status = "Unknown status.";

  const contactName = str(input.contactName);
  if (!contactName) errors.contactName = "Primary contact name is required.";

  const contactEmail = str(input.contactEmail);
  if (contactEmail && !EMAIL_RE.test(contactEmail)) errors.contactEmail = "Enter a valid email.";

  const contactPhone = str(input.contactPhone);
  if (contactPhone && !PHONE_RE.test(contactPhone)) errors.contactPhone = "Enter a valid phone number.";

  const paymentTermsDays = optNum(input.paymentTermsDays, errors, "paymentTermsDays", { min: 0 });

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      companyName,
      industry: optStr(input.industry, 120),
      website: website || null,
      status: isValidClientStatus(statusRaw) ? statusRaw : DEFAULT_CLIENT_STATUS,
      primaryContact: {
        name: contactName,
        email: contactEmail || null,
        phone: contactPhone || null,
        designation: optStr(input.contactDesignation, 120),
      },
      billing: {
        addressLine: optStr(input.billingAddress, 300),
        city: optStr(input.billingCity, 120),
        country: optStr(input.billingCountry, 120),
        state: optStr(input.billingState, 80),
        gstin: optStr(input.billingGstin, 40),
        currency: currency(input.billingCurrency),
        paymentTermsDays: paymentTermsDays,
      },
      notes: optStr(input.notes, 4000),
      tags: tags(input.tags),
    },
  };
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export function validateProject(input: Record<string, unknown>): Ok<ProjectWriteData> | Err {
  const errors: Record<string, string> = {};

  const name = str(input.name);
  if (!name) errors.name = "Project name is required.";
  if (name.length > 200) errors.name = "Project name is too long.";

  const clientId = str(input.clientId);
  if (!clientId) errors.clientId = "Select a client.";

  const priorityRaw = str(input.priority) || DEFAULT_PRIORITY;
  if (!isValidPriority(priorityRaw)) errors.priority = "Unknown priority.";

  const statusRaw = str(input.status) || DEFAULT_PROJECT_STATUS;
  if (!isValidProjectStatus(statusRaw)) errors.status = "Unknown status.";

  const startDate = optDate(input.startDate, errors, "startDate");
  const endDate = optDate(input.endDate, errors, "endDate");
  if (startDate && endDate && endDate < startDate) errors.endDate = "End date is before the start date.";

  const estimatedBudget = optNum(input.estimatedBudget, errors, "estimatedBudget", { min: 0 });
  const estimatedHours = optNum(input.estimatedHours, errors, "estimatedHours", { min: 0 });
  const progressPercent = optNum(input.progressPercent, errors, "progressPercent", { min: 0 }) ?? 0;
  if (progressPercent > 100) errors.progressPercent = "Progress cannot exceed 100%.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      name,
      clientId,
      category: optStr(input.category, 120),
      description: optStr(input.description, 8000),
      priority: isValidPriority(priorityRaw) ? priorityRaw : DEFAULT_PRIORITY,
      status: isValidProjectStatus(statusRaw) ? statusRaw : DEFAULT_PROJECT_STATUS,
      startDate,
      endDate,
      estimatedBudget,
      estimatedHours,
      currency: currency(input.currency),
      projectManagerId: str(input.projectManagerId) || null,
      technologies: tags(input.technologies),
      progressPercent: Math.min(100, Math.max(0, Math.round(progressPercent))),
    },
  };
}

// ---------------------------------------------------------------------------
// Project member
// ---------------------------------------------------------------------------

export function validateTask(input: Record<string, unknown>): Ok<TaskWriteData> | Err {
  const errors: Record<string, string> = {};

  const title = str(input.title);
  if (!title) errors.title = "Task title is required.";
  if (title.length > 300) errors.title = "Task title is too long.";

  const statusRaw = str(input.status) || DEFAULT_TASK_STATUS;
  if (!isValidTaskStatus(statusRaw)) errors.status = "Unknown status.";

  const priorityRaw = str(input.priority) || DEFAULT_PRIORITY;
  if (!isValidPriority(priorityRaw)) errors.priority = "Unknown priority.";

  const startDate = optDate(input.startDate, errors, "startDate");
  const dueDate = optDate(input.dueDate, errors, "dueDate");
  if (startDate && dueDate && dueDate < startDate) errors.dueDate = "Due date is before the start date.";

  const estimateHours = optNum(input.estimateHours, errors, "estimateHours", { min: 0 });

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      title,
      description: optStr(input.description, 8000),
      status: isValidTaskStatus(statusRaw) ? statusRaw : DEFAULT_TASK_STATUS,
      priority: isValidPriority(priorityRaw) ? priorityRaw : DEFAULT_PRIORITY,
      assigneeId: str(input.assigneeId) || null,
      labels: tags(input.labels),
      startDate,
      dueDate,
      estimateHours,
      parentTaskId: str(input.parentTaskId) || null,
    },
  };
}

export function validateMilestone(input: Record<string, unknown>): Ok<MilestoneWriteData> | Err {
  const errors: Record<string, string> = {};

  const name = str(input.name);
  if (!name) errors.name = "Milestone name is required.";
  if (name.length > 200) errors.name = "Milestone name is too long.";

  const statusRaw = str(input.status) || DEFAULT_MILESTONE_STATUS;
  if (!isValidMilestoneStatus(statusRaw)) errors.status = "Unknown status.";

  const dueDate = optDate(input.dueDate, errors, "dueDate");
  const manualProgressPercent = optNum(input.manualProgressPercent, errors, "manualProgressPercent", { min: 0 }) ?? 0;
  if (manualProgressPercent > 100) errors.manualProgressPercent = "Progress cannot exceed 100%.";

  const linkedTaskIds = Array.isArray(input.linkedTaskIds)
    ? Array.from(new Set(input.linkedTaskIds.map((x) => String(x)).filter(Boolean))).slice(0, 200)
    : [];

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      name,
      description: optStr(input.description, 4000),
      dueDate,
      status: isValidMilestoneStatus(statusRaw) ? statusRaw : DEFAULT_MILESTONE_STATUS,
      manualProgressPercent: Math.min(100, Math.max(0, Math.round(manualProgressPercent))),
      linkedTaskIds,
    },
  };
}

export function validateMember(input: Record<string, unknown>): Ok<MemberWriteData> | Err {
  const errors: Record<string, string> = {};

  const employeeId = str(input.employeeId);
  if (!employeeId) errors.employeeId = "Select an employee.";

  const roleRaw = str(input.role) || DEFAULT_MEMBER_ROLE;
  if (!isValidMemberRole(roleRaw)) errors.role = "Unknown role.";

  const allocationPercent = optNum(input.allocationPercent, errors, "allocationPercent", { min: 0 }) ?? 0;
  if (allocationPercent > 100) errors.allocationPercent = "Allocation cannot exceed 100%.";

  const billableRate = optNum(input.billableRate, errors, "billableRate", { min: 0 });
  const costRate = optNum(input.costRate, errors, "costRate", { min: 0 });

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      employeeId,
      role: isValidMemberRole(roleRaw) ? roleRaw : DEFAULT_MEMBER_ROLE,
      allocationPercent: Math.min(100, Math.max(0, Math.round(allocationPercent))),
      billableRate,
      costRate,
      active: input.active === undefined ? true : input.active === true || input.active === "true",
    },
  };
}

// ---------------------------------------------------------------------------
// Timesheet entry
// ---------------------------------------------------------------------------

export function validateTimesheet(input: Record<string, unknown>): Ok<EntryWriteData> | Err {
  const errors: Record<string, string> = {};

  const projectId = str(input.projectId);
  if (!projectId) errors.projectId = "Select a project.";

  const date = optDate(input.date, errors, "date");
  if (!date) errors.date = errors.date ?? "Select a date.";

  const startTime = str(input.startTime) || null;
  const endTime = str(input.endTime) || null;
  const TIME_RE = /^\d{2}:\d{2}$/;
  if (startTime && !TIME_RE.test(startTime)) errors.startTime = "Use HH:MM.";
  if (endTime && !TIME_RE.test(endTime)) errors.endTime = "Use HH:MM.";

  const sMin = parseHHmm(startTime);
  const eMin = parseHHmm(endTime);

  let hours: number;
  if (sMin !== null && eMin !== null) {
    if (eMin <= sMin) {
      errors.endTime = "End time must be after the start time.";
      hours = 0;
    } else {
      hours = Math.round(((eMin - sMin) / 60) * 100) / 100;
    }
  } else {
    hours = optNum(input.hours, errors, "hours", { min: 0 }) ?? 0;
  }

  if (hours <= 0) errors.hours = errors.hours ?? "Enter the hours worked (or a start and end time).";
  if (hours > MAX_TIMESHEET_HOURS_PER_DAY) errors.hours = `That's more than ${MAX_TIMESHEET_HOURS_PER_DAY} hours in one entry.`;

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      projectId,
      taskId: str(input.taskId) || null,
      date: date as string,
      startTime,
      endTime,
      hours,
      description: optStr(input.description, 2000),
      billable: input.billable === true || input.billable === "true" || input.billable === "on",
    },
  };
}

// ---------------------------------------------------------------------------
// Costing config
// ---------------------------------------------------------------------------

export function validateCostingConfig(input: Record<string, unknown>): Ok<CostingConfigInput> | Err {
  const errors: Record<string, string> = {};
  const contractValue = optNum(input.contractValue, errors, "contractValue", { min: 0 });
  const otherCosts = optNum(input.otherCosts, errors, "otherCosts", { min: 0 }) ?? 0;
  const defaultCostRate = optNum(input.defaultCostRate, errors, "defaultCostRate", { min: 0 }) ?? 0;
  const defaultBillRate = optNum(input.defaultBillRate, errors, "defaultBillRate", { min: 0 }) ?? 0;
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { contractValue, otherCosts, defaultCostRate, defaultBillRate } };
}
