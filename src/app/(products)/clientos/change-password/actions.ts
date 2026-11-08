"use server";

import { redirect } from "next/navigation";
import { getCurrentPortalUser, changeOwnPortalPassword } from "@/lib/portal-auth";
import { recordPortalAudit } from "@/lib/products/clientos/audit";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { headers } from "next/headers";
import { platformRootDomain } from "@/lib/platform/tenancy/provisioning";

export interface ChangePasswordState {
  error?: string;
}

export async function changePortalPasswordAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await getCurrentPortalUser();
  if (!user) redirect("/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnPortalPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };
  await recordPortalAudit({ actorId: user.id, action: "password_change", entity: "account", entityId: user.id });

  // Redirect to the company's app host so the browser lands on the correct domain.
  const companyId = await currentCompanyId();
  const hostHint = platformRootDomain() === "localhost" ? (await headers()).get("host") : null;
  const appUrl = await appUrlForCompany(companyId, hostHint).catch(() => null);
  redirect(appUrl ? `${appUrl}/clientos` : "/clientos");
}

