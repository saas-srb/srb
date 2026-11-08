import "server-only";
import { cache } from "react";
import { getCurrentDlmsUser } from "@/lib/dlms-auth";
import { dlmsCan, isDlmsManagerTier, type DlmsPermission } from "@/lib/dlms-roles";
import type { RoleContext } from "@/lib/permission-overrides";
import { getAccess } from "@/lib/products/cybervault/access";
import type { Scope } from "@/lib/products/cybervault/constants";

export interface DlmsViewer {
  userId: string;
  email: string;
  roles: string[];
  overrides: Record<string, boolean>;
  /** Pass to `dlmsCan`. */
  ctx: RoleContext;
  /** Manager tier and above see every scope; everyone else only what they were assigned. */
  seesAll: boolean;
  companyAccess: boolean;
  clientIds: string[];
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<DlmsViewer | null> => {
  const user = await getCurrentDlmsUser();
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  const seesAll = isDlmsManagerTier(ctx);
  const grant = seesAll ? null : await getAccess(user.id);
  return {
    userId: user.id,
    email: user.email,
    roles: user.roles,
    overrides: user.permissionOverrides,
    ctx,
    seesAll,
    companyAccess: seesAll || Boolean(grant?.companyAccess),
    clientIds: grant?.clientIds ?? [],
  };
});

export function can(viewer: DlmsViewer, permission: DlmsPermission): boolean {
  return dlmsCan(viewer.ctx, permission);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<DlmsViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

export class ForbiddenError extends Error {
  constructor(public permission?: DlmsPermission) {
    super("Forbidden");
  }
}

/** A user-facing validation failure: its message is safe to show as-is. */
export class DlmsInputError extends Error {}

/** May the viewer SEE records in this scope? (Scope only — the caller also checks the VIEW permission.) */
export function canReadScope(viewer: DlmsViewer, scope: Scope, clientId: string | null): boolean {
  if (viewer.seesAll) return true;
  if (scope === "company") return viewer.companyAccess;
  return clientId !== null && viewer.clientIds.includes(clientId);
}

/** May the viewer CHANGE records in this scope? Needs scope access AND the company/client management permission. */
export function canWriteScope(viewer: DlmsViewer, scope: Scope, clientId: string | null): boolean {
  if (!canReadScope(viewer, scope, clientId)) return false;
  return can(viewer, scope === "company" ? "MANAGE_COMPANY" : "MANAGE_CLIENTS");
}

/** Mongo filter restricting a DLMS collection to the scopes the viewer may see. Every list/query goes through this. */
export function scopeFilter(viewer: DlmsViewer): Record<string, unknown> {
  if (!can(viewer, "VIEW")) return { _id: "__none__" };
  if (viewer.seesAll) return {};
  const or: Record<string, unknown>[] = [];
  if (viewer.companyAccess) or.push({ scope: "company" });
  if (viewer.clientIds.length > 0) or.push({ scope: "client", clientId: { $in: viewer.clientIds } });
  return or.length > 0 ? { $or: or } : { _id: "__none__" };
}
