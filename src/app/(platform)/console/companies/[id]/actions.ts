"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { setCompanyStatus, type SetStatusResult } from "@/lib/platform/console/companies";
import { closePendingOnReactivate } from "@/lib/platform/reactivation";
import { extendTrial } from "@/lib/platform/billing/trials";

export async function setCompanyStatusAction(companyId: string, status: string): Promise<SetStatusResult> {
  const auth = await checkPlatformPermission("companies.status");
  if (!auth.ok) return auth;
  if (status !== "active" && status !== "suspended") return { ok: false, error: "Unknown status." };
  const id = String(companyId);
  const before = await getCompany(id);
  const res = await setCompanyStatus(id, status, auth.user.id);
  if (res.ok) {
    if (status === "active") await closePendingOnReactivate(id, auth.user.id);
    await recordPlatformAudit({
      actorId: auth.user.id,
      action: status === "suspended" ? "company.suspend" : "company.activate",
      target: { type: "company", id },
      companyId: id,
      details: { name: before?.name ?? null, from: before?.status ?? null, to: status },
    });
    revalidatePath("/console", "layout");
  }
  return res;
}

export async function extendTrialAction(companyId: string, days: number): Promise<{ ok: true; trialEndsAt: string } | { ok: false; error: string }> {
  const auth = await checkPlatformPermission("subscriptions.manage");
  if (!auth.ok) return auth;
  const res = await extendTrial(String(companyId), Number(days), auth.user.id);
  if (!res.ok) return res;
  revalidatePath("/console", "layout");
  return { ok: true, trialEndsAt: res.trialEndsAt.toISOString() };
}
