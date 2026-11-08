import "server-only";
import { getPaymentControls } from "@/lib/products/cashflow-ai/payment-controls";
import { PAYMENT_CODE_REQUIRED, PAYMENT_CODE_WRONG, paymentCodeMethod, verifyPaymentCode, type PaymentCodeMethod } from "@/lib/security/payment-auth";
import { userRateLimit } from "@/lib/security/rate-limit";

/**
 * The checks every action that sends money runs first, in one place: the person may not start payments faster than a person could, and, when
 * the company asks for it (the default), must confirm with a code. Returns the sentence to show when the payment must not go, else `null`.
 */
export async function paymentGate(userId: string, code: unknown, opts: { weight?: number } = {}): Promise<string | null> {
  const rate = await userRateLimit("payment-start", userId, 40 * (opts.weight ?? 1), 600);
  if (!rate.ok) return "You are sending payments faster than is safe. Wait a few minutes and try again.";
  const controls = await getPaymentControls();
  if (!controls.requireCode) return null;
  // Local development only, for a machine that cannot send email: never honoured in production.
  if (process.env.NODE_ENV !== "production" && process.env.PAYMENT_CODE_DISABLED === "true") return null;
  const typed = String(code ?? "").trim();
  if (!typed) return PAYMENT_CODE_REQUIRED;
  return (await verifyPaymentCode(userId, typed)) ? null : PAYMENT_CODE_WRONG;
}

/** What the form needs to know: whether to ask for a code, and how this person gets it. */
export async function paymentGateInfo(userId: string): Promise<{ required: boolean; method: PaymentCodeMethod }> {
  const [controls, method] = await Promise.all([getPaymentControls(), paymentCodeMethod(userId)]);
  return { required: controls.requireCode && !(process.env.NODE_ENV !== "production" && process.env.PAYMENT_CODE_DISABLED === "true"), method };
}
