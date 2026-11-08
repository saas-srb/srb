import "server-only";
import { isDateString } from "@/lib/products/talentos/time";
import type { PayComponent } from "@/lib/products/talentos/payroll";
import type { PayrollConfigInput } from "@/lib/products/talentos/payroll-config";
import type { SalaryStructure } from "@/lib/products/talentos/salary-revisions";
import { isValidDocumentCategory, EMPLOYEE_UPLOADABLE_CATEGORIES, type DocumentCategory } from "@/lib/products/talentos/document-categories";
import { isValidAccountType, type AccountType } from "@/lib/products/talentos/payout-status";

const IFSC_RE = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
const ACCOUNT_NUMBER_RE = /^\d{6,18}$/;

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
function optStr(v: unknown, max = 300): string | null {
  const s = str(v);
  return s ? s.slice(0, max) : null;
}
function components(v: unknown, errors: Record<string, string>, key: string, withFlags = false): PayComponent[] {
  if (!Array.isArray(v)) return [];
  const out: PayComponent[] = [];
  for (const raw of v) {
    const rec = (raw ?? {}) as Record<string, unknown>;
    const name = str(rec.name).slice(0, 60);
    if (!name) continue;
    const amount = num(rec.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      errors[key] = "Amounts must be zero or positive.";
      continue;
    }
    const flag = (x: unknown, fallback: boolean) => (x === undefined || x === null || x === "" ? fallback : x === true || x === "true" || x === "on");
    out.push(withFlags ? { name, amount: Math.round(amount), taxable: flag(rec.taxable, true), pf: flag(rec.pf, false), esi: flag(rec.esi, true), prorate: flag(rec.prorate, true) } : { name, amount: Math.round(amount) });
  }
  return out;
}

// ---------------------------------------------------------------------------

export function validatePayrollConfig(input: Record<string, unknown>): Ok<PayrollConfigInput> | Err {
  const errors: Record<string, string> = {};
  const pick = <T extends string>(v: unknown, allowed: readonly T[], k: string, fallback: T): T => {
    const s = str(v) as T;
    if (!allowed.includes(s)) {
      errors[k] = "Choose one of the listed options.";
      return fallback;
    }
    return s;
  };
  const range = (v: unknown, k: string, min: number, max: number, int = false) => {
    const n = num(v);
    if (!(n >= min && n <= max) || (int && !Number.isInteger(n))) errors[k] = `Enter ${int ? "a whole number" : "a number"} from ${min} to ${max}.`;
    return n;
  };
  const bool = (v: unknown) => v === true || v === "true" || v === "on";

  const data: PayrollConfigInput = {
    pfRegistered: bool(input.pfRegistered),
    esiRegistered: bool(input.esiRegistered),
    ptRegistered: bool(input.ptRegistered),
    lwfRegistered: bool(input.lwfRegistered),
    paidDaysBasis: pick(input.paidDaysBasis, ["calendar", "working", "fixed"], "paidDaysBasis", "calendar"),
    fixedDays: range(input.fixedDays, "fixedDays", 20, 31, true),
    sandwichRule: pick(input.sandwichRule, ["none", "unpaid_leave", "all_lop"], "sandwichRule", "none"),
    unmarkedDay: pick(input.unmarkedDay, ["lop", "present"], "unmarkedDay", "lop"),
    lateMarksPerHalfDay: range(input.lateMarksPerHalfDay, "lateMarksPerHalfDay", 0, 31, true),
    overtimeEnabled: bool(input.overtimeEnabled),
    overtimeRequiresApproval: input.overtimeRequiresApproval === undefined ? true : bool(input.overtimeRequiresApproval),
    overtimeMaxMinutesPerDay: range(input.overtimeMaxMinutesPerDay, "overtimeMaxMinutesPerDay", 30, 720, true),
    overtimeMaxMinutesPerMonth: range(input.overtimeMaxMinutesPerMonth, "overtimeMaxMinutesPerMonth", 60, 20000, true),
    overtimeMultiplier: range(input.overtimeMultiplier, "overtimeMultiplier", 1, 4),
    holidayWorkMultiplier: range(input.holidayWorkMultiplier, "holidayWorkMultiplier", 1, 4),
    hoursPerDay: range(input.hoursPerDay, "hoursPerDay", 1, 24),
    shortLeavesPerMonth: range(input.shortLeavesPerMonth, "shortLeavesPerMonth", 0, 10, true),
    shortLeaveMaxMinutes: range(input.shortLeaveMaxMinutes, "shortLeaveMaxMinutes", 30, 480, true),
    expenseMaxAgeDays: range(input.expenseMaxAgeDays, "expenseMaxAgeDays", 7, 365, true),
    wageDefinition: pick(input.wageDefinition, ["flags", "fifty_percent_rule"], "wageDefinition", "flags"),
    pfDefaultMode: pick(input.pfDefaultMode, ["ceiling", "actual"], "pfDefaultMode", "ceiling"),
    statutoryBonusEnabled: bool(input.statutoryBonusEnabled),
    statutoryBonusPercent: range(input.statutoryBonusPercent, "statutoryBonusPercent", 8.33, 20),
    minimumWage: range(input.minimumWage, "minimumWage", 0, 1_000_000),
    gratuityCovered: bool(input.gratuityCovered),
    includeGratuityProvision: bool(input.includeGratuityProvision),
    leaveEncashmentDaysInMonth: pick(String(input.leaveEncashmentDaysInMonth), ["26", "30"], "leaveEncashmentDaysInMonth", "30") === "26" ? 26 : 30,
    tdsEnabled: bool(input.tdsEnabled),
    defaultTaxRegime: pick(input.defaultTaxRegime, ["new", "old"], "defaultTaxRegime", "new"),
    noPanRule: pick(input.noPanRule, ["warn", "apply_20_percent"], "noPanRule", "warn"),
    proofCutoffMonth: range(input.proofCutoffMonth, "proofCutoffMonth", 1, 3, true),
    deductionCapPercent: range(input.deductionCapPercent, "deductionCapPercent", 10, 100),
    requireSeparateApprover: bool(input.requireSeparateApprover),
    financialYearStartMonth: 4,
  };

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data };
}

export function validateSalaryRevision(
  input: Record<string, unknown>
): Ok<SalaryStructure & { effectiveFrom: string; reason: string | null }> | Err {
  const errors: Record<string, string> = {};
  const effectiveFrom = str(input.effectiveFrom);
  if (!isDateString(effectiveFrom)) errors.effectiveFrom = "Select an effective date.";
  const basic = num(input.basic);
  if (!(basic >= 0)) errors.basic = "Enter a valid basic amount.";
  const hra = num(input.hra);
  if (!(hra >= 0)) errors.hra = "Enter a valid HRA amount.";
  const da = input.da === undefined || str(input.da) === "" ? 0 : num(input.da);
  if (!(da >= 0)) errors.da = "Enter a valid dearness allowance.";
  const employerNps = input.employerNps === undefined || str(input.employerNps) === "" ? 0 : num(input.employerNps);
  if (!(employerNps >= 0)) errors.employerNps = "Enter a valid employer NPS amount.";
  const allowances = components(input.allowances, errors, "allowances", true);
  const deductions = components(input.deductions, errors, "deductions");

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: { effectiveFrom, reason: optStr(input.reason, 300), basic: Math.round(basic), da: Math.round(da), hra: Math.round(hra), allowances, deductions, employerNps: Math.round(employerNps) },
  };
}

export function validatePayslipOverrides(
  input: Record<string, unknown>
): Ok<{ arrears: number; manualTds: number | null; otherDeductions: number }> | Err {
  const errors: Record<string, string> = {};
  const arrears = num(input.arrears) || 0;
  if (!(arrears >= 0)) errors.arrears = "Zero or positive.";
  const otherDeductions = num(input.otherDeductions) || 0;
  if (!(otherDeductions >= 0)) errors.otherDeductions = "Zero or positive.";
  const manualRaw = str(input.manualTds);
  const manualTds = manualRaw === "" ? null : num(input.manualTds);
  if (manualTds != null && !(manualTds >= 0)) errors.manualTds = "Zero or positive, or blank for auto.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { arrears: Math.round(arrears), manualTds: manualTds == null ? null : Math.round(manualTds), otherDeductions: Math.round(otherDeductions) } };
}

export function validateEmployeeLogin(input: Record<string, unknown>): Ok<{ email: string; tempPassword: string }> | Err {
  const errors: Record<string, string> = {};
  const email = str(input.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email.";
  const tempPassword = str(input.tempPassword);
  if (tempPassword.length < 10) errors.tempPassword = "At least 10 characters.";
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { email, tempPassword } };
}

export function validateDocumentMeta(
  input: Record<string, unknown>,
  actorRole: "staff" | "employee"
): Ok<{ category: DocumentCategory; title: string; issuedDate: string | null; expiryDate: string | null }> | Err {
  const errors: Record<string, string> = {};
  const category = str(input.category);
  if (!isValidDocumentCategory(category)) errors.category = "Choose a category.";
  else if (actorRole === "employee" && !EMPLOYEE_UPLOADABLE_CATEGORIES.includes(category)) {
    errors.category = "You can only upload documents in the allowed categories.";
  }
  const title = str(input.title);
  if (!title) errors.title = "Give the document a title.";
  else if (title.length > 120) errors.title = "Title must be 120 characters or fewer.";

  const issuedDate = str(input.issuedDate);
  const expiryDate = str(input.expiryDate);
  if (issuedDate && !isDateString(issuedDate)) errors.issuedDate = "Invalid date.";
  if (expiryDate && !isDateString(expiryDate)) errors.expiryDate = "Invalid date.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: { category: category as DocumentCategory, title, issuedDate: issuedDate || null, expiryDate: expiryDate || null },
  };
}

export function validateOffer(
  input: Record<string, unknown>
): Ok<{ applicationId: string; offerDate: string | null; proposedJoiningDate: string | null; annualCtc: number | null; notes: string | null }> | Err {
  const errors: Record<string, string> = {};
  const applicationId = str(input.applicationId);
  if (!applicationId) errors.applicationId = "Select an applicant.";
  const offerDate = str(input.offerDate);
  const proposedJoiningDate = str(input.proposedJoiningDate);
  if (offerDate && !isDateString(offerDate)) errors.offerDate = "Invalid date.";
  if (proposedJoiningDate && !isDateString(proposedJoiningDate)) errors.proposedJoiningDate = "Invalid date.";
  const ctcRaw = str(input.annualCtc);
  const annualCtc = ctcRaw === "" ? null : num(input.annualCtc);
  if (annualCtc != null && !(annualCtc >= 0 && annualCtc <= 100_000_000)) errors.annualCtc = "Enter a valid annual CTC.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      applicationId,
      offerDate: offerDate || null,
      proposedJoiningDate: proposedJoiningDate || null,
      annualCtc: annualCtc == null ? null : Math.round(annualCtc),
      notes: optStr(input.notes, 1000),
    },
  };
}

export function validateOfferDetails(
  input: Record<string, unknown>
): Ok<{ offerDate: string | null; proposedJoiningDate: string | null; annualCtc: number | null; notes: string | null }> | Err {
  const v = validateOffer({ ...input, applicationId: "placeholder" });
  if (!v.valid) return v;
  const { offerDate, proposedJoiningDate, annualCtc, notes } = v.data;
  return { valid: true, data: { offerDate, proposedJoiningDate, annualCtc, notes } };
}

export function validateOwnContact(input: Record<string, unknown>): Ok<{
  phone: string | null;
  personalEmail: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  emergencyContacts: { name: string; relationship: string; phone: string }[];
}> | Err {
  const errors: Record<string, string> = {};
  const phone = str(input.phone);
  if (phone && !/^[+]?[\d\s\-()]{7,20}$/.test(phone)) errors.phone = "Enter a valid phone number.";
  const personalEmail = str(input.personalEmail);
  if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) errors.personalEmail = "Enter a valid email.";

  const emergencyContacts = Array.isArray(input.emergencyContacts)
    ? input.emergencyContacts
        .map((c) => {
          const rec = (c ?? {}) as Record<string, unknown>;
          return { name: str(rec.name).slice(0, 120), relationship: str(rec.relationship).slice(0, 60), phone: str(rec.phone).slice(0, 20) };
        })
        .filter((c) => c.name && c.phone)
    : [];

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      phone: phone || null,
      personalEmail: personalEmail || null,
      addressLine: optStr(input.addressLine),
      city: optStr(input.city, 100),
      state: optStr(input.state, 100),
      postalCode: optStr(input.postalCode, 20),
      emergencyContacts,
    },
  };
}

// ---------------------------------------------------------------------------
// Bank accounts + payouts
// ---------------------------------------------------------------------------

export function validateBankAccount(input: Record<string, unknown>): Ok<{
  accountHolderName: string;
  bankName: string;
  branch: string | null;
  accountType: AccountType;
  accountNumber: string;
  ifsc: string;
  upiId: string | null;
  isPrimary: boolean;
}> | Err {
  const errors: Record<string, string> = {};

  const accountHolderName = str(input.accountHolderName);
  if (!accountHolderName) errors.accountHolderName = "Account holder name is required.";
  else if (accountHolderName.length > 120) errors.accountHolderName = "Must be 120 characters or fewer.";

  const bankName = str(input.bankName);
  if (!bankName) errors.bankName = "Bank name is required.";

  const accountType = str(input.accountType);
  if (!isValidAccountType(accountType)) errors.accountType = "Choose an account type.";

  const accountNumber = str(input.accountNumber).replace(/\s+/g, "");
  if (!accountNumber) errors.accountNumber = "Account number is required.";
  else if (!ACCOUNT_NUMBER_RE.test(accountNumber)) errors.accountNumber = "Enter a valid account number (6–18 digits).";

  const ifsc = str(input.ifsc).toUpperCase();
  if (!ifsc) errors.ifsc = "IFSC is required.";
  else if (!IFSC_RE.test(ifsc)) errors.ifsc = "Enter a valid IFSC code.";

  const upiRaw = str(input.upiId);
  if (upiRaw && !/^[\w.\-]{2,64}@[a-zA-Z]{2,32}$/.test(upiRaw)) errors.upiId = "Enter a valid UPI ID (name@bank).";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      accountHolderName,
      bankName: bankName.slice(0, 120),
      branch: optStr(input.branch, 120),
      accountType: accountType as AccountType,
      accountNumber,
      ifsc,
      upiId: upiRaw || null,
      isPrimary: input.isPrimary === true || input.isPrimary === "true" || input.isPrimary === "on",
    },
  };
}

