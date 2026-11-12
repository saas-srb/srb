import "server-only";
import type { ObjectId } from "mongodb";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { sendEmailCode } from "@/lib/security/email-otp";
import { sendSmsCode } from "@/lib/security/sms-otp";
import { hasSecondStep, isTrustedDevice, maskEmail, maskPhone, pickMethod, type MethodId, type MethodRow, type MethodView, type SecondStepAccount } from "@/lib/security/second-step";
import { getSecondStepPolicy, methodAllowed, noteMethodChange, noteWrong, offeredFor, readTrustToken, verifyMethod } from "@/lib/security/second-step-server";
import { recoverTwoStep } from "@/lib/security/two-factor";

/**
 * The second step of sign-in with every method an account has. After the password: the preferred method is asked first and a "Try another way"
 * list of ALL methods the platform offers is always shown (a method the account hasn't set up is greyed with a neutral hint). A method that fails
 * or is unavailable (unreadable authenticator, email or SMS provider down, lost phone) opens the first usable one instead, in customer-safe words.
 * Failures that are not the person's mistake are never counted. Only reached after a correct password.
 */

export interface SecondStepFail {
  ok: false;
  error: string;
  needsCode: true;
  method: MethodId;
  hint?: string;
  info?: string;
  /** Every method the platform offers, with its state, for the chooser (the one being shown is included). */
  methods: MethodRow[];
  /** Kept for older callers. */
  alternatives: { id: MethodId; label: string }[];
  keyUnavailable?: boolean;
  canEmail?: boolean;
  /** Nothing can verify this person right now. */
  nothingUsable?: boolean;
  /** Where to write for help (platform contact settings). */
  supportEmail?: string;
  /** Seconds before another code may be requested (email / SMS). */
  resendIn?: number;
  trustAllowed?: boolean;
  /** Count this response against the sign-in lock (a genuinely wrong code). */
  countFailure?: boolean;
}
export type SecondStepResult = { proceed: true; via: MethodId | "trusted" | "break_glass" } | SecondStepFail;

const PROMPT: Record<MethodId, string> = {
  app: "Enter the 6-digit code from your authenticator app.",
  email: "",
  sms: "",
  recovery: "Enter one of your saved recovery codes.",
};

type LoginUser = SecondStepAccount & { _id: ObjectId; email: string; platformRoleId?: string | null; roles?: string[] };

async function supportEmail(): Promise<string | undefined> {
  try {
    const { requestHostOrNull } = await import("@/lib/platform/saas/request");
    const { saasCanonicalHost } = await import("@/lib/platform/saas/hosts");
    const { saasContact } = await import("@/lib/platform/saas/brand");
    return saasContact(saasCanonicalHost(await requestHostOrNull())).support;
  } catch {
    return undefined;
  }
}

async function runSecondStepInner(c: { user: LoginUser; normalizedEmail: string; code?: string; resend?: boolean; method?: string | null; breakGlass: boolean; flagUnreadable?: () => void }): Promise<SecondStepResult> {
  const { user } = c;
  if (!hasSecondStep(user)) return { proceed: true, via: "trusted" };
  const policy = await getSecondStepPolicy();
  if (isTrustedDevice(user, await readTrustToken().catch(() => null), Date.now(), policy)) return { proceed: true, via: "trusted" };

  const { methods: offered, rows, appReadable } = await offeredFor(user, policy);
  const id = String(user._id);
  const unreadable = Boolean(user.twoFactor) && !appReadable;
  if (unreadable) c.flagUnreadable?.();
  const phone = user.secondStep?.sms?.e164;
  const alternatives = (current: MethodId): { id: MethodId; label: string }[] => offered.filter((m) => m.id !== current).map((m) => ({ id: m.id, label: m.label }));
  const base = (m: MethodId) => ({ ok: false as const, needsCode: true as const, method: m, methods: rows, alternatives: alternatives(m), keyUnavailable: unreadable, canEmail: offered.some((x) => x.id === "email") });
  const done = async (via: MethodId): Promise<SecondStepResult> => {
    // The authenticator couldn't be checked but the person proved themselves another way: drop the unreadable secret, and have them re-enrol right away.
    if (unreadable && via !== "app") {
      await recoverTwoStep(user._id);
      await recordPlatformAudit({ actorId: id, action: "two_step.recovered_key_mismatch", companyId: await currentCompanyId().catch(() => undefined), target: { type: "admin_user", id }, details: { via, email: maskEmail(user.email) } }).catch(() => {});
      void noteMethodChange(user, "app_removed");
    }
    return { proceed: true, via };
  };

  if (c.breakGlass) {
    await recoverTwoStep(user._id);
    await recordPlatformAudit({ actorId: id, action: "two_step.break_glass", companyId: await currentCompanyId().catch(() => undefined), target: { type: "admin_user", id }, details: { email: maskEmail(user.email) } }).catch(() => {});
    return { proceed: true, via: "break_glass" };
  }

  if (offered.length === 0) {
    // Nothing usable right now: neutral guidance and a way to reach support. (Staff already have an alert queued for an unreadable authenticator.)
    return { ...base("recovery"), error: "", info: "We can't verify you with the methods available on this account right now. Try again in a few minutes.", nothingUsable: true, supportEmail: await supportEmail(), alternatives: [] };
  }

  const method = pickMethod(offered, c.method) as MethodId;
  const typed = (c.code ?? "").trim();

  /** The prompt for a method WITHOUT sending anything (after a wrong code, or when switching to a method that needs no send). */
  const show = (m: MethodId, info: string | undefined, error: string): SecondStepFail => ({
    ...base(m),
    error,
    hint: m === "email" ? maskEmail(user.email) : m === "sms" && phone ? maskPhone(phone) : undefined,
    info: info ?? (m === "email" ? `Enter the 6-digit code we emailed to ${maskEmail(user.email)}.` : m === "sms" && phone ? `Enter the 6-digit code we texted to ${maskPhone(phone)}.` : PROMPT[m]),
  });

  /** Sends a code (email / SMS) and prompts; if sending fails the first other usable method opens instead, without saying why. */
  const ask = async (m: MethodId, error = ""): Promise<SecondStepFail> => {
    if (m === "email" || m === "sms") {
      const sent = m === "email" ? await sendEmailCode(user._id, user.email, "login") : await sendSmsCode(user._id, phone!, "login");
      if (sent.ok) return { ...show(m, `We sent a 6-digit code to ${sent.hint}. It works for 10 minutes.`, error), hint: sent.hint, resendIn: 45 };
      const wait = "waitSeconds" in sent ? sent.waitSeconds : undefined;
      if (wait) return { ...show(m, `A code was sent to ${m === "email" ? maskEmail(user.email) : maskPhone(phone!)} a moment ago. Check your messages. You can ask for another in ${wait} seconds.`, error), resendIn: wait };
      const rest = offered.filter((x) => x.id !== m);
      const next = rest[0]?.id;
      if (!next) return { ...base("recovery"), error: "", info: "We couldn't send a code right now. Try again in a few minutes.", nothingUsable: true, supportEmail: await supportEmail(), alternatives: [] };
      return show(next, `We couldn't send that code right now. ${next === "email" || next === "sms" ? "Choose how to get a code below." : PROMPT[next]}`.trim(), "");
    }
    return show(m, undefined, error);
  };

  // Nothing typed yet (or "send again"): ask with the chosen method.
  if (!typed || (c.resend && (method === "email" || method === "sms"))) return ask(method);

  if (!(await methodAllowed(user._id, method))) return show(method, undefined, "Too many tries with this method. Wait a few minutes, or try another way.");
  const res = await verifyMethod(user, method, typed);
  if (res === "ok") return done(method);
  if (res === "unavailable") {
    const next = offered.find((m) => m.id !== method)?.id;
    return next ? ask(next, "") : show("recovery", "We can't verify you with the methods available on this account right now. Try again in a few minutes.", "");
  }
  await noteWrong(user._id, method);
  // When the authenticator can't be checked, a wrong code is never counted against the person (the per-method limiter still throttles guessing).
  return { ...show(method, undefined, unreadable ? "We couldn't verify this code. Try another way." : "That code isn't right or has expired."), countFailure: !unreadable };
}

export async function runSecondStep(c: Parameters<typeof runSecondStepInner>[0]): Promise<SecondStepResult> {
  const r = await runSecondStepInner(c);
  if ("proceed" in r) return r;
  return { ...r, trustAllowed: (await getSecondStepPolicy()).trustDeviceAllowed };
}

export type { MethodView };
