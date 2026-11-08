"use server";

import { requirePlatformPermission } from "@/lib/platform/console/access";
import { loginAsCompany, type LoginAsCompanyResult } from "@/lib/platform/console/impersonate";
import { requestOrigin } from "@/lib/platform/request";

/**
 * Platform user → one-time sign-in link into a company's products as its Director. Its own permission, not "suspend / reactivate": this
 * is full access to the customer's data, so it is granted on purpose (the Support role has it; a custom role must be given it).
 */
export async function loginAsCompanyAction(companyId: string): Promise<LoginAsCompanyResult> {
  const user = await requirePlatformPermission("companies.impersonate");
  const { host } = await requestOrigin();
  return loginAsCompany(String(companyId ?? ""), user.id, host);
}
