import "server-only";
import { cache } from "react";
import { getCurrentCmsUser } from "@/lib/cms-auth";
import { cmsCan, type CmsPermission } from "@/lib/cms-roles";
import type { RoleContext } from "@/lib/permission-overrides";

export interface CmsViewer {
  userId: string;
  email: string;
  roles: string[];
  overrides: Record<string, boolean>;
  /** Pass to `cmsCan`. */
  ctx: RoleContext;
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<CmsViewer | null> => {
  const user = await getCurrentCmsUser();
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  return {
    userId: user.id,
    email: user.email,
    roles: user.roles,
    overrides: user.permissionOverrides,
    ctx,
  };
});

export function can(viewer: CmsViewer, permission: CmsPermission): boolean {
  return cmsCan(viewer.ctx, permission);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<CmsViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

/** Throws `Forbidden` unless the viewer holds the permission. */
export function assertCan(viewer: CmsViewer, permission: CmsPermission): void {
  if (!cmsCan(viewer.ctx, permission)) throw new ForbiddenError(permission);
}

export class ForbiddenError extends Error {
  constructor(public permission: CmsPermission) {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

/** Expected, user-facing validation failure inside a mutation — the message is shown to the user as-is. */
export class CmsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsInputError";
  }
}

type Fail = { ok: false; error: string };
type Ok<T extends object> = { ok: true } & T;
const SESSION_EXPIRED: Fail = { ok: false, error: "Your session has expired — please sign in again." };

/**
 * Every CMS mutation runs through this: resolves the viewer from the session
 * cookie (never from arguments), re-checks the specific permission, and
 * returns `{ ok:false, error }` for expected failures so the client can show
 * the message — mirrors `run()` in `src/app/rankmax-ai/(protected)/actions.ts`.
 */
export async function runCmsAction<T extends object>(
  permission: CmsPermission | CmsPermission[],
  fn: (v: CmsViewer) => Promise<T>
): Promise<Ok<T> | Fail> {
  let v: CmsViewer;
  try {
    v = await requireViewer();
  } catch {
    return SESSION_EXPIRED;
  }
  const perms = Array.isArray(permission) ? permission : [permission];
  if (!perms.some((p) => can(v, p))) return { ok: false, error: "You don't have permission to do that." };
  try {
    const out = await fn(v);
    return { ok: true, ...out };
  } catch (err) {
    if (err instanceof CmsInputError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "You don't have permission to do that." };
    console.error("[cms action]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
