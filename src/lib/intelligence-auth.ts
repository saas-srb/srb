import { accountWithinSeats } from "@/lib/platform/billing/enforce";
import "server-only";
import { cookies } from "next/headers";
import type { ObjectId } from "mongodb";
import { WORKSPACE_SESSION_COOKIE, workspaceSessionAccountId } from "@/lib/workspace-session";
import { getDb } from "@/lib/mongodb";
import { hasIntelligenceAccess } from "@/lib/intelligence-roles";

/**
 * AI Intelligence authentication. The product has NO sign-in or session store of
 * its own: it accepts the Workspace session (the one company sign-in) of an
 * `admin_users` account and applies the product's own role rule to the account's
 * CURRENT roles on every request (revoking the role closes the product at once).
 */

export interface CurrentIntelligenceUser {
  id: string;
  email: string;
  /** Raw `admin_users.roles` — every data-access check in the catalog runs over this. */
  roles: string[];
  /** Per-capability overrides from the Director — see `permission-overrides.ts`. */
  permissionOverrides: Record<string, boolean>;
  employeeId: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/** This product's user for an `admin_users` account in the current company, under the product's role rule. */
export async function getIntelligenceUserForAccount(adminId: ObjectId): Promise<CurrentIntelligenceUser | null> {
  const user = await (await getDb())
    .collection<{ _id: ObjectId; email: string; roles?: string[]; permissionOverrides?: Record<string, boolean>; employeeId?: string | null; mustChangePassword?: boolean; createdAt: Date; lastLoginAt: Date | null }>("admin_users")
    .findOne({ _id: adminId });
  if (!user || !(await accountWithinSeats(user))) return null;
  const roles = user.roles ?? [];
  if (!hasIntelligenceAccess(roles)) return null;
  return {
    id: user._id.toString(),
    email: user.email,
    roles,
    permissionOverrides: user.permissionOverrides ?? {},
    employeeId: user.employeeId ?? null,
    mustChangePassword: user.mustChangePassword === true,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

export async function getCurrentIntelligenceUser(): Promise<CurrentIntelligenceUser | null> {
  const store = await cookies();
  const accountId = await workspaceSessionAccountId(store.get(WORKSPACE_SESSION_COOKIE)?.value);
  return accountId ? getIntelligenceUserForAccount(accountId) : null;
}
