import { makeCode, matchByName, nameKey } from "./rules";

/**
 * Pure planner for the department unification migration (no database): decides, for each copy of a
 * department, whether to LINK it to a canonical department or to CREATE the canonical one first.
 * Nothing is ever deleted or renamed by the plan.
 */

export interface OrgDept { _id: string; name: string; code: string }
export interface SopDept { _id: string; name: string; code: string; hrmsDepartmentId: string | null }

export type PlanAction =
  | { kind: "link"; sopId: string; sopName: string; orgId: string; orgName: string; how: "exact" | "alias" }
  | { kind: "create-and-link"; sopId: string; sopName: string; name: string; code: string }
  | { kind: "skip-linked"; sopId: string; orgId: string }
  /** Another copy already took that department: left untouched for a person to merge (two SOP rows cannot link to one department). */
  | { kind: "conflict"; sopId: string; sopName: string; orgId: string; orgName: string };

export function planSopDepartments(org: OrgDept[], sop: SopDept[]): PlanAction[] {
  const actions: PlanAction[] = [];
  const takenOrgIds = new Set(sop.map((s) => s.hrmsDepartmentId).filter((x): x is string => !!x));
  const takenCodes = new Set(org.map((o) => o.code));
  const createdNames = new Map<string, string>(); // name key -> planned code, so two copies of one name make ONE department
  for (const s of sop) {
    if (s.hrmsDepartmentId) {
      actions.push({ kind: "skip-linked", sopId: s._id, orgId: s.hrmsDepartmentId });
      continue;
    }
    const free = org.filter((o) => !takenOrgIds.has(o._id));
    const { match, how } = matchByName(free, s.name);
    if (match && how !== "none") {
      takenOrgIds.add(match._id);
      actions.push({ kind: "link", sopId: s._id, sopName: s.name, orgId: match._id, orgName: match.name, how: how as "exact" | "alias" });
      continue;
    }
    const taken = matchByName(org, s.name);
    if (taken.match) {
      actions.push({ kind: "conflict", sopId: s._id, sopName: s.name, orgId: taken.match._id, orgName: taken.match.name });
      continue;
    }
    const key = nameKey(s.name);
    const code = createdNames.get(key) ?? makeCode(s.code || s.name, takenCodes);
    takenCodes.add(code);
    createdNames.set(key, code);
    actions.push({ kind: "create-and-link", sopId: s._id, sopName: s.name, name: s.name, code });
  }
  return actions;
}

export interface TextTarget { collection: string; textField: string; idField: string }

/** Collections that still hold a department as free text; the migration adds the id beside it (text is kept). */
export const TEXT_TARGETS: TextTarget[] = [
  { collection: "fms_cash_accounts", textField: "department", idField: "departmentId" },
];

export interface TextPlan { distinct: { text: string; count: number; orgId: string | null; orgName: string | null; how: string }[]; unmatched: string[] }

export function planTextValues(org: OrgDept[], values: { text: string; count: number }[]): TextPlan {
  const distinct = values.map((v) => {
    const { match, how } = matchByName(org, v.text);
    return { text: v.text, count: v.count, orgId: match?._id ?? null, orgName: match?.name ?? null, how };
  });
  return { distinct, unmatched: distinct.filter((d) => !d.orgId).map((d) => d.text) };
}
