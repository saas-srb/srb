"use server";

import { redirect } from "next/navigation";
import { externalUsers, createPortalSession, setPortalSessionCookie } from "@/lib/portal-auth";
import { provisionLeadAndAccount } from "@/lib/lead-management/provision";
import { resolveReferralCode, clearReferralCookie } from "@/lib/wallet/referral-capture";
import type { LeadManagementSource } from "@/lib/lead-management/types";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { headers } from "next/headers";
import { platformRootDomain } from "@/lib/platform/tenancy/provisioning";

export interface PortalJoinState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Signup account types → the existing lead source that already maps to the matching portal role. */
const ACCOUNT_TYPES: Record<string, LeadManagementSource> = {
  student: "industrial_training",
  intern: "internship",
  client: "client_inquiry",
  job_seeker: "job_portal",
};

export async function portalJoinAction(_prev: PortalJoinState, formData: FormData): Promise<PortalJoinState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const accountType = String(formData.get("accountType") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (phone.replace(/\D/g, "").length < 7) fieldErrors.phone = "Enter a valid phone number.";
  if (!(accountType in ACCOUNT_TYPES)) fieldErrors.accountType = "Choose what best describes you.";
  if (password.length < 8) fieldErrors.password = "Password must be at least 8 characters.";
  else if (password !== confirm) fieldErrors.confirm = "Passwords do not match.";
  if (formData.get("terms") !== "on") fieldErrors.terms = "Please accept the terms to continue.";
  if (Object.keys(fieldErrors).length > 0) return { error: "Please fix the highlighted fields.", fieldErrors };

  const users = await externalUsers();
  if (await users.findOne({ email })) {
    return { error: "An account with this email already exists. Sign in instead — a referral can only be applied to a brand-new account.", fieldErrors: { email: "Already registered." } };
  }

  const referralCode = await resolveReferralCode(formData.get("referralCode"));
  const result = await provisionLeadAndAccount({
    source: ACCOUNT_TYPES[accountType],
    name,
    email,
    phone,
    password,
    message: "Self-service signup from the portal join page.",
    referralCode,
  });

  const { token } = await createPortalSession(result.externalUserId, false);
  await setPortalSessionCookie(token, false);
  await clearReferralCookie();

  // Redirect to the company's app host so the browser lands on the right domain.
  // The session cookie is now scoped to the root domain (.selfrunbusiness.com) so it
  // will be sent on the app host too — this avoids the cross-domain cookie loss.
  const companyId = await currentCompanyId();
  const hostHint = platformRootDomain() === "localhost" ? (await headers()).get("host") : null;
  const appUrl = await appUrlForCompany(companyId, hostHint).catch(() => null);
  redirect(appUrl ? `${appUrl}/clientos` : "/clientos");
}
