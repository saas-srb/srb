import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { microByKey } from "@/lib/access/micro";
import { peopleScopeFor, type PeopleFeature, type PeopleScope } from "@/lib/access/scope";
import type { Level } from "@/lib/access/types";

/**
 * SprintOS access from the person's micro features. Pure (no server-only imports): pages, actions, routes, loaders, the menu and Ask AI use one rule.
 * Scopes: the person's own work (projects they manage or belong to), their team (the staff tier's view of those projects) and everyone's (`all`).
 */
export type PmsHolder = { subject: AccessSubject };

const PRODUCT = "sprintos";

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "clients.manage". An unknown key is never allowed. */
export function pmsCan(holder: PmsHolder | null | undefined, key: string, level?: Level): boolean {
  if (!holder) return false;
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  return Boolean(m) && accessCan(holder.subject, PRODUCT, full, level ?? m!.level);
}

const scoped = (own: string, team: string | undefined, all: string): PeopleFeature => ({ product: PRODUCT, own: `${PRODUCT}.${own}`, ...(team ? { team: `${PRODUCT}.${team}` } : {}), all: `${PRODUCT}.${all}` });
const SCOPED = {
  projects: scoped("projects.view", undefined, "projects.all"),
  dashboard: scoped("dashboard.view", "dashboard.team", "dashboard.all"),
} satisfies Record<string, PeopleFeature>;

/** The widest scope the person holds: "all" (every project), "team"/"own" (the projects they manage or belong to), "none". */
export function pmsScope(holder: PmsHolder | null | undefined, module: keyof typeof SCOPED): PeopleScope {
  return holder ? peopleScopeFor(holder.subject, SCOPED[module]) : "none";
}

/** Does the person see every project (not only their own)? */
export const pmsSeesAll = (holder: PmsHolder | null | undefined): boolean => pmsScope(holder, "projects") === "all";

/** May the person read the SprintOS activity log? (The Ask AI activity entity asks the same feature.) */
export const canViewActivity = (holder: PmsHolder | null | undefined): boolean => pmsCan(holder, "activity.view");
