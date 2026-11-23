import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { microByKey } from "@/lib/access/micro";
import { peopleScopeFor, type PeopleFeature, type PeopleScope } from "@/lib/access/scope";
import type { Level } from "@/lib/access/types";

/**
 * CohortAI access from the person's micro features. Pure (no server-only imports): pages, actions, routes, loaders, the menu and Ask AI use one rule.
 * Most modules have two scopes: the person's OWN (a student's program, batch, assignments, certificates, payments) and EVERYONE'S (the staff tier).
 */
export type TmsHolder = { subject: AccessSubject };

const PRODUCT = "cohort-ai";

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "certificates.manage". An unknown key is never allowed. */
export function tmsCan(holder: TmsHolder | null | undefined, key: string, level?: Level): boolean {
  if (!holder) return false;
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  return Boolean(m) && accessCan(holder.subject, PRODUCT, full, level ?? m!.level);
}

const scoped = (mod: string): PeopleFeature => ({ product: PRODUCT, own: `${PRODUCT}.${mod}.view`, all: `${PRODUCT}.${mod}.all` });
export type TmsModule = "dashboard" | "programs" | "batches" | "classes" | "assignments" | "projects" | "certificates" | "payments" | "students";

/** The widest scope the person holds in a module: "all" (everyone's records), "own" (only their own), "none". */
export function tmsScope(holder: TmsHolder | null | undefined, module: TmsModule): PeopleScope {
  return holder ? peopleScopeFor(holder.subject, scoped(module)) : "none";
}

/** Does the person see everyone's records in this module (the staff tier), rather than only their own? */
export const tmsSeesAll = (holder: TmsHolder | null | undefined, module: TmsModule): boolean => tmsScope(holder, module) === "all";

/** May the person open this student's record (certificate, invoice, assignment ...)? Their own, or anyone's with the module's everyone's scope. */
export function tmsMayOpen(holder: TmsHolder | null | undefined, module: TmsModule, ownerStudentId: string | null | undefined, myStudentId: string | null | undefined): boolean {
  const scope = tmsScope(holder, module);
  return scope === "all" || (scope === "own" && Boolean(ownerStudentId) && ownerStudentId === myStudentId);
}

/** May the person read the CohortAI audit log? (The Ask AI audit-log entity asks the same feature.) */
export const canViewAudit = (holder: TmsHolder | null | undefined): boolean => tmsCan(holder, "audit.view");
