"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { recordRazorpayTest, saveRazorpayConfig, type SaveRazorpayConfigResult } from "@/lib/platform/billing/razorpay-config";
import { testRazorpayConnection } from "@/lib/platform/billing/razorpay";

export async function saveRazorpayConfigAction(input: { keyId: string; keySecret: string; mode: string; webhookSecret?: string }): Promise<SaveRazorpayConfigResult> {
  const user = await requirePlatformPermission("payments.manage");
  const res = await saveRazorpayConfig({ keyId: String(input?.keyId ?? ""), keySecret: String(input?.keySecret ?? ""), webhookSecret: String(input?.webhookSecret ?? ""), mode: String(input?.mode ?? "") }, user.id);
  if (res.ok) revalidatePath("/console/payments");
  return res;
}

export async function testRazorpayConnectionAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requirePlatformPermission("payments.manage");
  const res = await testRazorpayConnection();
  await recordRazorpayTest(res);
  await recordPlatformAudit({ actorId: user.id, action: "settings.razorpay.test", target: { type: "platform_settings", id: "billing_razorpay" }, details: { ok: res.ok } });
  revalidatePath("/console/payments");
  return res;
}
