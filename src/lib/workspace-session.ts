import "server-only";
import { createHash } from "node:crypto";
import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

/**
 * The one company sign-in. A person signs in at `/commandos/login`; that
 * Workspace session (cookie `hub_session`, collection `hub_sessions`, written
 * by `hub-auth.ts`) is accepted by every staff product's own auth module
 * (`hrms-auth.ts`, `pms-auth.ts`, …) — each still applies ITS OWN role rule to
 * the account, so the session opens nothing the roles don't allow.
 *
 * Kept free of other auth imports so every product's auth module can use it.
 */

export const WORKSPACE_SESSION_COOKIE = "hub_session";
export const WORKSPACE_LOGIN_PATH = "/commandos/login";

/** The `admin_users._id` behind a Workspace session token in the CURRENT company, or null. */
export async function workspaceSessionAccountId(token: string | undefined | null): Promise<ObjectId | null> {
  if (!token) return null;
  const session = await (await getDb())
    .collection<{ tokenHash: string; adminId: ObjectId; expiresAt: Date }>("hub_sessions")
    .findOne({ tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: { $gt: new Date() } }, { projection: { adminId: 1 } });
  return session?.adminId ?? null;
}

/**
 * A path on this site that is safe to send someone to after sign-in, or null.
 * Only same-origin absolute paths: no scheme, no `//host`, no backslashes or
 * control characters, and never the sign-in page itself.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  const path = next.trim();
  if (path.length === 0 || path.length > 500) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(path) || path.includes("://")) return null;
  if (path === WORKSPACE_LOGIN_PATH || path.startsWith(`${WORKSPACE_LOGIN_PATH}?`) || path.startsWith(`${WORKSPACE_LOGIN_PATH}/`)) return null;
  return path;
}

/** The sign-in URL that returns to `next` afterwards (when `next` is safe). */
export function workspaceLoginUrl(next?: string | null): string {
  const safe = safeNextPath(next);
  return safe ? `${WORKSPACE_LOGIN_PATH}?next=${encodeURIComponent(safe)}` : WORKSPACE_LOGIN_PATH;
}
