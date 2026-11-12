"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getDb } from "@/lib/mongodb";
import { verifyPassword } from "@/lib/security/password";
import { breakGlassMatches } from "@/lib/security/break-glass";
import { sendEmailCode } from "@/lib/security/email-otp";
import { canRemoveMethod, hasSecondStep, maskPhone, normalizePhone, type MethodId, type SecondStepAccount } from "@/lib/security/second-step";
import { checkSmsCode, smsConfigured, smsUsableFor, sendSmsCode } from "@/lib/security/sms-otp";
import { getSecondStepPolicy, hasFreshReauth, issueReauth, methodAllowed, noteMethodChange, noteWrong, offeredFor, verifyMethod } from "@/lib/security/second-step-server";
import { confirmTwoFactorSetup, disableEmailTwoFactor, enableEmailTwoFactor, regenerateRecoveryCodes, secondStepReadable, setPreferredMethod, startTwoFactorSetup, twoFactorStatus } from "@/lib/security/two-factor";

/**
 * Server actions behind the "Security" settings and the re-authentication gate (`ReAuthGate`), shared by every product.
 * A method change needs a FRESH re-authentication (password plus a method the person already has); everything is audited with a notice email.
 */

type Fail = { ok: false; error: string; reauth?: boolean };
const REAUTH: Fail = { ok: false, error: "Please confirm it's you first.", reauth: true };

async function who() {
  const user = await getCurrentHubUser();
  if (!user || !ObjectId.isValid(user.id)) redirect("/commandos/login");
  return user;
}
async function account(id: string) {
  const u = await (await getDb()).collection("admin_users").findOne({ _id: new ObjectId(id) });
  return u as unknown as (SecondStepAccount & { _id: ObjectId; email: string; passwordHash: string; roles?: string[] }) | null;
}

// ── Re-authentication (step-up) ──────────────────────────────────────────────

export interface ReAuthState {
  fresh: boolean;
  needsSecondStep: boolean;
  methods: { id: MethodId; label: string }[];
  minutes: number;
}

export async function reauthStatusAction(): Promise<ReAuthState> {
  const user = await who();
  const a = await account(user.id);
  const policy = await getSecondStepPolicy();
  if (!a) return { fresh: false, needsSecondStep: false, methods: [], minutes: policy.reauthMinutes };
  const off = await offeredFor(a, policy);
  return { fresh: await hasFreshReauth(user.id), needsSecondStep: hasSecondStep(a), methods: off.methods.map((m) => ({ id: m.id, label: m.label })), minutes: policy.reauthMinutes };
}

/** Sends an email code for re-authentication (when that method is offered). */
export async function reauthSendEmailAction(): Promise<{ ok: true; hint: string } | Fail> {
  const user = await who();
  const a = await account(user.id);
  if (!a) return { ok: false, error: "Sign in again." };
  const off = await offeredFor(a);
  if (!off.methods.some((m) => m.id === "email")) return { ok: false, error: "That way isn't available." };
  const r = await sendEmailCode(a._id, a.email, "reauth");
  return r.ok ? r : { ok: false, error: r.error };
}

/** Password AND one second-step method of the person's choice (any they have). Counts only genuinely wrong answers. */
export async function reauthAction(input: { password: string; method?: MethodId; code?: string }): Promise<{ ok: true } | (Fail & { alternatives?: { id: MethodId; label: string }[] })> {
  const user = await who();
  const a = await account(user.id);
  if (!a) return { ok: false, error: "Sign in again." };
  const password = String(input?.password ?? "");
  const off = await offeredFor(a);
  const alternatives = off.methods.map((m) => ({ id: m.id, label: m.label }));
  const unreadableOnly = Boolean(a.twoFactor) && !off.appReadable && off.methods.length === 0;
  const emergency = unreadableOnly && breakGlassMatches({ email: a.email, password, envEmail: process.env.SAAS_ADMIN_EMAIL, envPassword: process.env.SAAS_ADMIN_PASSWORD });
  if (!emergency && !verifyPassword(password, a.passwordHash)) return { ok: false, error: "That password isn't right.", alternatives };
  if (hasSecondStep(a) && !emergency) {
    const method = (input?.method && off.methods.some((m) => m.id === input.method) ? input.method : off.methods[0]?.id) as MethodId | undefined;
    if (!method) return { ok: false, error: "We can't verify you with the methods available on this account right now. Try again in a few minutes.", alternatives };
    if (!(await methodAllowed(a._id, method))) return { ok: false, error: "Too many tries with this way. Wait a few minutes, or try another way.", alternatives };
    const res = await verifyMethod(a, method, String(input?.code ?? ""), "reauth");
    if (res === "unavailable") return { ok: false, error: "We couldn't verify this code. Try another way.", alternatives };
    if (res === "wrong") {
      await noteWrong(a._id, method);
      return { ok: false, error: "That code isn't right or has expired.", alternatives };
    }
  }
  await issueReauth(user.id);
  return { ok: true };
}

/** For other server actions: refuse unless the person re-authenticated within the policy window. */
async function freshOrFail(): Promise<{ user: Awaited<ReturnType<typeof who>> } | Fail> {
  const user = await who();
  return (await hasFreshReauth(user.id)) ? { user } : REAUTH;
}

// ── Manage methods ───────────────────────────────────────────────────────────

export interface SecondStepState {
  authenticator: { on: boolean; available: boolean; readable: boolean; since: string | null };
  email: { on: boolean; allowed: boolean; masked: string };
  /** SMS code: `configured` = a provider exists; `masked` = the verified number. */
  sms: { on: boolean; allowed: boolean; configured: boolean; masked: string | null };
  recoveryLeft: number;
  preferred: "app" | "email" | "sms" | null;
  /** The company/platform requires a second step for this person. */
  required: boolean;
  trustAllowed: boolean;
  trustDays: number;
  trusted: { hash: string; label: string; expiresAt: string }[];
  minutes: number;
}

export async function secondStepStateAction(): Promise<SecondStepState> {
  const user = await who();
  const a = (await account(user.id))!;
  const st = await twoFactorStatus(a._id);
  const policy = await getSecondStepPolicy();
  const { maskEmail } = await import("@/lib/security/second-step");
  const privileged = (a.roles ?? []).includes("super_admin");
  return {
    authenticator: { on: st.methods.includes("app"), available: st.available, readable: a.twoFactor ? await secondStepReadable(a as never) : true, since: st.methods.includes("app") && st.enabledAt ? st.enabledAt.toISOString() : null },
    email: { on: st.methods.includes("email"), allowed: policy.emailAllowed, masked: maskEmail(a.email) },
    sms: { on: st.methods.includes("sms"), allowed: policy.smsAllowed, configured: await smsConfigured(), masked: a.secondStep?.sms?.e164 ? maskPhone(a.secondStep.sms.e164) : null },
    recoveryLeft: st.recoveryLeft,
    preferred: st.preferred,
    required: privileged && policy.requireForAdmins,
    trustAllowed: policy.trustDeviceAllowed,
    trustDays: policy.trustDeviceDays,
    trusted: (a.secondStep?.trusted ?? []).filter((d) => new Date(d.expiresAt).getTime() > Date.now()).map((d) => ({ hash: d.hash.slice(0, 12), label: d.label ?? "Trusted device", expiresAt: new Date(d.expiresAt).toISOString() })),
    minutes: policy.reauthMinutes,
  };
}

const done = () => {
  revalidatePath("/commandos/settings/security");
  revalidatePath("/commandos/account/sessions");
};

export async function startAuthenticatorAction(): Promise<{ ok: true; secret: string; qr: string } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  const r = await startTwoFactorSetup(new ObjectId(g.user.id), g.user.email);
  return r;
}

/** The first code from the app turns the authenticator on (or replaces the old one). Recovery codes come back only when the account had none. */
export async function confirmAuthenticatorAction(code: string): Promise<{ ok: true; recovery: string[] } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  const id = new ObjectId(g.user.id);
  const had = (await twoFactorStatus(id)).methods.includes("app");
  const r = await confirmTwoFactorSetup(id, String(code ?? ""));
  if (!r.ok) return r;
  await noteMethodChange({ _id: id, email: g.user.email }, "app_changed");
  void had;
  done();
  return r;
}

export async function removeAuthenticatorAction(): Promise<{ ok: true } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  const a = (await account(g.user.id))!;
  const policy = await getSecondStepPolicy();
  const guard = canRemoveMethod(a, "app", { required: (a.roles ?? []).includes("super_admin") && policy.requireForAdmins });
  if (!guard.ok) return { ok: false, error: guard.reason };
  await (await getDb()).collection("admin_users").updateOne({ _id: a._id }, { $unset: { twoFactor: "", twoFactorPending: "" } });
  await noteMethodChange(a, "app_removed");
  done();
  return { ok: true };
}

export async function sendEmailMethodCodeAction(purpose: "enable" | "disable"): Promise<{ ok: true; hint: string } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  if (purpose === "enable" && !(await getSecondStepPolicy()).emailAllowed) return { ok: false, error: "Email codes aren't available for your account." };
  const r = await sendEmailCode(new ObjectId(g.user.id), g.user.email, purpose);
  return r.ok ? r : { ok: false, error: r.error };
}

export async function enableEmailMethodAction(code: string): Promise<{ ok: true } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  if (!(await getSecondStepPolicy()).emailAllowed) return { ok: false, error: "Email codes aren't available for your account." };
  const r = await enableEmailTwoFactor(new ObjectId(g.user.id), String(code ?? ""));
  if (r.ok) {
    await noteMethodChange({ _id: new ObjectId(g.user.id), email: g.user.email }, "email_on");
    done();
  }
  return r;
}

export async function disableEmailMethodAction(code: string): Promise<{ ok: true } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  const a = (await account(g.user.id))!;
  const policy = await getSecondStepPolicy();
  const guard = canRemoveMethod(a, "email", { required: (a.roles ?? []).includes("super_admin") && policy.requireForAdmins });
  if (!guard.ok) return { ok: false, error: guard.reason };
  const r = await disableEmailTwoFactor(a._id, String(code ?? ""));
  if (r.ok) {
    await noteMethodChange(a, "email_off");
    done();
  }
  return r;
}

/** New recovery codes, shown once; the old ones stop working. */
export async function regenerateRecoveryAction(): Promise<{ ok: true; codes: string[] } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  const codes = await regenerateRecoveryCodes(new ObjectId(g.user.id));
  await noteMethodChange({ _id: new ObjectId(g.user.id), email: g.user.email }, "recovery_regenerated");
  done();
  return { ok: true, codes };
}

export async function setPreferredAction(method: "app" | "email" | "sms"): Promise<{ ok: true } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  const st = await twoFactorStatus(new ObjectId(g.user.id));
  if (!st.methods.includes(method)) return { ok: false, error: "Turn that method on first." };
  await setPreferredMethod(new ObjectId(g.user.id), method);
  await noteMethodChange({ _id: new ObjectId(g.user.id), email: g.user.email }, "preferred_changed");
  done();
  return { ok: true };
}

export async function revokeTrustedDeviceAction(prefix: string): Promise<{ ok: true } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  const col = (await getDb()).collection("admin_users");
  const a = (await account(g.user.id))!;
  const target = (a.secondStep?.trusted ?? []).find((d) => d.hash.startsWith(String(prefix)));
  if (!target) return { ok: true };
  await col.updateOne({ _id: a._id }, { $pull: { "secondStep.trusted": { hash: target.hash } } } as never);
  await noteMethodChange(a, "trusted_device_removed");
  done();
  return { ok: true };
}

// ── SMS code ─────────────────────────────────────────────────────────────────

/** Adds or changes the phone number: texts a code to it (India first: ten digits mean +91). Needs a fresh re-authentication. */
export async function startSmsAction(phone: string): Promise<{ ok: true; hint: string } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  if (!(await getSecondStepPolicy()).smsAllowed) return { ok: false, error: "Text-message codes aren't available right now." };
  const e164 = normalizePhone(String(phone ?? ""));
  if (!e164) return { ok: false, error: "Enter a mobile number, for example 98765 43210 or +91 98765 43210." };
  if (!(await smsUsableFor(e164))) return { ok: false, error: "Text-message codes aren't available for that number right now." };
  const id = new ObjectId(g.user.id);
  const r = await sendSmsCode(id, e164, "enable");
  if (!r.ok) return { ok: false, error: r.error };
  await (await getDb()).collection("admin_users").updateOne({ _id: id }, { $set: { "secondStep.smsPending": { e164, at: new Date() } } } as never);
  return r;
}

export async function confirmSmsAction(code: string): Promise<{ ok: true } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  const id = new ObjectId(g.user.id);
  const a = (await account(g.user.id))!;
  const pending = (a.secondStep as { smsPending?: { e164: string; at: Date } } | null)?.smsPending;
  if (!pending || Date.now() - new Date(pending.at).getTime() > 15 * 60_000) return { ok: false, error: "That number was not confirmed in time. Start again." };
  if (!(await checkSmsCode(id, "enable", String(code ?? "")))) return { ok: false, error: "That code isn't right or has expired." };
  const changed = Boolean(a.secondStep?.sms?.e164);
  await (await getDb()).collection("admin_users").updateOne({ _id: id }, { $set: { "secondStep.sms": { e164: pending.e164, verifiedAt: new Date() } }, $unset: { "secondStep.smsPending": "" } } as never);
  await noteMethodChange(a, changed ? "sms_changed" : "sms_on");
  done();
  return { ok: true };
}

export async function removeSmsAction(): Promise<{ ok: true } | Fail> {
  const g = await freshOrFail();
  if ("ok" in g) return g;
  const a = (await account(g.user.id))!;
  const policy = await getSecondStepPolicy();
  const guard = canRemoveMethod(a, "sms", { required: (a.roles ?? []).includes("super_admin") && policy.requireForAdmins });
  if (!guard.ok) return { ok: false, error: guard.reason };
  await (await getDb()).collection("admin_users").updateOne({ _id: a._id }, { $unset: { "secondStep.sms": "", "secondStep.smsPending": "" } } as never);
  await (await getDb()).collection("admin_users").updateOne({ _id: a._id, "secondStep.preferred": "sms" } as never, { $unset: { "secondStep.preferred": "" } } as never);
  await noteMethodChange(a, "sms_off");
  done();
  return { ok: true };
}
