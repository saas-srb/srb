import "server-only";
import { createEmployee, updateEmployee, deleteEmployee, changeEmployeeStatus, getEmployee, employeeFullName, descendantEmployeeIds, wouldCreateCycle, type Employee } from "@/lib/products/talentos/employees";
import { rebuildHierarchyFor, removeFromHierarchy } from "@/lib/products/talentos/hierarchy";
import { createDepartment, updateDepartment, deleteDepartment, createDesignation, updateDesignation, deleteDesignation, createTeam, updateTeam, deleteTeam } from "@/lib/products/talentos/departments";
import { createHoliday, updateHoliday, deleteHoliday, getHoliday } from "@/lib/products/talentos/holidays";
import { createLeaveRequest, decideLeaveRequest, cancelLeaveRequest, getLeaveRequest, setAllocation, upsertLeaveType, deleteLeaveType, getLeaveType, listLeaveTypes, getBalances, getLeaveAnalytics, getLeaveCalendar, employeesOnLeave } from "@/lib/products/talentos/leave";
import { recordAttendance, bulkMarkAttendance, getTodaySnapshot, getMonthlyReport, getAttendanceOverview, MANUAL_ATTENDANCE_STATUSES } from "@/lib/products/talentos/attendance";
import { clockIn, clockOut, updateOwnContact } from "@/lib/products/talentos/self-service";
import { createOffer, updateOfferStatus, updateOfferDetails, getOffer, markOfferJoined } from "@/lib/products/talentos/offers";
import { getApplicationForConversion } from "@/lib/products/talentos/recruitment";
import { upsertPayrollProfile, getPayrollProfile } from "@/lib/products/talentos/payroll";
import { createRevision } from "@/lib/products/talentos/salary-revisions";
import { createRun, deleteRun, approveRun, getRun, getPayslip, recomputePayslip, updatePayslipOverrides, isMonthLocked } from "@/lib/products/talentos/payroll-run";
import { cancelPayout, refreshSalaryPayout } from "@/lib/products/talentos/salary-payouts";
import { getOrgSettings, updateOrgSettings, isDateString } from "@/lib/products/talentos/settings";
import { updatePayrollConfig, getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { updateCompanyDetails, getCompanyDetails } from "@/lib/products/talentos/company";
import { getHrmsDashboardStats } from "@/lib/products/talentos/dashboard";
import { recordAudit, diffSummary } from "@/lib/products/talentos/audit";
import { notify } from "@/lib/products/talentos/notifications";
import {
  validateEmployeeCreate, validateDepartment, validateDesignation, validateTeam, validatePayrollProfile,
} from "@/lib/products/talentos/validation";
import { validateHoliday, validateLeaveType, validateLeaveRequest, validateAttendanceEntry, validateOrgSettings, validateCompanyDetails } from "@/lib/products/talentos/validation-ops";
import { validateSalaryRevision, validatePayslipOverrides, validateOffer, validateOfferDetails, validateOwnContact, validatePayrollConfig } from "@/lib/products/talentos/validation-payroll";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, GENDERS, WORK_LOCATIONS, isValidEmployeeStatus } from "@/lib/products/talentos/employee-status";
import { HOLIDAY_TYPES } from "@/lib/products/talentos/holiday-types";
import { OFFER_STATUSES, isValidOfferStatus } from "@/lib/products/talentos/offers-status";
import { canApproveLeave, canManageAttendance, canManageEmployees, canManageHolidays, canManageMasters, canManagePayroll, canManagePayrollConfig, canRunPayroll, canManageSettings, canViewAllEmployees, canViewAuditLog } from "@/lib/hrms-roles";
import * as Bank from "@/app/(products)/talentos/(protected)/(staff)/employees/[id]/bank-actions";
import { check, fail, formInput, str, viaAction } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * HRMS for the agent: people, org structure, holidays, leave, attendance, recruitment offers, payroll, settings. Writes use the product's
 * own validators and functions and repeat what its screens do around them (reporting-line scope, payroll month locks, audit trail,
 * notifications). Managers act inside their reporting line; employees only on themselves.
 */

const MONEY_MOVES_IN_THE_APP = "Money is never sent from the assistant. Open the payment in the app and confirm it there with your confirmation code.";
const soft = { deletedAt: null };
const STATUS = EMPLOYEE_STATUSES.map((s) => s.value) as string[];
const EMPLOYMENT = EMPLOYMENT_TYPES.map((s) => s.value) as string[];
const LOCATION = WORK_LOCATIONS.map((s) => s.value) as string[];
const GENDER = GENDERS.map((s) => s.value) as string[];
const HOLIDAY = HOLIDAY_TYPES.map((s) => s.value) as string[];
const OFFER = OFFER_STATUSES.map((s) => s.value) as string[];

/** Employees this person may act on: everyone for HR, otherwise themselves and their reporting line. */
async function inScope(u: AgentUser, employeeId: string): Promise<boolean> {
  if (canViewAllEmployees(u)) return true;
  if (!u.employeeId) return false;
  if (employeeId === u.employeeId) return true;
  return (await descendantEmployeeIds(u.employeeId)).includes(employeeId);
}
async function lineFilter(field: string, u: AgentUser): Promise<Json | null> {
  if (!u.employeeId) return null;
  return { [field]: { $in: [u.employeeId, ...(await descendantEmployeeIds(u.employeeId))] } };
}
const audit = (u: AgentUser, a: Parameters<typeof recordAudit>[0] extends infer T ? Omit<Extract<T, object>, "actorId" | "actorEmail"> : never) => recordAudit({ actorId: u.id, actorEmail: u.email, ...(a as object) } as never);

const employeeInput = (e: Employee): Json => ({
  firstName: e.firstName, lastName: e.lastName, workEmail: e.workEmail, status: e.status,
  dateOfBirth: e.personal.dateOfBirth, gender: e.personal.gender, maritalStatus: e.personal.maritalStatus, personalEmail: e.personal.personalEmail, phone: e.personal.phone,
  addressLine: e.personal.addressLine, city: e.personal.city, state: e.personal.state, postalCode: e.personal.postalCode, photoKey: e.personal.photoKey,
  departmentId: e.professional.departmentId, designationId: e.professional.designationId, teamId: e.professional.teamId, reportingManagerId: e.professional.reportingManagerId,
  employmentType: e.professional.employmentType, workLocation: e.professional.workLocation, joiningDate: e.professional.joiningDate, probationEndDate: e.professional.probationEndDate, relievingDate: e.professional.relievingDate,
  emergencyContacts: e.emergencyContacts,
});

const scoped = (u: AgentUser) => ({ canViewAll: canViewAllEmployees(u) });
void scoped;

export const HRMS_ENTITIES: EntityDef[] = [
  {
    key: "hrms.employee", panel: "hrms", label: "Employee", description: "People who work here: code, name, work email, status, department, designation, manager, joining date, personal and contact details.", collection: "hrms_employees", idType: "string", baseFilter: soft,
    titleField: "firstName", search: ["firstName", "lastName", "workEmail", "employeeCode"], read: "staff", allowRead: canViewAllEmployees, write: "staff", allow: canManageEmployees, canDelete: true, hide: ["photoKey"],
    self: async (u) => (u.employeeId ? { _id: { $in: [u.employeeId, ...(await descendantEmployeeIds(u.employeeId))] } } : null),
    fields: [
      { key: "firstName", label: "First name", type: "string", required: true },
      { key: "lastName", label: "Last name", type: "string", required: true },
      { key: "workEmail", label: "Work email", type: "email", required: true },
      { key: "status", label: "Status", type: "enum", options: STATUS },
      { key: "dateOfBirth", label: "Date of birth", type: "dateString" },
      { key: "gender", label: "Gender", type: "enum", options: GENDER },
      { key: "maritalStatus", label: "Marital status", type: "string" },
      { key: "personalEmail", label: "Personal email", type: "email" },
      { key: "phone", label: "Phone", type: "string" },
      { key: "addressLine", label: "Address", type: "string" },
      { key: "city", label: "City", type: "string" },
      { key: "state", label: "State", type: "string" },
      { key: "postalCode", label: "Postal code", type: "string" },
      { key: "departmentId", label: "Department (hrms.department id)", type: "ref", ref: "hrms.department" },
      { key: "designationId", label: "Designation (hrms.designation id)", type: "ref", ref: "hrms.designation" },
      { key: "teamId", label: "Team (hrms.team id)", type: "ref", ref: "hrms.team" },
      { key: "reportingManagerId", label: "Reports to (hrms.employee id)", type: "ref", ref: "hrms.employee" },
      { key: "employmentType", label: "Employment type", type: "enum", options: EMPLOYMENT },
      { key: "workLocation", label: "Work location", type: "enum", options: LOCATION },
      { key: "joiningDate", label: "Joining date", type: "dateString" },
      { key: "probationEndDate", label: "Probation end date", type: "dateString" },
      { key: "relievingDate", label: "Relieving date", type: "dateString" },
      { key: "emergencyContacts", label: "Emergency contacts: [{name, relationship, phone}]", type: "json" },
    ],
    ops: {
      create: async (v, u) => {
        const c = check(validateEmployeeCreate(v));
        if (!c.ok) return c.error;
        const employee = await createEmployee(c.data, u.id, { recruitment: null });
        await rebuildHierarchyFor(employee._id);
        await audit(u, { action: "create", entity: "employee", entityId: employee._id, entityLabel: `${employeeFullName(employee)} (${employee.employeeCode})`, summary: "Employee created" });
        await notify({ audience: "staff", type: "employee_added", title: `${employeeFullName(employee)} added`, body: employee.employeeCode, link: `/talentos/employees/${employee._id}`, entityType: "employee", entityId: employee._id });
        return { ok: true, id: employee._id, record: employee };
      },
      update: async (id, v, u) => {
        const before = await getEmployee(id);
        if (!before) return fail("Employee not found.");
        const c = check(validateEmployeeCreate(formInput(employeeInput(before), v)));
        if (!c.ok) return c.error;
        const mgr = c.data.professional.reportingManagerId;
        if (mgr && mgr !== before.professional.reportingManagerId && (await wouldCreateCycle(id, mgr))) return fail("That would create a reporting cycle.");
        const after = await updateEmployee(id, c.data, u.id);
        if (!after) return fail("Employee not found.");
        await rebuildHierarchyFor(id);
        await audit(u, { action: "update", entity: "employee", entityId: id, entityLabel: `${employeeFullName(after)} (${after.employeeCode})`, summary: diffSummary(before as unknown as Json, after as unknown as Json, ["firstName", "lastName", "workEmail", "status"]) ?? "Profile details updated" });
        return { ok: true, id, record: after };
      },
      remove: async (id, u) => {
        const before = await getEmployee(id);
        if (!before) return fail("Employee not found.");
        const r = await deleteEmployee(id, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not delete the employee.");
        await removeFromHierarchy(id);
        await audit(u, { action: "delete", entity: "employee", entityId: id, entityLabel: `${employeeFullName(before)} (${before.employeeCode})`, summary: "Employee archived (soft delete)" });
        return { ok: true, id };
      },
    },
  },
  {
    key: "hrms.department", panel: "hrms", label: "Department", description: "Departments and their heads.", collection: "hrms_departments", idType: "string", baseFilter: soft, titleField: "name", search: ["name", "code"],
    read: "any", write: "staff", allow: canManageMasters, canDelete: true,
    fields: [
      { key: "name", label: "Name", type: "string", required: true },
      { key: "code", label: "Code (2–12 letters/digits)", type: "string", required: true },
      { key: "description", label: "Description", type: "text" },
      { key: "headEmployeeId", label: "Head (hrms.employee id)", type: "ref", ref: "hrms.employee" },
    ],
    ops: {
      create: async (v, u) => {
        const c = check(validateDepartment(v));
        if (!c.ok) return c.error;
        const d = await createDepartment(c.data, u.id);
        await audit(u, { action: "create", entity: "department", entityId: d._id, entityLabel: c.data.name });
        return { ok: true, id: d._id, record: d };
      },
      update: async (id, v, u) => {
        const cur = (await (await import("@/lib/products/talentos/departments")).getDepartment(id)) as Json | null;
        if (!cur) return fail("Department not found.");
        const c = check(validateDepartment(formInput(cur, v)));
        if (!c.ok) return c.error;
        const d = await updateDepartment(id, c.data, u.id);
        if (!d) return fail("Department not found.");
        await audit(u, { action: "update", entity: "department", entityId: id, entityLabel: c.data.name });
        return { ok: true, id, record: d };
      },
      remove: async (id, u) => {
        const r = await deleteDepartment(id, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not delete the department.");
        await audit(u, { action: "delete", entity: "department", entityId: id });
        return { ok: true, id };
      },
    },
  },
  {
    key: "hrms.designation", panel: "hrms", label: "Designation", description: "Job titles per department.", collection: "hrms_designations", idType: "string", baseFilter: soft, titleField: "title", search: ["title"],
    read: "any", write: "staff", allow: canManageMasters, canDelete: true,
    fields: [
      { key: "title", label: "Title", type: "string", required: true },
      { key: "departmentId", label: "Department (hrms.department id)", type: "ref", ref: "hrms.department", required: true },
      { key: "level", label: "Level", type: "string" },
    ],
    ops: {
      create: async (v, u) => {
        const c = check(validateDesignation(v));
        if (!c.ok) return c.error;
        const d = await createDesignation(c.data, u.id);
        await audit(u, { action: "create", entity: "designation", entityId: d._id, entityLabel: c.data.title });
        return { ok: true, id: d._id, record: d };
      },
      update: async (id, v, u) => {
        const rows = await (await import("@/lib/products/talentos/departments")).listDesignations();
        const cur = rows.find((d) => d._id === id) as unknown as Json | undefined;
        if (!cur) return fail("Designation not found.");
        const c = check(validateDesignation(formInput(cur, v)));
        if (!c.ok) return c.error;
        const d = await updateDesignation(id, c.data, u.id);
        if (!d) return fail("Designation not found.");
        await audit(u, { action: "update", entity: "designation", entityId: id, entityLabel: c.data.title });
        return { ok: true, id, record: d };
      },
      remove: async (id, u) => {
        const r = await deleteDesignation(id, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not delete the designation.");
        await audit(u, { action: "delete", entity: "designation", entityId: id });
        return { ok: true, id };
      },
    },
  },
  {
    key: "hrms.team", panel: "hrms", label: "Team", description: "Teams inside departments, with a lead.", collection: "hrms_teams", idType: "string", baseFilter: soft, titleField: "name", search: ["name"],
    read: "any", write: "staff", allow: canManageMasters, canDelete: true,
    fields: [
      { key: "name", label: "Name", type: "string", required: true },
      { key: "departmentId", label: "Department (hrms.department id)", type: "ref", ref: "hrms.department", required: true },
      { key: "leadEmployeeId", label: "Lead (hrms.employee id)", type: "ref", ref: "hrms.employee" },
    ],
    ops: {
      create: async (v, u) => {
        const c = check(validateTeam(v));
        if (!c.ok) return c.error;
        const t = await createTeam(c.data, u.id);
        await audit(u, { action: "create", entity: "team", entityId: t._id, entityLabel: c.data.name });
        return { ok: true, id: t._id, record: t };
      },
      update: async (id, v, u) => {
        const rows = await (await import("@/lib/products/talentos/departments")).listTeams();
        const cur = rows.find((t) => t._id === id) as unknown as Json | undefined;
        if (!cur) return fail("Team not found.");
        const c = check(validateTeam(formInput(cur, v)));
        if (!c.ok) return c.error;
        const t = await updateTeam(id, c.data, u.id);
        if (!t) return fail("Team not found.");
        await audit(u, { action: "update", entity: "team", entityId: id, entityLabel: c.data.name });
        return { ok: true, id, record: t };
      },
      remove: async (id, u) => {
        const r = await deleteTeam(id, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not delete the team.");
        await audit(u, { action: "delete", entity: "team", entityId: id });
        return { ok: true, id };
      },
    },
  },
  {
    key: "hrms.holiday", panel: "hrms", label: "Holiday", description: "The company holiday calendar.", collection: "hrms_holidays", idType: "string", baseFilter: soft, titleField: "name", search: ["name", "date"],
    read: "any", write: "staff", allow: canManageHolidays, canDelete: true,
    fields: [
      { key: "date", label: "Date", type: "dateString", required: true },
      { key: "name", label: "Name", type: "string", required: true },
      { key: "type", label: "Type", type: "enum", options: HOLIDAY, required: true },
    ],
    ops: {
      create: async (v, u) => {
        const c = check(validateHoliday(v));
        if (!c.ok) return c.error;
        const r = await createHoliday(c.data, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "create", entity: "holiday", entityId: r.holiday._id, entityLabel: `${c.data.name} (${c.data.date})` });
        return { ok: true, id: r.holiday._id, record: r.holiday };
      },
      update: async (id, v, u) => {
        const cur = await getHoliday(id);
        if (!cur) return fail("Holiday not found.");
        const c = check(validateHoliday(formInput(cur as unknown as Json, v)));
        if (!c.ok) return c.error;
        const r = await updateHoliday(id, c.data, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "update", entity: "holiday", entityId: id, entityLabel: `${c.data.name} (${c.data.date})` });
        return { ok: true, id, record: r.holiday };
      },
      remove: async (id, u) => {
        if (!(await deleteHoliday(id, u.id))) return fail("Holiday not found.");
        await audit(u, { action: "delete", entity: "holiday", entityId: id });
        return { ok: true, id };
      },
    },
  },
  {
    key: "hrms.leave_type", panel: "hrms", label: "Leave type", description: "Kinds of leave: code, label, paid, yearly quota, whether balance may go negative.", collection: "hrms_leave_types", idType: "string", baseFilter: soft, titleField: "label", search: ["label", "code"],
    read: "any", write: "staff", allow: canManageSettings, canDelete: true,
    fields: [
      { key: "code", label: "Code (lowercase, digits, underscore)", type: "string", required: true, createOnly: true },
      { key: "label", label: "Label", type: "string", required: true },
      { key: "paid", label: "Paid leave", type: "boolean" },
      { key: "defaultAnnualQuota", label: "Days per year", type: "number", required: true },
      { key: "allowNegativeBalance", label: "Allow negative balance", type: "boolean" },
      { key: "active", label: "Active", type: "boolean" },
    ],
    ops: {
      create: async (v, u) => {
        const c = check(validateLeaveType(v));
        if (!c.ok) return c.error;
        const r = await upsertLeaveType(c.data, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not save the leave type.");
        await audit(u, { action: "create", entity: "leave_type", entityId: c.data.code, entityLabel: c.data.label });
        return { ok: true, id: c.data.code, result: "Leave type created." };
      },
      update: async (id, v, u) => {
        const rows = await listLeaveTypes(true);
        const cur = rows.find((t) => t._id === id) as unknown as Json | undefined;
        if (!cur) return fail("Leave type not found.");
        const c = check(validateLeaveType(formInput(cur, v)));
        if (!c.ok) return c.error;
        const r = await upsertLeaveType(c.data, u.id, id);
        if (!r.ok) return fail(r.reason ?? "Could not save the leave type.");
        await audit(u, { action: "update", entity: "leave_type", entityId: id, entityLabel: c.data.label });
        return { ok: true, id, result: "Leave type updated." };
      },
      remove: async (id, u) => {
        const r = await deleteLeaveType(id, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not delete the leave type.");
        await audit(u, { action: "delete", entity: "leave_type", entityId: id });
        return { ok: true, id };
      },
    },
  },
  {
    key: "hrms.leave_request", panel: "hrms", label: "Leave request", description: "Leave applications (pending / approved / rejected / cancelled). Employees see and file their own; managers their reporting line; HR all.", collection: "hrms_leave_requests", idType: "string", baseFilter: soft,
    search: ["reason", "leaveTypeCode", "status", "startDate"], read: "staff", allowRead: canViewAllEmployees, write: "any", selfWrite: true,
    self: (u) => lineFilter("employeeId", u),
    fields: [
      { key: "employeeId", label: "Employee (hrms.employee id) — leave out to apply for yourself", type: "ref", ref: "hrms.employee", createOnly: true },
      { key: "leaveTypeCode", label: "Leave type code (see hrms.leave_type)", type: "string", required: true, createOnly: true },
      { key: "startDate", label: "From", type: "dateString", required: true, createOnly: true },
      { key: "endDate", label: "To (same as From for one day)", type: "dateString", createOnly: true },
      { key: "halfDayStart", label: "Half day on the first day", type: "boolean", createOnly: true },
      { key: "halfDayEnd", label: "Half day on the last day", type: "boolean", createOnly: true },
      { key: "reason", label: "Reason", type: "text", createOnly: true },
    ],
    ops: {
      create: async (v, u) => {
        const onBehalf = canApproveLeave(u) && typeof v.employeeId === "string" && v.employeeId;
        const employeeId = onBehalf ? String(v.employeeId) : u.employeeId;
        if (!employeeId) return fail("Your login isn't linked to an employee record, so leave can't be filed for you. Ask HR to link it.");
        if (onBehalf && !(await inScope(u, employeeId))) return fail("That employee is outside your reporting line.");
        const c = check(validateLeaveRequest({ ...v, employeeId }));
        if (!c.ok) return c.error;
        if (await isMonthLocked(c.data.startDate.slice(0, 7))) return fail("Payroll for that month is finalised — leave can't be filed for it.");
        const r = await createLeaveRequest(c.data, u.id);
        if (!r.ok) return fail(r.reason);
        const emp = await getEmployee(employeeId);
        await audit(u, { action: "create", entity: "leave_request", entityId: r.request._id, entityLabel: emp ? `${employeeFullName(emp)} · ${c.data.leaveTypeCode}` : c.data.leaveTypeCode, summary: `${r.request.days} day(s), ${c.data.startDate} → ${c.data.endDate}` });
        return { ok: true, id: r.request._id, record: r.request };
      },
    },
  },
  { key: "hrms.leave_balance", panel: "hrms", label: "Leave balance", description: "Allocated / used / pending leave per employee, leave type and year.", collection: "hrms_leave_balances", read: "staff", allowRead: canViewAllEmployees, self: (u) => lineFilter("employeeId", u) },
  { key: "hrms.attendance", panel: "hrms", label: "Attendance", description: "Daily attendance per employee (status, check-in/out, late minutes).", collection: "hrms_attendance", read: "staff", allowRead: canViewAllEmployees, self: (u) => lineFilter("employeeId", u) },
  {
    key: "hrms.offer", panel: "hrms", label: "Job offer", description: "Offers made to applicants (draft → extended → accepted → joined, or declined/withdrawn).", collection: "hrms_offers", idType: "string", baseFilter: soft, search: ["candidateName", "positionTitle"], titleField: "candidateName",
    read: "staff", allowRead: canManageEmployees, write: "staff", allow: canManageEmployees,
    fields: [
      { key: "applicationId", label: "Job application id (hrms.application)", type: "ref", ref: "hrms.application", required: true, createOnly: true },
      { key: "offerDate", label: "Offer date", type: "dateString" },
      { key: "proposedJoiningDate", label: "Proposed joining date", type: "dateString" },
      { key: "annualCtc", label: "Annual CTC", type: "number" },
      { key: "notes", label: "Notes", type: "text" },
    ],
    ops: {
      create: async (v, u) => {
        const c = check(validateOffer(v));
        if (!c.ok) return c.error;
        const r = await createOffer(c.data, u.id);
        if (!r.ok) return fail(r.error ?? "Could not create the offer.");
        await audit(u, { action: "create", entity: "offer", entityId: r.offer._id, entityLabel: `${r.offer.candidateName} — ${r.offer.positionTitle}` });
        return { ok: true, id: r.offer._id, record: r.offer };
      },
      update: async (id, v, u) => {
        const offer = await getOffer(id);
        if (!offer) return fail("Offer not found.");
        const c = check(validateOfferDetails(formInput(offer as unknown as Json, v)));
        if (!c.ok) return c.error;
        await updateOfferDetails(id, c.data, u.id);
        await audit(u, { action: "update", entity: "offer", entityId: id, entityLabel: offer.candidateName });
        return { ok: true, id, result: "Offer updated." };
      },
    },
  },
  { key: "hrms.application", panel: "hrms", label: "Job application", description: "Applications received through the careers pages (candidate, position, status).", collection: "career_applications", read: "staff", allowRead: canManageEmployees, search: ["name", "email", "positionTitle"], hide: ["resume"] },
  { key: "hrms.payroll_run", panel: "hrms", label: "Payroll run", description: "Monthly payroll runs (draft → approved) with totals.", collection: "hrms_payroll_runs", idType: "string", read: "staff", allowRead: canRunPayroll },
  { key: "hrms.payslip", panel: "hrms", label: "Payslip", description: "Payslips: employee, month, gross, deductions, net. Employees see their own.", collection: "hrms_payslips", idType: "string", search: ["employeeName", "month"], read: "staff", allowRead: canRunPayroll, self: (u) => (u.employeeId ? { employeeId: u.employeeId } : null) },
  { key: "hrms.salary_payout", panel: "hrms", label: "Salary payout", description: "Salary transfers per payslip: pending, initiated, paid, failed.", collection: "hrms_salary_payouts", idType: "string", read: "staff", allowRead: canRunPayroll },
  { key: "hrms.salary_revision", panel: "hrms", label: "Salary revision", description: "History of salary structure changes.", collection: "hrms_salary_revisions", idType: "string", read: "staff", allowRead: canManagePayroll },
  { key: "hrms.payroll_profile", panel: "hrms", label: "Payroll profile", description: "An employee's salary structure (basic, HRA, allowances, deductions).", collection: "hrms_payroll_profiles", read: "staff", allowRead: canManagePayroll },
  { key: "hrms.audit", panel: "hrms", label: "Audit log", description: "Who changed what in TalentOS.", collection: "hrms_audit_logs", idType: "string", search: ["entityLabel", "summary", "actorEmail"], read: "admin", allowRead: canViewAuditLog },
];

// ── Actions ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const own = (u: AgentUser) => u.employeeId;

export const HRMS_ACTIONS: ActionDef[] = [
  {
    key: "hrms.change_employee_status", panel: "hrms", label: "Change an employee's status", description: "Move an employee between probation, active, on leave, notice period, relieved or terminated (relieving date for exits).", level: "staff", allow: canManageEmployees,
    params: [{ key: "employeeId", label: "Employee (hrms.employee id)", type: "ref", ref: "hrms.employee", required: true }, { key: "status", label: "New status", type: "enum", options: STATUS, required: true }, { key: "relievingDate", label: "Relieving date (for exits)", type: "dateString" }],
    run: async (v, u) => {
      const status = String(v.status);
      if (!isValidEmployeeStatus(status)) return fail("Invalid status.");
      const before = await getEmployee(String(v.employeeId));
      if (!before) return fail("Employee not found.");
      const after = await changeEmployeeStatus(before._id, status, u.id, str(v.relievingDate) ?? undefined);
      if (!after) return fail("Employee not found.");
      await audit(u, { action: "status_change", entity: "employee", entityId: before._id, entityLabel: `${employeeFullName(after)} (${after.employeeCode})`, summary: `status: ${before.status} → ${after.status}` });
      return { ok: true, id: before._id, result: `${employeeFullName(after)} is now ${after.status}.` };
    },
  },
  {
    key: "hrms.decide_leave", panel: "hrms", label: "Approve or reject a leave request", description: "Decide a pending leave request in your reporting line. Updates the balance and attendance and notifies the employee.", level: "staff", allow: canApproveLeave,
    params: [{ key: "requestId", label: "Leave request id", type: "ref", ref: "hrms.leave_request", required: true }, { key: "decision", label: "Decision", type: "enum", options: ["approved", "rejected"], required: true }, { key: "note", label: "Note to the employee", type: "string" }],
    run: async (v, u) => {
      const req = await getLeaveRequest(String(v.requestId));
      if (!req) return fail("Leave request not found.");
      if (!(await inScope(u, req.employeeId))) return fail("That request is outside your reporting line.");
      if (v.decision === "approved" && (await isMonthLocked(req.startDate.slice(0, 7)))) return fail("Payroll for that month is finalised — this leave can no longer be approved.");
      const r = await decideLeaveRequest(req._id, v.decision as "approved", str(v.note), u.id);
      if (!r.ok) return fail(r.reason ?? "Could not decide that request.");
      const emp = await getEmployee(req.employeeId);
      await audit(u, { action: v.decision === "approved" ? "approve" : "reject", entity: "leave_request", entityId: req._id, entityLabel: emp ? `${employeeFullName(emp)} · ${req.leaveTypeCode}` : req.leaveTypeCode, summary: str(v.note) ? `${String(v.decision)}: ${str(v.note)}` : String(v.decision) });
      return { ok: true, id: req._id, result: `Leave ${String(v.decision)}.` };
    },
  },
  {
    key: "hrms.cancel_leave", panel: "hrms", label: "Cancel or withdraw a leave request", description: "Cancel a leave request and give the days back. Employees can withdraw their own pending request.", level: "any", destructive: true,
    params: [{ key: "requestId", label: "Leave request id", type: "ref", ref: "hrms.leave_request", required: true }],
    run: async (v, u) => {
      const req = await getLeaveRequest(String(v.requestId));
      if (!req) return fail("Leave request not found.");
      if (canApproveLeave(u)) {
        if (!(await inScope(u, req.employeeId))) return fail("That request is outside your reporting line.");
      } else {
        if (req.employeeId !== own(u)) return fail("Leave request not found.");
        if (req.status !== "pending") return fail("Only a pending request can be withdrawn.");
      }
      const r = await cancelLeaveRequest(req._id, u.id);
      if (!r.ok) return fail(r.reason ?? "Could not cancel that request.");
      await audit(u, { action: "cancel", entity: "leave_request", entityId: req._id, summary: canApproveLeave(u) ? "Leave request cancelled" : "Withdrawn by employee" });
      return { ok: true, id: req._id, result: "Leave cancelled." };
    },
  },
  {
    key: "hrms.set_leave_allocation", panel: "hrms", label: "Set an employee's leave allocation", description: "Set how many days of a leave type an employee has for a year.", level: "staff", allow: canManageEmployees,
    params: [{ key: "employeeId", label: "Employee (hrms.employee id)", type: "ref", ref: "hrms.employee", required: true }, { key: "leaveTypeCode", label: "Leave type code", type: "string", required: true }, { key: "year", label: "Year", type: "number", required: true }, { key: "allocated", label: "Days", type: "number", required: true }],
    run: async (v, u) => {
      const allocated = Number(v.allocated);
      if (!Number.isFinite(allocated) || allocated < 0 || allocated > 365) return fail("Enter an allocation between 0 and 365.");
      if (!(await getEmployee(String(v.employeeId)))) return fail("Employee not found.");
      if (!(await getLeaveType(String(v.leaveTypeCode)))) return fail("Unknown leave type code.");
      await setAllocation(String(v.employeeId), String(v.leaveTypeCode), Number(v.year), allocated, u.id);
      await audit(u, { action: "update", entity: "leave_request", entityId: `${String(v.employeeId)}:${String(v.leaveTypeCode)}:${String(v.year)}`, summary: `allocation → ${allocated} (${String(v.leaveTypeCode)} ${String(v.year)})` });
      return { ok: true, result: `Allocation set to ${allocated} day(s).` };
    },
  },
  {
    key: "hrms.mark_attendance", panel: "hrms", label: "Record one employee's attendance for a day", description: "Mark present, half day or absent with optional check-in/out times.", level: "staff", allow: canManageAttendance,
    params: [
      { key: "employeeId", label: "Employee (hrms.employee id)", type: "ref", ref: "hrms.employee", required: true },
      { key: "date", label: "Date", type: "dateString", required: true },
      { key: "status", label: "Status", type: "enum", options: [...MANUAL_ATTENDANCE_STATUSES], required: true },
      { key: "checkIn", label: "Check-in HH:MM", type: "string" }, { key: "checkOut", label: "Check-out HH:MM", type: "string" },
      { key: "breakMinutes", label: "Break minutes", type: "number" }, { key: "note", label: "Note", type: "string" },
    ],
    run: async (v, u) => {
      const date = String(v.date);
      if (!isDateString(date)) return fail("Invalid date.");
      if (await isMonthLocked(date.slice(0, 7))) return fail("Payroll for this month is finalised — attendance is locked.");
      if (!(await inScope(u, String(v.employeeId)))) return fail("That employee is outside your reporting line.");
      const c = check(validateAttendanceEntry(v));
      if (!c.ok) return c.error;
      const r = await recordAttendance(String(v.employeeId), date, c.data, u.id);
      if (!r.ok) return fail(r.reason);
      const emp = await getEmployee(String(v.employeeId));
      await audit(u, { action: "update", entity: "attendance", entityId: r.record._id, entityLabel: emp ? `${employeeFullName(emp)} · ${date}` : date, summary: c.data.status });
      return { ok: true, id: r.record._id, result: "Attendance recorded." };
    },
  },
  {
    key: "hrms.bulk_mark_attendance", panel: "hrms", label: "Mark attendance for many employees on a day", description: "Mark a list of employees present, half day or absent for one date.", level: "staff", allow: canManageAttendance,
    params: [{ key: "date", label: "Date", type: "dateString", required: true }, { key: "employeeIds", label: "Employees (hrms.employee ids)", type: "stringList", required: true }, { key: "status", label: "Status", type: "enum", options: [...MANUAL_ATTENDANCE_STATUSES], required: true }],
    run: async (v, u) => {
      const date = String(v.date);
      if (!isDateString(date)) return fail("Invalid date.");
      if (await isMonthLocked(date.slice(0, 7))) return fail("Payroll for this month is finalised — attendance is locked.");
      const ids: string[] = [];
      for (const id of v.employeeIds as string[]) if (await inScope(u, id)) ids.push(id);
      if (!ids.length) return fail("No in-scope employees selected.");
      const marked = await bulkMarkAttendance(date, ids, v.status as never, u.id);
      await audit(u, { action: "bulk_mark", entity: "attendance", entityId: date, entityLabel: `${date} · ${marked} employee(s)`, summary: `bulk-marked ${String(v.status)}` });
      return { ok: true, result: `Marked ${marked} employee(s) ${String(v.status)}.` };
    },
  },
  {
    key: "hrms.clock_in", panel: "hrms", label: "Clock in", description: "Record your own check-in for today.", level: "any", params: [],
    run: async (_v, u) => {
      if (!u.employeeId) return fail("Your login isn't linked to an employee record.");
      const { nowInOrgTz } = await import("@/lib/products/talentos/time");
      if (await isMonthLocked(nowInOrgTz((await getOrgSettings()).timezone).date.slice(0, 7))) return fail("Payroll for this month is finalised — attendance is locked.");
      const r = await clockIn(u.employeeId);
      if (!r.ok) return fail(r.error ?? "Could not clock in.");
      await audit(u, { action: "clock_in", entity: "attendance", entityId: u.employeeId, summary: `Clocked in ${r.time}` });
      return { ok: true, result: `Clocked in at ${r.time}.` };
    },
  },
  {
    key: "hrms.clock_out", panel: "hrms", label: "Clock out", description: "Record your own check-out for today.", level: "any", params: [],
    run: async (_v, u) => {
      if (!u.employeeId) return fail("Your login isn't linked to an employee record.");
      const r = await clockOut(u.employeeId);
      if (!r.ok) return fail(r.error ?? "Could not clock out.");
      await audit(u, { action: "clock_out", entity: "attendance", entityId: u.employeeId, summary: `Clocked out ${r.time}` });
      return { ok: true, result: `Clocked out at ${r.time}.` };
    },
  },
  {
    key: "hrms.update_my_contact", panel: "hrms", label: "Update my own contact details", description: "Change your own phone, personal email, address and emergency contacts.", level: "any",
    params: [
      { key: "phone", label: "Phone", type: "string" }, { key: "personalEmail", label: "Personal email", type: "email" }, { key: "addressLine", label: "Address", type: "string" },
      { key: "city", label: "City", type: "string" }, { key: "state", label: "State", type: "string" }, { key: "postalCode", label: "Postal code", type: "string" },
      { key: "emergencyContacts", label: "Emergency contacts: [{name, relationship, phone}]", type: "json" },
    ],
    run: async (v, u) => {
      if (!u.employeeId) return fail("Your login isn't linked to an employee record.");
      const me = await getEmployee(u.employeeId);
      if (!me) return fail("Employee not found.");
      const current = { phone: me.personal.phone, personalEmail: me.personal.personalEmail, addressLine: me.personal.addressLine, city: me.personal.city, state: me.personal.state, postalCode: me.personal.postalCode, emergencyContacts: me.emergencyContacts };
      const c = check(validateOwnContact(formInput(current as Json, v)));
      if (!c.ok) return c.error;
      if (!(await updateOwnContact(u.employeeId, c.data))) return fail("Could not save your details.");
      await audit(u, { action: "update", entity: "employee", entityId: u.employeeId, summary: "Employee updated own contact details" });
      return { ok: true, result: "Your details are saved." };
    },
  },
  {
    key: "hrms.set_offer_status", panel: "hrms", label: "Change a job offer's status", description: "Extend, accept, decline, withdraw an offer (notifies the HR team).", level: "staff", allow: canManageEmployees,
    params: [{ key: "offerId", label: "Offer id (hrms.offer)", type: "ref", ref: "hrms.offer", required: true }, { key: "status", label: "New status", type: "enum", options: OFFER, required: true }],
    run: async (v, u) => {
      const status = String(v.status);
      if (!isValidOfferStatus(status)) return fail("Invalid status.");
      const r = await updateOfferStatus(String(v.offerId), status, u.id);
      if (!r.ok) return fail(r.error ?? "Could not change the offer.");
      await audit(u, { action: "status_change", entity: "offer", entityId: String(v.offerId), entityLabel: `${r.offer.candidateName} — ${r.offer.positionTitle}`, summary: `→ ${status}` });
      await notify({ audience: "staff", type: "offer_status", title: `Offer ${status}: ${r.offer.candidateName}`, body: r.offer.positionTitle, link: "/talentos/recruitment", entityType: "offer", entityId: String(v.offerId) });
      return { ok: true, id: String(v.offerId), result: `Offer is now ${status}.` };
    },
  },
  {
    key: "hrms.convert_applicant", panel: "hrms", label: "Hire an applicant (create the employee from their application)", description: "Create the employee record from a job application and mark their offer as joined.", level: "staff", allow: canManageEmployees,
    params: [
      { key: "applicationId", label: "Job application id (hrms.application)", type: "ref", ref: "hrms.application", required: true },
      { key: "firstName", label: "First name", type: "string", required: true }, { key: "lastName", label: "Last name", type: "string", required: true },
      { key: "workEmail", label: "Work email", type: "email", required: true }, { key: "joiningDate", label: "Joining date", type: "dateString" },
      { key: "departmentId", label: "Department (hrms.department id)", type: "ref", ref: "hrms.department" }, { key: "designationId", label: "Designation (hrms.designation id)", type: "ref", ref: "hrms.designation" },
      { key: "reportingManagerId", label: "Reports to (hrms.employee id)", type: "ref", ref: "hrms.employee" }, { key: "employmentType", label: "Employment type", type: "enum", options: EMPLOYMENT },
    ],
    run: async (v, u) => {
      const prefill = await getApplicationForConversion(String(v.applicationId));
      if (!prefill) return fail("That applicant is no longer available for conversion.");
      const c = check(validateEmployeeCreate(v));
      if (!c.ok) return c.error;
      const employee = await createEmployee(c.data, u.id, { recruitment: { applicationId: String(v.applicationId), positionSlug: prefill.positionSlug, positionTitle: prefill.positionTitle, convertedAt: new Date(), convertedBy: u.id } });
      await rebuildHierarchyFor(employee._id);
      await audit(u, { action: "convert_from_applicant", entity: "employee", entityId: employee._id, entityLabel: `${employeeFullName(employee)} (${employee.employeeCode})`, summary: `Converted from application ${String(v.applicationId)}` });
      await markOfferJoined(String(v.applicationId), employee._id, u.id);
      await notify({ audience: "staff", type: "employee_added", title: `${employeeFullName(employee)} added`, body: `${employee.employeeCode} · converted from a job application`, link: `/talentos/employees/${employee._id}`, entityType: "employee", entityId: employee._id });
      return { ok: true, id: employee._id, result: `${employeeFullName(employee)} (${employee.employeeCode}) created.` };
    },
  },
  {
    key: "hrms.save_payroll_profile", panel: "hrms", label: "Set an employee's salary structure", description: "Basic, HRA, allowances, deductions and PF/ESI/UAN/PAN numbers for payroll.", level: "staff", allow: canManagePayroll,
    params: [
      { key: "employeeId", label: "Employee (hrms.employee id)", type: "ref", ref: "hrms.employee", required: true },
      { key: "basic", label: "Basic per month", type: "number", required: true }, { key: "hra", label: "HRA per month", type: "number", required: true },
      { key: "allowances", label: "Allowances [{name, amount}]", type: "json" }, { key: "deductions", label: "Deductions [{name, amount}]", type: "json" },
      { key: "pfNumber", label: "PF number", type: "string" }, { key: "esiNumber", label: "ESI number", type: "string" }, { key: "uan", label: "UAN", type: "string" }, { key: "panNumber", label: "PAN", type: "string" },
    ],
    run: async (v, u) => {
      const employee = await getEmployee(String(v.employeeId));
      if (!employee) return fail("Employee not found.");
      const cur = ((await getPayrollProfile(employee._id)) as unknown as Json | null) ?? {};
      const c = check(validatePayrollProfile(formInput(cur, v)));
      if (!c.ok) return c.error;
      await upsertPayrollProfile(employee._id, c.data, u.id);
      await audit(u, { action: "update", entity: "payroll_profile", entityId: employee._id, entityLabel: `${employeeFullName(employee)} (${employee.employeeCode})`, summary: "Salary structure / bank details updated" });
      return { ok: true, id: employee._id, result: "Salary structure saved." };
    },
  },
  {
    key: "hrms.create_salary_revision", panel: "hrms", label: "Record a salary revision", description: "A new salary structure effective from a date, kept in the employee's history.", level: "staff", allow: canRunPayroll,
    params: [
      { key: "employeeId", label: "Employee (hrms.employee id)", type: "ref", ref: "hrms.employee", required: true }, { key: "effectiveFrom", label: "Effective from", type: "dateString", required: true },
      { key: "basic", label: "Basic per month", type: "number", required: true }, { key: "hra", label: "HRA per month", type: "number", required: true },
      { key: "allowances", label: "Allowances [{name, amount}]", type: "json" }, { key: "deductions", label: "Deductions [{name, amount}]", type: "json" }, { key: "reason", label: "Reason", type: "string" },
    ],
    run: async (v, u) => {
      const employee = await getEmployee(String(v.employeeId));
      if (!employee) return fail("Employee not found.");
      const c = check(validateSalaryRevision(v));
      if (!c.ok) return c.error;
      const rev = await createRevision({ employeeId: employee._id, ...c.data }, u.id);
      await audit(u, { action: "create", entity: "salary_revision", entityId: rev._id, entityLabel: `${employeeFullName(employee)} (${employee.employeeCode})`, summary: `Effective ${c.data.effectiveFrom} — basic ${c.data.basic}` });
      return { ok: true, id: rev._id, result: "Salary revision recorded." };
    },
  },
  {
    key: "hrms.create_payroll_run", panel: "hrms", label: "Generate a month's payroll run", description: "Create the payroll run (all payslips) for a month, YYYY-MM. It stays a draft until approved.", level: "staff", allow: canRunPayroll,
    params: [{ key: "month", label: "Month (YYYY-MM)", type: "string", required: true }],
    run: async (v, u) => {
      const month = String(v.month);
      if (!/^\d{4}-\d{2}$/.test(month)) return fail("Pick a valid month, like 2026-10.");
      const r = await createRun(month, u.id);
      if (!r.ok) return fail(r.error ?? "Could not create the run.");
      await audit(u, { action: "generate", entity: "payroll_run", entityId: r.run._id, entityLabel: month, summary: `${r.run.payslipCount} payslip(s), net ${r.run.totalNet}` });
      return { ok: true, id: r.run._id, result: `Run created: ${r.run.payslipCount} payslip(s), net ${r.run.totalNet}.` };
    },
  },
  {
    key: "hrms.approve_payroll_run", panel: "hrms", label: "Approve a payroll run (creates the salary payouts)", description: "Finalise a drafted payroll run. This locks the month and creates the salary payouts.", level: "staff", allow: canRunPayroll, destructive: true,
    params: [{ key: "runId", label: "Payroll run id (hrms.payroll_run)", type: "ref", ref: "hrms.payroll_run", required: true }],
    run: async (v, u) => {
      const run = await getRun(String(v.runId));
      const r = await approveRun(String(v.runId), u.id);
      if (!r.ok) return fail(r.error ?? "Could not approve the run.");
      await audit(u, { action: "approve", entity: "payroll_run", entityId: String(v.runId), entityLabel: run?.month, summary: "Run approved — salary payouts created" });
      return { ok: true, id: String(v.runId), result: "Payroll run approved." };
    },
  },
  {
    key: "hrms.delete_payroll_run", panel: "hrms", label: "Delete a draft payroll run", description: "Remove a payroll run that has not been approved.", level: "staff", allow: canRunPayroll, destructive: true,
    params: [{ key: "runId", label: "Payroll run id (hrms.payroll_run)", type: "ref", ref: "hrms.payroll_run", required: true }],
    run: async (v, u) => {
      const run = await getRun(String(v.runId));
      const r = await deleteRun(String(v.runId));
      if (!r.ok) return fail(r.error ?? "Could not delete the run.");
      await audit(u, { action: "delete", entity: "payroll_run", entityId: String(v.runId), entityLabel: run?.month });
      return { ok: true, id: String(v.runId), result: "Payroll run deleted." };
    },
  },
  {
    key: "hrms.set_payslip_overrides", panel: "hrms", label: "Adjust a payslip (arrears, other deductions, manual TDS)", description: "Apply arrears, other deductions or a manual TDS to one payslip of a draft run.", level: "staff", allow: canRunPayroll,
    params: [{ key: "payslipId", label: "Payslip id (hrms.payslip)", type: "ref", ref: "hrms.payslip", required: true }, { key: "arrears", label: "Arrears", type: "number" }, { key: "otherDeductions", label: "Other deductions", type: "number" }, { key: "manualTds", label: "Manual TDS (leave out for automatic)", type: "number" }],
    run: async (v, u) => {
      const slip = await getPayslip(String(v.payslipId));
      if (!slip) return fail("Payslip not found.");
      const c = check(validatePayslipOverrides(v));
      if (!c.ok) return c.error;
      const r = await updatePayslipOverrides(slip._id, c.data);
      if (!r.ok) return fail(r.error ?? "Could not adjust the payslip.");
      await audit(u, { action: "update", entity: "payslip", entityId: slip._id, entityLabel: `${slip.employeeName} · ${slip.month}`, summary: `arrears ${c.data.arrears}, other ${c.data.otherDeductions}${c.data.manualTds != null ? `, TDS ${c.data.manualTds}` : ""}` });
      return { ok: true, id: slip._id, result: "Payslip adjusted." };
    },
  },
  {
    key: "hrms.recompute_payslip", panel: "hrms", label: "Recompute a payslip", description: "Recalculate a payslip from the current salary structure, attendance and rates.", level: "staff", allow: canRunPayroll,
    params: [{ key: "payslipId", label: "Payslip id (hrms.payslip)", type: "ref", ref: "hrms.payslip", required: true }],
    run: async (v) => {
      const r = await recomputePayslip(String(v.payslipId));
      return r.ok ? { ok: true, id: String(v.payslipId), result: "Payslip recomputed." } : fail(r.error ?? "Could not recompute the payslip.");
    },
  },
  {
    key: "hrms.initiate_payouts", panel: "hrms", label: "Pay salaries (send the payouts)", description: "Not available here: salaries are paid from Payroll → the run → Pay with Razorpay, with a confirmation code.", level: "staff", allow: canRunPayroll, destructive: true,
    params: [{ key: "payoutIds", label: "Payout ids (hrms.salary_payout)", type: "stringList", required: true }],
    run: async () => fail(MONEY_MOVES_IN_THE_APP),
  },
  {
    key: "hrms.retry_payout", panel: "hrms", label: "Retry a failed payout", description: "Not available here: retry from the payout in the app, with a confirmation code.", level: "staff", allow: canRunPayroll, destructive: true,
    params: [{ key: "payoutId", label: "Payout id (hrms.salary_payout)", type: "ref", ref: "hrms.salary_payout", required: true }],
    run: async () => fail(MONEY_MOVES_IN_THE_APP),
  },
  {
    key: "hrms.cancel_payout", panel: "hrms", label: "Cancel a salary payout", description: "Cancel a payout that has not been paid.", level: "staff", allow: canRunPayroll, destructive: true,
    params: [{ key: "payoutId", label: "Payout id (hrms.salary_payout)", type: "ref", ref: "hrms.salary_payout", required: true }],
    run: async (v, u) => {
      const r = await cancelPayout(String(v.payoutId), { id: u.id, email: u.email });
      return r.ok ? { ok: true, id: String(v.payoutId), result: "Payout cancelled." } : fail(r.error ?? "Could not cancel the payout.");
    },
  },
  {
    key: "hrms.refresh_payout", panel: "hrms", label: "Check a salary payout's status with RazorpayX", description: "Asks RazorpayX whether a salary payout was paid, failed or returned. Use it when the status looks stuck.", level: "staff", allow: canRunPayroll,
    params: [{ key: "payoutId", label: "Payout id (hrms.salary_payout)", type: "ref", ref: "hrms.salary_payout", required: true }],
    run: async (v) => {
      const r = await refreshSalaryPayout(String(v.payoutId));
      return r.ok ? { ok: true, id: String(v.payoutId), result: "Payout status refreshed from RazorpayX." } : fail(r.error ?? "Could not refresh the payout.");
    },
  },
  {
    key: "hrms.save_work_schedule", panel: "hrms", label: "Change the work schedule", description: "Working days (0=Sunday…6=Saturday), shift start/end, grace and early-departure minutes, half/full day hours, timezone.", level: "admin", allow: canManageSettings,
    params: [
      { key: "workingDays", label: "Working days as numbers 0–6", type: "json" }, { key: "shiftStart", label: "Shift start HH:MM", type: "string" }, { key: "shiftEnd", label: "Shift end HH:MM", type: "string" },
      { key: "graceMinutes", label: "Late grace minutes", type: "number" }, { key: "earlyDepartureMinutes", label: "Early departure minutes", type: "number" },
      { key: "halfDayHours", label: "Half-day hours", type: "number" }, { key: "fullDayHours", label: "Full-day hours", type: "number" }, { key: "timezone", label: "Timezone (IANA)", type: "string" },
    ],
    run: async (v, u) => {
      const cur = (await getOrgSettings()) as unknown as Json;
      const c = check(validateOrgSettings(formInput(cur, v)));
      if (!c.ok) return c.error;
      await updateOrgSettings(c.data, u.id);
      await audit(u, { action: "update", entity: "org_settings", entityId: "org", entityLabel: "Work schedule", summary: `shift ${c.data.shiftStart}–${c.data.shiftEnd}, grace ${c.data.graceMinutes}m` });
      return { ok: true, result: "Work schedule saved." };
    },
  },
  {
    key: "hrms.save_company_details", panel: "hrms", label: "Change company details used on payslips", description: "Legal name, address, PAN, GSTIN, PF/ESI codes, signatory and payslip note.", level: "admin", allow: canManageSettings,
    params: ["name", "legalName", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "email", "phone", "website", "pan", "gstin", "cin", "pfEstablishmentCode", "esiEstablishmentCode", "lin", "tan", "ptRegistration", "signatoryName", "signatoryDesignation", "payslipNote"].map((k) => ({ key: k, label: k, type: "string" as const })),
    run: async (v, u) => {
      const cur = (await getCompanyDetails()) as unknown as Json;
      const c = check(validateCompanyDetails(formInput(cur, v)));
      if (!c.ok) return c.error;
      await updateCompanyDetails(c.data, u.id);
      await audit(u, { action: "update", entity: "company", entityId: "org", entityLabel: "Company details", summary: `${c.data.name}${c.data.pan ? ` · PAN ${c.data.pan}` : ""}` });
      return { ok: true, result: "Company details saved." };
    },
  },
  {
    key: "hrms.save_payroll_config", panel: "hrms", label: "Change payroll policy", description: "How days are counted (calendar/working/fixed), sandwich rule, overtime, late marks, which registrations the company holds (PF, ESI, professional tax, labour welfare fund), default tax regime and deduction limit. The law's own rates (PF, ESI, tax slabs, professional tax) are set by the platform and cannot be changed here.", level: "admin", allow: canManagePayrollConfig,
    params: [
      { key: "paidDaysBasis", label: "Pay days basis", type: "enum", options: ["calendar", "working", "fixed"] }, { key: "fixedDays", label: "Fixed days (26 or 30) when basis is fixed", type: "number" },
      { key: "sandwichRule", label: "Sandwich rule", type: "enum", options: ["none", "unpaid_leave", "all_lop"] }, { key: "unmarkedDay", label: "Working day with no attendance", type: "enum", options: ["lop", "present"] },
      { key: "lateMarksPerHalfDay", label: "Late marks that cost half a day (0 = off)", type: "number" }, { key: "overtimeEnabled", label: "Pay overtime", type: "boolean" },
      { key: "pfRegistered", label: "Registered with EPFO", type: "boolean" }, { key: "esiRegistered", label: "Registered with ESIC", type: "boolean" }, { key: "ptRegistered", label: "Professional tax registered", type: "boolean" },
      { key: "defaultTaxRegime", label: "Default tax regime", type: "enum", options: ["new", "old"] }, { key: "deductionCapPercent", label: "Most that recoveries may take, % of wages", type: "number" }, { key: "requireSeparateApprover", label: "A different person must approve each run", type: "boolean" },
    ],
    run: async (v, u) => {
      const cur = (await getPayrollConfig()) as unknown as Json;
      const c = check(validatePayrollConfig(formInput(cur, v)));
      if (!c.ok) return c.error;
      await updatePayrollConfig(c.data, u.id);
      await audit(u, { action: "update", entity: "payroll_config", entityId: "org", entityLabel: "Payroll policy", summary: `days ${c.data.paidDaysBasis}, sandwich ${c.data.sandwichRule}, tax ${c.data.defaultTaxRegime}` });
      return { ok: true, result: "Payroll policy saved." };
    },
  },
  ...(["save_bank_account", "set_primary_bank_account", "set_bank_verification", "delete_bank_account"] as const).map((k): ActionDef => {
    const emp = { key: "employeeId", label: "Employee (hrms.employee id)", type: "ref", ref: "hrms.employee", required: true } as const;
    const acct = { key: "accountId", label: "Bank account id", type: "string", required: true } as const;
    const base = { panel: "hrms", level: "staff" as const, allow: canManagePayroll, destructive: true };
    if (k === "save_bank_account") return { ...base, key: "hrms.save_bank_account", label: "Add or edit an employee's bank account", description: "Salary account: holder, bank, branch, type, account number, IFSC, UPI, primary. Leave accountId out to add. Account numbers are stored encrypted and never shown back.", params: [emp, { key: "accountId", label: "Account id to edit (leave out to add)", type: "string" }, { key: "accountHolderName", label: "Account holder name", type: "string", required: true }, { key: "bankName", label: "Bank name", type: "string", required: true }, { key: "branch", label: "Branch", type: "string" }, { key: "accountType", label: "Type (savings / current)", type: "string", required: true }, { key: "accountNumber", label: "Account number", type: "string", required: true }, { key: "ifsc", label: "IFSC", type: "string", required: true }, { key: "upiId", label: "UPI id", type: "string" }, { key: "isPrimary", label: "Primary account", type: "boolean" }], run: (v) => viaAction(() => Bank.saveBankAccountAction(String(v.employeeId), v, str(v.accountId) ?? undefined), "Bank account saved.") };
    if (k === "set_primary_bank_account") return { ...base, key: "hrms.set_primary_bank_account", label: "Make a bank account primary", description: "Salary is paid to the primary account.", params: [emp, acct], run: (v) => viaAction(() => Bank.setPrimaryBankAccountAction(String(v.employeeId), String(v.accountId)), "Primary account set.") };
    if (k === "set_bank_verification") return { ...base, key: "hrms.set_bank_verification", label: "Verify or reject a bank account", description: "Record the verification result for an account (status: verified / rejected / pending).", params: [emp, acct, { key: "status", label: "Status", type: "enum", options: ["verified", "rejected", "pending"], required: true }, { key: "note", label: "Note", type: "string" }], run: (v) => viaAction(() => Bank.setBankVerificationAction(String(v.employeeId), String(v.accountId), String(v.status), String(v.note ?? "")), "Verification saved.") };
    return { ...base, key: "hrms.delete_bank_account", label: "Delete a bank account", description: "Remove an employee's bank account.", params: [emp, acct], run: (v) => viaAction(() => Bank.deleteBankAccountAction(String(v.employeeId), String(v.accountId)), "Bank account deleted.") };
  }),
];

// ── Reports ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const isoDay = () => new Date().toISOString().slice(0, 10);
const staffOnly = (u: AgentUser) => canViewAllEmployees(u) || !!u.employeeId;

export const HRMS_REPORTS: ReportDef[] = [
  {
    key: "hrms.dashboard", panel: "hrms", label: "HR dashboard numbers", description: "Headcount, joiners, exits, attrition, department and gender split.", level: "staff", allow: canViewAllEmployees,
    params: [{ key: "dateFrom", label: "From", type: "dateString" }, { key: "dateTo", label: "To", type: "dateString" }, { key: "departmentId", label: "Department id", type: "string" }],
    run: async (v) => (await getHrmsDashboardStats({ dateFrom: v.dateFrom ? new Date(String(v.dateFrom)) : undefined, dateTo: v.dateTo ? new Date(`${String(v.dateTo)}T23:59:59`) : undefined, departmentId: str(v.departmentId) ?? undefined })) as unknown as Json,
  },
  {
    key: "hrms.leave_analytics", panel: "hrms", label: "Leave analytics", description: "Leave taken by type and department over a period.", level: "staff", allow: canViewAllEmployees,
    params: [{ key: "from", label: "From", type: "dateString", required: true }, { key: "to", label: "To", type: "dateString", required: true }],
    run: async (v) => (await getLeaveAnalytics(String(v.from), String(v.to))) as unknown as Json,
  },
  {
    key: "hrms.leave_calendar", panel: "hrms", label: "Who is on leave when", description: "Approved and pending leave across a date range.", level: "any", allow: staffOnly,
    params: [{ key: "from", label: "From", type: "dateString", required: true }, { key: "to", label: "To", type: "dateString", required: true }],
    run: async (v, u) => {
      const restrict = canViewAllEmployees(u) ? undefined : [u.employeeId!, ...(await descendantEmployeeIds(u.employeeId!))];
      return { entries: await getLeaveCalendar(String(v.from), String(v.to), restrict) } as unknown as Json;
    },
  },
  {
    key: "hrms.leave_balances", panel: "hrms", label: "Leave balances of an employee", description: "Allocated, used, pending and available days per leave type for a year (default: you, this year).", level: "any", allow: staffOnly,
    params: [{ key: "employeeId", label: "Employee (hrms.employee id)", type: "ref", ref: "hrms.employee" }, { key: "year", label: "Year", type: "number" }],
    run: async (v, u) => {
      const id = str(v.employeeId) ?? u.employeeId;
      if (!id) return fail("Say which employee.");
      if (!(await inScope(u, id))) return fail("That employee is outside your reporting line.");
      if (!(await getEmployee(id))) return fail("Employee not found.");
      return { employeeId: id, balances: await getBalances(id, Number(v.year) || new Date().getFullYear()) } as unknown as Json;
    },
  },
  {
    key: "hrms.on_leave_today", panel: "hrms", label: "Employees on leave on a day", description: "Ids of employees on approved leave on a date (default today).", level: "staff", allow: canViewAllEmployees,
    params: [{ key: "date", label: "Date", type: "dateString" }],
    run: async (v) => ({ date: str(v.date) ?? isoDay(), employeeIds: await employeesOnLeave(str(v.date) ?? undefined) }),
  },
  {
    key: "hrms.attendance_today", panel: "hrms", label: "Today's attendance snapshot", description: "Present, absent, late, on leave counts for today.", level: "staff", allow: (u) => canManageAttendance(u) || canViewAllEmployees(u),
    params: [],
    run: async (_v, u) => (await getTodaySnapshot(canViewAllEmployees(u) ? undefined : u.employeeId ?? undefined)) as unknown as Json,
  },
  {
    key: "hrms.attendance_month", panel: "hrms", label: "Monthly attendance report", description: "Per-employee present/absent/late/leave days for a month.", level: "staff", allow: (u) => canManageAttendance(u) || canViewAllEmployees(u),
    params: [{ key: "month", label: "Month (YYYY-MM)", type: "string", required: true }, { key: "departmentId", label: "Department id", type: "string" }],
    run: async (v, u) => ({ rows: await getMonthlyReport(String(v.month), { departmentId: str(v.departmentId) ?? undefined, restrictToManagerId: canViewAllEmployees(u) ? undefined : u.employeeId ?? undefined }) }) as unknown as Json,
  },
  {
    key: "hrms.attendance_trend", panel: "hrms", label: "Attendance trend", description: "Daily attendance counts across a date range.", level: "staff", allow: (u) => canManageAttendance(u) || canViewAllEmployees(u),
    params: [{ key: "from", label: "From", type: "dateString", required: true }, { key: "to", label: "To", type: "dateString", required: true }],
    run: async (v, u) => ({ points: await getAttendanceOverview(String(v.from), String(v.to), { restrictToManagerId: canViewAllEmployees(u) ? undefined : u.employeeId ?? undefined }) }) as unknown as Json,
  },
];
