import { passwordPolicyError } from "@/lib/security/password";
import { accountWithinSeats } from "@/lib/platform/billing/enforce";
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { WORKSPACE_SESSION_COOKIE, workspaceSessionAccountId } from "@/lib/workspace-session";
import { getDb } from "@/lib/mongodb";
import { verifyPassword, hashPassword } from "@/lib/lms-auth";
import { normalizeSeoRoles, hasSeoAccess } from "@/lib/seo-roles";

/**
 * SEO product authentication. A separate cookie / session store from the LMS,
 * HRMS, PMS, TMS, PRMS and SOP products so sign-in state is independent, but the
 * *identity* store is shared: users live in `admin_users`, and SEO access is
 * gated on the `roles` array there: any account whose roles carry an
 * explicit `seo_*` role (SEO access is never implied by an HRMS role).
 */

export const SEO_SESSION_COOKIE = "seo_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface AdminUserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  roles?: string[];
  permissionOverrides?: Record<string, boolean>;
  employeeId?: string | null;
  mustChangePassword?: boolean;
}

interface SeoSessionDoc {
  _id: ObjectId;
  tokenHash: string;
  adminId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export interface CurrentSeoUser {
  id: string;
  email: string;
  /** Raw `admin_users.roles` — every SEO permission check runs over this (see `seoCan`). */
  roles: string[];
  /** Explicit SEO roles, for display only. */
  seoRoles: ReturnType<typeof normalizeSeoRoles>;
  /** Per-capability overrides from the Director — see `permission-overrides.ts`. */
  permissionOverrides: Record<string, boolean>;
  employeeId: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

let userIndexEnsured = false;
let sessionIndexEnsured = false;

async function getAdminUsersCollection() {
  const db = await getDb();
  const collection = db.collection<AdminUserDoc>("admin_users");
  if (!userIndexEnsured) {
    userIndexEnsured = true;
    await collection.createIndex({ email: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

async function getSeoSessionsCollection() {
  const db = await getDb();
  const collection = db.collection<SeoSessionDoc>("seo_sessions");
  if (!sessionIndexEnsured) {
    sessionIndexEnsured = true;
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
    await collection.createIndex({ tokenHash: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifySeoCredentials(
  email: string,
  password: string
): Promise<{ ok: true; adminId: ObjectId } | { ok: false; error: string }> {
  const users = await getAdminUsersCollection();
  const normalizedEmail = email.trim().toLowerCase();
  const user = await users.findOne({ email: normalizedEmail });

  // Same generic error for every failure mode so the login form never reveals
  // which accounts exist or which have SEO access.
  const GENERIC = "Invalid email or password.";

  if (!user) return { ok: false, error: GENERIC };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Too many failed attempts. Try again in a few minutes." };
  }

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await users.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: attempts, lockedUntil } });
    return { ok: false, error: GENERIC };
  }

  if (!hasSeoAccess(user.roles)) {
    // Correct credentials but no SEO access — do not count as a failed attempt.
    return { ok: false, error: GENERIC };
  }

  await users.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } }
  );
  return { ok: true, adminId: user._id };
}

export async function createSeoSession(adminId: ObjectId): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const sessions = await getSeoSessionsCollection();
  await sessions.insertOne({
    _id: new ObjectId(),
    tokenHash: hashToken(token),
    adminId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function destroySeoSessionByToken(token: string): Promise<void> {
  const sessions = await getSeoSessionsCollection();
  await sessions.deleteOne({ tokenHash: hashToken(token) });
}

export async function getSessionSeoUser(token: string | undefined | null): Promise<CurrentSeoUser | null> {
  if (!token) return null;
  const sessions = await getSeoSessionsCollection();
  const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return getSeoUserForAccount(session.adminId);
}

/**
 * This product's user for an `admin_users` account, under the product's own role
 * rule — shared by the product's session and the Workspace session.
 */
export async function getSeoUserForAccount(adminId: ObjectId): Promise<CurrentSeoUser | null> {
  const users = await getAdminUsersCollection();
  const user = await users.findOne({ _id: adminId });
  if (!user || !(await accountWithinSeats(user))) return null;

  const roles = user.roles ?? [];
  // Access can be revoked mid-session by clearing the roles array.
  if (!hasSeoAccess(roles)) return null;

  return {
    id: user._id.toString(),
    email: user.email,
    roles,
    seoRoles: normalizeSeoRoles(roles),
    permissionOverrides: user.permissionOverrides ?? {},
    employeeId: user.employeeId ?? null,
    mustChangePassword: user.mustChangePassword === true,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function setSeoSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SEO_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSeoSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SEO_SESSION_COOKIE);
}

export async function getCurrentSeoUser(): Promise<CurrentSeoUser | null> {
  const store = await cookies();
  const own = await getSessionSeoUser(store.get(SEO_SESSION_COOKIE)?.value);
  if (own) return own;
  // One company sign-in: the Workspace session of the same account opens this product too (same role rule).
  const accountId = await workspaceSessionAccountId(store.get(WORKSPACE_SESSION_COOKIE)?.value);
  return accountId ? getSeoUserForAccount(accountId) : null;
}

/**
 * Server-action / route guard. Throws `Unauthorized` when there is no SEO
 * session, or `Forbidden` when the session lacks every listed role. Render-time
 * gating on a page is never a security boundary for the mutation endpoint.
 */
export async function requireSeoUser(...anyOf: string[]): Promise<CurrentSeoUser> {
  const user = await getCurrentSeoUser();
  if (!user) throw new Error("Unauthorized");
  if (anyOf.length > 0 && !anyOf.some((r) => user.roles.includes(r))) {
    throw new Error("Forbidden");
  }
  return user;
}

/**
 * Changes the signed-in user's own password and clears `mustChangePassword`.
 * Minimum length matches the bootstrap script.
 */
export async function changeOwnSeoPassword(
  userId: string,
  current: string,
  next: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  { const weak = passwordPolicyError(next); if (weak) return { ok: false, error: weak }; }
  if (next === current) return { ok: false, error: "New password must be different from the current one." };
  if (!ObjectId.isValid(userId)) return { ok: false, error: "Unknown account." };

  const users = await getAdminUsersCollection();
  const user = await users.findOne({ _id: new ObjectId(userId) });
  if (!user) return { ok: false, error: "Unknown account." };
  if (!verifyPassword(current, user.passwordHash)) return { ok: false, error: "Current password is incorrect." };

  await users.updateOne(
    { _id: user._id },
    { $set: { passwordHash: hashPassword(next), mustChangePassword: false } }
  );
  return { ok: true };
}

