"use server";

import { redirect } from "next/navigation";
import {
  verifyPortalCredentials,
  createPortalSession,
  setPortalSessionCookie,
  getSessionPortalUser,
} from "@/lib/portal-auth";
import { recordPortalAudit } from "@/lib/products/clientos/audit";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { headers } from "next/headers";
import { platformRootDomain } from "@/lib/platform/tenancy/provisioning";

export interface PortalLoginState {
  error?: string;
}

export async function portalLoginAction(_prev: PortalLoginState, formData: FormData): Promise<PortalLoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!email || !password) return { error: "Enter your email and password." };

  const result = await verifyPortalCredentials(email, password);
  if (!result.ok) return { error: result.error };

  const { token } = await createPortalSession(result.userId, remember);
  await setPortalSessionCookie(token, remember);
  await recordPortalAudit({ actorId: result.userId, action: "login", entity: "account", entityId: result.userId });

  const user = await getSessionPortalUser(token);

  // Redirect to the company's app host so the browser lands on the correct domain.
  const companyId = await currentCompanyId();
  const hostHint = platformRootDomain() === "localhost" ? (await headers()).get("host") : null;
  const appUrl = await appUrlForCompany(companyId, hostHint).catch(() => null);
  const base = appUrl ?? "";
  if (user?.mustChangePassword) redirect(`${base}/clientos/change-password`);
  redirect(`${base}/clientos`);
}
