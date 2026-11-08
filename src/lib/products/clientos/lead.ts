import "server-only";
import { externalUsers, type CurrentPortalUser } from "@/lib/portal-auth";
import { getLeadRecord, listLeadsForUser, serializeLeadRecord } from "@/lib/lead-management/records";
import { listLeadTimeline } from "@/lib/lead-management/timeline";
import { listLeadMessages } from "@/lib/lead-management/messages";
import { workflowFor, portalStageTimeline, stageMeta } from "@/lib/lead-management/workflows";
import type { SerializedLeadRecord, SerializedLeadTimelineEvent, SerializedLeadMessage } from "@/lib/lead-management/types";
import type { LeadStage } from "@/lib/lead-management/workflows";

/**
 * The portal's view of Lead Management. The active lead drives which dashboard
 * renders and its lifecycle timeline; deep module data (batch, milestones, …)
 * still comes from TMS/PMS once the lead is linked.
 */

export interface PortalLeadView {
  lead: SerializedLeadRecord;
  workflow: LeadStage[];
  currentStageLabel: string;
  currentStagePortalLabel: string;
  stageTimeline: { key: string; label: string; state: "done" | "current" | "upcoming" | "skipped" }[];
  events: SerializedLeadTimelineEvent[];
  messages: SerializedLeadMessage[];
}

/** All leads on the account (for the topbar switcher). */
export async function listPortalLeadSummaries(
  user: CurrentPortalUser
): Promise<{ id: string; code: string; type: string; name: string; stageLabel: string; active: boolean }[]> {
  const leads = await listLeadsForUser(user.id);
  return leads.map((l) => ({
    id: l._id,
    code: l.code,
    type: l.type,
    name: l.name,
    stageLabel: stageMeta(l.type, l.stage)?.label ?? l.stage,
    active: l._id === (user.activeLeadId ?? user.leadId),
  }));
}

export async function getActivePortalLead(user: CurrentPortalUser): Promise<PortalLeadView | null> {
  const leadId = user.activeLeadId ?? user.leadId;
  if (!leadId) return null;
  const lead = await getLeadRecord(leadId);
  if (!lead || lead.externalUserId !== user.id) return null;

  const [events, messages] = await Promise.all([
    listLeadTimeline(lead._id, { visibleOnly: true }),
    listLeadMessages(lead._id, { visibility: "portal" }),
  ]);

  const meta = stageMeta(lead.type, lead.stage);
  return {
    lead: serializeLeadRecord(lead),
    workflow: workflowFor(lead.type),
    currentStageLabel: meta?.label ?? lead.stage,
    currentStagePortalLabel: meta?.portalLabel ?? lead.stage,
    stageTimeline: portalStageTimeline(lead.type, lead.stage),
    events,
    messages,
  };
}

/** Switch which lead the portal renders. Guards ownership. */
export async function setActivePortalLead(userId: string, leadId: string): Promise<boolean> {
  const lead = await getLeadRecord(leadId);
  if (!lead || lead.externalUserId !== userId) return false;
  const users = await externalUsers();
  await users.updateOne(
    { _id: userId },
    { $set: { activeLeadId: leadId, role: lead.type, updatedAt: new Date() } }
  );
  return true;
}
