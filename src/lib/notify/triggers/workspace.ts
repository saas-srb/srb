import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { notifyUsers } from "@/lib/notify";
import { userIdsByRoles } from "@/lib/notify/audience";
import { plural, short } from "@/lib/notify/triggers/format";

/**
 * Workspace (company control centre) notifications — they land in the Workspace bell. People-management, domain, billing and
 * automation events go to the company's admins (Directors and Workspace Admins); anything about one person's own access also
 * goes to that person. Never throws.
 */
const ADMINS = ["workspace_admin"];

async function admins(except?: string | null): Promise<string[]> {
  return (await userIdsByRoles(ADMINS)).filter((i) => i !== except);
}
async function tell(userIds: string[], title: string, body: string, url: string, dedupeKey?: string, priority?: "high" | "normal"): Promise<void> {
  try {
    if (userIds.length) await notifyUsers("workspace", userIds, { type: "workspace_event", title, body, link: url, dedupeKey, priority });
  } catch (err) {
    console.error("[notify] workspace notification failed", err instanceof Error ? err.message : err);
  }
}
async function emailOf(id: string): Promise<string> {
  try {
    const u = await (await getDb()).collection<{ _id: ObjectId; email?: string }>("admin_users").findOne({ _id: new ObjectId(id) }, { projection: { email: 1 } });
    return u?.email ?? "an account";
  } catch {
    return "an account";
  }
}

export const workspaceEvents = {
  userAdded: async (email: string, roles: string[], actor: string) => tell(await admins(actor), `New team member: ${email}`, `Added with ${plural(roles.length, "role")}: ${roles.join(", ") || "none"}.`, "/commandos/users"),
  rolesChanged: async (userId: string, roles: string[], actor: string) => {
    const email = await emailOf(userId);
    const body = `Access is now: ${roles.join(", ") || "none"}.`;
    await tell(await admins(actor), `Access changed for ${email}`, body, "/commandos/users");
    if (userId !== actor) await tell([userId], "Your access was changed", body, "/commandos");
  },
  customRoleChanged: async (roleName: string, holders: number, actor: string) => tell(await admins(actor), `Custom role updated: ${short(roleName, 50)}`, `${plural(holders, "person")} with this role now have the new access.`, "/commandos/roles"),
  overridesChanged: async (userId: string, actor: string) => {
    const email = await emailOf(userId);
    await tell(await admins(actor), `Permissions adjusted for ${email}`, "Individual permissions were switched on or off.", "/commandos/users");
    if (userId !== actor) await tell([userId], "Your permissions were adjusted", "What you can do in some products changed.", "/commandos");
  },
  deactivated: async (userId: string, actor: string) => tell(await admins(actor), `Account deactivated: ${await emailOf(userId)}`, "They can no longer sign in.", "/commandos/users"),
  reactivated: async (userId: string, actor: string) => tell(await admins(actor), `Account reactivated: ${await emailOf(userId)}`, "They can sign in again.", "/commandos/users"),
  passwordReset: async (userId: string, actor: string) => tell(await admins(actor), `Password reset for ${await emailOf(userId)}`, "A temporary password was issued.", "/commandos/users"),
  inviteAccepted: async (email: string, name: string) => tell(await admins(), `${short(name, 40) || email} joined`, `${email} accepted the invitation and can sign in.`, "/commandos/users"),
  domain: async (host: string, what: "verified" | "failed" | "removed" | "primary", detail?: string) =>
    tell(await admins(), what === "verified" ? `Domain verified: ${host}` : what === "failed" ? `Domain needs attention: ${host}` : what === "primary" ? `Primary domain is now ${host}` : `Domain removed: ${host}`, short(detail, 160) || (what === "verified" ? "Your site is reachable on it." : "Check the DNS records on the Domains page."), "/commandos/settings/domains"),
  automationFailed: async (name: string, id: string, detail: string) => tell(await admins(), `Automation failed: ${short(name, 50)}`, short(detail, 160), "/commandos/settings/automations"),
  billing: async (type: string, planName: string | null) => {
    const m: Record<string, [string, string]> = {
      activated: [`Subscription active${planName ? `: ${planName}` : ""}`, "Thank you — your plan is now active."],
      plan_changed: [`Plan changed${planName ? ` to ${planName}` : ""}`, "The new plan applies from now."],
      past_due: ["Payment failed", "We could not charge your payment method. Update it to avoid losing access."],
      grace: ["Your account is in a grace period", "Add a payment method soon — access will become read-only."],
      suspended: ["Your account is read-only", "Subscribe to a plan to continue editing."],
      canceled: ["Subscription canceled", "You keep access until the end of the paid period."],
      reactivated: ["Subscription restored", "Your account is fully active again."],
    };
    const row = m[type];
    if (row) await tell(await admins(), row[0], row[1], "/commandos/settings/billing", undefined, type === "past_due" || type === "suspended" || type === "grace" ? "high" : "normal");
  },
  trialReminder: async (daysLeft: number) => tell(await admins(), `Your trial ends in ${plural(daysLeft, "day")}`, "Pick a plan to keep everything running.", "/commandos/settings/billing", `trial-reminder:${daysLeft}`, "high"),
  maintenance: async (message: string, startsAt: Date, endsAt: Date, mode: string) =>
    tell(await admins(), mode === "banner" ? "Planned maintenance" : "Maintenance window (the workspace will be unavailable)", `${short(message, 120) || "The platform team scheduled maintenance."} ${startsAt.toLocaleString("en-IN")} – ${endsAt.toLocaleString("en-IN")}.`, "/commandos", `maintenance:${startsAt.toISOString()}`, "high"),
  usage: async (what: string, pct: number, periodKey: string) => tell(await admins(), pct >= 100 ? `${what} limit reached` : `${what} is at ${pct}% of your plan`, pct >= 100 ? "Upgrade your plan or add capacity to continue." : "Consider upgrading before you reach the limit.", "/commandos/settings/billing", `usage:${what}:${periodKey}:${pct >= 100 ? 100 : 80}`, pct >= 100 ? "high" : "normal"),
};
