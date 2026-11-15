/**
 * Organization rules: pure functions, no database. The store (store.ts) and the tests use these.
 * Departments, teams and designations are master data only: CRUD plus a usage count. No permission
 * or business logic lives here; every caller does its own permission check.
 */

export type OrgKind = "department" | "team" | "designation";

export class OrgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgError";
  }
}

/** Collapses whitespace and trims. Returns "" for anything that is not text. */
export function cleanName(value: unknown, max = 80): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** The key two names are compared by: "  Human  RESOURCES " equals "human resources". */
export function nameKey(value: unknown): string {
  return cleanName(value, 200).toLowerCase();
}

export function cleanCode(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) : "";
}

/** Builds a short unique code from a name (HR, FIN, BD...). `taken` holds the codes already used. */
export function makeCode(name: string, taken: Set<string>): string {
  const base = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "DEP";
  let code = base;
  let i = 2;
  while (taken.has(code)) code = `${base}${i++}`;
  return code;
}

export interface NamedRow {
  _id: string;
  name: string;
  /** Narrows uniqueness: a team name is unique inside its department, a designation title inside its department. */
  scope?: string | null;
}

/** The row that already uses `name` (in the same scope), ignoring `ignoreId`. */
export function findDuplicate(rows: NamedRow[], name: string, scope: string | null | undefined, ignoreId?: string): NamedRow | null {
  const key = nameKey(name);
  return rows.find((r) => r._id !== ignoreId && nameKey(r.name) === key && (r.scope ?? null) === (scope ?? null)) ?? null;
}

export interface Usage {
  employees: number;
  people: number;
  designations: number;
  teams: number;
  documents: number;
}

export const EMPTY_USAGE: Usage = { employees: 0, people: 0, designations: 0, teams: 0, documents: 0 };

/** Plain-language reason a row cannot be archived; null when it is free. */
export function usageReason(kind: OrgKind, u: Usage): string | null {
  const parts: string[] = [];
  if (u.employees) parts.push(`${u.employees} employee(s)`);
  if (u.people) parts.push(`${u.people} user(s)`);
  if (u.designations) parts.push(`${u.designations} designation(s)`);
  if (u.teams) parts.push(`${u.teams} team(s)`);
  if (u.documents) parts.push(`${u.documents} document(s)`);
  if (parts.length === 0) return null;
  const noun = kind === "department" ? "department" : kind === "team" ? "team" : "designation";
  return `This ${noun} is in use by ${parts.join(", ")}. Move them first, then archive it.`;
}

// ---------------------------------------------------------------------------
// Mapping: attach a free-text department to a canonical one (used by the migration)
// ---------------------------------------------------------------------------

/** Words that differ between companies for the same department. Both sides are normalised. */
export const DEPARTMENT_ALIASES: Record<string, string> = {
  hr: "human resources",
  "human resource": "human resources",
  "human resources": "human resources",
  it: "information technology",
  "information technology": "information technology",
  fin: "finance",
  accounts: "accounts",
  "accounts and finance": "finance",
  "customer service": "customer support",
  ops: "operations",
  mgmt: "management",
  qa: "quality assurance",
};

export function canonicalDepartmentKey(name: string): string {
  const k = nameKey(name).replace(/&/g, "and");
  return DEPARTMENT_ALIASES[k] ?? k;
}

export interface MatchResult<T> {
  match: T | null;
  how: "exact" | "alias" | "none";
}

/** Finds the canonical department for a free-text name: exact (case-insensitive) first, then by alias. */
export function matchByName<T extends { name: string }>(rows: T[], name: string): MatchResult<T> {
  const key = nameKey(name);
  if (!key) return { match: null, how: "none" };
  const exact = rows.find((r) => nameKey(r.name) === key);
  if (exact) return { match: exact, how: "exact" };
  const canon = canonicalDepartmentKey(name);
  const alias = rows.find((r) => canonicalDepartmentKey(r.name) === canon);
  return alias ? { match: alias, how: "alias" } : { match: null, how: "none" };
}

// ---------------------------------------------------------------------------
// Picker contract (what OrgPicker renders; kept pure so it can be tested)
// ---------------------------------------------------------------------------

export interface OrgOption {
  value: string;
  label: string;
  /** Department id for teams and designations, so pickers can filter. */
  departmentId?: string | null;
  hint?: string | null;
}

export function toOptions(kind: OrgKind, rows: { _id: string; name?: string; title?: string; code?: string; departmentId?: string | null }[]): OrgOption[] {
  return rows
    .map((r) => ({
      value: r._id,
      label: (kind === "designation" ? r.title : r.name) ?? "",
      departmentId: kind === "department" ? null : (r.departmentId ?? null),
      hint: kind === "department" ? (r.code ?? null) : null,
    }))
    .filter((o) => o.label)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function filterByDepartment(options: OrgOption[], departmentId: string | null | undefined): OrgOption[] {
  return departmentId ? options.filter((o) => o.departmentId === departmentId) : options;
}
