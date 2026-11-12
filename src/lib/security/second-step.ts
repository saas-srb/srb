import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure rules of the multi-method second step (no database, no server imports): which methods an account has and offers, which one is
 * asked first, what may be removed, the short-lived re-authentication marker, trusted-device tokens and the policy defaults.
 * Methods: `app` (authenticator), `email` (a code sent to the verified address), `sms` (a code texted to a verified phone number), `recovery` (single-use codes).
 */

export type MethodId = "app" | "email" | "sms" | "recovery";

export interface SecondStepPolicy {
  /** Email codes may be used (as a method and as the fallback when the authenticator can't be checked). */
  emailAllowed: boolean;
  /** SMS codes may be used. OFF until a provider (and, for +91 numbers, the DLT fields) is configured and an operator allows it. */
  smsAllowed: boolean;
  /** Admins must have a second step. */
  requireForAdmins: boolean;
  /** People may choose "trust this device". Off by default. */
  trustDeviceAllowed: boolean;
  trustDeviceDays: number;
  /** How long a re-authentication stays fresh for sensitive actions. */
  reauthMinutes: number;
}

export const DEFAULT_POLICY: SecondStepPolicy = { emailAllowed: true, smsAllowed: false, requireForAdmins: false, trustDeviceAllowed: false, trustDeviceDays: 30, reauthMinutes: 10 };

export function mergePolicy(...layers: (Partial<SecondStepPolicy> | null | undefined)[]): SecondStepPolicy {
  const out: SecondStepPolicy = { ...DEFAULT_POLICY };
  for (const l of layers) {
    if (!l) continue;
    if (typeof l.emailAllowed === "boolean") out.emailAllowed = l.emailAllowed;
    if (typeof l.smsAllowed === "boolean") out.smsAllowed = l.smsAllowed;
    if (typeof l.requireForAdmins === "boolean") out.requireForAdmins = l.requireForAdmins;
    if (typeof l.trustDeviceAllowed === "boolean") out.trustDeviceAllowed = l.trustDeviceAllowed;
    if (Number.isFinite(l.trustDeviceDays)) out.trustDeviceDays = Math.min(90, Math.max(1, Math.round(l.trustDeviceDays as number)));
    if (Number.isFinite(l.reauthMinutes)) out.reauthMinutes = Math.min(60, Math.max(1, Math.round(l.reauthMinutes as number)));
  }
  return out;
}

/** What is stored on the account (older documents have only the first fields; everything here is optional). */
export interface SecondStepAccount {
  email: string;
  twoFactor?: { secret?: unknown; recovery?: string[] } | null;
  twoFactorEmail?: unknown | null;
  secondStep?: { preferred?: MethodId | null; recovery?: string[]; sms?: { e164: string; verifiedAt?: Date | string } | null; trusted?: { hash: string; expiresAt: Date | string; label?: string }[] } | null;
}

export interface MethodView {
  id: MethodId;
  label: string;
  /** Where a code goes, masked, or null. Never anything that identifies a method the account does not have. */
  masked: string | null;
}

export const maskEmail = (email: string): string => {
  const [name, domain] = email.split("@");
  if (!domain) return "your email";
  return `${name.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(name.length - 1, 6)))}@${domain}`;
};

export const recoveryLeft = (a: SecondStepAccount): number => (a.secondStep?.recovery?.length ?? 0) + (a.twoFactor?.recovery?.length ?? 0);

/** Methods the account has switched on (regardless of whether they can be used right now). */
export function enrolled(a: SecondStepAccount): { app: boolean; email: boolean; sms: boolean; recovery: boolean } {
  return { app: Boolean(a.twoFactor), email: Boolean(a.twoFactorEmail), sms: Boolean(a.secondStep?.sms?.e164), recovery: recoveryLeft(a) > 0 };
}

export const hasSecondStep = (a: SecondStepAccount): boolean => {
  const e = enrolled(a);
  return e.app || e.email || e.sms;
};

/** `+91 ******1234`: the country code and the last four digits only. */
export function maskPhone(e164: string): string {
  const d = e164.replace(/[^\d]/g, "");
  const cc = e164.startsWith("+91") ? "91" : e164.startsWith("+1") ? "1" : d.slice(0, 2);
  const rest = d.slice(cc.length);
  return `+${cc} ${"*".repeat(Math.max(4, rest.length - 4))}${rest.slice(-4)}`;
}

/** A typed number to E.164. Ten digits with no country code are taken as Indian (+91). Null when it isn't a plausible number. */
export function normalizePhone(raw: string, defaultCc = "91"): string | null {
  const t = raw.trim();
  const digits = t.replace(/[^\d]/g, "");
  let e164: string;
  if (t.startsWith("+")) e164 = `+${digits}`;
  else if (t.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (digits.length === 10) e164 = `+${defaultCc}${digits}`;
  else if (digits.length === 12 && digits.startsWith("91")) e164 = `+${digits}`;
  else return null;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  if (e164.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(e164)) return null; // Indian mobile numbers
  return e164;
}

/**
 * The methods to OFFER at sign-in, in order. `appReadable` is false when the authenticator can't be checked on this server (it is then not offered, and
 * nothing about why is said). Email is offered when it is switched on, or, when the authenticator can't be checked, as the automatic fallback
 * (if the policy allows email and a provider exists). SMS is offered when a verified number exists and SMS is usable for it (policy, provider and,
 * for +91 numbers, DLT). Recovery codes are offered whenever any are left.
 */
export function offeredMethods(a: SecondStepAccount, ctx: { appReadable: boolean; emailReady: boolean; smsUsable?: boolean; policy: SecondStepPolicy }): MethodView[] {
  const e = enrolled(a);
  const out: MethodView[] = [];
  const emailUsable = ctx.policy.emailAllowed && ctx.emailReady;
  const smsUsable = ctx.policy.smsAllowed && Boolean(ctx.smsUsable);
  const add = (m: MethodView) => out.some((x) => x.id === m.id) || out.push(m);
  const ordered: MethodId[] = a.secondStep?.preferred ? [a.secondStep.preferred, "app", "email", "sms", "recovery"] : ["app", "email", "sms", "recovery"];
  for (const id of ordered) {
    if (id === "app" && e.app && ctx.appReadable) add({ id, label: "Use your authenticator app", masked: null });
    if (id === "email" && emailUsable && (e.email || (e.app && !ctx.appReadable))) add({ id, label: `Email a code to ${maskEmail(a.email)}`, masked: maskEmail(a.email) });
    if (id === "sms" && smsUsable && e.sms) add({ id, label: `Text a code to ${maskPhone(a.secondStep!.sms!.e164)}`, masked: maskPhone(a.secondStep!.sms!.e164) });
    if (id === "recovery" && e.recovery) add({ id, label: "Use a recovery code", masked: null });
  }
  return out;
}

export interface MethodRow {
  id: MethodId;
  title: string;
  description: string;
  /** `available`: can be used now. `unavailable`: the account has it but it can't be used right now. `not_set_up`: the account doesn't have it. */
  status: "available" | "unavailable" | "not_set_up";
}

/**
 * Every method the platform offers, for the chooser: a method the platform has not enabled is HIDDEN; one the account hasn't set up is shown
 * greyed with a neutral hint (never revealing anything about other accounts). Pure; `offered` comes from `offeredMethods`.
 */
export function methodRows(a: SecondStepAccount, offered: MethodView[], ctx: { emailReady: boolean; smsConfigured: boolean; policy: SecondStepPolicy }): MethodRow[] {
  const e = enrolled(a);
  const has = (id: MethodId) => offered.some((m) => m.id === id);
  const rows: MethodRow[] = [];
  const row = (id: MethodId, title: string, description: string, haveIt: boolean) => rows.push({ id, title, description: has(id) || haveIt ? description : "Not set up for this account", status: has(id) ? "available" : haveIt ? "unavailable" : "not_set_up" });
  row("app", "Authenticator app", "Use the code from your authenticator app", e.app);
  if (ctx.policy.emailAllowed && (ctx.emailReady || e.email)) row("email", "Email code", `We'll email a code to ${maskEmail(a.email)}`, e.email);
  if (ctx.policy.smsAllowed && (ctx.smsConfigured || e.sms)) row("sms", "SMS code", a.secondStep?.sms?.e164 ? `We'll text a code to ${maskPhone(a.secondStep.sms.e164)}` : "We'll text a code to your phone", e.sms);
  row("recovery", "Recovery code", "Use one of your saved recovery codes", e.recovery);
  // An unavailable method says so neutrally.
  for (const r of rows) if (r.status === "unavailable") r.description = "Not available right now";
  return rows;
}

/** The method asked first: the one requested (if offered), else the first offered. */
export function pickMethod(offered: MethodView[], requested?: string | null): MethodId | null {
  if (requested && offered.some((m) => m.id === requested)) return requested as MethodId;
  return offered[0]?.id ?? null;
}

/**
 * May `method` be turned off? Never when it would leave an account that is REQUIRED to have a second step without any usable method
 * (recovery codes alone do not count: they run out).
 */
export function canRemoveMethod(a: SecondStepAccount, method: "app" | "email" | "sms", opts: { required: boolean }): { ok: true } | { ok: false; reason: string } {
  const e = enrolled(a);
  const remaining = (method === "app" ? 0 : Number(e.app)) + (method === "email" ? 0 : Number(e.email)) + (method === "sms" ? 0 : Number(e.sms));
  if (opts.required && remaining === 0) return { ok: false, reason: "Your company requires a second step. Add another method first, then turn this one off." };
  return { ok: true };
}

// ── Re-authentication marker ─────────────────────────────────────────────────

const b64u = (b: Buffer) => b.toString("base64url");

/** A short-lived signed marker, bound to one account and one session: "this person proved themselves again at `iat`". */
export function signReauthMarker(input: { userId: string; sessionHash: string; nowMs: number; secret: string }): string {
  const payload = b64u(Buffer.from(JSON.stringify({ u: input.userId, s: input.sessionHash, iat: input.nowMs })));
  return `${payload}.${b64u(createHmac("sha256", input.secret).update(`reauth|${payload}`).digest())}`;
}

export function verifyReauthMarker(token: string | null | undefined, input: { userId: string; sessionHash: string; nowMs: number; windowMs: number; secret: string }): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const want = Buffer.from(b64u(createHmac("sha256", input.secret).update(`reauth|${payload}`).digest()));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; s: string; iat: number };
    return p.u === input.userId && p.s === input.sessionHash && input.nowMs - p.iat >= 0 && input.nowMs - p.iat <= input.windowMs;
  } catch {
    return false;
  }
}

// ── Trusted devices ──────────────────────────────────────────────────────────

export const newDeviceToken = (): string => randomBytes(32).toString("base64url");
export const hashDeviceToken = (t: string): string => createHash("sha256").update(`trusted-device|${t}`).digest("hex");

/** Is `token` one of the account's unexpired trusted devices? (Only meaningful when the policy allows trusting devices.) */
export function isTrustedDevice(a: SecondStepAccount, token: string | null | undefined, nowMs: number, policy: SecondStepPolicy): boolean {
  if (!policy.trustDeviceAllowed || !token) return false;
  const h = Buffer.from(hashDeviceToken(token));
  return (a.secondStep?.trusted ?? []).some((d) => {
    const x = Buffer.from(d.hash);
    return x.length === h.length && timingSafeEqual(x, h) && new Date(d.expiresAt).getTime() > nowMs;
  });
}

// ── Per-method rate limit (pure decision; the counters live in the database) ──

export interface RateState {
  count: number;
  windowStart: number;
}
/** At most `max` tries per `windowMs`. Only genuinely wrong codes are counted by the caller: never an unavailable method or an outage. */
export function rateDecision(state: RateState | null, nowMs: number, rule: { max: number; windowMs: number }): { allowed: boolean; next: RateState } {
  if (!state || nowMs - state.windowStart >= rule.windowMs) return { allowed: true, next: { count: 0, windowStart: nowMs } };
  return { allowed: state.count < rule.max, next: state };
}
