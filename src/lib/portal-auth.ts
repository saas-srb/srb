import { passwordPolicyError } from "@/lib/security/password";
import "server-only";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongodb";
import { verifyPassword, hashPassword } from "@/lib/lms-auth";
import { isPortalRole, type PortalRole } from "@/lib/portal-roles";
import { platformRootDomain } from "@/lib/platform/tenancy/provisioning";

/**
 * External User Portal authentication. A completely separate identity store
 * (`external_users`) and session store (`portal_sessions`) from every internal
 * product — external people never touch `admin_users`. Mirrors the shape of
 * `src/lib/prms-auth.ts`.
 */

export const PORTAL_SESSION_COOKIE = "portal_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h default (no "remember me")
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d with "remember me"
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface ExternalUserDoc {
  _id: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: PortalRole;
  /** Exactly one of these is set, matching `role`. */
  applicationId?: string | null;
  studentId?: string | null;
  clientId?: string | null;
  displayName: string;
  status: "active" | "suspended";
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
  /** Lead Management link — the first lead created for this account. */
  leadId?: string | null;
  /** Which lead's dashboard the portal currently renders (defaults to leadId). */
  activeLeadId?: string | null;
  /** Wallet & Credits — this account's own shareable referral code, generated lazily on first `/clientos/referrals` visit. */
  referralCode?: string | null;
  /** The referral code (if any) that was live in the visitor's browser when this account was created. */
  referredByCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

interface PortalSessionDoc {
  _id: string;
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface CurrentPortalUser {
  id: string;
  email: string;
  phone: string;
  role: PortalRole;
  displayName: string;
  applicationId: string | null;
  studentId: string | null;
  clientId: string | null;
  leadId: string | null;
  activeLeadId: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

let userIdx = false;
let sessionIdx = false;

export async function externalUsers() {
  const db = await getDb();
  const c = db.collection<ExternalUserDoc>("external_users");
  if (!userIdx) {
    userIdx = true;
    await Promise.all([
      c.createIndex({ email: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ role: 1 }).catch(() => {}),
      c.createIndex({ applicationId: 1 }).catch(() => {}),
      c.createIndex({ studentId: 1 }).catch(() => {}),
      c.createIndex({ clientId: 1 }).catch(() => {}),
      c.createIndex({ referralCode: 1 }, { unique: true, partialFilterExpression: { referralCode: { $type: "string" } } }).catch(() => {}),
    ]);
  }
  return c;
}

async function portalSessions() {
  const db = await getDb();
  const c = db.collection<PortalSessionDoc>("portal_sessions");
  if (!sessionIdx) {
    sessionIdx = true;
    await Promise.all([
      c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {}),
      c.createIndex({ tokenHash: 1 }, { unique: true }).catch(() => {}),
    ]);
  }
  return c;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function toCurrentUser(u: ExternalUserDoc): CurrentPortalUser {
  return {
    id: u._id,
    email: u.email,
    phone: u.phone,
    role: u.role,
    displayName: u.displayName || u.email.split("@")[0],
    applicationId: u.applicationId ?? null,
    studentId: u.studentId ?? null,
    clientId: u.clientId ?? null,
    leadId: u.leadId ?? null,
    activeLeadId: u.activeLeadId ?? u.leadId ?? null,
    mustChangePassword: u.mustChangePassword === true,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

const GENERIC = "Invalid email or password.";

export async function verifyPortalCredentials(
  email: string,
  password: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const users = await externalUsers();
  const user = await users.findOne({ email: email.trim().toLowerCase() });
  if (!user) return { ok: false, error: GENERIC };
  if (user.status === "suspended") return { ok: false, error: "This account has been suspended. Contact your account manager." };
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Too many failed attempts. Try again in a few minutes." };
  }
  if (!verifyPassword(password, user.passwordHash)) {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await users.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: attempts, lockedUntil } });
    return { ok: false, error: GENERIC };
  }
  await users.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } }
  );
  return { ok: true, userId: user._id };
}

export async function createPortalSession(userId: string, remember: boolean): Promise<{ token: string; ttlMs: number }> {
  const token = randomBytes(32).toString("hex");
  const ttlMs = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
  const sessions = await portalSessions();
  await sessions.insertOne({
    _id: randomUUID(),
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return { token, ttlMs };
}

export async function destroyPortalSessionByToken(token: string): Promise<void> {
  const sessions = await portalSessions();
  await sessions.deleteOne({ tokenHash: hashToken(token) });
}

export async function getSessionPortalUser(token: string | undefined | null): Promise<CurrentPortalUser | null> {
  if (!token) return null;
  const sessions = await portalSessions();
  const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const users = await externalUsers();
  const user = await users.findOne({ _id: session.userId });
  if (!user || user.status === "suspended" || !isPortalRole(user.role)) return null;
  return toCurrentUser(user);
}

export async function setPortalSessionCookie(token: string, remember: boolean): Promise<void> {
  const store = await cookies();
  const root = platformRootDomain();
  // Set domain to the root (e.g. .selfrunbusiness.com) so the cookie is readable
  // on both the site host (demo.x.com) and the app host (demo-app.x.com).
  // On localhost every subdomain is a different port — no domain attribute needed.
  const domain = root !== "localhost" ? `.${root}` : undefined;
  store.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(domain ? { domain } : {}),
    // Remember me → persistent 30-day cookie; otherwise a session cookie.
    ...(remember ? { maxAge: REMEMBER_TTL_MS / 1000 } : {}),
  });
}

export async function clearPortalSessionCookie(): Promise<void> {
  const store = await cookies();
  const root = platformRootDomain();
  const domain = root !== "localhost" ? `.${root}` : undefined;
  store.set(PORTAL_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(domain ? { domain } : {}),
    maxAge: 0,
  });
}

export async function getCurrentPortalUser(): Promise<CurrentPortalUser | null> {
  const store = await cookies();
  return getSessionPortalUser(store.get(PORTAL_SESSION_COOKIE)?.value);
}

/** Server-action / route guard. Throws `Unauthorized` / `Forbidden`. */
export async function requirePortalUser(...anyOf: PortalRole[]): Promise<CurrentPortalUser> {
  const user = await getCurrentPortalUser();
  if (!user) throw new Error("Unauthorized");
  if (anyOf.length > 0 && !anyOf.includes(user.role)) throw new Error("Forbidden");
  return user;
}

export async function changeOwnPortalPassword(
  userId: string,
  current: string,
  next: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  { const weak = passwordPolicyError(next); if (weak) return { ok: false, error: weak }; }
  if (next === current) return { ok: false, error: "New password must be different." };
  const users = await externalUsers();
  const user = await users.findOne({ _id: userId });
  if (!user) return { ok: false, error: "Unknown account." };
  if (!verifyPassword(current, user.passwordHash)) return { ok: false, error: "Current password is incorrect." };
  await users.updateOne(
    { _id: userId },
    { $set: { passwordHash: hashPassword(next), mustChangePassword: false, updatedAt: new Date() } }
  );
  return { ok: true };
}
