import "server-only";
import { cache } from "react";
import { getCurrentSmmsUser } from "@/lib/smms-auth";
import { smmsCan, type SmmsPermission } from "@/lib/smms-roles";
import type { RoleContext } from "@/lib/permission-overrides";

export interface SmmsViewer {
  userId: string;
  email: string;
  roles: string[];
  /** Pass to `smmsCan`. */
  ctx: RoleContext;
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<SmmsViewer | null> => {
  const user = await getCurrentSmmsUser();
  if (!user) return null;
  return { userId: user.id, email: user.email, roles: user.roles, ctx: { roles: user.roles, permissionOverrides: user.permissionOverrides } };
});

export function can(viewer: SmmsViewer, permission: SmmsPermission): boolean {
  return smmsCan(viewer.ctx, permission);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<SmmsViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

export class ForbiddenError extends Error {
  constructor(public permission?: SmmsPermission) {
    super("Forbidden");
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}

/** A user-facing validation failure: its message is safe to show as-is. */
export class SmmsInputError extends Error {}
