import "server-only";
import { cache } from "react";
import { ObjectId } from "mongodb";
import { getAibotsUserForAccount, getCurrentAibotsUser } from "@/lib/aibots-auth";
import { aibotsCan, isAibotsManagerTier, type AibotsPermission } from "@/lib/aibots-roles";
import type { RoleContext } from "@/lib/permission-overrides";

export interface AibotsViewer {
  userId: string;
  email: string;
  roles: string[];
  /** Pass to `aibotsCan`. */
  ctx: RoleContext;
  /** Oversight tier — dashboard numbers span everyone, not only this user. */
  seesAll: boolean;
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<AibotsViewer | null> => {
  const user = await getCurrentAibotsUser();
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  return { userId: user.id, email: user.email, roles: user.roles, ctx, seesAll: isAibotsManagerTier(ctx) };
});

/**
 * The viewer for a user id, read fresh from the account (null when the id is malformed, the account is gone, or its access was revoked).
 * For callbacks that arrive without the person's session cookie (a phone-leg callback from Twilio) and must re-check what they may do NOW.
 */
export async function viewerForUserId(userId: string): Promise<AibotsViewer | null> {
  if (typeof userId !== "string" || !ObjectId.isValid(userId)) return null;
  const user = await getAibotsUserForAccount(new ObjectId(userId));
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  return { userId: user.id, email: user.email, roles: user.roles, ctx, seesAll: isAibotsManagerTier(ctx) };
}

export function can(viewer: AibotsViewer, permission: AibotsPermission): boolean {
  return aibotsCan(viewer.ctx, permission);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<AibotsViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

export class ForbiddenError extends Error {
  constructor(public permission?: AibotsPermission) {
    super("Forbidden");
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}

/** A user-facing validation failure: its message is safe to show as-is. */
export class AibotsInputError extends Error {}
