import "server-only";
import { cache } from "react";
import { ObjectId } from "mongodb";
import { getAibotsUserForAccount, getCurrentAibotsUser } from "@/lib/aibots-auth";
import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { loadAccessSubject } from "@/lib/access/server";
import { microByKey } from "@/lib/access/micro";
import type { Level } from "@/lib/access/types";
import type { RoleContext } from "@/lib/permission-overrides";

const PRODUCT = "agentos";

/**
 * The old permission names the data layer still passes, translated to micro features in this one place (the person's access decides, not the old roles).
 * New code passes the micro key (`<module>.<feature>`) directly.
 */
export type AibotsPermission = "USE_BOT" | "CREATE_BOT" | "EDIT_BOT" | "DELETE_BOT" | "MANAGE_KB" | "UPLOAD_FILES" | "DELETE_FILES" | "VIEW_CHATS" | "DELETE_CHATS" | "VIEW_AUDIT" | "MANAGE_SETTINGS" | "VOICE_CALL" | "VOICE_CALL_MANAGE" | "VOICE_CALL_TAKEOVER";
export const PERMISSION_FEATURE: Record<AibotsPermission, string> = {
  USE_BOT: "agents.use", CREATE_BOT: "agents.create", EDIT_BOT: "agents.edit", DELETE_BOT: "agents.delete", MANAGE_KB: "knowledge.manage", UPLOAD_FILES: "knowledge.upload", DELETE_FILES: "knowledge.delete",
  VIEW_CHATS: "chats.all", DELETE_CHATS: "chats.delete", VIEW_AUDIT: "activity.view", MANAGE_SETTINGS: "settings.manage", VOICE_CALL: "calls.place", VOICE_CALL_MANAGE: "calls.manage", VOICE_CALL_TAKEOVER: "calls.takeover",
};

export interface AibotsViewer {
  userId: string;
  email: string;
  roles: string[];
  ctx: RoleContext;
  /** The person's access (micro features of AgentOS). */
  subject: AccessSubject;
  /** Oversight: dashboard numbers span everyone, not only this user (holds "Read everyone's chats" or "Edit agents"). */
  seesAll: boolean;
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<AibotsViewer | null> => {
  const user = await getCurrentAibotsUser();
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  const subject = (await loadAccessSubject(user.id)) ?? { isDirector: false, access: {} };
  return { userId: user.id, email: user.email, roles: user.roles, ctx, subject, seesAll: oversees({ subject }) };
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
  const subject = (await loadAccessSubject(user.id)) ?? { isDirector: false, access: {} };
  return { userId: user.id, email: user.email, roles: user.roles, ctx, subject, seesAll: oversees({ subject }) };
}

/** Oversight: the dashboard spans everyone for a person who may read everyone's chats or edit any agent (the same rule the old roles used). */
const oversees = (v: Pick<AibotsViewer, "subject">) => can(v, "chats.all") || can(v, "agents.edit");

/** The one check. `key` is a micro key (`<module>.<feature>`, no product) or one of the old permission names (translated). An unknown key is never allowed. */
export function can(viewer: Pick<AibotsViewer, "subject">, key: string, level?: Level): boolean {
  const short = (PERMISSION_FEATURE as Record<string, string>)[key] ?? key;
  const full = `${PRODUCT}.${short}`;
  const m = microByKey(full);
  if (!m) return false;
  return accessCan(viewer.subject, PRODUCT, full, level ?? m.level);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<AibotsViewer> {
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
export class AibotsInputError extends Error {}
