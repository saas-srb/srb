import "server-only";
import { cache } from "react";
import { getCurrentOtsUser } from "@/lib/ots-auth";
import { otsCan, isOtsStaff, type OtsPermission } from "@/lib/ots-roles";
import type { RoleContext } from "@/lib/permission-overrides";
import { staffCandidateRefs } from "@/lib/products/evaliq/people";
import type { CandidateRef } from "@/lib/products/evaliq/constants";

export interface OtsViewer {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  /** Pass to `otsCan`. */
  ctx: RoleContext;
  employeeId: string | null;
  /** Every candidate identity this login takes tests as (employee / staff user / TMS student). */
  candidates: CandidateRef[];
  isStaff: boolean;
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<OtsViewer | null> => {
  const user = await getCurrentOtsUser();
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  const who = await staffCandidateRefs({ id: user.id, email: user.email, employeeId: user.employeeId, studentId: user.studentId });
  return {
    userId: user.id,
    email: user.email,
    name: who.name,
    roles: user.roles,
    ctx,
    employeeId: who.employeeId,
    candidates: who.refs,
    isStaff: isOtsStaff(ctx),
  };
});

export function can(viewer: OtsViewer, permission: OtsPermission): boolean {
  return otsCan(viewer.ctx, permission);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<OtsViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

export class ForbiddenError extends Error {
  constructor(public permission?: OtsPermission) {
    super("Forbidden");
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}

/** A user-facing validation failure: its message is safe to show as-is. */
export class OtsInputError extends Error {}
