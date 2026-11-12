import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { clientPromise } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { stableRootSecret } from "@/lib/platform/keyring";
import { checkEmailCode, maskEmail } from "@/lib/security/email-otp";
import { secondStepReadable, useRecoveryCode, verifyAuthenticatorCode } from "@/lib/security/two-factor";
import { DEFAULT_POLICY, hashDeviceToken, mergePolicy, newDeviceToken, offeredMethods, rateDecision, signReauthMarker, verifyReauthMarker, type MethodId, type MethodView, type RateState, type SecondStepAccount, type SecondStepPolicy } from "@/lib/security/second-step";

/** Server side of the multi-method second step: policy, which methods an account is offered, verifying one, re-authentication, trusted devices, notices. */

// ── Policy: platform default, optionally overridden per company ─────────────

const POLICY_DOC = "second_step_policy";
let emailReadyCache: { at: number; ok: boolean } | null = null;
const cache = new Map<string, { at: number; policy: SecondStepPolicy }>();
const TTL = 60_000;

export async function getSecondStepPolicy(companyId?: string): Promise<SecondStepPolicy> {
  const cid = companyId ?? (await currentCompanyId().catch(() => "")) ?? "";
  const hit = cache.get(cid);
  if (hit && Date.now() - hit.at < TTL) return hit.policy;
  const db = (await clientPromise).db();
  const platform = (await db.collection<{ _id: string; policy?: Partial<SecondStepPolicy> }>("platform_settings").findOne({ _id: POLICY_DOC }))?.policy;
  const company = cid ? (await db.collection<{ _id: string; secondStepPolicy?: Partial<SecondStepPolicy> }>("companies").findOne({ _id: cid }, { projection: { secondStepPolicy: 1 } }))?.secondStepPolicy : null;
  const policy = mergePolicy(DEFAULT_POLICY, platform, company);
  cache.set(cid, { at: Date.now(), policy });
  return policy;
}

export function bustSecondStepPolicyCache(): void {
  cache.clear();
  emailReadyCache = null;
}

export async function savePlatformPolicy(patch: Partial<SecondStepPolicy>, actorId: string): Promise<SecondStepPolicy> {
  const db = (await clientPromise).db();
  const cur = (await db.collection<{ _id: string; policy?: Partial<SecondStepPolicy> }>("platform_settings").findOne({ _id: POLICY_DOC }))?.policy;
  const next = mergePolicy(cur, patch);
  await db.collection("platform_settings").updateOne({ _id: POLICY_DOC as never }, { $set: { policy: next, updatedAt: new Date() } }, { upsert: true });
  bustSecondStepPolicyCache();
  await recordPlatformAudit({ actorId, action: "second_step.policy_changed", target: { type: "platform_settings", id: POLICY_DOC }, details: { ...next } });
  return next;
}

export async function saveCompanyPolicy(companyId: string, patch: Partial<SecondStepPolicy> | null, actorId: string): Promise<void> {
  const db = (await clientPromise).db();
  await db.collection("companies").updateOne({ _id: companyId as never }, patch ? { $set: { secondStepPolicy: patch } } : { $unset: { secondStepPolicy: "" } });
  bustSecondStepPolicyCache();
  await recordPlatformAudit({ actorId, action: "second_step.company_policy_changed", companyId, target: { type: "company", id: companyId }, details: { ...(patch ?? { cleared: true }) } });
}

// ── What an account is offered ───────────────────────────────────────────────

export async function emailProviderReady(): Promise<boolean> {
  if (emailReadyCache && Date.now() - emailReadyCache.at < TTL) return emailReadyCache.ok;
  const { resolveEmailConfig } = await import("@/lib/platform/integrations/resolve");
  const ok = await resolveEmailConfig().then((e) => e.provider === "resend" && Boolean(e.resendApiKey)).catch(() => false);
  emailReadyCache = { at: Date.now(), ok };
  return ok;
}

export async function offeredFor(user: SecondStepAccount & { _id: ObjectId }, policy?: SecondStepPolicy): Promise<{ methods: MethodView[]; appReadable: boolean; policy: SecondStepPolicy }> {
  const p = policy ?? (await getSecondStepPolicy());
  const appReadable = user.twoFactor ? await secondStepReadable(user as never) : true;
  const emailReady = await emailProviderReady();
  return { methods: offeredMethods(user, { appReadable, emailReady, policy: p }), appReadable, policy: p };
}

// ── Verifying one method ─────────────────────────────────────────────────────

const RULE = { max: 10, windowMs: 10 * 60_000 };
async function rateCol() {
  return (await getDb()).collection<{ _id: string } & RateState>("second_step_rate");
}

/** May this person try a code with this method now? Counts only genuinely wrong codes (never an unavailable method or an outage). */
export async function methodAllowed(adminId: ObjectId, method: MethodId): Promise<boolean> {
  const c = await rateCol();
  const cur = await c.findOne({ _id: `${String(adminId)}:${method}` });
  return rateDecision(cur ? { count: cur.count, windowStart: cur.windowStart } : null, Date.now(), RULE).allowed;
}
export async function noteWrong(adminId: ObjectId, method: MethodId): Promise<void> {
  const c = await rateCol();
  const id = `${String(adminId)}:${method}`;
  const cur = await c.findOne({ _id: id });
  const d = rateDecision(cur ? { count: cur.count, windowStart: cur.windowStart } : null, Date.now(), RULE);
  await c.updateOne({ _id: id }, { $set: { windowStart: d.next.windowStart, count: d.next.count + 1 } }, { upsert: true });
}

const looksNumeric = (c: string) => /^\d{6}$/.test(c.replace(/\s/g, ""));

/** "ok" | "wrong" | "unavailable". A recovery code is accepted under any method when it isn't a plain 6-digit code. */
export async function verifyMethod(user: SecondStepAccount & { _id: ObjectId }, method: MethodId, code: string, emailPurpose: "login" | "reauth" = "login"): Promise<"ok" | "wrong" | "unavailable"> {
  const typed = code.trim();
  if (method === "recovery" || !looksNumeric(typed)) return (await useRecoveryCode(user as never, typed)) ? "ok" : "wrong";
  if (method === "app") {
    const r = await verifyAuthenticatorCode(user as never, typed);
    return r === "unreadable" ? "unavailable" : r;
  }
  return (await checkEmailCode(user._id, emailPurpose, typed)) ? "ok" : "wrong";
}

// ── Notices and audit ────────────────────────────────────────────────────────

export async function noteMethodChange(user: { _id: ObjectId; email: string }, what: string): Promise<void> {
  await recordPlatformAudit({ actorId: String(user._id), action: `second_step.${what}`, companyId: await currentCompanyId().catch(() => undefined), target: { type: "admin_user", id: String(user._id) }, details: { email: maskEmail(user.email) } }).catch(() => {});
  try {
    const { sendEmail } = await import("@/lib/platform/email");
    const { renderEmail } = await import("@/lib/platform/email/template");
    const text = { app_changed: "your authenticator app was changed", email_on: "email codes were turned on", email_off: "email codes were turned off", recovery_regenerated: "your recovery codes were replaced", preferred_changed: "your preferred sign-in check was changed", trusted_device_added: "a device was trusted", trusted_device_removed: "a trusted device was removed", app_removed: "your authenticator app was turned off" }[what] ?? "your sign-in settings were changed";
    const { html, text: plain } = renderEmail({ brand: "Security notice", heading: "Your sign-in settings changed", paragraphs: [`We're letting you know that ${text}.`], footnote: "If this wasn't you, change your password now and tell your administrator." });
    await sendEmail({ to: user.email, subject: "Your sign-in settings changed", html, text: plain, event: "auth_second_step_changed" });
  } catch {
    /* a notice that can't be sent never blocks the change */
  }
}

// ── Re-authentication (step-up) ──────────────────────────────────────────────

const REAUTH_COOKIE = "selfrun_reauth";
const secret = () => stableRootSecret() ?? process.env.API_TRANSPORT_SECRET ?? "selfrun-reauth-dev";
const sessionHash = async (): Promise<string> => {
  const { HUB_SESSION_COOKIE } = await import("@/lib/hub-auth");
  const tok = (await cookies()).get(HUB_SESSION_COOKIE)?.value ?? "";
  return createHash("sha256").update(tok).digest("hex").slice(0, 32);
};

/** Has this signed-in person re-authenticated within the policy window? */
export async function hasFreshReauth(userId: string): Promise<boolean> {
  const token = (await cookies()).get(REAUTH_COOKIE)?.value;
  const policy = await getSecondStepPolicy().catch(() => DEFAULT_POLICY);
  return verifyReauthMarker(token, { userId, sessionHash: await sessionHash(), nowMs: Date.now(), windowMs: policy.reauthMinutes * 60_000, secret: secret() });
}

export async function issueReauth(userId: string): Promise<void> {
  const policy = await getSecondStepPolicy().catch(() => DEFAULT_POLICY);
  (await cookies()).set(REAUTH_COOKIE, signReauthMarker({ userId, sessionHash: await sessionHash(), nowMs: Date.now(), secret: secret() }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: policy.reauthMinutes * 60 });
}

// ── Trusted devices (opt-in) ─────────────────────────────────────────────────

export const TRUST_COOKIE = "selfrun_trusted_device";

export async function trustThisDevice(user: { _id: ObjectId; email: string }, label: string): Promise<boolean> {
  const policy = await getSecondStepPolicy();
  if (!policy.trustDeviceAllowed) return false;
  const token = newDeviceToken();
  const expiresAt = new Date(Date.now() + policy.trustDeviceDays * 86_400_000);
  await (await getDb()).collection("admin_users").updateOne({ _id: user._id }, { $push: { "secondStep.trusted": { hash: hashDeviceToken(token), expiresAt, label: label.slice(0, 80), createdAt: new Date() } } } as never);
  (await cookies()).set(TRUST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: policy.trustDeviceDays * 86_400 });
  await noteMethodChange(user, "trusted_device_added");
  return true;
}

export async function readTrustToken(): Promise<string | null> {
  return (await cookies()).get(TRUST_COOKIE)?.value ?? null;
}

/** Any one of the account's methods proves the person (for confirmations that ask for a code in a form): recovery code, authenticator or emailed code. */
export async function verifyAnySecondStep(user: SecondStepAccount & { _id: ObjectId }, code: string): Promise<"ok" | "wrong" | "unavailable"> {
  const typed = code.trim();
  if (!typed) return "wrong";
  if (!/^\d{6}$/.test(typed.replace(/\s/g, ""))) return verifyMethod(user, "recovery", typed);
  if (user.twoFactor) {
    const r = await verifyMethod(user, "app", typed);
    if (r === "ok") return "ok";
    if (r === "unavailable" && !user.twoFactorEmail) return "unavailable";
  }
  if (user.twoFactorEmail || user.twoFactor) {
    if (await checkEmailCode(user._id, "reauth", typed)) return "ok";
  }
  return "wrong";
}
