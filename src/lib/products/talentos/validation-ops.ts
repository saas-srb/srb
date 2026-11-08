import "server-only";
import { isDateString, isTimeString, parseHHmm } from "@/lib/products/talentos/time";
import { isValidHolidayType, type HolidayType } from "@/lib/products/talentos/holiday-types";
import { isValidAttendanceStatus, MANUAL_ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/products/talentos/attendance-status";
import type { CompanyDetailsInput } from "@/lib/products/talentos/company";
import { normaliseState } from "@/lib/products/talentos/payroll/rates";

/**
 * Server-side validators for the Phase 2a modules — same
 * `{ valid, data } | { valid, errors }` contract as `validation.ts`.
 */

type Ok<T> = { valid: true; data: T };
type Err = { valid: false; errors: Record<string, string> };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(str(v));
  return Number.isFinite(n) ? n : NaN;
}
function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === 1 || v === "1";
}

// ---------------------------------------------------------------------------
// Org settings
// ---------------------------------------------------------------------------

export interface OrgSettingsData {
  workingDays: number[];
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  earlyDepartureMinutes: number;
  halfDayHours: number;
  fullDayHours: number;
  timezone: string;
  saturdayOffs: number[];
  state: string | null;
}

export function validateOrgSettings(input: Record<string, unknown>): Ok<OrgSettingsData> | Err {
  const errors: Record<string, string> = {};

  const rawDays = Array.isArray(input.workingDays) ? input.workingDays : [];
  const workingDays = Array.from(new Set(rawDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort();
  if (workingDays.length === 0) errors.workingDays = "Select at least one working day.";

  const shiftStart = str(input.shiftStart);
  const shiftEnd = str(input.shiftEnd);
  if (!isTimeString(shiftStart)) errors.shiftStart = "Enter a valid time (HH:mm).";
  if (!isTimeString(shiftEnd)) errors.shiftEnd = "Enter a valid time (HH:mm).";
  if (isTimeString(shiftStart) && isTimeString(shiftEnd) && parseHHmm(shiftEnd) <= parseHHmm(shiftStart)) {
    errors.shiftEnd = "Shift end must be after shift start.";
  }

  const graceMinutes = num(input.graceMinutes);
  const earlyDepartureMinutes = num(input.earlyDepartureMinutes);
  const halfDayHours = num(input.halfDayHours);
  const fullDayHours = num(input.fullDayHours);
  if (!(graceMinutes >= 0 && graceMinutes <= 240)) errors.graceMinutes = "0–240 minutes.";
  if (!(earlyDepartureMinutes >= 0 && earlyDepartureMinutes <= 240)) errors.earlyDepartureMinutes = "0–240 minutes.";
  if (!(halfDayHours > 0 && halfDayHours <= 24)) errors.halfDayHours = "Enter hours (0–24).";
  if (!(fullDayHours > 0 && fullDayHours <= 24)) errors.fullDayHours = "Enter hours (0–24).";
  if (!errors.halfDayHours && !errors.fullDayHours && halfDayHours >= fullDayHours) {
    errors.halfDayHours = "Half-day hours must be less than full-day hours.";
  }

  const timezone = str(input.timezone) || "Asia/Kolkata";
  const rawSat = Array.isArray(input.saturdayOffs) ? input.saturdayOffs : [];
  const saturdayOffs = workingDays.includes(6) ? Array.from(new Set(rawSat.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 5))).sort() : [];
  const stateRaw = str(input.state);
  const state = stateRaw ? normaliseState(stateRaw) : null;
  if (stateRaw && !state) errors.state = "Choose one of the listed states or union territories.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      workingDays,
      shiftStart,
      shiftEnd,
      graceMinutes: Math.round(graceMinutes),
      earlyDepartureMinutes: Math.round(earlyDepartureMinutes),
      halfDayHours,
      fullDayHours,
      timezone,
      saturdayOffs,
      state,
    },
  };
}

// ---------------------------------------------------------------------------
// Holiday
// ---------------------------------------------------------------------------

export function validateHoliday(input: Record<string, unknown>): Ok<{ date: string; name: string; type: HolidayType; states: string[] }> | Err {
  const errors: Record<string, string> = {};
  const date = str(input.date);
  if (!isDateString(date)) errors.date = "Select a valid date.";
  const name = str(input.name);
  if (!name) errors.name = "Name is required.";
  else if (name.length > 120) errors.name = "Name must be 120 characters or fewer.";
  const type = str(input.type);
  if (!isValidHolidayType(type)) errors.type = "Select a holiday type.";
  const rawStates = Array.isArray(input.states) ? input.states : [];
  const states = Array.from(new Set(rawStates.map((s) => normaliseState(String(s))).filter((s): s is NonNullable<ReturnType<typeof normaliseState>> => !!s)));
  if (rawStates.length > 0 && states.length !== new Set(rawStates.map((s) => String(s).trim())).size) errors.states = "Choose states from the list.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { date, name, type: type as HolidayType, states } };
}

// ---------------------------------------------------------------------------
// Leave type
// ---------------------------------------------------------------------------

export function validateLeaveType(
  input: Record<string, unknown>
): Ok<{ code: string; label: string; paid: boolean; defaultAnnualQuota: number; allowNegativeBalance: boolean; active: boolean }> | Err {
  const errors: Record<string, string> = {};
  const code = str(input.code).toLowerCase();
  if (!code) errors.code = "Code is required.";
  else if (!/^[a-z0-9_]{2,20}$/.test(code)) errors.code = "2–20 chars: lowercase letters, digits, underscore.";
  const label = str(input.label);
  if (!label) errors.label = "Label is required.";
  else if (label.length > 60) errors.label = "Label must be 60 characters or fewer.";
  const quota = num(input.defaultAnnualQuota);
  if (!(quota >= 0 && quota <= 365)) errors.defaultAnnualQuota = "Enter a quota between 0 and 365.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      code,
      label,
      paid: bool(input.paid),
      defaultAnnualQuota: Math.round(quota * 2) / 2,
      allowNegativeBalance: bool(input.allowNegativeBalance),
      active: input.active === undefined ? true : bool(input.active),
    },
  };
}

// ---------------------------------------------------------------------------
// Leave request
// ---------------------------------------------------------------------------

export function validateLeaveRequest(
  input: Record<string, unknown>
): Ok<{ employeeId: string; leaveTypeCode: string; startDate: string; endDate: string; halfDayStart: boolean; halfDayEnd: boolean; reason: string }> | Err {
  const errors: Record<string, string> = {};
  const employeeId = str(input.employeeId);
  if (!employeeId) errors.employeeId = "Select an employee.";
  const leaveTypeCode = str(input.leaveTypeCode);
  if (!leaveTypeCode) errors.leaveTypeCode = "Select a leave type.";
  const startDate = str(input.startDate);
  const endDate = str(input.endDate) || startDate;
  if (!isDateString(startDate)) errors.startDate = "Select a start date.";
  if (!isDateString(endDate)) errors.endDate = "Select a valid end date.";
  if (!errors.startDate && !errors.endDate && endDate < startDate) errors.endDate = "End date is before start date.";
  const reason = str(input.reason);
  if (reason.length > 1000) errors.reason = "Reason must be 1000 characters or fewer.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      employeeId,
      leaveTypeCode,
      startDate,
      endDate,
      halfDayStart: bool(input.halfDayStart),
      halfDayEnd: bool(input.halfDayEnd),
      reason,
    },
  };
}

// ---------------------------------------------------------------------------
// Company details (payslip identity)
// ---------------------------------------------------------------------------

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9A-Z]{15}$/;

export function validateCompanyDetails(input: Record<string, unknown>): Ok<CompanyDetailsInput> | Err {
  const errors: Record<string, string> = {};
  const cap = (v: unknown, max: number) => str(v).slice(0, max);

  const name = cap(input.name, 120);
  if (!name) errors.name = "Company name is required.";

  const pan = cap(input.pan, 15).toUpperCase();
  if (pan && !PAN_RE.test(pan)) errors.pan = "PAN looks invalid (ABCDE1234F).";
  const gstin = cap(input.gstin, 20).toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) errors.gstin = "GSTIN must be 15 characters.";

  const tan = cap(input.tan, 12).toUpperCase();
  if (tan && !/^[A-Z]{4}\d{5}[A-Z]$/.test(tan)) errors.tan = "TAN is 10 characters: four letters, five digits, one letter (MUMA12345B).";

  const email = cap(input.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      name,
      legalName: cap(input.legalName, 160) || name,
      addressLine1: cap(input.addressLine1, 160),
      addressLine2: cap(input.addressLine2, 160),
      city: cap(input.city, 80),
      state: cap(input.state, 80),
      postalCode: cap(input.postalCode, 12),
      country: cap(input.country, 60) || "India",
      email,
      phone: cap(input.phone, 40),
      website: cap(input.website, 120),
      pan,
      gstin,
      cin: cap(input.cin, 40).toUpperCase(),
      pfEstablishmentCode: cap(input.pfEstablishmentCode, 40),
      esiEstablishmentCode: cap(input.esiEstablishmentCode, 40),
      lin: cap(input.lin, 40),
      tan,
      ptRegistration: cap(input.ptRegistration, 40),
      signatoryName: cap(input.signatoryName, 120),
      signatoryDesignation: cap(input.signatoryDesignation, 80) || "Authorised Signatory",
      payslipNote: cap(input.payslipNote, 400),
    },
  };
}

// ---------------------------------------------------------------------------
// Attendance entry
// ---------------------------------------------------------------------------

export function validateAttendanceEntry(
  input: Record<string, unknown>
): Ok<{ status: AttendanceStatus; checkIn: string | null; checkOut: string | null; breakMinutes: number; note: string | null }> | Err {
  const errors: Record<string, string> = {};
  const status = str(input.status);
  if (!isValidAttendanceStatus(status) || !MANUAL_ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) {
    errors.status = "Pick Present, Half Day or Absent.";
  }

  const checkIn = str(input.checkIn) || null;
  const checkOut = str(input.checkOut) || null;
  if (checkIn && !isTimeString(checkIn)) errors.checkIn = "Enter a valid time (HH:mm).";
  if (checkOut && !isTimeString(checkOut)) errors.checkOut = "Enter a valid time (HH:mm).";
  if (checkIn && checkOut && isTimeString(checkIn) && isTimeString(checkOut) && parseHHmm(checkOut) <= parseHHmm(checkIn)) {
    errors.checkOut = "Check-out must be after check-in.";
  }

  const breakMinutes = num(input.breakMinutes) || 0;
  if (!(breakMinutes >= 0 && breakMinutes <= 600)) errors.breakMinutes = "0–600 minutes.";

  const note = str(input.note);
  if (note.length > 500) errors.note = "Note must be 500 characters or fewer.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      status: status as AttendanceStatus,
      checkIn,
      checkOut,
      breakMinutes: Math.round(breakMinutes),
      note: note || null,
    },
  };
}
