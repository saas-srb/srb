"use server";

import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import {
  disconnectPaymentAccount,
  savePaymentAccount,
  testPaymentAccount,
  type PaymentAccountInput,
  type PaymentAccountResult,
} from "@/lib/platform/integrations/payments";

async function requireOwner() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  return user;
}

export async function savePaymentAccountAction(input: PaymentAccountInput, code: string): Promise<PaymentAccountResult> {
  const user = await requireOwner();
  // Changing where payments go, or the keys that can send money, needs the confirmation code like any payment.
  const blocked = await paymentGate(user.id, code);
  if (blocked) return { ok: false, error: blocked };
  return savePaymentAccount(
    {
      keyId: String(input?.keyId ?? ""),
      keySecret: String(input?.keySecret ?? ""),
      webhookSecret: String(input?.webhookSecret ?? ""),
      payoutsEnabled: input?.payoutsEnabled === true,
      accountNumber: String(input?.accountNumber ?? ""),
    },
    { id: user.id, email: user.email },
  );
}

export async function testPaymentAccountAction(): Promise<PaymentAccountResult> {
  await requireOwner();
  return testPaymentAccount();
}

export async function disconnectPaymentAccountAction(code: string): Promise<PaymentAccountResult> {
  const user = await requireOwner();
  const blocked = await paymentGate(user.id, code);
  if (blocked) return { ok: false, error: blocked };
  return disconnectPaymentAccount({ id: user.id, email: user.email });
}
