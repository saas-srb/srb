import { blockedMessage, canSignIn, statusOf } from "@/lib/security/account-status";
import { passwordPolicyError } from "@/lib/security/password";
import { accountWithinSeats } from "@/lib/platform/billing/enforce";
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId, type Collection } from "mongodb";
import { breakGlassMatches } from "@/lib/security/break-glass";
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

type HubFail = { ok: false; error: string; needsCode?: boolean; method?: "app" | "email" | "sms" | "recovery"; hint?: string; info?: string; keyUnavailable?: boolean; canEmail?: boolean; alternatives?: { id: "app" | "email" | "sms" | "recovery"; label: string }[]; trustAllowed?: boolean; methods?: { id: "app" | "email" | "sms" | "recovery"; title: string; description: string; status: "available" | "unavailable" | "not_set_up" }[]; nothingUsable?: boolean; supportEmail?: string; resendIn?: number };

/** Staff-only: records that this person's authenticator can't be checked (Console Health item + notification + audit). Never blocks or slows the sign-in. */
async function flagUnreadable(user: HubUserDoc, email: string): Promise<void> {
  try {
    const { currentCompanyId } = await import("@/lib/platform/tenancy/context");
    const { flagTwoStepResetNeeded } = await import("@/lib/platform/two-step-alerts");
    await flagTwoStepResetNeeded({ companyId: await currentCompanyId(), adminId: String(user._id), email });
  } catch {
    /* an alert that can't be recorded must not affect sign-in */
  }
}

export async function sendRecoveryNotice(to: string, via: string): Promise<void> {
  try {
    const { sendEmail } = await import("@/lib/platform/email");
    const { renderEmail } = await import("@/lib/platform/email/template");
    const how = via === "break_glass" ? "the platform's emergency sign-in" : via === "email_code" ? "a code sent to this email" : via === "staff_reset" ? "a reset by the platform team" : "a recovery code";
    const { html, text } = renderEmail({ brand: "Security notice", heading: "Your two-step sign-in was reset", paragraphs: [`Someone signed in using ${how} because your authenticator could not be checked. Two-step is now off until you set it up again, which you will be asked to do at once.`], footnote: "If this wasn't you, change your password now and tell your administrator." });
    await sendEmail({ to, subject: "Your two-step sign-in was reset", html, text, event: "auth_two_step_reset" });
  } catch {
    /* a notice that can't be sent must not block a recovery */
  }
}

export async function verifyHubCredentials(
  email: string,
  password: string,
  code?: string,
  opts: { resend?: boolean; method?: string | null } = {}
): Promise<{ ok: true; adminId: ObjectId } | HubFail> {
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

  // Two-step secret that can't be opened with this deployment's keys (a key mismatch): not the person's mistake, never counted as a failure.
  const twoStepUnreadable = Boolean(user.twoFactor) && !(await (await import("@/lib/security/two-factor")).secondStepReadable(user as never));
  // Emergency path for platform staff only, and only in that situation: this deployment's own SAAS_ADMIN_EMAIL / SAAS_ADMIN_PASSWORD, exactly.
  // (Evaluated only in that rare situation, so normal sign-in does no extra work.)
  const platformStaff = twoStepUnreadable && (Boolean(user.platformRoleId) || ((user.roles ?? []).includes("super_admin") && (await (await import("@/lib/platform/tenancy/context")).isPlatformOwnerContext().catch(() => false))));
  const breakGlass = twoStepUnreadable && platformStaff && breakGlassMatches({ email: normalizedEmail, password, envEmail: process.env.SAAS_ADMIN_EMAIL, envPassword: process.env.SAAS_ADMIN_PASSWORD });
  const valid = verifyPassword(password, user.passwordHash) || breakGlass;
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

  // Second step with every method the account has (authenticator, emailed code, recovery codes): see security/second-step-login.ts.
  {
    const { runSecondStep } = await import("@/lib/security/second-step-login");
    const step = await runSecondStep({ user: user as never, normalizedEmail, code, resend: opts.resend, method: opts.method, breakGlass, flagUnreadable: () => void flagUnreadable(user, normalizedEmail) });
    if (!("proceed" in step)) {
      if (step.countFailure) {
        await recordLoginEvent({ type: "login_failed", email: normalizedEmail, adminId: user._id.toString(), reason: "wrong_second_step" });
        const attempts = (user.failedLoginAttempts ?? 0) + 1;
        const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
        await users.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: attempts, lockedUntil } });
      }
      const { countFailure, ...rest } = step;
      void countFailure;
      return rest;
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
