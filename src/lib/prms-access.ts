import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { microByKey } from "@/lib/access/micro";
import { peopleScopeFor, type PeopleFeature, type PeopleScope } from "@/lib/access/scope";
import type { Level } from "@/lib/access/types";

/**
 * SpendIQ access from the person's micro features. Pure (no server-only imports): pages, actions, routes, loaders, the menu and Ask AI use one rule.
 * Scopes for requisitions and expenses: the person's OWN, or EVERYONE'S (the staff tier). Procurement and finance records are staff records.
 */
export type PrmsHolder = { subject: AccessSubject };

const PRODUCT = "spendiq";

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "vendors.manage". An unknown key is never allowed. */
export function prmsCan(holder: PrmsHolder | null | undefined, key: string, level?: Level): boolean {
  if (!holder) return false;
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  return Boolean(m) && accessCan(holder.subject, PRODUCT, full, level ?? m!.level);
}

const scoped = (own: string, all: string): PeopleFeature => ({ product: PRODUCT, own: `${PRODUCT}.${own}`, all: `${PRODUCT}.${all}` });
const SCOPED = {
  requisitions: scoped("requisitions.view", "requisitions.all"),
  expenses: scoped("expenses.view", "expenses.all"),
  dashboard: scoped("dashboard.view", "dashboard.all"),
} satisfies Record<string, PeopleFeature>;

/** The widest scope the person holds in a module: "all" (everyone's records), "own" (only what they raised), "none". */
export function prmsScope(holder: PrmsHolder | null | undefined, module: keyof typeof SCOPED): PeopleScope {
  return holder ? peopleScopeFor(holder.subject, SCOPED[module]) : "none";
}

/** May the person open this record? Their own, or any when they hold the module's everyone's scope. */
export function prmsMayOpen(holder: PrmsHolder | null | undefined, module: "requisitions" | "expenses", ownerUserId: string | null | undefined, userId: string): boolean {
  const scope = prmsScope(holder, module);
  return scope === "all" || (scope === "own" && Boolean(ownerUserId) && ownerUserId === userId);
}

/** May the person change this record? Their own (they hold the module's submit feature) or anyone's (they hold its manage feature). */
export function prmsMayChange(holder: PrmsHolder | null | undefined, module: "requisitions" | "expenses", ownerUserId: string | null | undefined, userId: string): boolean {
  return (Boolean(ownerUserId) && ownerUserId === userId && prmsCan(holder, `${module}.submit`)) || prmsCan(holder, `${module}.manage`);
}

/** May the person read the SpendIQ audit log? (The Ask AI audit-log entity asks the same feature.) */
export const canViewAudit = (holder: PrmsHolder | null | undefined): boolean => prmsCan(holder, "audit.view");
