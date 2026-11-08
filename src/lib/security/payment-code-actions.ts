"use server";

import { getCurrentHubUser } from "@/lib/hub-auth";
import { paymentGateInfo } from "@/lib/products/cashflow-ai/payment-guard";
import { sendPaymentCode } from "@/lib/security/payment-auth";
import { userRateLimit } from "@/lib/security/rate-limit";

/** For the confirmation-code box shown next to every button that sends money: do we ask, and send the emailed code when that is how this person confirms. */
export async function paymentCodeInfoAction(): Promise<{ required: boolean; method: "app" | "email" }> {
  const user = await getCurrentHubUser();
  if (!user) return { required: true, method: "email" };
  return paymentGateInfo(user.id);
}

export async function sendPaymentCodeAction(): Promise<{ ok: boolean; hint?: string; error?: string }> {
  const user = await getCurrentHubUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const gate = await userRateLimit("payment-code-send", user.id, 6, 3600);
  if (!gate.ok) return { ok: false, error: "Too many codes were requested. Please try again later." };
  const r = await sendPaymentCode(user.id);
  return r.ok ? { ok: true, hint: r.hint } : { ok: false, error: r.error };
}
