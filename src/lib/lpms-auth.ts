import { passwordPolicyError } from "@/lib/security/password";
import { accountWithinSeats } from "@/lib/platform/billing/enforce";
import "server-only";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { randomBytes, createHash } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { hasLpmsAccess, effectiveLpmsRoles } from "@/lib/lpms-roles";
import { verifyPassword, hashPassword } from "@/lib/lms-auth";
import { workspaceSessionAccountId, WORKSPACE_SESSION_COOKIE } from "@/lib/workspace-session";

export const LPMS_SESSION_COOKIE = "lpms_session";
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

interface LpmsSessionDoc {
  _id: ObjectId;
  tokenHash: string;
  adminId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export interface CurrentLpmsUser {
  id: string;
  email: string;
  roles: string[];
  lpmsRoles: ReturnType<typeof effectiveLpmsRoles>;
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

async function getLpmsSessionsCollection() {
  const db = await getDb();
  const collection = db.collection<LpmsSessionDoc>("lpms_sessions");
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

export async function verifyLpmsCredentials(
  email: string,
  password: string
): Promise<{ ok: true; adminId: ObjectId } | { ok: false; error: string }> {
  const users = await getAdminUsersCollection();
  const normalizedEmail = email.trim().toLowerCase();
  const user = await users.findOne({ email: normalizedEmail });

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

  if (!hasLpmsAccess(user.roles)) {
    return { ok: false, error: GENERIC };
  }

  await users.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } }
  );
  return { ok: true, adminId: user._id };
}

export async function createLpmsSession(adminId: ObjectId): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const sessions = await getLpmsSessionsCollection();
  await sessions.insertOne({
    _id: new ObjectId(),
    tokenHash: hashToken(token),
    adminId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function destroyLpmsSessionByToken(token: string): Promise<void> {
  const sessions = await getLpmsSessionsCollection();
  await sessions.deleteOne({ tokenHash: hashToken(token) });
}

export async function getSessionLpmsUser(token: string | undefined | null): Promise<CurrentLpmsUser | null> {
  if (!token) return null;
  const sessions = await getLpmsSessionsCollection();
  const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return getLpmsUserForAccount(session.adminId);
}

export async function getLpmsUserForAccount(adminId: ObjectId): Promise<CurrentLpmsUser | null> {
  const users = await getAdminUsersCollection();
  const user = await users.findOne({ _id: adminId });
  if (!user || !(await accountWithinSeats(user))) return null;

  const roles = user.roles ?? [];
  if (!hasLpmsAccess(roles)) return null;

  return {
    id: user._id.toString(),
    email: user.email,
    roles,
    lpmsRoles: effectiveLpmsRoles(roles),
    permissionOverrides: user.permissionOverrides ?? {},
    employeeId: user.employeeId ?? null,
    mustChangePassword: user.mustChangePassword === true,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function setLpmsSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(LPMS_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearLpmsSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(LPMS_SESSION_COOKIE);
}

export async function getCurrentLpmsUser(): Promise<CurrentLpmsUser | null> {
  const store = await cookies();
  const own = await getSessionLpmsUser(store.get(LPMS_SESSION_COOKIE)?.value);
  if (own) return own;
  const accountId = await workspaceSessionAccountId(store.get(WORKSPACE_SESSION_COOKIE)?.value);
  return accountId ? getLpmsUserForAccount(accountId) : null;
}

export async function requireLpmsUser(...anyOf: string[]): Promise<CurrentLpmsUser> {
  const user = await getCurrentLpmsUser();
  if (!user) throw new Error("Unauthorized");
  if (anyOf.length > 0 && !anyOf.some((r) => user.roles.includes(r))) {
    throw new Error("Forbidden");
  }
  return user;
}

export async function changeOwnLpmsPassword(
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
