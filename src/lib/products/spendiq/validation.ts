import "server-only";
import { panError } from "@/lib/products/cashflow-ai/tds/core";
import {
  DEFAULT_VENDOR_CATEGORY,
  DEFAULT_VENDOR_STATUS,
  DEFAULT_PAYMENT_TERM,
  DEFAULT_CURRENCY,
  DEFAULT_PRIORITY,
  DEFAULT_UOM,
  SUPPORTED_CURRENCIES,
  isValidVendorCategory,
  isValidVendorStatus,
  isValidPaymentTerm,
  isValidPriority,
  isValidExpenseCategory,
  UNITS_OF_MEASURE,
} from "@/lib/products/spendiq/constants";
import type { VendorWriteData } from "@/lib/products/spendiq/vendors";
import type { RequisitionWriteData } from "@/lib/products/spendiq/requisitions";

/**
 * Hand-rolled server-side validators. Same `{ valid, data } | { valid, errors }`
 * contract as `src/lib/cohort-ai/validation.ts`.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-()]{7,20}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

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
function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === "1";
}
function currency(v: unknown): string {
  const c = str(v).toUpperCase() || DEFAULT_CURRENCY;
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c) ? c : DEFAULT_CURRENCY;
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

void bool;

// ---------------------------------------------------------------------------
// Vendor
// ---------------------------------------------------------------------------

export function validateVendor(input: Record<string, unknown>): Ok<VendorWriteData> | Err {
  const errors: Record<string, string> = {};

  const companyName = str(input.companyName);
  if (!companyName) errors.companyName = "Company name is required.";
  if (companyName.length > 200) errors.companyName = "Company name is too long.";

  const gstin = optStr(input.gstin, 20)?.toUpperCase() ?? null;
  if (gstin && !GSTIN_RE.test(gstin)) errors.gstin = "Enter a valid 15-character GSTIN.";

  const pan = optStr(input.pan, 10)?.toUpperCase() ?? null;
  if (pan) {
    const problem = panError(pan);
    if (problem) errors.pan = problem;
  }

  const email = optStr(input.email, 160);
  if (email && !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";

  const phone = optStr(input.phone, 40);
  if (phone && !PHONE_RE.test(phone)) errors.phone = "Enter a valid phone number.";

  const categoryRaw = str(input.category) || DEFAULT_VENDOR_CATEGORY;
  if (!isValidVendorCategory(categoryRaw)) errors.category = "Unknown vendor category.";

  const statusRaw = str(input.status) || DEFAULT_VENDOR_STATUS;
  if (!isValidVendorStatus(statusRaw)) errors.status = "Unknown status.";

  const termRaw = str(input.paymentTerms) || DEFAULT_PAYMENT_TERM;
  if (!isValidPaymentTerm(termRaw)) errors.paymentTerms = "Unknown payment term.";

  const rating = optNum(input.rating, errors, "rating", { min: 0 });
  if (rating !== null && rating > 5) errors.rating = "Rating is out of 5.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      companyName,
      gstin,
      pan,
      contactPerson: optStr(input.contactPerson, 160),
      email,
      phone,
      addressLine: optStr(input.addressLine, 400),
      city: optStr(input.city, 120),
      state: optStr(input.state, 120),
      pincode: optStr(input.pincode, 12),
      bankDetails: {
        accountName: optStr(input.bankAccountName, 160),
        accountNumber: optStr(input.bankAccountNumber, 40),
        ifsc: optStr(input.bankIfsc, 20)?.toUpperCase() ?? null,
        bankName: optStr(input.bankName, 160),
        branch: optStr(input.bankBranch, 160),
      },
      paymentTerms: isValidPaymentTerm(termRaw) ? termRaw : DEFAULT_PAYMENT_TERM,
      currency: currency(input.currency),
      category: isValidVendorCategory(categoryRaw) ? categoryRaw : DEFAULT_VENDOR_CATEGORY,
      rating: rating !== null ? Math.round(rating * 10) / 10 : null,
      status: isValidVendorStatus(statusRaw) ? statusRaw : DEFAULT_VENDOR_STATUS,
      notes: optStr(input.notes, 4000),
    },
  };
}

// ---------------------------------------------------------------------------
// Purchase Requisition
// ---------------------------------------------------------------------------

export function validateRequisition(input: Record<string, unknown>): Ok<RequisitionWriteData> | Err {
  const errors: Record<string, string> = {};

  const departmentId = str(input.departmentId);
  if (!departmentId) errors.departmentId = "Select a department.";

  const category = str(input.category);
  if (!category) errors.category = "Select a category.";
  else if (!isValidExpenseCategory(category)) errors.category = "Unknown category.";

  const itemName = str(input.itemName);
  if (!itemName) errors.itemName = "Item name is required.";
  if (itemName.length > 240) errors.itemName = "Item name is too long.";

  const quantity = optNum(input.quantity, errors, "quantity", { min: 1 });
  if (quantity === null && !errors.quantity) errors.quantity = "Enter a quantity.";

  const estimatedCost = optNum(input.estimatedCost, errors, "estimatedCost", { min: 0 });
  if (estimatedCost === null && !errors.estimatedCost) errors.estimatedCost = "Enter the estimated cost.";

  const priorityRaw = str(input.priority) || DEFAULT_PRIORITY;
  if (!isValidPriority(priorityRaw)) errors.priority = "Unknown priority.";

  const uomRaw = str(input.uom) || DEFAULT_UOM;
  const uom = (UNITS_OF_MEASURE as readonly string[]).includes(uomRaw) ? uomRaw : DEFAULT_UOM;

  const requiredDate = optDate(input.requiredDate, errors, "requiredDate");

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      departmentId,
      departmentName: optStr(input.departmentName, 160),
      projectId: optStr(input.projectId, 60),
      projectName: optStr(input.projectName, 200),
      category,
      subcategory: optStr(input.subcategory, 120),
      itemName,
      quantity: Math.round(quantity ?? 1),
      uom,
      estimatedCost: estimatedCost ?? 0,
      currency: currency(input.currency),
      requiredDate,
      priority: isValidPriority(priorityRaw) ? priorityRaw : DEFAULT_PRIORITY,
      justification: optStr(input.justification, 4000),
      preferredVendorId: optStr(input.preferredVendorId, 60),
    },
  };
}
