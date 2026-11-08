import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { isEmailVerified } from "@/lib/platform/email-verification-rule";
import { forgetEmailLapse } from "@/lib/platform/email-lapse";

export { isEmailVerified, showVerifyStrip, verifyStripHiddenOn } from "@/lib/platform/email-verification-rule";

/**
 * Email verification of a Workspace user. Sign-up is never blocked on it: a new
 * owner starts with `admin_users.emailVerified: false` and the Workspace shows a
 * "Verify email" strip until the link in the verification email is used.
 *
 * A MISSING `emailVerified` field means verified — everyone who signed up before
 * this existed, and anyone created by invitation, admin or seeder.
 *
 * Tokens live in the company-scoped `email_verifications` collection (so one only
 * resolves on its own company's host), are stored as sha256 only, single-use, 24h.
 */

const COLLECTION = "email_verifications";
const TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_SENDS_PER_HOUR = 3;

interface Verification {
  _id: string;
  tokenHash: string;
  userId: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let indexed = false;
async function col() {
  const c = (await getDb()).collection<Verification>(COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([
      c.createIndex({ tokenHash: 1 }, { unique: true }),
      c.createIndex({ userId: 1, createdAt: 1 }),
      c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]).catch(() => {});
  }
  return c;
}

export type SendVerificationResult = { ok: true; email: string } | { ok: false; error: string };

/** `origin` = the current request's origin, i.e. the company's own host. Never throws. */
export async function sendVerificationEmail(userId: string, origin: string): Promise<SendVerificationResult> {
  try {
    if (!ObjectId.isValid(userId)) return { ok: false, error: "Unknown account." };
    const user = await (await getDb()).collection("admin_users").findOne({ _id: new ObjectId(userId) }, { projection: { email: 1, name: 1, emailVerified: 1 } });
    if (!user) return { ok: false, error: "Unknown account." };
    if (isEmailVerified(user)) return { ok: false, error: "Your email is already verified." };

    const c = await col();
    const recent = await c.countDocuments({ userId, createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) } });
    if (recent >= MAX_SENDS_PER_HOUR) return { ok: false, error: "We've already sent several verification emails. Please try again in an hour." };

    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const id = randomUUID();
    await c.insertOne({ _id: id, tokenHash: sha256(token), userId, email: user.email, createdAt: now, expiresAt: new Date(now.getTime() + TTL_MS), usedAt: null });

    const company = await getCompany(await currentCompanyId());
    const brand = company?.name ?? "your workspace";
    const { html, text } = renderEmail({
      brand,
      heading: "Verify your email address",
      paragraphs: [`Hi${user.name ? ` ${user.name}` : ""},`, `Confirm that ${user.email} is your email address for ${brand}.`],
      action: { label: "Verify email", url: `${origin}/commandos/verify-email?token=${token}` },
      footnote: "This link expires in 24 hours. If you didn't create this account, ignore this email.",
    });
    const sent = await sendEmail({ to: user.email, subject: `Verify your email for ${brand}`, html, text, event: "auth_verify_email" });
    if (!sent.ok) {
      await c.deleteOne({ _id: id });
      return { ok: false, error: "We couldn't send the email right now. Please try again in a few minutes." };
    }
    return { ok: true, email: user.email };
  } catch (err) {
    console.error("[email-verification] send failed", err);
    return { ok: false, error: "We couldn't send the email right now. Please try again in a few minutes." };
  }
}

/** Read-only (a bare GET must never consume): who the link is for, if it is still valid. */
export async function describeVerification(token: string): Promise<{ email: string } | null> {
  const doc = await (await col()).findOne({ tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } }, { projection: { email: 1 } });
  return doc ? { email: doc.email } : null;
}

/** Single-use. Marks only the token's own user (and only while their email is still the one the link was sent to). */
export async function consumeVerification(token: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const doc = await (await col()).findOneAndUpdate({ tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
  if (!doc) return { ok: false, error: "This link has expired or was already used." };
  const now = new Date();
  await (await getDb()).collection("admin_users").updateOne({ _id: new ObjectId(doc.userId), email: doc.email }, { $set: { emailVerified: true, emailVerifiedAt: now } });
  forgetEmailLapse(); // a company on hold is released at once
  return { ok: true, email: doc.email };
}
