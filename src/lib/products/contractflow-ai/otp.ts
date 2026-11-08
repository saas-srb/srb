import "server-only";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { lpmsCan } from "@/lib/lpms-roles";
import { activeEmailProvider, sendEmail } from "@/lib/platform/email";
import { getSavedConnection } from "@/lib/platform/connections/store";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { cfOtp, cfRequests, cfSettings, cfSigners } from "./cf-db";
import { appendEvent } from "./events";
import type { DltDetails, OtpChannel, OtpDoc, SignerDoc } from "./sign-types";
import type { LpmsViewer } from "./types";

/**
 * One-time codes that prove a signer controls the email address (default) or phone number the request was sent to (B3).
 *
 * EMAIL is the default and needs no registration: it goes out through the company's own email account when it saved one (Workspace >
 * Settings > Integrations: SMTP, Resend or SendGrid), otherwise through the platform's provider (`sendEmail` decides).
 *
 * SMS is optional and goes ONLY through the company's OWN Twilio connection (a platform-wide fallback account is never used for it). It is
 * BLOCKED until a manager records that India DLT registration is complete. What Twilio says (https://www.twilio.com/en-us/guidelines/in/sms,
 * read 2026-11-08, VERIFIED): to send to Indian numbers on the domestic route, the company and the Sender ID must first be registered on the
 * mobile operators' DLT portal; only DLT-registered alphanumeric Sender IDs are supported (operators add a two-letter prefix); provisioning
 * a Sender ID takes about 10 business days; a Sender ID must be used strictly for its approved use case; shortened URLs are not allowed.
 * UNVERIFIED (the Twilio support article 21162166457755 returned HTTP 403 and the guidelines page does not cover them): that the Entity ID
 * and the approved Template ID must be sent with each message, the exact API parameter names for them, and OTP-specific template rules.
 * So this module sends the exact approved template text from the registered Sender ID and does NOT guess parameter names for the IDs; it
 * stores them with the confirmation so the sender can be completed once the owner checks Twilio's account documentation. International
 * (non-DLT) routes exist, but this module does not use them for Indian numbers.
 *
 * Code rules: 6 digits from the system CSPRNG, stored only as a salted SHA-256 hash, valid for OTP_TTL_MINUTES, single use, one active code
 * per signer and purpose (a new code supersedes the old one), at most OTP_MAX_ATTEMPTS wrong tries then a lockout, a cooldown between
 * sends and a daily cap per signer, plus per-address rate limits. Codes and full addresses/numbers are never logged or put in events:
 * events and rows carry masked destinations only. A 6-digit code is guessable in principle (1 in 10^6 per try), so the attempt cap and the
 * lockout, not the hash, are what protect it.
 */

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_DAILY_CAP = 10;
export const OTP_LOCKOUT_MINUTES = 15;
/** How long a successful check stays good for signing. */
export const OTP_VERIFIED_MINUTES = 30;
export const OTP_SEND_PER_IP = 10; // per 10 minutes
export const OTP_CHECK_PER_IP = 30; // per 10 minutes

export const DLT_EXPLANATION =
  "Text-message codes to Indian numbers are switched off until your company's DLT registration is recorded. India's mobile operators require the company, the sender name (header) and every message template to be registered on their DLT portal before Twilio can deliver, and registering a sender name takes about 10 business days. Register, then ask a manager to record the Entity ID, sender ID and approved template here. Email codes work in the meantime.";

export class OtpError extends Error {
  constructor(
    message: string,
    readonly code: "forbidden" | "invalid" | "not_found" | "closed" | "channel_unavailable" | "no_destination" | "cooldown" | "daily_cap" | "locked" | "no_active_code" | "expired" | "wrong_code" | "send_failed" | "rate_limited",
    readonly retryAfterSeconds?: number,
    readonly attemptsLeft?: number,
  ) {
    super(message);
    this.name = "OtpError";
  }
}

// ── Senders (replaceable in tests; the defaults are the real providers) ──────────────────────────────────────────
export interface OtpSenders {
  email(to: string, subject: string, text: string, html: string): Promise<{ ok: boolean }>;
  sms(to: string, text: string, from: string, twilio: Record<string, string>): Promise<{ ok: boolean }>;
  /** Whether an email account can deliver at all (a company account, or a real platform provider). */
  emailConfigured(): Promise<boolean>;
  /** The company's OWN Twilio account, if it saved one; never the platform's fallback. */
  companyTwilio(): Promise<Record<string, string> | null>;
}

const realSenders: OtpSenders = {
  async email(to, subject, text, html) {
    // No `event`: a verification code must not be switchable off in the Notification center.
    const r = await sendEmail({ to, subject, text, html });
    return { ok: r.ok };
  },
  async sms(to, text, from, twilio) {
    const form = new URLSearchParams({ To: to, From: from, Body: text });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok };
  },
  async emailConfigured() {
    for (const k of ["smtp", "resend", "sendgrid"]) if (await getSavedConnection(k).catch(() => null)) return true;
    return (await activeEmailProvider()).id !== "console";
  },
  async companyTwilio() {
    const c = await resolveConnection("twilio");
    return c && c.source === "workspace" && c.values.accountSid && c.values.authToken ? c.values : null;
  },
};
let senders: OtpSenders = realSenders;
/** Tests only. */
export function __setOtpSenders(s: OtpSenders | null) {
  senders = s ?? realSenders;
}

// ── Masking and hashing ───────────────────────────────────────────────────────────────────────────────────────────
export function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? `${domain[0]}***${domain.slice(dot)}` : `${domain[0] ?? ""}***`;
  return `${local.slice(0, 1)}***@${host}`;
}
export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length < 4 ? "***" : `${phone.trim().startsWith("+") ? "+" : ""}${"*".repeat(Math.max(d.length - 2, 2))}${d.slice(-2)}`;
}
const hashCode = (salt: string, signerId: string, code: string) => createHash("sha256").update(`${salt}:${signerId}:${code}`).digest();
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// ── Settings: the India DLT record ────────────────────────────────────────────────────────────────────────────────
const ctx = (v: LpmsViewer) => ({ roles: v.roles, permissionOverrides: v.overrides });
const ID = /^[A-Za-z0-9_-]{4,40}$/;

export async function getDlt(): Promise<DltDetails | null> {
  return (await (await cfSettings()).findOne({ _id: "main" }))?.dlt ?? null;
}

/** A manager records that DLT registration is complete. All four fields are required; the template must carry {code}. */
export async function recordDlt(v: LpmsViewer, input: { entityId: string; senderId: string; templateId: string; templateText: string }, now = new Date()): Promise<DltDetails> {
  if (!lpmsCan(ctx(v), "MANAGE_POLICIES")) throw new OtpError("Only a manager may record the DLT registration.", "forbidden");
  const entityId = String(input.entityId ?? "").trim();
  const senderId = String(input.senderId ?? "").trim();
  const templateId = String(input.templateId ?? "").trim();
  const templateText = String(input.templateText ?? "").trim();
  if (!ID.test(entityId) || !ID.test(templateId)) throw new OtpError("Enter the Entity ID and the approved Template ID exactly as the DLT portal shows them.", "invalid");
  if (!/^[A-Za-z0-9]{3,11}$/.test(senderId)) throw new OtpError("The sender ID is the 3 to 11 letter or digit header registered on the DLT portal.", "invalid");
  if (!templateText.includes("{code}") || templateText.length > 400) throw new OtpError("Enter the approved message text, with {code} where the code goes.", "invalid");
  const dlt: DltDetails = { entityId, senderId, templateId, templateText, confirmed: true, confirmedBy: v.userId, confirmedAt: now };
  await (await cfSettings()).updateOne({ _id: "main" }, { $set: { dlt } }, { upsert: true });
  return dlt;
}

export async function clearDlt(v: LpmsViewer): Promise<void> {
  if (!lpmsCan(ctx(v), "MANAGE_POLICIES")) throw new OtpError("Only a manager may change the DLT registration.", "forbidden");
  await (await cfSettings()).updateOne({ _id: "main" }, { $set: { dlt: null } }, { upsert: true });
}

export interface ChannelState {
  available: boolean;
  /** Plain-language reason when not available. */
  reason: string | null;
}
export async function otpChannels(): Promise<{ email: ChannelState; sms: ChannelState }> {
  const email: ChannelState = (await senders.emailConfigured()) ? { available: true, reason: null } : { available: false, reason: "No email account is set up to send codes. Add one in Workspace > Settings > Integrations." };
  const dlt = await getDlt();
  const twilio = await senders.companyTwilio();
  const sms: ChannelState = !dlt?.confirmed
    ? { available: false, reason: DLT_EXPLANATION }
    : !twilio
      ? { available: false, reason: "Connect your company's own Twilio account in Workspace > Settings > Integrations to send text-message codes." }
      : { available: true, reason: null };
  return { email, sms };
}

// ── Issue and check ──────────────────────────────────────────────────────────────────────────────────────────────
async function loadOpenSigner(signerId: string): Promise<SignerDoc> {
  const signer = typeof signerId === "string" && signerId.length <= 64 ? await (await cfSigners()).findOne({ _id: signerId }) : null;
  if (!signer) throw new OtpError("This signer was not found.", "not_found");
  const request = await (await cfRequests()).findOne({ _id: signer.requestId });
  if (!request || !["sent", "in_progress"].includes(request.status) || signer.tokenRevokedAt || signer.status === "signed" || signer.status === "declined") throw new OtpError("This request is closed.", "closed");
  return signer;
}

const perIp = async (headers: Headers | null, bucket: string, limit: number) => {
  if (!headers) return;
  const r = await rateLimit(new Request("http://signing.invalid/", { headers }), bucket, limit, 600);
  if (!r.ok) throw new OtpError("Too many attempts from this connection. Please wait a few minutes.", "rate_limited", r.retryAfter);
};

/** Sends a code to the signer's own address or number (never to one supplied by the caller). */
export async function sendCode(signerId: string, channel: OtpChannel, headers: Headers | null = null, now = new Date()): Promise<{ destinationMasked: string; expiresAt: Date; resendAfterSeconds: number }> {
  if (channel !== "email" && channel !== "sms") throw new OtpError("Choose email or text message.", "invalid");
  await perIp(headers, "cf-otp-send", OTP_SEND_PER_IP);
  const signer = await loadOpenSigner(signerId);
  const events = { requestId: signer.requestId, signerId: signer._id, actorType: "signer" as const, actorId: signer._id, ip: headers ? clientIp(new Request("http://signing.invalid/", { headers })) : null };
  const refuse = async (err: OtpError, reason: string): Promise<never> => {
    await appendEvent({ ...events, type: "otp_refused", data: { channel, reason } });
    throw err;
  };

  if (signer.otpLockedUntil && signer.otpLockedUntil.getTime() > now.getTime()) {
    return refuse(new OtpError("Too many wrong codes. Please wait before asking for a new one.", "locked", Math.ceil((signer.otpLockedUntil.getTime() - now.getTime()) / 1000)), "locked");
  }
  const states = await otpChannels();
  if (!states[channel].available) return refuse(new OtpError(states[channel].reason ?? "This way of receiving a code is not available.", "channel_unavailable"), "channel_unavailable");
  const destination = channel === "email" ? signer.email : signer.phone;
  if (!destination) return refuse(new OtpError("There is no phone number on this request. Use email instead.", "no_destination"), "no_destination");
  if (channel === "sms" && !/^\+91[\s-]?[6-9]\d{4}[\s-]?\d{5}$/.test(destination.trim())) return refuse(new OtpError("Text-message codes are available for Indian mobile numbers (+91) only. Use email instead.", "no_destination"), "not_indian_mobile");

  const col = await cfOtp();
  const last = await col.find({ signerId: signer._id, purpose: "sign" }).sort({ createdAt: -1 }).limit(1).next();
  if (last) {
    const wait = OTP_COOLDOWN_SECONDS - Math.floor((now.getTime() - last.createdAt.getTime()) / 1000);
    if (wait > 0) return refuse(new OtpError(`A code was just sent. You can ask for another in ${wait} seconds.`, "cooldown", wait), "cooldown");
  }
  const sentToday = await col.countDocuments({ signerId: signer._id, createdAt: { $gt: new Date(now.getTime() - 86_400_000) } });
  if (sentToday >= OTP_DAILY_CAP) return refuse(new OtpError("The limit of codes for today has been reached. Try again tomorrow or ask the sender for help.", "daily_cap"), "daily_cap");

  const code = newCode();
  const salt = randomBytes(16).toString("hex");
  const destinationMasked = channel === "email" ? maskEmail(destination) : maskPhone(destination);
  const doc: OtpDoc = {
    _id: randomUUID(),
    signerId: signer._id,
    requestId: signer.requestId,
    purpose: "sign",
    channel,
    salt,
    codeHash: hashCode(salt, signer._id, code).toString("hex"),
    destinationMasked,
    status: "active",
    attempts: 0,
    maxAttempts: OTP_MAX_ATTEMPTS,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
    usedAt: null,
    deleteAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000 + 86_400_000),
  };
  // One active code per signer and purpose: the new one replaces any older one before it can be used.
  await col.updateMany({ signerId: signer._id, purpose: "sign", status: "active" }, { $set: { status: "superseded" } });
  await col.insertOne(doc);

  let ok = false;
  try {
    if (channel === "email") {
      const text = `Your verification code is ${code}.\n\nIt works for ${OTP_TTL_MINUTES} minutes and only once. If you did not expect this, you can ignore this email; nobody can sign without the code.`;
      ok = (await senders.email(destination, "Your verification code", text, `<p>Your verification code is <strong style="font-size:1.4em;letter-spacing:.15em">${code}</strong>.</p><p>It works for ${OTP_TTL_MINUTES} minutes and only once. If you did not expect this, you can ignore this email; nobody can sign without the code.</p>`)).ok;
    } else {
      const dlt = (await getDlt())!;
      const twilio = (await senders.companyTwilio())!;
      ok = (await senders.sms(`+91${destination.replace(/\D/g, "").slice(-10)}`, dlt.templateText.replace("{code}", code), dlt.senderId, twilio)).ok;
    }
  } catch {
    ok = false;
  }
  if (!ok) {
    await col.updateOne({ _id: doc._id }, { $set: { status: "superseded" } });
    await appendEvent({ ...events, type: "otp_refused", data: { channel, reason: "send_failed", destination: destinationMasked } });
    throw new OtpError("We could not send the code just now. Please try again in a minute.", "send_failed");
  }
  await appendEvent({ ...events, type: "otp_sent", data: { channel, destination: destinationMasked } });
  return { destinationMasked, expiresAt: doc.expiresAt, resendAfterSeconds: OTP_COOLDOWN_SECONDS };
}

/** Checks a code. Success marks the signer verified; the code can never be used again. */
export async function checkCode(signerId: string, code: unknown, headers: Headers | null = null, now = new Date()): Promise<{ verifiedUntil: Date }> {
  await perIp(headers, "cf-otp-check", OTP_CHECK_PER_IP);
  const signer = await loadOpenSigner(signerId);
  const events = { requestId: signer.requestId, signerId: signer._id, actorType: "signer" as const, actorId: signer._id };
  if (signer.otpLockedUntil && signer.otpLockedUntil.getTime() > now.getTime()) throw new OtpError("Too many wrong codes. Please wait before trying again.", "locked", Math.ceil((signer.otpLockedUntil.getTime() - now.getTime()) / 1000));
  const entered = typeof code === "string" ? code.replace(/\s/g, "") : "";
  const col = await cfOtp();
  const active = await col.findOne({ signerId: signer._id, purpose: "sign", status: "active" });
  if (!active) throw new OtpError("There is no code waiting. Ask for a new one.", "no_active_code");
  if (active.expiresAt.getTime() <= now.getTime()) {
    await col.updateOne({ _id: active._id, status: "active" }, { $set: { status: "expired" } });
    throw new OtpError("That code has expired. Ask for a new one.", "expired");
  }
  // Count the try BEFORE comparing, atomically, so parallel guesses cannot exceed the limit.
  const counted = await col.findOneAndUpdate({ _id: active._id, status: "active", attempts: { $lt: active.maxAttempts } }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
  if (!counted) throw new OtpError("That code can no longer be used. Ask for a new one.", "no_active_code");
  const expected = Buffer.from(counted.codeHash, "hex");
  const given = hashCode(counted.salt, signer._id, entered);
  const match = /^\d{6}$/.test(entered) && expected.length === given.length && timingSafeEqual(expected, given);
  if (!match) {
    const left = counted.maxAttempts - counted.attempts;
    await appendEvent({ ...events, type: "otp_failed", data: { channel: counted.channel, attempt: counted.attempts, destination: counted.destinationMasked } });
    if (left <= 0) {
      const until = new Date(now.getTime() + OTP_LOCKOUT_MINUTES * 60_000);
      await col.updateOne({ _id: counted._id }, { $set: { status: "locked" } });
      await (await cfSigners()).updateOne({ _id: signer._id }, { $set: { otpLockedUntil: until } });
      await appendEvent({ ...events, type: "otp_locked", data: { channel: counted.channel, minutes: OTP_LOCKOUT_MINUTES, destination: counted.destinationMasked } });
      throw new OtpError(`That was the last try. For safety, codes are paused for ${OTP_LOCKOUT_MINUTES} minutes.`, "locked", OTP_LOCKOUT_MINUTES * 60, 0);
    }
    throw new OtpError(`That code is not right. You have ${left} ${left === 1 ? "try" : "tries"} left.`, "wrong_code", undefined, left);
  }
  // Single use: only one caller can flip active -> used.
  const used = await col.findOneAndUpdate({ _id: counted._id, status: "active" }, { $set: { status: "used", usedAt: now } });
  if (!used) throw new OtpError("That code has already been used. Ask for a new one.", "no_active_code");
  await (await cfSigners()).updateOne({ _id: signer._id }, { $set: { status: "otp_verified", otpVerifiedAt: now, otpLockedUntil: null } });
  await appendEvent({ ...events, type: "otp_verified", data: { channel: counted.channel, destination: counted.destinationMasked } });
  return { verifiedUntil: new Date(now.getTime() + OTP_VERIFIED_MINUTES * 60_000) };
}

/** True while the signer's last successful check is recent enough. The signing step (B4) and countersigning (B7) must call this. */
export async function isIdentityVerified(signerId: string, now = new Date()): Promise<boolean> {
  const s = await (await cfSigners()).findOne({ _id: signerId });
  return !!s?.otpVerifiedAt && now.getTime() - s.otpVerifiedAt.getTime() < OTP_VERIFIED_MINUTES * 60_000 && !s.tokenRevokedAt;
}
