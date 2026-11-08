import "server-only";
import { cache } from "react";
import { getCurrentSeoUser } from "@/lib/seo-auth";
import { isSeoManagerTier, seoCan, type SeoPermission } from "@/lib/seo-roles";
import type { RoleContext } from "@/lib/permission-overrides";

export interface SeoViewer {
  userId: string;
  email: string;
  roles: string[];
  overrides: Record<string, boolean>;
  /** Pass to `seoCan` / `isSeoManagerTier`. */
  ctx: RoleContext;
  isManagerTier: boolean;
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<SeoViewer | null> => {
  const user = await getCurrentSeoUser();
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  return {
    userId: user.id,
    email: user.email,
    roles: user.roles,
    overrides: user.permissionOverrides,
    ctx,
    isManagerTier: isSeoManagerTier(ctx),
  };
});

export function can(viewer: SeoViewer, permission: SeoPermission): boolean {
  return seoCan(viewer.ctx, permission);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<SeoViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

/** Throws `Forbidden` unless the viewer holds the permission. */
export function assertCan(viewer: SeoViewer, permission: SeoPermission): void {
  if (!seoCan(viewer.ctx, permission)) throw new ForbiddenError(permission);
}

export class ForbiddenError extends Error {
  constructor(public permission: SeoPermission) {
    super("Forbidden");
  }
}

/** A user-facing validation failure: its message is safe to show as-is. */
export class SeoInputError extends Error {}
