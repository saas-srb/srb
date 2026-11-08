import { canSignIn } from "@/lib/security/account-status";
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { hashPassword } from "@/lib/security/password";
import { passwordPolicyError } from "@/lib/security/password";
import { destroySessionsEverywhere } from "@/lib/cross-module-sso";
import { recordLoginEvent } from "@/lib/security/store";

/**
 * Self-service account recovery for a company's workspace accounts. A person who forgot their password asks for a link; the link works once,
 * for 30 minutes, and sets a new password. Nothing in the answer says whether the email has an account (so it cannot be used to find out),
 * a person can have only a few links pending, the token is stored only as a hash, and a successful reset ends every sign-in of the account and
 * clears any lock-out. An account with two-step sign-in keeps it: the reset gives a new password, not a way round the second step.
 */
const COLLECTION = "password_resets";
const TTL_MS = 30 * 60_000;
const MAX_PENDING = 3;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
let indexed = false;

async function resets() {
  const c = (await getDb()).collection<{ _id: string; adminId: unknown; tokenHash: string; email: string; createdAt: Date; expiresAt: Date; usedAt: Date | null }>(COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 }), c.createIndex({ tokenHash: 1 }, { unique: true })]).catch(() => {});
  }
  return c;
}

/** Sends the link if there is an active account for this email. Always succeeds from the caller's side. */
export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return;
  const db = await getDb();
  const user = await db.collection("admin_users").findOne({ email }, { projection: { _id: 1, email: 1, name: 1, active: 1, status: 1, disabled: 1, roles: 1, platformRoleId: 1 } });
  // Someone who is suspended, deactivated or has left the company gets no reset link (they could not sign in with it anyway).
  if (!user || user.active === false || user.disabled === true || !canSignIn(user as { status?: string; roles?: string[]; platformRoleId?: string })) return;
  const col = await resets();
  const now = new Date();
  if ((await col.countDocuments({ adminId: user._id, usedAt: null, expiresAt: { $gt: now } })) >= MAX_PENDING) return;
  const token = randomBytes(32).toString("base64url");
  await col.insertOne({ _id: crypto.randomUUID(), adminId: user._id, tokenHash: sha256(token), email, createdAt: now, expiresAt: new Date(now.getTime() + TTL_MS), usedAt: null });
  const companyId = await currentCompanyId();
  const [company, origin] = await Promise.all([getCompany(companyId), appUrlForCompany(companyId)]);
  const name = company?.name ?? "your company";
  const { html, text } = renderEmail({
    brand: name,
    heading: "Reset your password",
    paragraphs: [`Hi${typeof user.name === "string" && user.name ? ` ${user.name}` : ""},`, `Someone asked to reset the password of your ${name} account. Use the button to choose a new one. If it was not you, ignore this email: your password stays as it is.`],
    action: { label: "Choose a new password", url: `${origin}/commandos/reset-password?token=${token}` },
    footnote: "This link works once and expires in 30 minutes.",
  });
  await sendEmail({ to: email, subject: `Reset your ${name} password`, html, text, event: "auth_password_reset" }).catch(() => {});
}

export type ResetResult = { ok: true } | { ok: false; error: string };

/** Whether this token can still be used (so the page can say so before asking for a password). */
export async function resetTokenValid(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return false;
  return !!(await (await resets()).findOne({ tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } }));
}

export async function resetPasswordWithToken(token: string, next: string): Promise<ResetResult> {
  const bad = { ok: false as const, error: "This link has expired or was already used. Ask for a new one." };
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return bad;
  const col = await resets();
  const doc = await col.findOne({ tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } });
  if (!doc) return bad;
  const weak = passwordPolicyError(next, { email: doc.email });
  if (weak) return { ok: false, error: weak };
  // Claim the token first: two simultaneous uses cannot both win.
  const claimed = await col.updateOne({ _id: doc._id, usedAt: null }, { $set: { usedAt: new Date() } });
  if (claimed.modifiedCount !== 1) return bad;
  const db = await getDb();
  const adminId = doc.adminId as import("mongodb").ObjectId;
  await db.collection("admin_users").updateOne({ _id: adminId }, { $set: { passwordHash: hashPassword(next), mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null } });
  // Any other link still pending for this account is void, and every sign-in ends.
  await col.updateMany({ adminId: doc.adminId, usedAt: null }, { $set: { usedAt: new Date() } });
  await destroySessionsEverywhere(adminId).catch(() => {});
  await recordLoginEvent({ type: "password_reset", email: doc.email, adminId: String(adminId) }).catch(() => {});
  return { ok: true };
}
