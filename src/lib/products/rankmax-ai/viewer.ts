import "server-only";
import { cache } from "react";
import { getCurrentSeoUser } from "@/lib/seo-auth";
import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { loadAccessSubject } from "@/lib/access/server";
import { microByKey } from "@/lib/access/micro";
import type { Level } from "@/lib/access/types";
import type { RoleContext } from "@/lib/permission-overrides";

const PRODUCT = "rankmax-ai";

export interface SeoViewer {
  userId: string;
  email: string;
  roles: string[];
  overrides: Record<string, boolean>;
  ctx: RoleContext;
  /** The person's access (micro features of RankMax). Every check goes through `can(viewer, "<module>.<feature>")`. */
  subject: AccessSubject;
  /** Holds "Work on and assign everyone's tasks". */
  isManagerTier: boolean;
}

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "keywords.manage". An unknown key is never allowed (the coverage test also fails on it). */
export function can(viewer: Pick<SeoViewer, "subject">, key: string, level?: Level): boolean {
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  if (!m) return false;
  return accessCan(viewer.subject, PRODUCT, full, level ?? m.level);
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<SeoViewer | null> => {
  const user = await getCurrentSeoUser();
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  const subject = (await loadAccessSubject(user.id)) ?? { isDirector: false, access: {} };
  return { userId: user.id, email: user.email, roles: user.roles, overrides: user.permissionOverrides, ctx, subject, isManagerTier: can({ subject }, "tasks.all") };
});

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<SeoViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

/** Throws `Forbidden` unless the viewer holds the feature. */
export function assertCan(viewer: Pick<SeoViewer, "subject">, key: string): void {
  if (!can(viewer, key)) throw new ForbiddenError(key);
}

export class ForbiddenError extends Error {
  constructor(public permission: string) {
    super("Forbidden");
  }
}

/** A user-facing validation failure: its message is safe to show as-is. */
export class SeoInputError extends Error {}
