import "server-only";
import {
  DEFAULT_EMPLOYEE_STATUS,
  isValidEmployeeStatus,
  isValidEmploymentType,
  isValidGender,
  isValidWorkLocation,
} from "@/lib/products/talentos/employee-status";
import type {
  EmployeeWriteData,
  EmergencyContact,
  EmployeePersonal,
  EmployeeProfessional,
} from "@/lib/products/talentos/employees";
import type { PayrollWriteData, PayComponent, StatutoryFlags } from "@/lib/products/talentos/payroll";
import { normaliseState } from "@/lib/products/talentos/payroll/rates";
import { emptyBank } from "@/lib/products/talentos/payroll";

/**
 * Hand-rolled server-side validators (the project has no schema library).
 * Same `{ valid, data } | { valid, errors }` contract as
 * `src/lib/career-application-validation.ts`.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-()]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Ok<T> = { valid: true; data: T };
type Err = { valid: false; errors: Record<string, string> };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function optStr(v: unknown, max = 500): string | null {
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
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(str(v));
  return Number.isFinite(n) ? n : NaN;
}

// ---------------------------------------------------------------------------
// Employee
// ---------------------------------------------------------------------------

function parsePersonal(input: Record<string, unknown>, errors: Record<string, string>): EmployeePersonal {
  const gender = str(input.gender);
  return {
    dateOfBirth: optDate(input.dateOfBirth, errors, "dateOfBirth"),
    gender: gender && isValidGender(gender) ? gender : null,
    maritalStatus: optStr(input.maritalStatus, 40),
    personalEmail: (() => {
      const e = str(input.personalEmail);
      if (!e) return null;
      if (!EMAIL_RE.test(e)) errors.personalEmail = "Enter a valid personal email.";
      return e.slice(0, 254);
    })(),
    phone: (() => {
      const p = str(input.phone);
      if (!p) return null;
      if (!PHONE_RE.test(p)) errors.phone = "Enter a valid phone number.";
      return p;
    })(),
    addressLine: optStr(input.addressLine, 300),
    city: optStr(input.city, 100),
    state: optStr(input.state, 100),
    postalCode: optStr(input.postalCode, 20),
    photoKey: optStr(input.photoKey, 200),
  };
}

function parseProfessional(input: Record<string, unknown>, errors: Record<string, string>): EmployeeProfessional {
  const employmentType = str(input.employmentType);
  const workLocation = str(input.workLocation);
  if (employmentType && !isValidEmploymentType(employmentType)) errors.employmentType = "Invalid employment type.";
  if (workLocation && !isValidWorkLocation(workLocation)) errors.workLocation = "Invalid work location.";
  return {
    departmentId: optStr(input.departmentId, 64),
    designationId: optStr(input.designationId, 64),
    teamId: optStr(input.teamId, 64),
    reportingManagerId: optStr(input.reportingManagerId, 64),
    employmentType: employmentType && isValidEmploymentType(employmentType) ? employmentType : null,
    workLocation: workLocation && isValidWorkLocation(workLocation) ? workLocation : null,
    joiningDate: optDate(input.joiningDate, errors, "joiningDate"),
    probationEndDate: optDate(input.probationEndDate, errors, "probationEndDate"),
    relievingDate: optDate(input.relievingDate, errors, "relievingDate"),
  };
}

function parseEmergencyContacts(input: unknown): EmergencyContact[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((c) => {
      const rec = (c ?? {}) as Record<string, unknown>;
      return { name: str(rec.name).slice(0, 120), relationship: str(rec.relationship).slice(0, 60), phone: str(rec.phone).slice(0, 20) };
    })
    .filter((c) => c.name && c.phone);
}

export function validateEmployeeCreate(input: Record<string, unknown>): Ok<EmployeeWriteData> | Err {
  const errors: Record<string, string> = {};

  const firstName = str(input.firstName);
  if (!firstName) errors.firstName = "First name is required.";
  else if (firstName.length > 80) errors.firstName = "First name must be 80 characters or fewer.";

  const lastName = str(input.lastName);
  if (!lastName) errors.lastName = "Last name is required.";
  else if (lastName.length > 80) errors.lastName = "Last name must be 80 characters or fewer.";

  const workEmail = str(input.workEmail).toLowerCase();
  if (!workEmail) errors.workEmail = "Work email is required.";
  else if (!EMAIL_RE.test(workEmail)) errors.workEmail = "Enter a valid work email.";

  const statusRaw = str(input.status) || DEFAULT_EMPLOYEE_STATUS;
  if (!isValidEmployeeStatus(statusRaw)) errors.status = "Invalid employment status.";

  const personal = parsePersonal(input, errors);
  const professional = parseProfessional(input, errors);
  const emergencyContacts = parseEmergencyContacts(input.emergencyContacts);

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      firstName,
      lastName,
      workEmail,
      status: statusRaw as EmployeeWriteData["status"],
      personal,
      professional,
      emergencyContacts,
    },
  };
}

export function validateEmployeeUpdate(input: Record<string, unknown>): Ok<Partial<EmployeeWriteData>> | Err {
  // Update accepts the same shape; all fields present in the form are re-validated.
  const result = validateEmployeeCreate(input);
  return result;
}

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------

export function validateDepartment(input: Record<string, unknown>): Ok<{ name: string; code: string; description: string | null; headEmployeeId: string | null }> | Err {
  const errors: Record<string, string> = {};
  const name = str(input.name);
  if (!name) errors.name = "Name is required.";
  else if (name.length > 100) errors.name = "Name must be 100 characters or fewer.";

  const code = str(input.code).toUpperCase();
  if (!code) errors.code = "Code is required.";
  else if (!/^[A-Z0-9-]{2,12}$/.test(code)) errors.code = "Code must be 2–12 letters, digits or dashes.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { name, code, description: optStr(input.description, 500), headEmployeeId: optStr(input.headEmployeeId, 64) } };
}

export function validateDesignation(input: Record<string, unknown>): Ok<{ title: string; departmentId: string; level: string | null }> | Err {
  const errors: Record<string, string> = {};
  const title = str(input.title);
  if (!title) errors.title = "Title is required.";
  else if (title.length > 100) errors.title = "Title must be 100 characters or fewer.";

  const departmentId = str(input.departmentId);
  if (!departmentId) errors.departmentId = "Select a department.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { title, departmentId, level: optStr(input.level, 40) } };
}

export function validateTeam(input: Record<string, unknown>): Ok<{ name: string; departmentId: string; leadEmployeeId: string | null }> | Err {
  const errors: Record<string, string> = {};
  const name = str(input.name);
  if (!name) errors.name = "Name is required.";
  else if (name.length > 100) errors.name = "Name must be 100 characters or fewer.";

  const departmentId = str(input.departmentId);
  if (!departmentId) errors.departmentId = "Select a department.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { name, departmentId, leadEmployeeId: optStr(input.leadEmployeeId, 64) } };
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

function parseComponents(input: unknown, errors: Record<string, string>, key: string, withFlags = false): PayComponent[] {
  if (!Array.isArray(input)) return [];
  const out: PayComponent[] = [];
  for (const raw of input) {
    const rec = (raw ?? {}) as Record<string, unknown>;
    const name = str(rec.name).slice(0, 60);
    if (!name) continue;
    const amount = num(rec.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      errors[key] = "All amounts must be zero or a positive number.";
      continue;
    }
    const flag = (v: unknown, fallback: boolean) => (v === undefined || v === null || v === "" ? fallback : v === true || v === "true" || v === "on");
    out.push(withFlags ? { name, amount: Math.round(amount), taxable: flag(rec.taxable, true), pf: flag(rec.pf, false), esi: flag(rec.esi, true), prorate: flag(rec.prorate, true) } : { name, amount: Math.round(amount) });
  }
  return out;
}

const PAN_FORMAT = /^[A-Z]{5}\d{4}[A-Z]$/;

export function validatePayrollProfile(input: Record<string, unknown>): Ok<PayrollWriteData> | Err {
  const errors: Record<string, string> = {};

  const basic = num(input.basic);
  if (!Number.isFinite(basic) || basic < 0) errors.basic = "Basic salary must be zero or a positive number.";

  const hra = num(input.hra);
  if (!Number.isFinite(hra) || hra < 0) errors.hra = "HRA must be zero or a positive number.";

  const da = input.da === undefined || str(input.da) === "" ? 0 : num(input.da);
  if (!Number.isFinite(da) || da < 0) errors.da = "Dearness allowance must be zero or a positive number.";
  const employerNps = input.employerNps === undefined || str(input.employerNps) === "" ? 0 : num(input.employerNps);
  if (!Number.isFinite(employerNps) || employerNps < 0) errors.employerNps = "Employer NPS must be zero or a positive number.";

  const allowances = parseComponents(input.allowances, errors, "allowances", true);
  const deductions = parseComponents(input.deductions, errors, "deductions");

  const pan = str(input.panNumber).toUpperCase().replace(/\s/g, "");
  if (pan && !PAN_FORMAT.test(pan)) errors.panNumber = "PAN has 10 characters: five letters, four digits, one letter (ABCDE1234F).";
  const uan = str(input.uan).replace(/\s/g, "");
  if (uan && !/^\d{12}$/.test(uan)) errors.uan = "UAN is 12 digits.";
  const esi = str(input.esiNumber).replace(/\s/g, "");
  if (esi && !/^\d{10,17}$/.test(esi)) errors.esiNumber = "An ESI (IP) number is 10 to 17 digits.";

  let statutory: StatutoryFlags | undefined;
  if (input.statutory && typeof input.statutory === "object") {
    const f = input.statutory as Record<string, unknown>;
    const b = (v: unknown, d: boolean) => (v === undefined ? d : v === true || v === "true" || v === "on");
    const mode = str(f.pfMode);
    const stateRaw = str(f.workState);
    const workState = stateRaw ? normaliseState(stateRaw) : null;
    if (stateRaw && !workState) errors.workState = "Choose one of the listed states or union territories.";
    statutory = {
      pfApplicable: b(f.pfApplicable, true),
      pfMode: mode === "ceiling" || mode === "actual" ? mode : null,
      epsEligible: b(f.epsEligible, true),
      esiApplicable: b(f.esiApplicable, true),
      esiDisabled: b(f.esiDisabled, false),
      ptApplicable: b(f.ptApplicable, true),
      lwfApplicable: b(f.lwfApplicable, true),
      tdsApplicable: b(f.tdsApplicable, true),
      workState,
    };
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      currency: "INR",
      basic: Math.round(basic),
      da: Math.round(da),
      hra: Math.round(hra),
      allowances,
      deductions,
      employerNps: Math.round(employerNps),
      pfNumber: optStr(input.pfNumber, 40),
      esiNumber: esi || null,
      uan: uan || null,
      panNumber: pan || null,
      statutory,
      // Bank details now live in `hrms_bank_accounts`, not the payroll profile.
      bank: emptyBank(),
    },
  };
}
