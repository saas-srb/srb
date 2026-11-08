import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { checkEmailCode, sendEmailCode, maskEmail } from "@/lib/security/email-otp";
import { verifySecondStep } from "@/lib/security/two-factor";
import { userRateLimit } from "@/lib/security/rate-limit";

/**
 * Confirming a payment. Before money leaves, the person is asked for a code on top of their sign-in, so a stolen or left-open session cannot
 * move money by itself: the code from their authenticator app when they use one, otherwise a code emailed to their own address. A code works
 * once; wrong tries are limited. Used by every action that sends money and by approvals.
 */

export type PaymentCodeMethod = "app" | "email";

async function account(adminId: string) {
  if (!ObjectId.isValid(adminId)) return null;
  return (await getDb()).collection<{ _id: ObjectId; email: string; twoFactor?: { secret: unknown; lastStep?: number; recovery: string[] } | null }>("admin_users").findOne({ _id: new ObjectId(adminId) }, { projection: { email: 1, twoFactor: 1 } });
}

/** How this person confirms: the app code when they have an authenticator app, else an emailed code. */
export async function paymentCodeMethod(adminId: string): Promise<PaymentCodeMethod> {
  const a = await account(adminId);
  return a?.twoFactor ? "app" : "email";
}

/** Sends the emailed code when that is how this person confirms. */
export async function sendPaymentCode(adminId: string): Promise<{ ok: true; method: PaymentCodeMethod; hint?: string } | { ok: false; error: string }> {
  const a = await account(adminId);
  if (!a) return { ok: false, error: "Your account could not be found." };
  if (a.twoFactor) return { ok: true, method: "app", hint: "Open your authenticator app and enter the current code." };
  const r = await sendEmailCode(a._id, a.email, "payment");
  return r.ok ? { ok: true, method: "email", hint: `A code was sent to ${r.hint ?? maskEmail(a.email)}.` } : { ok: false, error: r.error };
}

/** Whether `code` confirms this person. Wrong tries are counted per person, so a stolen session cannot guess its way in. */
export async function verifyPaymentCode(adminId: string, code: string): Promise<boolean> {
  const gate = await userRateLimit("payment-code", adminId, 10, 600);
  if (!gate.ok) return false;
  const a = await account(adminId);
  if (!a) return false;
  const digits = String(code ?? "").replace(/\s/g, "");
  if (!digits) return false;
  if (a.twoFactor) return verifySecondStep({ _id: a._id, twoFactor: a.twoFactor as never }, digits);
  return checkEmailCode(a._id, "payment", digits);
}

export const PAYMENT_CODE_REQUIRED = "Enter the confirmation code to send this payment.";
export const PAYMENT_CODE_WRONG = "That confirmation code is not right or has expired. Ask for a new one and try again.";
