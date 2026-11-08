import { blockedMessage, canSignIn, statusOf } from "@/lib/security/account-status";
import { passwordPolicyError } from "@/lib/security/password";
import { accountWithinSeats } from "@/lib/platform/billing/enforce";
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { WORKSPACE_SESSION_COOKIE } from "@/lib/workspace-session";
import { verifyPassword, hashPassword, passwordNeedsRehash } from "@/lib/lms-auth";
import { recordLoginEvent } from "@/lib/security/store";
import { touchLoginSession } from "@/lib/security/touch";

/**
 * Workspace authentication — THE company sign-in (`/commandos/login`) for
 * every `admin_users` account. Its session (`hub_sessions`) is also accepted
 * by every staff product's auth module (see `workspace-session.ts`), so there
 * is one sign-in for the whole company.
 *
 * `verifyHubCredentials` has NO role restriction — any account with valid
 * credentials can sign in here, same permissiveness as `lms-auth.ts`. Hub
 * itself has no role vocabulary; it exists to show each account whichever
 * OTHER products its real roles already grant (see `cross-module-sso.ts`).
 */

export const HUB_SESSION_COOKIE = WORKSPACE_SESSION_COOKIE;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface HubUserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  roles?: string[];
  permissionOverrides?: Record<string, boolean>;
  mustChangePassword?: boolean;
  emailVerified?: boolean;
  /** Account status (see security/account-status.ts); absent on older accounts. */
  status?: string;
  platformRoleId?: string | null;
  /** Set once the person has turned on two-step sign-in (see security/two-factor.ts). */
  twoFactor?: { secret: { c: string; iv: string; t: string }; enabledAt: Date; lastStep: number; recovery: string[] } | null;
  /** Two-step sign-in by a code sent to the account's own email (the person's choice; see `security/two-factor.ts`). */
  twoFactorEmail?: { enabledAt: Date } | null;
}

interface HubSessionDoc {
  _id: ObjectId;
  tokenHash: string;
  adminId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export interface CurrentHubUser {
  id: string;
  email: string;
  /** Raw `admin_users.roles` — Hub has no role vocabulary of its own; this is
   * used only to decide which OTHER products' dashboard tiles to show. */
  roles: string[];
  /** The Director's per-user capability overrides (`permission-overrides.ts`). */
  permissionOverrides?: Record<string, boolean>;
  mustChangePassword: boolean;
  /** false only for a new sign-up that hasn't verified its email; a missing field counts as verified. */
  emailVerified?: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

let userIndexEnsured = false;
let sessionIndexEnsured = false;

async function getHubUsersCollection() {
  const db = await getDb();
  const collection = db.collection<HubUserDoc>("admin_users");
  if (!userIndexEnsured) {
    userIndexEnsured = true;
    await collection.createIndex({ email: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

async function getHubSessionsCollection() {
  const db = await getDb();
  const collection = db.collection<HubSessionDoc>("hub_sessions");
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

export async function verifyHubCredentials(
  email: string,
  password: string,
  code?: string,
  opts: { resend?: boolean } = {}
): Promise<{ ok: true; adminId: ObjectId } | { ok: false; error: string; needsCode?: boolean; method?: "app" | "email"; hint?: string; info?: string }> {
  const users = await getHubUsersCollection();
  const normalizedEmail = email.trim().toLowerCase();
  const user = await users.findOne({ email: normalizedEmail });

  // Same generic error for every failure mode so the login form never reveals
  // which accounts exist.
  const GENERIC = "Invalid email or password.";

  if (!user) {
    await recordLoginEvent({ type: "login_failed", email: normalizedEmail, reason: "unknown_account" });
    return { ok: false, error: GENERIC };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordLoginEvent({ type: "login_locked", email: normalizedEmail, adminId: user._id.toString(), reason: "locked" });
    return { ok: false, error: "Too many failed attempts. Try again in a few minutes." };
  }

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordLoginEvent({ type: "login_failed", email: normalizedEmail, adminId: user._id.toString(), reason: "wrong_password" });
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await users.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: attempts, lockedUntil } });
    return { ok: false, error: GENERIC };
  }

  // Status: someone who is suspended, deactivated or has left the company never signs in, however right the password is (and no code is emailed).
  if (!canSignIn(user)) {
    await recordLoginEvent({ type: "login_failed", email: normalizedEmail, adminId: user._id.toString(), reason: `account_${statusOf(user)}` });
    return { ok: false, error: blockedMessage(statusOf(user)) };
  }

  // Two-step sign-in by email: the password was right, so a code goes to the account's own address (never before: the mailbox can't be
  // flooded by someone who doesn't know the password). It is asked for next, and checked here without counting the asking as a failure.
  if (user.twoFactorEmail && !user.twoFactor) {
    const { sendEmailCode, checkEmailCode, maskEmail } = await import("@/lib/security/email-otp");
    const typed = (code ?? "").trim();
    if (!typed || opts.resend) {
      const sent = await sendEmailCode(user._id, user.email, "login");
      if (sent.ok) return { ok: false, error: "", needsCode: true, method: "email", hint: sent.hint, info: `We sent a 6-digit code to ${sent.hint}. It works for 10 minutes.` };
      // Asked again too soon: the code already sent is still the one to use.
      if (sent.waitSeconds) return { ok: false, error: "", needsCode: true, method: "email", hint: maskEmail(user.email), info: `A code was sent to ${maskEmail(user.email)} a moment ago. Check your inbox (and spam). You can ask for another in ${sent.waitSeconds} seconds.` };
      return { ok: false, error: sent.error };
    }
    if (!(await checkEmailCode(user._id, "login", typed))) {
      await recordLoginEvent({ type: "login_failed", email: normalizedEmail, adminId: user._id.toString(), reason: "wrong_second_step" });
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
      await users.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: attempts, lockedUntil } });
      return { ok: false, error: "That code isn't right or has expired. Ask for a new one.", needsCode: true, method: "email", hint: maskEmail(user.email) };
    }
  }

  // Two-step sign-in: the password was right, so ask for the second step (without counting it as a failure) and check it.
  if (user.twoFactor) {
    if (!code || !code.trim()) return { ok: false, error: "Enter the 6-digit code from your authenticator app, or a recovery code.", needsCode: true, method: "app" };
    const { verifySecondStep } = await import("@/lib/security/two-factor");
    if (!(await verifySecondStep(user as never, code))) {
      await recordLoginEvent({ type: "login_failed", email: normalizedEmail, adminId: user._id.toString(), reason: "wrong_second_step" });
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
      await users.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: attempts, lockedUntil } });
      return { ok: false, error: "That code isn't right. Try the next one in your app, or use a recovery code.", needsCode: true, method: "app" };
    }
  }

  if (!(await accountWithinSeats(user))) {
    await recordLoginEvent({ type: "login_failed", email: normalizedEmail, adminId: user._id.toString(), reason: "over_seat_limit" });
    return { ok: false, error: "Your company's plan has fewer user seats than accounts, and this account isn't one of them. Ask your admin to upgrade the plan." };
  }

  // No role check — Hub accepts any valid admin_users login, mirroring LMS.
  await users.updateOne(
    { _id: user._id },
    // A password hashed at an older, cheaper cost is hashed again at today's now that we know it is right.
    { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), ...(passwordNeedsRehash(user.passwordHash) ? { passwordHash: hashPassword(password) } : {}) } }
  );
  return { ok: true, adminId: user._id };
}

export async function createHubSession(adminId: ObjectId): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const sessions = await getHubSessionsCollection();
  await sessions.insertOne({
    _id: new ObjectId(),
    tokenHash: hashToken(token),
    adminId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function destroyHubSessionByToken(token: string): Promise<void> {
  const sessions = await getHubSessionsCollection();
  await sessions.deleteOne({ tokenHash: hashToken(token) });
}

export async function getSessionHubUser(token: string | undefined | null): Promise<CurrentHubUser | null> {
  if (!token) return null;
  const sessions = await getHubSessionsCollection();
  const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;

  const users = await getHubUsersCollection();
  const user = await users.findOne({ _id: session.adminId });
  if (!user || !(await accountWithinSeats(user))) return null;

  return {
    id: user._id.toString(),
    email: user.email,
    roles: user.roles ?? [],
    permissionOverrides: user.permissionOverrides ?? {},
    mustChangePassword: user.mustChangePassword === true,
    emailVerified: user.emailVerified !== false,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function setHubSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(HUB_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearHubSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(HUB_SESSION_COOKIE);
}

export async function getCurrentHubUser(): Promise<CurrentHubUser | null> {
  const store = await cookies();
  const token = store.get(HUB_SESSION_COOKIE)?.value;
  const user = await getSessionHubUser(token);
  if (user) await touchLoginSession();
  return user;
}

/**
 * Changes the signed-in user's own password and clears `mustChangePassword`.
 * Minimum length matches every other module's bootstrap script.
 */
export async function changeOwnHubPassword(
  userId: string,
  current: string,
  next: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  { const weak = passwordPolicyError(next); if (weak) return { ok: false, error: weak }; }
  if (next === current) return { ok: false, error: "New password must be different from the current one." };
  if (!ObjectId.isValid(userId)) return { ok: false, error: "Unknown account." };

  const users = await getHubUsersCollection();
  const user = await users.findOne({ _id: new ObjectId(userId) });
  if (!user) return { ok: false, error: "Unknown account." };
  if (!verifyPassword(current, user.passwordHash)) return { ok: false, error: "Current password is incorrect." };

  await users.updateOne(
    { _id: user._id },
    { $set: { passwordHash: hashPassword(next), mustChangePassword: false } }
  );
  return { ok: true };
}
