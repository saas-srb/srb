"use server";

import { redirect } from "next/navigation";
import { registerExternalUser } from "@/lib/products/clientos/registration";
import { createPortalSession, setPortalSessionCookie } from "@/lib/portal-auth";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { headers } from "next/headers";
import { platformRootDomain } from "@/lib/platform/tenancy/provisioning";

export interface PortalRegisterState {
  error?: string;
}

export async function portalRegisterAction(_prev: PortalRegisterState, formData: FormData): Promise<PortalRegisterState> {
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const referralCode = formData.get("referralCode");

  if (!email || !phone || !password) return { error: "Fill in every field." };
  if (password !== confirm) return { error: "Passwords do not match." };

  const result = await registerExternalUser({ email, phone, password, referralCode: typeof referralCode === "string" ? referralCode : null });
  if (!result.ok) return { error: result.error };

  const { token } = await createPortalSession(result.userId, false);
  await setPortalSessionCookie(token, false);

  // Redirect to the company's app host so the browser lands on the correct domain.
  const companyId = await currentCompanyId();
  const hostHint = platformRootDomain() === "localhost" ? (await headers()).get("host") : null;
  const appUrl = await appUrlForCompany(companyId, hostHint).catch(() => null);
  redirect(appUrl ? `${appUrl}/clientos` : "/clientos");
}

