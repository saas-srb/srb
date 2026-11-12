import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getConfig } from "@/lib/platform/config/store";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { transportSecret } from "@/lib/security/transport-ip";
import { maskPhone } from "@/lib/security/second-step";

/**
 * Six-digit sign-in codes sent by SMS (Twilio; a company's own account first, then the platform's). A code lasts ten minutes, works once, and is
 * stored only as a keyed hash. One new code per 45 seconds, five an hour per person and purpose, five an hour per phone number (across accounts)
 * and ten a day per person, five wrong tries per code. A provider failure is reported as a failure to SEND, never as a wrong code.
 * India (+91): the DLT entity, template and sender must be configured, or SMS is not usable for those numbers.
 */
export type SmsPurpose = "login" | "enable" | "reauth";

interface OtpDoc {
  _id: string;
  adminId: string;
  purpose: SmsPurpose;
  numberHash: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  sentAt: Date;
  sends: Date[];
}

export const SMS_RULES = { ttlMs: 10 * 60_000, cooldownMs: 45_000, perHour: 5, perNumberPerHour: 5, perDay: 10, maxTries: 5 };

let indexed = false;
async function col() {
  const c = (await getDb()).collection<OtpDoc>("sms_otps");
  if (!indexed) {
    indexed = true;
    await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 }).catch(() => {});
  }
  return c;
}
const key = () => transportSecret() ?? Buffer.from("selfrun-sms-otp");
const hash = async (adminId: ObjectId | string, purpose: SmsPurpose, code: string) => createHmac("sha256", key()).update(`sms-otp|${await currentCompanyId()}|${String(adminId)}|${purpose}|${code}`).digest("hex");
const numberHash = (e164: string) => createHmac("sha256", key()).update(`sms-number|${e164}`).digest("hex");

// ── Provider and DLT ─────────────────────────────────────────────────────────

export interface SmsProvider {
  accountSid: string;
  authToken: string;
  from: string;
  dlt: { entityId: string; templateId: string; senderId: string } | null;
}

export async function smsProvider(): Promise<SmsProvider | null> {
  const v = await connectionValues("twilio").catch(() => null);
  const [from, entityId, templateId, senderId] = await Promise.all([getConfig("TWILIO_SMS_FROM"), getConfig("DLT_ENTITY_ID"), getConfig("DLT_TEMPLATE_ID"), getConfig("DLT_SENDER_ID")]);
  const sender = v?.smsFrom || from || senderId;
  if (!v?.accountSid || !v.authToken || !sender) return null;
  return { accountSid: v.accountSid, authToken: v.authToken, from: sender, dlt: entityId && templateId && senderId ? { entityId, templateId, senderId } : null };
}

/** Pure: may SMS be sent to this number with this configuration? (+91 needs the DLT fields.) */
export function smsSendable(p: SmsProvider | null, e164: string): boolean {
  if (!p) return false;
  return e164.startsWith("+91") ? Boolean(p.dlt) : true;
}

export async function smsConfigured(): Promise<boolean> {
  return (await smsProvider()) !== null;
}

export async function smsUsableFor(e164: string): Promise<boolean> {
  return smsSendable(await smsProvider(), e164);
}

// ── Sending ──────────────────────────────────────────────────────────────────

export type SmsSend = { ok: true; hint: string } | { ok: false; error: string; waitSeconds?: number; /** The provider failed (not the person): nothing is counted. */ providerFailure?: boolean };

async function twilio(p: SmsProvider, to: string, body: string): Promise<boolean> {
  try {
    const form: Record<string, string> = { To: to, From: to.startsWith("+91") && p.dlt ? p.dlt.senderId : p.from, Body: body };
    if (to.startsWith("+91") && p.dlt) {
      form.DltEntityId = p.dlt.entityId;
      form.DltTemplateId = p.dlt.templateId;
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(p.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${p.accountSid}:${p.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Texts a fresh code to `e164`. Never throws. */
export async function sendSmsCode(adminId: ObjectId, e164: string, purpose: SmsPurpose): Promise<SmsSend> {
  try {
    const p = await smsProvider();
    if (!smsSendable(p, e164)) return { ok: false, error: "We couldn't send a text message right now.", providerFailure: true };
    const c = await col();
    const now = new Date();
    const id = `${String(adminId)}:${purpose}`;
    const doc = await c.findOne({ _id: id });
    if (doc) {
      const wait = SMS_RULES.cooldownMs - (now.getTime() - doc.sentAt.getTime());
      if (wait > 0) return { ok: false, error: `A code was just sent. You can ask for another in ${Math.ceil(wait / 1000)} seconds.`, waitSeconds: Math.ceil(wait / 1000) };
      if (doc.sends.filter((d) => now.getTime() - d.getTime() < 3_600_000).length >= SMS_RULES.perHour) return { ok: false, error: "Too many codes were requested. Please try again in an hour." };
    }
    // Daily cap per person and an hourly cap per number (a number can't be used to flood someone through many accounts).
    const all = await c.find({ adminId: String(adminId) }, { projection: { sends: 1 } }).toArray();
    if (all.flatMap((d) => d.sends).filter((d) => now.getTime() - d.getTime() < 86_400_000).length >= SMS_RULES.perDay) return { ok: false, error: "Too many codes were requested today. Please try again tomorrow." };
    const nh = numberHash(e164);
    const byNumber = await c.find({ numberHash: nh }, { projection: { sends: 1 } }).toArray();
    if (byNumber.flatMap((d) => d.sends).filter((d) => now.getTime() - d.getTime() < 3_600_000).length >= SMS_RULES.perNumberPerHour) return { ok: false, error: "Too many codes were sent to this number. Please try again later." };

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const sends = [...(doc?.sends ?? []).filter((d) => now.getTime() - d.getTime() < 86_400_000), now];
    if (!(await twilio(p!, e164, `Your sign-in code is ${code}. It works for 10 minutes. Do not share it with anyone.`))) return { ok: false, error: "We couldn't send a text message right now.", providerFailure: true };
    await c.replaceOne({ _id: id }, { adminId: String(adminId), purpose, numberHash: nh, codeHash: await hash(adminId, purpose, code), expiresAt: new Date(now.getTime() + SMS_RULES.ttlMs), attempts: 0, sentAt: now, sends }, { upsert: true });
    return { ok: true, hint: maskPhone(e164) };
  } catch {
    return { ok: false, error: "We couldn't send a text message right now.", providerFailure: true };
  }
}

/** Is `code` the live code for this person and purpose? A right code is used up; a wrong one counts against five tries. */
export async function checkSmsCode(adminId: ObjectId, purpose: SmsPurpose, code: string): Promise<boolean> {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length !== 6) return false;
  const c = await col();
  const id = `${String(adminId)}:${purpose}`;
  const doc = await c.findOne({ _id: id });
  if (!doc || doc.expiresAt.getTime() < Date.now() || doc.attempts >= SMS_RULES.maxTries) return false;
  const want = Buffer.from(doc.codeHash);
  const got = Buffer.from(await hash(adminId, purpose, digits));
  if (want.length === got.length && timingSafeEqual(want, got)) return (await c.deleteOne({ _id: id, codeHash: doc.codeHash })).deletedCount === 1;
  await c.updateOne({ _id: id }, { $inc: { attempts: 1 } });
  return false;
}
