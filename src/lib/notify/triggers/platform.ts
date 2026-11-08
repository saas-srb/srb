import "server-only";
import { getPlatformOwnerCompanyId } from "@/lib/platform/tenancy/companies";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { notify } from "@/lib/platform/notifications";
import { getPlatformAccessForUser, listPlatformUsers } from "@/lib/platform/console/roles";
import { hasPermission, type PlatformPermission } from "@/lib/platform/console/permissions";
import { plural, short } from "@/lib/notify/triggers/format";

/**
 * Platform Console notifications (the SaaS owner's team). Each goes only to platform users whose role holds the matching permission,
 * so a support agent is not told about invoices and a finance user is not told about sign-ups. Never throws.
 */
async function tellTeam(permission: PlatformPermission, title: string, body: string, url: string, exceptUserId?: string | null): Promise<void> {
  try {
    const ownerId = await getPlatformOwnerCompanyId();
    if (!ownerId) return;
    await runAsCompany(ownerId, async () => {
      const users = await listPlatformUsers();
      const flags = await Promise.all(users.map(async (u) => hasPermission((await getPlatformAccessForUser(u.id))?.permissions, permission)));
      const ids = users.filter((u, i) => flags[i] && u.id !== exceptUserId).map((u) => u.id);
      if (ids.length) await notify({ to: { userIds: ids }, title, body, url });
    });
  } catch (err) {
    console.error("[notify] platform team notification failed", err instanceof Error ? err.message : err);
  }
}

const SUBSCRIPTION_TEXT: Record<string, string> = {
  trial_started: "started a trial",
  activated: "subscribed",
  plan_changed: "changed plan",
  past_due: "had a payment fail",
  grace: "entered the grace period",
  suspended: "was suspended (read-only)",
  canceled: "canceled",
  reactivated: "came back",
};

export const platformEvents = {
  signupAwaiting: (company: string, email: string) => tellTeam("signups.read", `Sign-up awaiting approval: ${short(company, 50)}`, `${email} confirmed their email and is waiting for you.`, "/console/signups"),
  companyCreated: (company: string, email: string, id: string) => tellTeam("companies.read", `New company: ${short(company, 50)}`, `Owner: ${email}`, `/console/companies/${id}`),
  subscription: (company: string, companyId: string, type: string, planName: string | null) =>
    tellTeam("subscriptions.read", `${short(company, 50)} ${SUBSCRIPTION_TEXT[type] ?? type}`, planName ? `Plan: ${planName}` : "See the subscription for details.", `/console/subscriptions/${companyId}`),
  companyStatus: (company: string, companyId: string, status: "active" | "suspended", actor: string) =>
    tellTeam("companies.read", `${short(company, 50)} was ${status === "suspended" ? "suspended" : "reactivated"}`, status === "suspended" ? "Its workspace no longer opens." : "Its workspace opens again.", `/console/companies/${companyId}`, actor),
  invoice: (kind: "issued" | "paid", number: string | null, company: string, total: number, id: string) =>
    tellTeam("invoices.read", `Invoice ${number ?? ""} ${kind}`.trim(), `${short(company, 50)} · ₹${(total / 100).toLocaleString("en-IN")}`, `/console/invoices/${id}`),
  trialsEnding: (n: number) => tellTeam("subscriptions.read", `${plural(n, "trial")} ending soon`, "These companies' trials end within 3 days.", "/console/subscriptions?status=trialing"),
  paymentWebhookFailed: (detail: string) => tellTeam("payments.read", "A payment event could not be processed", short(detail, 160), "/console/payments"),
};
