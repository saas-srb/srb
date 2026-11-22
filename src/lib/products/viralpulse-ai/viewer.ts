import "server-only";
import { cache } from "react";
import { getCurrentSmmsUser } from "@/lib/smms-auth";
import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { loadAccessSubject } from "@/lib/access/server";
import { microByKey } from "@/lib/access/micro";
import type { Level } from "@/lib/access/types";
import type { RoleContext } from "@/lib/permission-overrides";

const PRODUCT = "viralpulse-ai";

export interface SmmsViewer {
  userId: string;
  email: string;
  roles: string[];
  ctx: RoleContext;
  /** The person's access (micro features of ViralPulse). Every check goes through `can(viewer, "<module>.<feature>")`. */
  subject: AccessSubject;
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<SmmsViewer | null> => {
  const user = await getCurrentSmmsUser();
  if (!user) return null;
  const subject = (await loadAccessSubject(user.id)) ?? { isDirector: false, access: {} };
  return { userId: user.id, email: user.email, roles: user.roles, ctx: { roles: user.roles, permissionOverrides: user.permissionOverrides }, subject };
});

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "posts.publish". An unknown key is never allowed (the coverage test also fails on it). */
export function can(viewer: Pick<SmmsViewer, "subject">, key: string, level?: Level): boolean {
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  if (!m) return false;
  return accessCan(viewer.subject, PRODUCT, full, level ?? m.level);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<SmmsViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

export class ForbiddenError extends Error {
  constructor(public permission?: string) {
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
