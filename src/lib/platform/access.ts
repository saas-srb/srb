import "server-only";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { enabledModules } from "@/lib/platform/onboarding/state";
import type { EventArea } from "@/lib/platform/events/catalog";
import { hasLmsAccess, lmsCan } from "@/lib/lms-roles";
import { hasPmsStaffRole, normalizePmsRoles } from "@/lib/pms-roles";
import { canViewAllEmployees } from "@/lib/hrms-roles";
import { canViewCommercialFinance, hasFmsAccess } from "@/lib/fms-roles";

/**
 * Which cross-product areas a person may see company-wide data for — the one
 * rule behind the company KPIs, global search, recent activity and the AI
 * assistant. An area is visible only when its product is in the company's plan,
 * switched on, AND the person's roles give them company-wide access there
 * (the same tier each product uses for its own "see everything" views; people
 * with narrower access use the product itself, which scopes to their own work).
 */

export interface AccessUser {
  id: string;
  email: string;
  roles: readonly string[];
  /** The Director's per-user capability overrides, where a product's "see everything" rule honours them. */
  permissionOverrides?: Record<string, boolean> | null;
}

/** The cross-product data areas (the `intelligence` event area is an audit trail, not data). */
export type Area = Exclude<EventArea, "intelligence">;

const AREA_MODULE: Record<Area, string> = { leads: "lms", clients: "pms", projects: "pms", tasks: "pms", invoices: "fms", employees: "hrms", leave: "hrms" };

function roleAllows(area: Area, user: Pick<AccessUser, "roles" | "permissionOverrides">): boolean {
  const roles = user.roles;
  if (roles.includes("super_admin")) return true;
  switch (area) {
    case "leads":
      return hasLmsAccess(roles) && lmsCan({ roles, permissionOverrides: user.permissionOverrides }, "VIEW_LEADS");
    case "clients":
    case "projects":
    case "tasks":
      return hasPmsStaffRole(normalizePmsRoles([...roles]));
    case "invoices":
      // Customer invoices are the CashFlow "commercial finance" tier: a payroll-only accountant, or someone the Director removed it from, gets none.
      return hasFmsAccess(roles) && canViewCommercialFinance({ roles, permissionOverrides: user.permissionOverrides });
    case "employees":
    case "leave":
      return canViewAllEmployees({ roles, permissionOverrides: user.permissionOverrides });
  }
}

export async function accessibleAreas(user: Pick<AccessUser, "roles" | "permissionOverrides">): Promise<Set<Area>> {
  const [entitlements, enabled] = await Promise.all([getEntitlements(), enabledModules()]);
  const out = new Set<Area>();
  for (const area of Object.keys(AREA_MODULE) as Area[]) {
    const moduleKey = AREA_MODULE[area];
    if (entitlements.modules !== null && !entitlements.modules.has(moduleKey)) continue;
    if (enabled && !enabled.has(moduleKey)) continue;
    if (roleAllows(area, user)) out.add(area);
  }
  return out;
}
