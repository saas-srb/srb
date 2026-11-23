import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { microByKey } from "@/lib/access/micro";
import { peopleScopeFor, type PeopleFeature, type PeopleScope } from "@/lib/access/scope";
import type { Level } from "@/lib/access/types";

/**
 * TalentOS access from the person's micro features. Pure (no server-only imports) so pages, actions, routes, loaders, the menu and Ask AI all use one rule.
 * Every module has the same three scopes: the person's OWN records, their reporting line ("team") and everyone ("all"). `hrScope(holder, "leave")` gives the
 * widest one the person holds; the loaders and actions then filter with `ownOrStaff` / `peopleFilter` from `lib/access/scope.ts`.
 */
export type HrHolder = { subject: AccessSubject };

const PRODUCT = "talentos";

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "leave.approve". An unknown key is never allowed. */
export function hrCan(holder: HrHolder | null | undefined, key: string, level?: Level): boolean {
  if (!holder) return false;
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  return Boolean(m) && accessCan(holder.subject, PRODUCT, full, level ?? m!.level);
}

/** The scope features of each module that has them: [own feature, team feature, all feature]. */
const scoped = (own: string, team: string, all: string): PeopleFeature => ({ product: PRODUCT, own: `${PRODUCT}.${own}`, team: `${PRODUCT}.${team}`, all: `${PRODUCT}.${all}` });
const SCOPED = {
  leave: scoped("leave.view", "leave.team", "leave.all"),
  attendance: scoped("attendance.view", "attendance.team", "attendance.all"),
  requests: scoped("requests.view", "requests.team", "requests.all"),
  employees: scoped("profile.view", "employees.team", "employees.all"),
  dashboard: scoped("dashboard.view", "dashboard.team", "dashboard.all"),
} satisfies Record<string, PeopleFeature>;

/** The widest scope the person holds in a module ("all" > "team" > "own" > "none"). A write in a scope needs the module's write feature too (check `hrCan` for it). */
export function hrScope(holder: HrHolder | null | undefined, module: keyof typeof SCOPED): PeopleScope {
  if (!holder) return "none";
  return peopleScopeFor(holder.subject, SCOPED[module]);
}

/** Does the person hold any scope beyond their own in this module (a manager's team or everyone)? */
export const hrSeesOthers = (holder: HrHolder | null | undefined, module: keyof typeof SCOPED): boolean => {
  const s = hrScope(holder, module);
  return s === "team" || s === "all";
};

/** May the person read the TalentOS audit trail? (The Ask AI activity-log entity asks the same feature.) */
export const canViewAudit = (holder: HrHolder | null | undefined): boolean => hrCan(holder, "audit.view");

/** May the person manage departments, designations and teams? (Managed in CommandOS; the Ask AI master-data tools ask the same feature.) */
export const canManageMasters = (holder: HrHolder | null | undefined): boolean => hrCan(holder, "masters.manage");
