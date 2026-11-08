import "server-only";
import { hashPassword } from "@/lib/lms-auth";
import { externalUsers } from "@/lib/portal-auth";
import { newId } from "@/lib/products/clientos/db";
import { matchDomainRecord } from "@/lib/products/clientos/identity";
import { recordPortalAudit } from "@/lib/products/clientos/audit";
import { adoptOrphanLeads, restoreAccountFor } from "@/lib/products/clientos/repair";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { PORTAL_ROLE_META } from "@/lib/portal-roles";
import { awardSignupBonus } from "@/lib/wallet/signup-bonus";
import { attributeAndRewardReferral } from "@/lib/wallet/referrals";
import { resolveReferralCode } from "@/lib/wallet/referral-capture";

export interface RegisterInput {
  email: string;
  phone: string;
  password: string;
  referralCode?: string | null;
}

const GENERIC_NO_MATCH =
  "We couldn't match that email and phone to an application, enrolment or client on file. Use the exact email and phone you gave us.";

export async function registerExternalUser(
  input: RegisterInput
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (phone.replace(/\D/g, "").length < 7) return { ok: false, error: "Enter a valid phone number." };
  if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const users = await externalUsers();
  const existing = await users.findOne({ email });
  if (existing) return { ok: false, error: "An account with this email already exists. Try signing in or resetting your password." };

  const match = await matchDomainRecord(email, phone);
  if (!match) return { ok: false, error: GENERIC_NO_MATCH };

  const referralCode = await resolveReferralCode(input.referralCode);
  const now = new Date();
  const _id = newId();
  await users.insertOne({
    _id,
    email,
    phone,
    passwordHash: hashPassword(input.password),
    role: match.role,
    applicationId: match.applicationId ?? null,
    studentId: match.studentId ?? null,
    clientId: match.clientId ?? null,
    displayName: match.displayName || email.split("@")[0],
    status: "active",
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    referralCode: null,
    referredByCode: referralCode,
  });

  // History already on file for this person (a lead whose account was missing) belongs to the new account.
  await adoptOrphanLeads(_id, email).catch((e) => console.error("[portal] adopt leads failed", e));
  await recordPortalAudit({ actorId: _id, action: "register", entity: "account", entityId: _id, summary: `role=${match.role}` });
  try {
    await awardSignupBonus(_id, match.role);
    await attributeAndRewardReferral(referralCode, _id, match.role);
  } catch (walletErr) {
    console.error("Wallet signup/referral reward failed (account still created)", walletErr);
  }
  await notifyPortalUser({
    recipientUserId: _id,
    type: "welcome",
    title: `Welcome to the ${PORTAL_ROLE_META[match.role].portalName}`,
    body: "Your account is ready. Everything here updates live as your status changes.",
    link: "/clientos",
  });

  return { ok: true, userId: _id };
}

/** Forgot-password identity re-check — same bar as registration (email + phone). */
export async function verifyForReset(emailRaw: string, phoneRaw: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  const users = await externalUsers();
  // A lead on file without its account (data brought over from elsewhere): the same email + phone restores it, so reset can finish.
  const user = (await users.findOne({ email })) ?? (await restoreAccountFor(emailRaw, phoneRaw).catch(() => null));
  // Generic message either way so we don't reveal which emails have accounts.
  const GENERIC = "If that email and phone match an account, you can set a new password below.";
  if (!user) return { ok: false, error: GENERIC };
  const { normalizePhone } = await import("@/lib/products/clientos/db");
  if (normalizePhone(user.phone) !== normalizePhone(phoneRaw)) return { ok: false, error: GENERIC };
  return { ok: true, userId: user._id };
}

export async function resetPortalPassword(userId: string, next: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (next.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const users = await externalUsers();
  const res = await users.updateOne(
    { _id: userId },
    { $set: { passwordHash: hashPassword(next), mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() } }
  );
  if (res.matchedCount === 0) return { ok: false, error: "Unknown account." };
  await recordPortalAudit({ actorId: userId, action: "password_reset", entity: "account", entityId: userId });
  return { ok: true };
}
