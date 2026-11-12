import "server-only";
import type { ObjectId } from "mongodb";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { sendEmailCode } from "@/lib/security/email-otp";
import { hasSecondStep, isTrustedDevice, maskEmail, pickMethod, type MethodId, type MethodView, type SecondStepAccount } from "@/lib/security/second-step";
import { methodAllowed, noteMethodChange, noteWrong, offeredFor, readTrustToken, verifyMethod, getSecondStepPolicy } from "@/lib/security/second-step-server";
import { recoverTwoStep } from "@/lib/security/two-factor";

/**
 * The second step of sign-in with every method an account has. After the password: the preferred method is asked first, "Try another way"
 * lists the others (masked), and a method that fails or is unavailable (unreadable authenticator, email provider down, lost phone) simply
 * surfaces the others, in customer-safe words. Failures that are not the person's mistake are never counted.
 */

export interface SecondStepFail {
  ok: false;
  error: string;
  needsCode: true;
  method: MethodId;
  hint?: string;
  info?: string;
  /** The other ways in, masked, for "Try another way". */
  alternatives: { id: MethodId; label: string }[];
  /** Kept for older callers: the authenticator can't be checked / an email code is on offer. */
  keyUnavailable?: boolean;
  canEmail?: boolean;
  /** The page may offer "trust this device" (policy). */
  trustAllowed?: boolean;
  /** Count this response against the sign-in lock (a genuinely wrong code). */
  countFailure?: boolean;
}
export type SecondStepResult = { proceed: true; via: MethodId | "trusted" | "break_glass" } | SecondStepFail;

const PROMPT: Record<MethodId, string> = {
  app: "Enter the 6-digit code from your authenticator app.",
  email: "",
  recovery: "Enter one of your recovery codes. If you can't find one, ask your administrator to reset your sign-in.",
};

type LoginUser = SecondStepAccount & { _id: ObjectId; email: string; platformRoleId?: string | null; roles?: string[] };

async function runSecondStepInner(c: { user: LoginUser; normalizedEmail: string; code?: string; resend?: boolean; method?: string | null; breakGlass: boolean; flagUnreadable?: () => void }): Promise<SecondStepResult> {
  const { user } = c;
  if (!hasSecondStep(user)) return { proceed: true, via: "trusted" };
  const policy = await getSecondStepPolicy();
  if (isTrustedDevice(user, await readTrustToken().catch(() => null), Date.now(), policy)) return { proceed: true, via: "trusted" };

  const { methods: offered, appReadable } = await offeredFor(user, policy);
  const id = String(user._id);
  const unreadable = Boolean(user.twoFactor) && !appReadable;
  if (unreadable) c.flagUnreadable?.();
  const alternatives = (current: MethodId): { id: MethodId; label: string }[] => offered.filter((m) => m.id !== current).map((m) => ({ id: m.id, label: m.label }));
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
    // Nothing usable right now (for example an unreadable authenticator, no recovery codes and no email option): calm words, nothing counted.
    return { ok: false, error: "", needsCode: true, method: "recovery", info: "We couldn't verify your sign-in right now. Ask your administrator to reset your sign-in.", alternatives: [], keyUnavailable: unreadable };
  }

  let method = pickMethod(offered, c.method) as MethodId;
  const typed = (c.code ?? "").trim();

  const ask = async (m: MethodId, info?: string, error = ""): Promise<SecondStepFail> => {
    if (m === "email") {
      const sent = await sendEmailCode(user._id, user.email, "login");
      if (sent.ok) return { ok: false, error, needsCode: true, method: "email", hint: sent.hint, info: info ?? `We sent a 6-digit code to ${sent.hint}. It works for 10 minutes.`, alternatives: alternatives("email"), keyUnavailable: unreadable, canEmail: true };
      if (sent.waitSeconds) return { ok: false, error, needsCode: true, method: "email", hint: maskEmail(user.email), info: `A code was sent to ${maskEmail(user.email)} a moment ago. Check your inbox (and spam). You can ask for another in ${sent.waitSeconds} seconds.`, alternatives: alternatives("email"), keyUnavailable: unreadable, canEmail: true };
      // The email could not be sent (provider down, too many requests): offer the other ways, without saying why.
      const rest = offered.filter((x) => x.id !== "email");
      const next = rest[0]?.id;
      if (!next) return { ok: false, error: "", needsCode: true, method: "recovery", info: "We couldn't send a code right now. Please try again in a few minutes, or ask your administrator to reset your sign-in.", alternatives: [], keyUnavailable: unreadable };
      return { ok: false, error: "", needsCode: true, method: next, info: `We couldn't send the email right now. ${PROMPT[next]}`, alternatives: rest.filter((x) => x.id !== next).map((x) => ({ id: x.id, label: x.label })), keyUnavailable: unreadable };
    }
    return { ok: false, error, needsCode: true, method: m, info: info ?? PROMPT[m], alternatives: alternatives(m), keyUnavailable: unreadable, canEmail: offered.some((x) => x.id === "email") };
  };

  /** The prompt for a method WITHOUT sending anything (after a wrong code). */
  const show = (m: MethodId, info: string | undefined, error: string): SecondStepFail => ({ ok: false, error, needsCode: true, method: m, hint: m === "email" ? maskEmail(user.email) : undefined, info: info ?? (m === "email" ? `Enter the 6-digit code we emailed to ${maskEmail(user.email)}.` : PROMPT[m]), alternatives: alternatives(m), keyUnavailable: unreadable, canEmail: offered.some((x) => x.id === "email") });

  // Nothing typed yet (or "send again"): ask with the chosen method.
  if (!typed || (c.resend && method === "email")) return ask(method);

  if (!(await methodAllowed(user._id, method))) return show(method, undefined, "Too many tries with this method. Wait a few minutes, or try another way.");
  const res = await verifyMethod(user, method, typed);
  if (res === "ok") return done(method);
  if (res === "unavailable") {
    const rest = offered.filter((m) => m.id !== method);
    const next = rest[0]?.id;
    return next ? ask(next, `We couldn't verify this code. ${next === "email" ? "" : PROMPT[next]}`.trim()) : ask("recovery", "We couldn't verify this code. Enter a recovery code, or ask your administrator to reset your sign-in.");
  }
  // A recovery code typed under another method still counts as the recovery method.
  await noteWrong(user._id, method);
  // When the authenticator can't be checked, a wrong code is never counted against the person (the per-method limiter still throttles guessing).
  return { ...show(method, undefined, unreadable ? "We couldn't verify this code. Enter a recovery code, or try another way." : "That code isn't right or has expired."), countFailure: !unreadable };
}

export async function runSecondStep(c: Parameters<typeof runSecondStepInner>[0]): Promise<SecondStepResult> {
  const r = await runSecondStepInner(c);
  if ("proceed" in r) return r;
  return { ...r, trustAllowed: (await getSecondStepPolicy()).trustDeviceAllowed };
}

export type { MethodView };
