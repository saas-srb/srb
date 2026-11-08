import "server-only";
import { accessibleAreas } from "@/lib/platform/access";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { enabledModules } from "@/lib/platform/onboarding/state";
import { canManageExpenses, canManageFinance, canManageProcurement } from "@/lib/prms-roles";
import { canReviewTimesheets, canViewAllProjects, hasPmsStaffRole, normalizePmsRoles } from "@/lib/pms-roles";
import type { AccessGrant, EntityDef, IntelArea } from "@/lib/products/databrain-ai/catalog/types";

/**
 * Who may read which entity. Nothing here invents a rule: every area is the
 * company-wide tier an existing product already uses.
 *  - leads, clients, projects, tasks, invoices, employees, leave: `accessibleAreas()`
 *    (platform/access.ts) — plan + enabled product + role tier; the same rule behind the
 *    Staff Hub KPIs, global search and the "Ask about your business" box. People whose
 *    product role is the self-service tier (employee portals) get nothing company-wide.
 *  - PMS is tighter than the Ask box: the PMS product scopes its project list to the projects a person manages or is a
 *    member of unless they hold `canViewAllProjects` (pms_admin, Director, or an override), so projects, project
 *    members and tasks need that same tier. Timesheets need `canReviewTimesheets` (the product's review page shows all).
 *    Clients stay at the staff tier: the PMS client list shows every client to every staff role.
 *  - procurement (vendors, purchase orders): PRMS `canManageProcurement` or `canManageFinance`.
 *  - expenses: PRMS `canManageExpenses` (admin, procurement manager, finance). Department
 *    managers only see their own department's expenses in PRMS, so they get none here.
 * Both PRMS rules honour the Director's permission overrides, and the PRMS product must be in the plan and enabled.
 */

export interface IntelAccessUser {
  roles: readonly string[];
  permissionOverrides?: Record<string, boolean> | null;
}

export async function intelAreas(user: IntelAccessUser): Promise<Set<IntelArea>> {
  const base = await accessibleAreas(user);
  const out = new Set<IntelArea>(base);
  // Re-derive the PMS areas from the PMS product's own "see everything" rules (accessibleAreas only knows the staff tier).
  const ctx0 = { roles: user.roles, permissionOverrides: user.permissionOverrides ?? null };
  out.delete("projects");
  out.delete("tasks");
  if (base.has("projects") && hasPmsStaffRole(normalizePmsRoles([...user.roles]))) {
    if (canViewAllProjects(ctx0)) {
      out.add("projects");
      out.add("tasks");
    }
    if (canReviewTimesheets(ctx0)) out.add("timesheets");
  }
  const [entitlements, enabled] = await Promise.all([getEntitlements(), enabledModules()]);
  const prmsOn = (entitlements.modules === null || entitlements.modules.has("prms")) && (!enabled || enabled.has("prms"));
  if (prmsOn) {
    const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides ?? null };
    if (canManageProcurement(ctx) || canManageFinance(ctx)) out.add("procurement");
    if (canManageExpenses(ctx)) out.add("expenses");
  }
  return out;
}

/**
 * What the user may see of an entity: null = nothing; "all" = every non-sensitive field;
 * otherwise only the listed fields (union of the grants they hold).
 */
export function grantedFields(def: Pick<EntityDef, "access">, areas: ReadonlySet<IntelArea>): "all" | ReadonlySet<string> | null {
  let any = false;
  const subset = new Set<string>();
  for (const g of def.access as readonly AccessGrant[]) {
    if (!areas.has(g.area)) continue;
    if (!g.fields) return "all";
    any = true;
    for (const f of g.fields) subset.add(f);
  }
  return any ? subset : null;
}
