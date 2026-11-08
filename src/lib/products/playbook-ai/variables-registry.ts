/**
 * The variable registry: every built-in variable a Playbook document can use, by typed namespace, where its value comes from, and the
 * missing-data report. Pure and client-safe (the editor's variable picker reads it). Reading the actual values is `variables-adapters.ts`
 * (server-only). Custom per-company variables (`custom.*`) are added by the caller from `pb_variables`.
 *
 * Sensitive data is deliberately absent: no salary, bank account or ID-document numbers are variables. A letter that needs an amount
 * takes it as an `input.*` field the author types in.
 */

import type { PBDoc, VariableFormat, VariableNamespace } from "@/lib/products/playbook-ai/doc/types";
import { collectVariables, resolveDoc, type VarLists, type VarValues } from "@/lib/products/playbook-ai/doc/variables";
import type { DocLinks, MissingItem, MissingReport, VariableSnapshot } from "@/lib/products/playbook-ai/documents-types";

export type VariableSource =
  | "company_profile" | "author" | "employee" | "client" | "vendor" | "candidate" | "project" | "document" | "clock" | "input" | "custom";

export interface VariableDef {
  key: string;
  namespace: VariableNamespace;
  label: string;
  description: string;
  /** Format the picker suggests (the author can pick another). */
  format: VariableFormat;
  source: VariableSource;
}

const def = (namespace: VariableNamespace, field: string, label: string, source: VariableSource, format: VariableFormat = "text", description = ""): VariableDef => ({
  key: `${namespace}.${field}`, namespace, label, description: description || label, format, source,
});

export const BUILTIN_VARIABLES: readonly VariableDef[] = [
  // Company profile (Settings > Company in TalentOS: `hrms_company`)
  def("company", "name", "Company name", "company_profile"),
  def("company", "legal_name", "Company legal name", "company_profile"),
  def("company", "address", "Company address (one line)", "company_profile"),
  def("company", "address_line1", "Company address line 1", "company_profile"),
  def("company", "address_line2", "Company address line 2", "company_profile"),
  def("company", "city", "Company city", "company_profile"),
  def("company", "state", "Company state", "company_profile"),
  def("company", "postal_code", "Company PIN code", "company_profile"),
  def("company", "country", "Company country", "company_profile"),
  def("company", "email", "Company email", "company_profile"),
  def("company", "phone", "Company phone", "company_profile"),
  def("company", "website", "Company website", "company_profile"),
  def("company", "pan", "Company PAN", "company_profile", "upper"),
  def("company", "gstin", "Company GSTIN", "company_profile", "upper"),
  def("company", "cin", "Company CIN", "company_profile", "upper"),
  def("company", "tan", "Company TAN", "company_profile", "upper"),
  def("company", "pf_code", "PF establishment code", "company_profile"),
  def("company", "esi_code", "ESI establishment code", "company_profile"),
  def("company", "pt_registration", "Professional tax registration", "company_profile"),
  def("company", "signatory_name", "Authorised signatory name", "company_profile"),
  def("company", "signatory_designation", "Authorised signatory designation", "company_profile"),
  // The person writing the document
  def("author", "name", "Author name", "author"),
  def("author", "email", "Author email", "author"),
  def("author", "designation", "Author designation", "author"),
  def("author", "department", "Author department", "author"),
  def("author", "employee_code", "Author employee code", "author"),
  // Employee (TalentOS `hrms_employees`)
  def("employee", "name", "Employee full name", "employee"),
  def("employee", "first_name", "Employee first name", "employee"),
  def("employee", "last_name", "Employee last name", "employee"),
  def("employee", "code", "Employee code", "employee"),
  def("employee", "work_email", "Employee work email", "employee"),
  def("employee", "personal_email", "Employee personal email", "employee"),
  def("employee", "phone", "Employee phone", "employee"),
  def("employee", "designation", "Employee designation", "employee"),
  def("employee", "department", "Employee department", "employee"),
  def("employee", "employment_type", "Employment type", "employee"),
  def("employee", "work_location", "Work location", "employee"),
  def("employee", "joining_date", "Date of joining", "employee", "date"),
  def("employee", "probation_end_date", "Probation end date", "employee", "date"),
  def("employee", "relieving_date", "Relieving date", "employee", "date"),
  def("employee", "reporting_manager", "Reporting manager", "employee"),
  def("employee", "address", "Employee address (one line)", "employee"),
  // Client (SprintOS `pms_clients`)
  def("client", "code", "Client code", "client"),
  def("client", "name", "Client company name", "client"),
  def("client", "contact_name", "Client contact name", "client"),
  def("client", "contact_designation", "Client contact designation", "client"),
  def("client", "contact_email", "Client contact email", "client"),
  def("client", "contact_phone", "Client contact phone", "client"),
  def("client", "address", "Client address (one line)", "client"),
  def("client", "state", "Client state", "client"),
  def("client", "gstin", "Client GSTIN", "client", "upper"),
  def("client", "currency", "Client currency", "client"),
  def("client", "payment_terms_days", "Client payment terms (days)", "client", "number"),
  // Vendor (SpendIQ `prms_vendors`; bank details are never offered)
  def("vendor", "code", "Vendor code", "vendor"),
  def("vendor", "name", "Vendor company name", "vendor"),
  def("vendor", "contact_person", "Vendor contact person", "vendor"),
  def("vendor", "email", "Vendor email", "vendor"),
  def("vendor", "phone", "Vendor phone", "vendor"),
  def("vendor", "address", "Vendor address (one line)", "vendor"),
  def("vendor", "state", "Vendor state", "vendor"),
  def("vendor", "gstin", "Vendor GSTIN", "vendor", "upper"),
  def("vendor", "pan", "Vendor PAN", "vendor", "upper"),
  def("vendor", "payment_terms", "Vendor payment terms", "vendor"),
  def("vendor", "currency", "Vendor currency", "vendor"),
  // Candidate (career applications)
  def("candidate", "name", "Candidate name", "candidate"),
  def("candidate", "email", "Candidate email", "candidate"),
  def("candidate", "phone", "Candidate phone", "candidate"),
  def("candidate", "position", "Position applied for", "candidate"),
  def("candidate", "applied_on", "Application date", "candidate", "date"),
  // Project (SprintOS `pms_projects`)
  def("project", "code", "Project code", "project"),
  def("project", "name", "Project name", "project"),
  def("project", "description", "Project description", "project"),
  def("project", "start_date", "Project start date", "project", "date"),
  def("project", "end_date", "Project end date", "project", "date"),
  def("project", "budget", "Project estimated budget", "project", "money"),
  def("project", "currency", "Project currency", "project"),
  def("project", "manager", "Project manager", "project"),
  def("project", "client_name", "Project client", "project"),
  // This document
  def("doc", "title", "Document title", "document"),
  def("doc", "number", "Document number", "document"),
  def("doc", "version", "Version number", "document", "number"),
  def("doc", "status", "Document status", "document"),
  def("doc", "issue_date", "Issue date", "document", "date"),
  // Today (Indian time)
  def("date", "today", "Today's date", "clock", "date"),
  def("date", "day", "Day of month", "clock"),
  def("date", "month", "Month name", "clock"),
  def("date", "year", "Year", "clock"),
  def("date", "financial_year", "Financial year (April to March)", "clock"),
];

/** Namespaces that have built-in or dynamic variables, for tests and the picker. */
export const VARIABLE_NAMESPACES_USED: readonly string[] = [...new Set([...BUILTIN_VARIABLES.map((v) => v.namespace), "input", "party", "custom"])];

const BY_KEY = new Map(BUILTIN_VARIABLES.map((v) => [v.key, v]));
export const builtinVariable = (key: string): VariableDef | undefined => BY_KEY.get(key);

/** Namespaces whose keys are free-form: typed into the document form (`input`, `party`) rather than read from a record. */
export const FREE_NAMESPACES: readonly string[] = ["input", "party"];

/** Which link a namespace needs before its values can be read. */
export const NAMESPACE_LINK: Partial<Record<string, keyof DocLinks>> = {
  employee: "employeeId", client: "clientId", vendor: "vendorId", candidate: "candidateId", project: "projectId",
};

export interface CustomVariableDef { key: string; label: string; description?: string; valueType: "text" | "number" | "money" | "date"; value: string | number }

export function customToDef(c: CustomVariableDef): VariableDef {
  return { key: c.key, namespace: "custom", label: c.label, description: c.description || c.label, format: c.valueType === "text" ? "text" : c.valueType, source: "custom" };
}

/** The picker's catalogue: built-ins plus the company's custom variables. */
export function variableCatalogue(custom: readonly CustomVariableDef[] = []): VariableDef[] {
  return [...BUILTIN_VARIABLES, ...custom.map(customToDef)];
}

export function isKnownVariable(key: string, custom: readonly CustomVariableDef[] = []): boolean {
  const ns = key.split(".")[0];
  if (FREE_NAMESPACES.includes(ns)) return true;
  return BY_KEY.has(key) || custom.some((c) => c.key === key);
}

/** Today in Indian time as `{ iso, year, month, day, financialYear }`. Deterministic for a given instant. */
export function indiaDateParts(now: Date): { iso: string; year: number; monthIndex: number; day: number; financialYear: string } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const year = ist.getUTCFullYear();
  const monthIndex = ist.getUTCMonth();
  const day = ist.getUTCDate();
  const startYear = monthIndex >= 3 ? year : year - 1;
  return {
    iso: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year, monthIndex, day,
    financialYear: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
  };
}

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** `date.*` values for an instant. */
export function dateValues(now: Date): VarValues {
  const p = indiaDateParts(now);
  return { "date.today": p.iso, "date.day": String(p.day), "date.month": MONTH_NAMES[p.monthIndex], "date.year": String(p.year), "date.financial_year": p.financialYear };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Missing-data report
// ---------------------------------------------------------------------------------------------------------------------------------

export interface MissingReportInput {
  doc: PBDoc;
  values: VarValues;
  lists?: VarLists;
  links?: DocLinks;
  custom?: readonly CustomVariableDef[];
  /** Namespaces whose source the actor may not read (from the adapters), so the report can say "no access" instead of "no value". */
  deniedNamespaces?: readonly string[];
}

const SOURCE_NAME: Record<string, string> = {
  company: "the company profile (TalentOS > Settings > Company)", author: "the author's profile", employee: "the linked employee", client: "the linked client",
  vendor: "the linked vendor", candidate: "the linked candidate", project: "the linked project", doc: "the document", date: "the calendar",
  input: "the document form", party: "the document form", custom: "Playbook > Variables",
};

/**
 * Lists what stops a document from being issued: required variables with no usable value (a variable with a fallback is never "missing")
 * and placeholders still to fill. Pure: pass the values the adapters read.
 */
export function buildMissingReport(i: MissingReportInput): MissingReport {
  const collected = collectVariables(i.doc);
  const res = resolveDoc(i.doc, { values: i.values, lists: i.lists });
  const unresolved = new Map(res.unresolved.map((u) => [u.key, u.reason]));
  const denied = new Set(i.deniedNamespaces ?? []);
  const items: MissingItem[] = [];
  for (const use of collected.variables) {
    const reason = unresolved.get(use.key);
    if (!reason) continue;
    const ns = use.key.split(".")[0];
    const known = builtinVariable(use.key) ?? i.custom?.find((c) => c.key === use.key);
    const label = known ? known.label : use.key;
    const linkKey = NAMESPACE_LINK[ns];
    let code: MissingItem["reason"];
    let fix: string;
    if (!isKnownVariable(use.key, i.custom)) {
      code = "unknown_variable";
      fix = ns === "custom" ? `Define "${use.key}" in Playbook > Variables, or remove it from the document.` : `"${use.key}" is not a variable Playbook provides. Replace it with one from the picker.`;
    } else if (denied.has(ns)) {
      code = "no_access";
      fix = `You do not have access to read ${SOURCE_NAME[ns] ?? ns}. Ask someone with access to fill this document.`;
    } else if (linkKey && !i.links?.[linkKey]) {
      code = "no_source_selected";
      fix = `Choose ${SOURCE_NAME[ns]} for this document.`;
    } else if (reason !== "no value") {
      code = "bad_format";
      fix = `The value is ${reason}. Correct it in ${SOURCE_NAME[ns] ?? "its source"}.`;
    } else {
      code = "no_value";
      fix = FREE_NAMESPACES.includes(ns) ? `Fill "${label}" in the document form.` : `Add "${label}" in ${SOURCE_NAME[ns] ?? "its source"}, or give the variable a fallback.`;
    }
    items.push({ key: use.key, label, reason: code, fix, source: (known && "source" in known ? known.source : null) ?? (FREE_NAMESPACES.includes(ns) ? "input" : "custom") });
  }
  const present = (k: string) => { const v = i.values[k]; return v !== undefined && v !== null && !(typeof v === "string" && v.trim() === ""); };
  const conditionsWithoutValue = collected.conditionKeys.filter((k) => !present(k));
  return {
    missing: items.sort((a, b) => a.key.localeCompare(b.key)),
    placeholders: res.placeholders,
    conditionsWithoutValue,
    ok: items.length === 0 && res.placeholders.length === 0,
  };
}

/** Resolves a document from a frozen snapshot: what the renderers use for an issued version. Never reads live data. */
export function resolveFromSnapshot(doc: PBDoc, snapshot: VariableSnapshot): ReturnType<typeof resolveDoc> {
  return resolveDoc(doc, { values: snapshot.values, lists: snapshot.lists });
}

/** Keys a snapshot must hold for a document: variables, placeholders and condition keys (item variables of repeats come from the lists). */
export function snapshotKeys(doc: PBDoc): string[] {
  const c = collectVariables(doc);
  return [...new Set([...c.variables.map((v) => v.key), ...c.placeholders.map((p) => p.key), ...c.conditionKeys])].sort();
}
