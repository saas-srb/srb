import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompanyBrand } from "@/lib/platform/branding";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { transportSecret } from "@/lib/security/transport-ip";

/**
 * Six-digit codes sent by email, for two-step sign-in. A code lasts ten minutes, works once, and is stored only as a keyed hash. At most five
 * wrong tries per code, one new code every 30 seconds and five an hour per person and purpose, so the mailbox can't be used to flood
 * someone and a code can't be guessed. The purposes are kept apart: a sign-in code can't turn the feature on or off.
 */
export type OtpPurpose = "login" | "enable" | "disable" | "payment";

interface OtpDoc {
  _id: string;
  adminId: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  sentAt: Date;
  /** When each code of the last hour was sent. */
  sends: Date[];
}

const TTL_MS = 10 * 60_000;
const COOLDOWN_MS = 30_000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_TRIES = 5;

let indexed = false;
async function col() {
  const c = (await getDb()).collection<OtpDoc>("email_otps");
  if (!indexed) {
    indexed = true;
    await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 }).catch(() => {});
  }
  return c;
}

const idOf = (adminId: ObjectId | string, purpose: OtpPurpose) => `${String(adminId)}:${purpose}`;

async function hashOf(adminId: ObjectId | string, purpose: OtpPurpose, code: string): Promise<string> {
  const key = transportSecret() ?? Buffer.from("selfrun-email-otp");
  return createHmac("sha256", key).update(`email-otp|${await currentCompanyId()}|${String(adminId)}|${purpose}|${code}`).digest("hex");
}

/** `jane.doe@acme.com` → `j***@acme.com` */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "your email";
  return `${name.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(name.length - 1, 6)))}@${domain}`;
}

const COPY: Record<OtpPurpose, { subject: string; heading: string; lead: string }> = {
  login: { subject: "Your sign-in code", heading: "Your sign-in code", lead: "Use this code to finish signing in." },
  enable: { subject: "Confirm two-step sign-in by email", heading: "Turn on email codes", lead: "Use this code to turn on two-step sign-in by email." },
  disable: { subject: "Confirm turning off two-step sign-in", heading: "Turn off email codes", lead: "Use this code to turn off two-step sign-in." },
  payment: { subject: "Confirm a payment", heading: "Confirm a payment", lead: "Someone, hopefully you, is about to send money from your workspace. Use this code to confirm it." },
};

export type SendCodeResult = { ok: true; hint: string } | { ok: false; error: string; waitSeconds?: number };

/** Emails a fresh code to the account's own address. Never throws. */
export async function sendEmailCode(adminId: ObjectId, email: string, purpose: OtpPurpose): Promise<SendCodeResult> {
  try {
    const c = await col();
    const now = new Date();
    const id = idOf(adminId, purpose);
    const doc = await c.findOne({ _id: id });
    if (doc) {
      const wait = COOLDOWN_MS - (now.getTime() - doc.sentAt.getTime());
      if (wait > 0) return { ok: false, error: `A code was just sent. You can ask for another in ${Math.ceil(wait / 1000)} seconds.`, waitSeconds: Math.ceil(wait / 1000) };
      const recent = doc.sends.filter((d) => now.getTime() - d.getTime() < 3_600_000);
      if (recent.length >= MAX_SENDS_PER_HOUR) return { ok: false, error: "Too many codes were requested. Please try again in an hour." };
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const sends = [...(doc?.sends ?? []).filter((d) => now.getTime() - d.getTime() < 3_600_000), now];
    await c.replaceOne({ _id: id }, { adminId: String(adminId), purpose, codeHash: await hashOf(adminId, purpose, code), expiresAt: new Date(now.getTime() + TTL_MS), attempts: 0, sentAt: now, sends }, { upsert: true });

    const brand = await getCompanyBrand().catch(() => null);
    const name = brand?.name?.trim() || "Your workspace";
    const copy = COPY[purpose];
    const { html, text } = renderEmail({
      brand: name,
      heading: copy.heading,
      paragraphs: [copy.lead, `Your code: ${code}`, "It works once and expires in 10 minutes."],
      footnote: "If this wasn't you, someone may know your password. Change it, and do not share this code with anyone.",
    });
    const sent = await sendEmail({ to: email, subject: `${copy.subject} — ${name}`, html, text, event: "auth_email_otp" });
    if (!sent.ok) {
      await c.deleteOne({ _id: id });
      return { ok: false, error: "We couldn't send the email right now. Please try again in a moment." };
    }
    return { ok: true, hint: maskEmail(email) };
  } catch (err) {
    console.error("[email-otp] send failed", err);
    return { ok: false, error: "We couldn't send the email right now. Please try again in a moment." };
  }
}

/** Whether `code` is the live code for this person and purpose. A right code is used up; a wrong one counts against the five tries. */
export async function checkEmailCode(adminId: ObjectId, purpose: OtpPurpose, code: string): Promise<boolean> {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length !== 6) return false;
  const c = await col();
  const id = idOf(adminId, purpose);
  const doc = await c.findOne({ _id: id });
  if (!doc || doc.expiresAt.getTime() < Date.now() || doc.attempts >= MAX_TRIES) return false;
  const want = Buffer.from(doc.codeHash);
  const got = Buffer.from(await hashOf(adminId, purpose, digits));
  if (want.length === got.length && timingSafeEqual(want, got)) {
    // Only the first request that presents the right code wins.
    const r = await c.deleteOne({ _id: id, codeHash: doc.codeHash });
    return r.deletedCount === 1;
  }
  await c.updateOne({ _id: id }, { $inc: { attempts: 1 } });
  return false;
}
