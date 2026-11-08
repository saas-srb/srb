"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManagePaymentLinks } from "@/lib/fms-roles";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { createPaymentLink } from "@/lib/products/cashflow-ai/payments/links";
import { emailPaymentLink } from "@/lib/products/cashflow-ai/payments/link-email";
import { userRateLimit } from "@/lib/security/rate-limit";
import type { PaymentSourceModule } from "@/lib/products/cashflow-ai/payments/intents";

export interface CollectResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  url?: string;
  emailSent?: boolean;
  emailError?: string | null;
}

const PORTALS: Record<string, PaymentSourceModule> = { TMS: "Cohort AI", PMS: "SprintOS", DIRECT: "DIRECT" as PaymentSourceModule };

/** Makes a payment link for a customer and emails it to them. Customers pay it through Razorpay Checkout; money is booked when Razorpay confirms. */
export async function createCollectLinkAction(input: Record<string, unknown>): Promise<CollectResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManagePaymentLinks(user)) return { ok: false, error: "You don't have permission to create payment links." };
  const gate = await userRateLimit("payment-link", user.id, 30, 600);
  if (!gate.ok) return { ok: false, error: "You are creating links faster than is safe. Wait a few minutes and try again." };

  const errors: Record<string, string> = {};
  const name = String(input.payerName ?? "").trim().slice(0, 120);
  if (!name) errors.payerName = "Enter who is paying.";
  const email = String(input.payerEmail ?? "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.payerEmail = "Enter their email address: the link is sent there.";
  const amount = Math.round(Number(String(input.amount ?? "").replace(/[, ]/g, "")) * 100) / 100;
  if (!(amount >= 1 && amount <= 10_000_000)) errors.amount = "Enter an amount from ₹1 to ₹1,00,00,000.";
  const phone = String(input.payerPhone ?? "").replace(/[^\d+]/g, "").slice(0, 16) || null;
  if (Object.keys(errors).length > 0) return { ok: false, error: Object.values(errors)[0], fieldErrors: errors };

  const title = String(input.purpose ?? "").trim().slice(0, 120) || "Payment";
  const portal = PORTALS[String(input.portal ?? "DIRECT")] ?? PORTALS.DIRECT;
  const res = await createPaymentLink({ title, amount, currency: "INR", customerName: name, customerEmail: email, customerPhone: phone, sourceModule: portal, expiresInDays: 7, actorId: user.id });
  if (!res.ok) return { ok: false, error: res.reason };

  const mailed = await emailPaymentLink({ to: email, name, title, amount, currency: "INR", url: res.publicUrl });
  await recordAudit({ actorId: user.id, actorEmail: user.email ?? null, action: "create", entity: "payment_link", entityId: res.paymentLink._id, entityLabel: title, summary: `₹${amount} for ${name}${mailed.sent ? ", emailed" : ", NOT emailed"}` });
  revalidatePath("/cashflow-ai/receivables");
  revalidatePath("/cashflow-ai/payment-links");
  return { ok: true, url: res.publicUrl, emailSent: mailed.sent, emailError: mailed.error };
}
