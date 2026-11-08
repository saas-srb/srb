/**
 * AI Intelligence (AI Data Analyst) role model. Like every other product, access
 * is gated on the shared `admin_users.roles` array — there is no separate
 * user store. Opening the product needs an explicit `intelligence_*` role (or
 * super_admin).
 *
 * IMPORTANT: this decides only WHO MAY OPEN THE PRODUCT. What data a question
 * may touch is decided per business entity, from the roles of each product the
 * data belongs to (`lib/databrain-ai/catalog/access.ts`, built on
 * `lib/platform/access.ts`) — an Intelligence role grants no data by itself.
 *
 * Pure file (no server-only imports) so the Workspace catalogs can use it.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const INTELLIGENCE_ROLES = ["super_admin", "intelligence_admin", "intelligence_user"] as const;
export type IntelligenceRole = (typeof INTELLIGENCE_ROLES)[number];

export const INTELLIGENCE_ROLE_META: Record<IntelligenceRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Opens DataBrain and can ask about every part of the company's data.",
  },
  intelligence_admin: {
    label: "DataBrain Admin",
    description: "Opens DataBrain. Answers still only use data this person may already see in the other products.",
  },
  intelligence_user: {
    label: "DataBrain User",
    description: "Ask business questions in plain language. Answers only use data this person may already see in the other products.",
  },
};

export const INTELLIGENCE_PERMISSIONS = ["USE"] as const;
export type IntelligencePermission = (typeof INTELLIGENCE_PERMISSIONS)[number];

/** Key under which the Director stores an override — matches `permission-catalog.ts`. */
export const INTELLIGENCE_PERMISSION_KEY: Record<IntelligencePermission, string> = {
  USE: "intelligence.canUse",
};

export const INTELLIGENCE_PERMISSION_META: Record<IntelligencePermission, { label: string; description: string }> = {
  USE: { label: "Use DataBrain", description: "Open the product and ask questions. Which records an answer may use is decided by the person's access in the other products, not by this." },
};

export function isIntelligenceRole(value: unknown): value is IntelligenceRole {
  return typeof value === "string" && (INTELLIGENCE_ROLES as readonly string[]).includes(value);
}

export function normalizeIntelligenceRoles(value: unknown): IntelligenceRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isIntelligenceRole)));
}

/** Can open the AI Intelligence product at `/databrain-ai/*`. */
export function hasIntelligenceAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeIntelligenceRoles(roles).length > 0;
}

/** The single permission check every page, action and route uses. Director overrides are honoured (a denial removes the product). */
export function intelligenceCan(user: RoleContext, permission: IntelligencePermission): boolean {
  return resolvePermission(user, INTELLIGENCE_PERMISSION_KEY[permission], () => hasIntelligenceAccess(user.roles));
}

export function primaryIntelligenceRoleLabel(roles: readonly string[]): string {
  if (roles.includes("super_admin")) return INTELLIGENCE_ROLE_META.super_admin.label;
  const eff = normalizeIntelligenceRoles(roles);
  for (const r of ["intelligence_admin", "intelligence_user"] as const) if (eff.includes(r)) return INTELLIGENCE_ROLE_META[r].label;
  return "No Access";
}
