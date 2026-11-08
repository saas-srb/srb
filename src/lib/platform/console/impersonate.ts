import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { issueSupportHandoff } from "@/lib/platform/signup";
import { recordPlatformAudit } from "@/lib/platform/audit";

export type LoginAsCompanyResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * "Login as company": gives a Platform Console user a one-time link that signs them in to a company's products as that company's Super
 * Admin — every product, no further permission. The link works once, for two minutes, only on that company's own host. Every use is audited
 * with the platform user's id (the company's own audit trail shows its Director, as the session is theirs).
 */
export async function loginAsCompany(companyId: string, actorId: string, hostHint: string | null): Promise<LoginAsCompanyResult> {
  const company = await getCompany(companyId);
  if (!company) return { ok: false, error: "Unknown company." };
  if (company.isPlatformOwner) return { ok: false, error: "That is the platform's own workspace; you are already in it." };
  if (company.status !== "active") return { ok: false, error: "The company is suspended. Reactivate it first." };
  const admin = await runAsCompany(companyId, async () =>
    (await getDb()).collection<{ _id: unknown; roles?: string[]; email?: string }>("admin_users").find({ roles: "super_admin", status: { $nin: BLOCKED_STATUSES } }).sort({ _id: 1 }).limit(1).next(),
  );
  if (!admin) return { ok: false, error: "This company has no Director account to sign in as." };
  const url = await issueSupportHandoff({ companyId, adminId: String(admin._id) }, await appUrlForCompany(companyId, hostHint));
  await recordPlatformAudit({ actorId, companyId, action: "company.login_as", target: { type: "company", id: companyId }, details: { as: admin.email ?? String(admin._id) } });
  return { ok: true, url };
}
