import "server-only";
import { getCurrentPortalUser, type CurrentPortalUser } from "@/lib/portal-auth";
import { PORTAL_ROLE_META } from "@/lib/portal-roles";
import { getActivePortalLead, listPortalLeadSummaries } from "@/lib/products/clientos/lead";
import { getApplicantOverview } from "@/lib/products/clientos/applicant";
import { getLearnerOverview } from "@/lib/products/clientos/student";
import { getClientOverview } from "@/lib/products/clientos/client";
import { getWalletOverview } from "@/lib/products/clientos/wallet";
import { listPortalNotifications } from "@/lib/products/clientos/notifications";
import { listPortalDocuments } from "@/lib/products/clientos/documents";
import { listInterviewsForLead } from "@/lib/products/clientos/interviews";
import { markAllPortalNotificationsReadAction, switchPortalLeadAction } from "@/app/(products)/clientos/(app)/actions";
import { sendPortalMessageAction } from "@/app/(products)/clientos/(app)/messages/actions";
import { f, fail, viaAction } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * The External User Portal (applicants, interns, trainees, clients). The signed-in portal account only ever sees and changes its own
 * records: every tool resolves the person from the portal session, never from anything the model passes in.
 */

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Json;

async function me<T>(run: (u: CurrentPortalUser) => Promise<T>): Promise<Json> {
  const u = await getCurrentPortalUser();
  if (!u) return fail("Please sign in again.");
  return json(await run(u));
}
const rep = (key: string, label: string, description: string, params: ReportDef["params"], run: (u: CurrentPortalUser, v: Json) => Promise<unknown>): ReportDef => ({ key, panel: "portal", label, description, level: "any", params, run: (v) => me((u) => run(u, v)) });

export const PORTAL_REPORTS: ReportDef[] = [
  rep("portal.my_account", "Your account and request", "Who you are in the portal, which request is active and where it stands (stage, timeline, recent updates).", [], async (u) => {
    const view = await getActivePortalLead(u);
    return { name: u.displayName, email: u.email, kind: PORTAL_ROLE_META[u.role].portalName, activeRequest: view ? { code: view.lead.code, type: view.lead.type, stage: view.currentStagePortalLabel, timeline: view.stageTimeline, events: view.events.slice(-10) } : null, requests: await listPortalLeadSummaries(u) };
  }),
  rep("portal.overview", "Your progress", "Applicants: hiring steps, interviews and offer. Interns/trainees: program, batch, attendance, assignments, certificates. Clients: projects, milestones, meetings and invoices.", [], async (u) => {
    const view = await getActivePortalLead(u);
    const type = view?.lead.type ?? u.role;
    if (type === "job_applicant") { const id = u.applicationId ?? view?.lead.applicationId ?? null; return id ? getApplicantOverview(id) : { note: "No application is linked to this account yet." }; }
    if (type === "intern" || type === "trainee") return getLearnerOverview(u.studentId ?? view?.lead.studentId ?? null);
    return getClientOverview(u.clientId ?? view?.lead.clientId ?? null);
  }),
  rep("portal.interviews", "Your interviews", "Your scheduled and past interviews for the active request.", [], async (u) => {
    const view = await getActivePortalLead(u);
    return view ? listInterviewsForLead(view.lead._id, u.applicationId ?? view.lead.applicationId ?? null) : [];
  }),
  rep("portal.messages", "Your conversation with the team", "The messages between you and the company team on the active request.", [], async (u) => (await getActivePortalLead(u))?.messages.slice(-30) ?? []),
  rep("portal.documents", "Your documents", "Documents shared with you or by you.", [], (u) => listPortalDocuments(u)),
  rep("portal.wallet", "Wallet and credits", "Your wallet balance and credits.", [], (u) => getWalletOverview(u.id)),
  rep("portal.notifications", "Your notifications", "Your latest notifications.", [], (u) => listPortalNotifications(u.id, 20)),
];

export const PORTAL_ACTIONS: ActionDef[] = [
  { key: "portal.send_message", panel: "portal", label: "Message the team", level: "any", description: "Send a message to the company team on your active request.", params: [f.text("body", "Message", true)], run: (v) => viaAction(() => sendPortalMessageAction(String(v.body ?? "")), "Message sent.") },
  { key: "portal.switch_request", panel: "portal", label: "Switch to another request", level: "any", description: "Make another of your requests the active one (ids from portal.my_account → requests).", params: [f.str("leadId", "Request id", true)], run: (v) => viaAction(() => switchPortalLeadAction(String(v.leadId ?? "")), "Switched.") },
  { key: "portal.mark_notifications_read", panel: "portal", label: "Mark all notifications as read", level: "any", description: "Mark every notification as read.", params: [], run: () => viaAction(() => markAllPortalNotificationsReadAction(), "All read.") },
];
