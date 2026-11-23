import "server-only";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { enabledModules } from "@/lib/platform/onboarding/state";
import type { EventArea } from "@/lib/platform/events/catalog";
import { holdsLegacy, type SubjectHolder } from "@/lib/access/holds";

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

function roleAllows(area: Area, user: SubjectHolder): boolean {
  if (user.roles?.includes("super_admin")) return true;
  switch (area) {
    case "leads":
      return holdsLegacy(user, "dealflow-ai", "lms.VIEW_LEADS");
    case "clients":
    case "projects":
    case "tasks":
      return holdsLegacy(user, "sprintos", "pms.hasPmsStaffRole");
    case "invoices":
      // Customer invoices are the CashFlow "commercial finance" tier: a payroll-only accountant, or someone the Director removed it from, gets none.
      return holdsLegacy(user, "cashflow-ai", "fms.canViewCommercialFinance");
    case "employees":
    case "leave":
      return holdsLegacy(user, "talentos", "hrms.canViewAllEmployees");
  }
}

export async function accessibleAreas(user: Pick<AccessUser, "roles" | "permissionOverrides"> & SubjectHolder): Promise<Set<Area>> {
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
