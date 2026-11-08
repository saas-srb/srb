"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { confirmTopup, startTopup, type ConfirmTopupResult, type StartTopupResult, type TopupResponse } from "@/lib/platform/billing/credits";

/** Buying capacity is a billing act: Directors of this company only, re-checked in every action. */
async function requireDirector(): Promise<{ companyId: string; userId: string }> {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  return { companyId: await currentCompanyId(), userId: user.id };
}

export async function startTopupAction(packId: string): Promise<StartTopupResult> {
  const { companyId, userId } = await requireDirector();
  return startTopup(companyId, String(packId ?? ""), userId);
}

export async function confirmTopupAction(response: TopupResponse): Promise<ConfirmTopupResult> {
  const { companyId, userId } = await requireDirector();
  const res = await confirmTopup(companyId, response, userId);
  if (res.ok) {
    revalidatePath("/commandos/settings/usage");
    revalidatePath("/commandos/settings/billing/invoices");
  }
  return res;
}
