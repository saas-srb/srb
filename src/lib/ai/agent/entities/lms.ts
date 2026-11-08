import "server-only";
import { deleteLead, updateLead, getLead, getDashboardStats, getStaleLeadsSummary, getRecentLeadsSummary, assignLeadsCampaign, validateLeadUpdate, isValidCategory, type CategorySlug } from "@/lib/leads";
import { collectionNameFor } from "@/lib/categories";
import { getLeadCategories } from "@/lib/lead-categories";
import { LEAD_STATUSES } from "@/lib/lead-status";
import { advanceLeadStage, assignLeadOwner, getLeadRecord, getLeadStats, setLeadLink, mirrorLinkToAccount } from "@/lib/lead-management/records";
import { postLeadMessage } from "@/lib/lead-management/messages";
import { recordLeadEvent } from "@/lib/lead-management/timeline";
import { provisionLeadAndAccount } from "@/lib/lead-management/provision";
import { LEAD_WORKFLOWS, nextStageOptions } from "@/lib/lead-management/workflows";
import { PORTAL_ROLES, isPortalRole } from "@/lib/portal-roles";
import { getApplication, updateApplication, deleteApplication } from "@/lib/career-applications";
import { validateApplicationUpdate } from "@/lib/career-application-validation";
import { CAREER_APPLICATION_STATUSES } from "@/lib/career-application-status";
import { createInterview, updateInterviewStatus, deleteInterview, type InterviewMode, type InterviewStatus } from "@/lib/products/clientos/interviews";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { getCampaignAnalytics, undoImport, isValidPlatform, campaignKeyFor } from "@/lib/campaigns";
import { getStudent } from "@/lib/products/cohort-ai/students";
import { getClient } from "@/lib/products/sprintos/clients";
import { getProject } from "@/lib/products/sprintos/projects";
import { canManageCampaigns, canViewLmsAnalytics, lmsCan, type LmsPermission } from "@/lib/lms-roles";
import { check, fail, formInput, str } from "@/lib/ai/agent/entities/helpers";
import { peek } from "@/lib/ai/agent/records";
import type { ActionDef, AgentUser, EntityDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * Leads (LMS) for the agent. Two things live here, as in the product: website enquiries by category (status, notes, deal value) and
 * managed leads run through a stage workflow with a portal account, owner, messages and interviews; plus job applications and campaigns.
 */

const L = (p: LmsPermission) => (u: AgentUser) => lmsCan({ roles: u.roles, permissionOverrides: u.permissionOverrides }, p);
const LEADS_OR_CAREERS = (u: AgentUser) => L("VIEW_LEADS")(u) || L("VIEW_CAREERS")(u);
const EDIT_LEADS_OR_CAREERS = (u: AgentUser) => L("EDIT_LEADS")(u) || L("MANAGE_CAREERS")(u);

const LEAD_STATUS: string[] = LEAD_STATUSES.map((s) => s.value);
const APP_STATUS: string[] = CAREER_APPLICATION_STATUSES.map((s) => s.value);
const ALL_STAGES = Array.from(new Set(Object.values(LEAD_WORKFLOWS).flat().map((s) => s.key)));
const clampInt = (n: unknown, d: number) => (Number.isFinite(Number(n)) ? Number(n) : d);

async function categoryOfLead(id: string): Promise<CategorySlug | null> {
  const doc = await peek(LEAD, id);
  return doc && typeof doc.category === "string" ? (doc.category as CategorySlug) : null;
}

const LEAD: EntityDef = {
  key: "lms.lead", panel: "lms", label: "Enquiry / lead", description: "Website enquiries by category (every lead category together): name, contact, message, status new/in_progress/completed/rejected, notes, deal value, source and campaign.",
  collection: "leads", titleField: "name", search: ["name", "email", "phone", "message", "campaign", "notes"], read: "staff", allowRead: L("VIEW_LEADS"), allow: L("EDIT_LEADS"),  write: "staff", canDelete: true, hide: ["resume", "attribution"],
  collections: async () => (await getLeadCategories()).categories.map((c) => collectionNameFor(c.slug as CategorySlug)),
  fields: [
    { key: "name", label: "Name", type: "string" },
    { key: "phone", label: "Phone", type: "string" },
    { key: "email", label: "Email", type: "email" },
    { key: "message", label: "Message", type: "text" },
    { key: "subService", label: "Service / sub-category", type: "string" },
    { key: "status", label: "Status", type: "enum", options: LEAD_STATUS },
    { key: "notes", label: "Internal notes", type: "text" },
    { key: "dealValue", label: "Deal value (won amount)", type: "number" },
  ],
  ops: {
    update: async (id, v) => {
      const cat = await categoryOfLead(id);
      if (!cat) return fail("Lead not found.");
      const c = check(validateLeadUpdate(v as never));
      if (!c.ok) return c.error;
      const r = await updateLead(cat, id, c.data);
      return r ? { ok: true, id, record: r } : fail("Lead not found.");
    },
    remove: async (id, u) => {
      if (!L("DELETE_LEADS")(u)) return fail("You don't have permission to delete leads.");
      const cat = await categoryOfLead(id);
      if (!cat) return fail("Lead not found.");
      return (await deleteLead(cat, id)) ? { ok: true, id } : fail("Lead not found.");
    },
  },
};

const MANAGED: EntityDef = {
  key: "lms.managed_lead", panel: "lms", label: "Managed lead", description: "Leads run through a stage workflow (job applicant, intern, trainee, client) with an owner, portal account, messages and timeline.", collection: "lead_records", idType: "string", baseFilter: { deletedAt: null },
  titleField: "name", search: ["name", "email", "phone", "code"], read: "staff", allowRead: L("VIEW_LEADS"), allow: L("EDIT_LEADS"),  write: "staff",
  fields: [
    { key: "name", label: "Name", type: "string", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "string", required: true },
    { key: "type", label: "Lead type", type: "enum", options: [...PORTAL_ROLES], required: true },
    { key: "message", label: "Message / what they want", type: "text" },
  ],
  ops: {
    create: async (v, u) => {
      const name = String(v.name ?? "").trim();
      if (!name || !String(v.email ?? "").trim() || !String(v.phone ?? "").trim()) return fail("Name, email and phone are required.");
      if (!isPortalRole(v.type)) return fail("Pick a valid lead type.");
      const r = await provisionLeadAndAccount({ source: "manual", type: v.type, name, email: String(v.email), phone: String(v.phone), message: str(v.message), actorId: u.id });
      return { ok: true, id: r.leadId, result: `Lead ${r.leadCode} created${r.isNewAccount ? " with a new portal account (the temporary password is shown on the lead's page in LMS)" : ""}.` };
    },
  },
};

const APPLICATION: EntityDef = {
  key: "lms.career_application", panel: "lms", label: "Job application (careers)", description: "Applications from the careers page: candidate, position, status, notes.", collection: "career_applications", titleField: "name", search: ["name", "email", "positionTitle", "notes"],
  read: "staff", allowRead: L("VIEW_CAREERS"), allow: L("MANAGE_CAREERS"),  write: "staff", canDelete: true, hide: ["resume"],
  fields: [
    { key: "status", label: "Status", type: "enum", options: APP_STATUS },
    { key: "notes", label: "Notes", type: "text" },
  ],
  ops: {
    update: async (id, v) => {
      const c = check(validateApplicationUpdate(v as never));
      if (!c.ok) return c.error;
      const r = await updateApplication(id, c.data);
      return r ? { ok: true, id, record: r } : fail("Application not found.");
    },
    remove: async (id) => ((await deleteApplication(id)) ? { ok: true, id } : fail("Application not found.")),
  },
};

export const LMS_ENTITIES: EntityDef[] = [
  LEAD,
  MANAGED,
  APPLICATION,
  { key: "lms.lead_message", panel: "lms", label: "Lead message", description: "The conversation on a managed lead (internal notes and messages to the lead).", collection: "lead_messages", idType: "string", read: "staff", allowRead: L("VIEW_LEADS") },
  { key: "lms.lead_timeline", panel: "lms", label: "Lead timeline", description: "Stage changes, messages, interviews and documents on a managed lead.", collection: "lead_timeline", idType: "string", read: "staff", allowRead: L("VIEW_LEADS") },
  { key: "lms.interview", panel: "lms", label: "Interview", description: "Scheduled interviews for applicants.", collection: "portal_interviews", idType: "string", read: "staff", allowRead: LEADS_OR_CAREERS },
  { key: "lms.campaign", panel: "lms", label: "Campaign", description: "Ad campaigns imported or tracked, with platform and key.", collection: "campaigns", read: "staff", allowRead: canManageCampaigns },
  { key: "lms.campaign_import", panel: "lms", label: "Campaign import", description: "History of campaign performance and lead-list imports (can be undone).", collection: "campaign_imports", read: "staff", allowRead: canManageCampaigns },
];

const INTERVIEW_PARAMS = [
  { key: "title", label: "Title", type: "string" as const, required: true },
  { key: "mode", label: "Mode", type: "enum" as const, options: ["onsite", "video", "phone"], required: true },
  { key: "scheduledAt", label: "Date and time (ISO, e.g. 2026-10-20T11:00)", type: "string" as const, required: true },
  { key: "durationMins", label: "Duration in minutes", type: "number" as const },
  { key: "round", label: "Round", type: "string" as const }, { key: "location", label: "Location", type: "string" as const },
  { key: "meetingLink", label: "Meeting link", type: "string" as const }, { key: "panel", label: "Product / interviewers", type: "string" as const }, { key: "notes", label: "Notes", type: "string" as const },
];

const touchTimeline = (leadId: string, u: { id: string }, kind: string, title: string, detail: string | null, visible: boolean) =>
  recordLeadEvent(leadId, { kind: kind as never, title, detail, actor: "staff", actorId: u.id, visibleToLead: visible });

export const LMS_ACTIONS: ActionDef[] = [
  {
    key: "lms.advance_stage", panel: "lms", label: "Move a managed lead to its next stage", description: "Advance a managed lead along its workflow (notifies the person in their portal). Stages differ by lead type; only reachable stages are accepted.", level: "staff", allow: L("EDIT_LEADS"),
    params: [{ key: "leadId", label: "Managed lead id (lms.managed_lead)", type: "ref", ref: "lms.managed_lead", required: true }, { key: "stage", label: `Stage key (${ALL_STAGES.join(", ")})`, type: "string", required: true }],
    run: async (v, u) => {
      const lead = await getLeadRecord(String(v.leadId));
      if (!lead) return fail("Lead not found.");
      const r = await advanceLeadStage(lead._id, String(v.stage), u.id);
      return r.ok ? { ok: true, id: lead._id, result: `Moved to ${String(v.stage)}.` } : fail(r.error, { reachableStages: nextStageOptions(lead.type, lead.stage).map((s) => s.key) });
    },
  },
  {
    key: "lms.assign_owner", panel: "lms", label: "Assign (or clear) a managed lead's owner", description: "Give a managed lead to a staff member (admin_users id), or leave ownerId out to unassign.", level: "staff", allow: L("EDIT_LEADS"),
    params: [{ key: "leadId", label: "Managed lead id", type: "ref", ref: "lms.managed_lead", required: true }, { key: "ownerId", label: "Staff user id (workspace.user); leave out to unassign", type: "ref", ref: "workspace.user" }],
    run: async (v, u) => {
      const lead = await getLeadRecord(String(v.leadId));
      if (!lead) return fail("Lead not found.");
      await assignLeadOwner(lead._id, str(v.ownerId), u.id);
      return { ok: true, id: lead._id, result: str(v.ownerId) ? "Owner assigned." : "Owner cleared." };
    },
  },
  {
    key: "lms.add_note", panel: "lms", label: "Add an internal note to a managed lead", description: "A staff-only note (not visible to the lead).", level: "staff", allow: L("EDIT_LEADS"),
    params: [{ key: "leadId", label: "Managed lead id", type: "ref", ref: "lms.managed_lead", required: true }, { key: "body", label: "Note", type: "text", required: true }],
    run: async (v, u) => {
      if (!(await getLeadRecord(String(v.leadId)))) return fail("Lead not found.");
      if (!String(v.body ?? "").trim()) return fail("Note is empty.");
      await postLeadMessage({ leadId: String(v.leadId), body: String(v.body), visibility: "internal", channel: "note", authorType: "staff", authorStaffId: u.id });
      return { ok: true, id: String(v.leadId), result: "Note added." };
    },
  },
  {
    key: "lms.send_lead_message", panel: "lms", label: "Send a message to a lead (they see it in their portal)", description: "A message the lead will receive in their portal. Use channel document_request to ask for documents.", level: "staff", allow: L("MESSAGE_LEADS"),
    params: [{ key: "leadId", label: "Managed lead id", type: "ref", ref: "lms.managed_lead", required: true }, { key: "body", label: "Message", type: "text", required: true }, { key: "channel", label: "Kind", type: "enum", options: ["message", "document_request", "interview_reminder"] }],
    run: async (v, u) => {
      if (!(await getLeadRecord(String(v.leadId)))) return fail("Lead not found.");
      if (!String(v.body ?? "").trim()) return fail("Message is empty.");
      await postLeadMessage({ leadId: String(v.leadId), body: String(v.body), visibility: "portal", channel: (str(v.channel) as never) ?? "message", authorType: "staff", authorStaffId: u.id });
      return { ok: true, id: String(v.leadId), result: "Message sent." };
    },
  },
  {
    key: "lms.link_student", panel: "lms", label: "Link a managed lead to a Cohort AI student", description: "So batch, attendance and assignments show in the lead's portal.", level: "staff", allow: L("EDIT_LEADS"),
    params: [{ key: "leadId", label: "Managed lead id", type: "ref", ref: "lms.managed_lead", required: true }, { key: "studentId", label: "Student id (tms.student)", type: "ref", ref: "tms.student", required: true }],
    run: async (v, u) => {
      const lead = await getLeadRecord(String(v.leadId));
      if (!lead) return fail("Lead not found.");
      const student = await getStudent(String(v.studentId).trim());
      if (!student) return fail("No TMS student with that id.");
      await setLeadLink(lead._id, { studentId: student._id }, u.id);
      await mirrorLinkToAccount(lead.externalUserId, { studentId: student._id });
      await touchTimeline(lead._id, u, "linked_student", "Linked to TMS student", `${student.fullName} (${student.studentCode ?? student._id})`, false);
      return { ok: true, id: lead._id, result: `Linked to ${student.fullName}.` };
    },
  },
  {
    key: "lms.link_client", panel: "lms", label: "Link a managed lead to a SprintOS client (and project)", description: "So milestones, meetings and invoices show in the lead's portal.", level: "staff", allow: L("EDIT_LEADS"),
    params: [{ key: "leadId", label: "Managed lead id", type: "ref", ref: "lms.managed_lead", required: true }, { key: "clientId", label: "Client id (pms.client)", type: "ref", ref: "pms.client", required: true }, { key: "projectId", label: "Project id (pms.project, optional)", type: "ref", ref: "pms.project" }],
    run: async (v, u) => {
      const lead = await getLeadRecord(String(v.leadId));
      if (!lead) return fail("Lead not found.");
      const client = await getClient(String(v.clientId).trim());
      if (!client) return fail("No PMS client with that id.");
      let projectId: string | null = null;
      if (str(v.projectId)) {
        const project = await getProject(String(v.projectId).trim());
        if (!project) return fail("No PMS project with that id.");
        if (project.clientId !== client._id) return fail("That project belongs to a different client.");
        projectId = project._id;
      }
      await setLeadLink(lead._id, { clientId: client._id, projectId }, u.id);
      await mirrorLinkToAccount(lead.externalUserId, { clientId: client._id });
      await touchTimeline(lead._id, u, "linked_project", "Linked to PMS client", client.companyName, false);
      return { ok: true, id: lead._id, result: `Linked to ${client.companyName}.` };
    },
  },
  {
    key: "lms.schedule_interview", panel: "lms", label: "Schedule an interview for a job applicant lead", description: "Create the interview, notify the applicant in their portal and log it on the timeline. Only for job-applicant leads.", level: "staff", allow: EDIT_LEADS_OR_CAREERS,
    params: [{ key: "leadId", label: "Managed lead id (job applicant)", type: "ref", ref: "lms.managed_lead", required: true }, ...INTERVIEW_PARAMS],
    run: async (v, u) => {
      const lead = await getLeadRecord(String(v.leadId));
      if (!lead) return fail("Lead not found.");
      if (lead.type !== "job_applicant") return fail("Interviews are only for job applicant leads.");
      const when = new Date(String(v.scheduledAt));
      if (!String(v.title).trim() || isNaN(when.getTime())) return fail("Title and a valid date/time are required.");
      await createInterview(lead.applicationId ?? lead._id, { title: String(v.title), mode: String(v.mode) as InterviewMode, scheduledAt: when.toISOString(), durationMins: clampInt(v.durationMins, 45), round: str(v.round), location: str(v.location), meetingLink: str(v.meetingLink), panel: str(v.panel), notes: str(v.notes) }, u.id, lead._id);
      await touchTimeline(lead._id, u, "interview_scheduled", `Interview scheduled: ${String(v.title)}`, when.toLocaleString(), true);
      await notifyPortalUser({ recipientUserId: lead.externalUserId, type: "interview", title: "Interview scheduled", body: `${String(v.title)} — ${when.toLocaleString()}`, link: "/clientos/interviews" });
      return { ok: true, id: lead._id, result: "Interview scheduled." };
    },
  },
  {
    key: "lms.schedule_application_interview", panel: "lms", label: "Schedule an interview for a careers application", description: "Interview for an application received through the careers page (notifies the applicant's portal).", level: "staff", allow: L("MANAGE_CAREERS"),
    params: [{ key: "applicationId", label: "Application id (lms.career_application)", type: "ref", ref: "lms.career_application", required: true }, ...INTERVIEW_PARAMS],
    run: async (v, u) => {
      const app = await getApplication(String(v.applicationId));
      if (!app) return fail("Application not found.");
      const when = new Date(String(v.scheduledAt));
      if (!String(v.title).trim() || isNaN(when.getTime())) return fail("Title and a valid date/time are required.");
      await createInterview(String(v.applicationId), { title: String(v.title), mode: String(v.mode) as InterviewMode, scheduledAt: when.toISOString(), durationMins: clampInt(v.durationMins, 45), round: str(v.round), location: str(v.location), meetingLink: str(v.meetingLink), panel: str(v.panel), notes: str(v.notes) }, u.id);
      const { externalUsers } = await import("@/lib/portal-auth");
      const account = await (await externalUsers()).findOne({ role: "job_applicant", applicationId: String(v.applicationId) });
      if (account) await notifyPortalUser({ recipientUserId: account._id, type: "interview", title: "Interview scheduled", body: `${String(v.title)} — ${when.toLocaleString()}`, link: "/clientos/interviews" });
      return { ok: true, result: "Interview scheduled." };
    },
  },
  {
    key: "lms.set_interview_status", panel: "lms", label: "Mark an interview scheduled / completed / cancelled", description: "Update an interview's status.", level: "staff", allow: EDIT_LEADS_OR_CAREERS,
    params: [{ key: "interviewId", label: "Interview id (lms.interview)", type: "ref", ref: "lms.interview", required: true }, { key: "status", label: "Status", type: "enum", options: ["scheduled", "completed", "cancelled"], required: true }],
    run: async (v) => {
      await updateInterviewStatus(String(v.interviewId), String(v.status) as InterviewStatus);
      return { ok: true, id: String(v.interviewId), result: `Interview marked ${String(v.status)}.` };
    },
  },
  {
    key: "lms.remove_interview", panel: "lms", label: "Delete an interview", description: "Remove an interview record.", level: "staff", allow: EDIT_LEADS_OR_CAREERS, destructive: true,
    params: [{ key: "interviewId", label: "Interview id (lms.interview)", type: "ref", ref: "lms.interview", required: true }],
    run: async (v) => {
      await deleteInterview(String(v.interviewId));
      return { ok: true, id: String(v.interviewId), result: "Interview deleted." };
    },
  },
  {
    key: "lms.bulk_update_lead_status", panel: "lms", label: "Change the status of many enquiries at once", description: "Set the same status on a list of enquiries (ids from lms.lead).", level: "staff", allow: L("EDIT_LEADS"),
    params: [{ key: "ids", label: "Lead ids (lms.lead)", type: "stringList", required: true }, { key: "status", label: "Status", type: "enum", options: LEAD_STATUS, required: true }],
    run: async (v) => {
      const c = check(validateLeadUpdate({ status: v.status } as never));
      if (!c.ok) return c.error;
      let updated = 0;
      for (const id of (v.ids as string[]).slice(0, 200)) {
        const cat = await categoryOfLead(id);
        if (cat && (await updateLead(cat, id, c.data))) updated += 1;
      }
      return updated ? { ok: true, result: `${updated} enquir${updated === 1 ? "y" : "ies"} updated.` } : fail("None of those enquiries were found.");
    },
  },
  {
    key: "lms.bulk_delete_leads", panel: "lms", label: "Delete many enquiries", description: "Permanently delete enquiries (ids from lms.lead).", level: "staff", allow: L("DELETE_LEADS"), destructive: true,
    params: [{ key: "ids", label: "Lead ids (lms.lead)", type: "stringList", required: true }],
    run: async (v) => {
      let deleted = 0;
      for (const id of (v.ids as string[]).slice(0, 200)) {
        const cat = await categoryOfLead(id);
        if (cat && (await deleteLead(cat, id))) deleted += 1;
      }
      return deleted ? { ok: true, result: `${deleted} enquir${deleted === 1 ? "y" : "ies"} deleted.` } : fail("None of those enquiries were found.");
    },
  },
  {
    key: "lms.bulk_update_application_status", panel: "lms", label: "Change the status of many job applications", description: "Set the same status on a list of careers applications.", level: "staff", allow: L("MANAGE_CAREERS"),
    params: [{ key: "ids", label: "Application ids (lms.career_application)", type: "stringList", required: true }, { key: "status", label: "Status", type: "enum", options: APP_STATUS, required: true }],
    run: async (v) => {
      const c = check(validateApplicationUpdate({ status: v.status } as never));
      if (!c.ok) return c.error;
      let updated = 0;
      for (const id of (v.ids as string[]).slice(0, 200)) if (await updateApplication(id, c.data)) updated += 1;
      return updated ? { ok: true, result: `${updated} application(s) updated.` } : fail("None of those applications were found.");
    },
  },
  {
    key: "lms.assign_campaign", panel: "lms", label: "Attribute enquiries to a campaign", description: "Tag a list of enquiries with an ad platform and campaign name.", level: "staff", allow: canManageCampaigns,
    params: [{ key: "targets", label: "Enquiries: [{category, id}]", type: "json", required: true }, { key: "platform", label: "Platform (e.g. meta, google, linkedin)", type: "string", required: true }, { key: "campaignName", label: "Campaign name", type: "string" }],
    run: async (v) => {
      if (!isValidPlatform(String(v.platform))) return fail("Unknown platform.");
      const name = String(v.campaignName ?? "").trim().slice(0, 200);
      const targets = (Array.isArray(v.targets) ? (v.targets as Json[]) : []).map((t) => ({ category: String(t.category), id: String(t.id) })).filter((t): t is { category: CategorySlug; id: string } => isValidCategory(t.category));
      if (!targets.length) return fail("No valid leads selected.");
      const updated = await assignLeadsCampaign(targets, String(v.platform), name || undefined, campaignKeyFor(name));
      return { ok: true, result: `${updated} enquir${updated === 1 ? "y" : "ies"} updated.` };
    },
  },
  {
    key: "lms.undo_campaign_import", panel: "lms", label: "Undo a campaign import", description: "Remove everything a campaign performance / lead-list import added.", level: "staff", allow: canManageCampaigns, destructive: true,
    params: [{ key: "importId", label: "Import id (lms.campaign_import)", type: "ref", ref: "lms.campaign_import", required: true }],
    run: async (v) => {
      const r = await undoImport(String(v.importId));
      return r.error ? fail(r.error) : { ok: true, result: "Import undone." };
    },
  },
];

export const LMS_REPORTS: ReportDef[] = [
  {
    key: "lms.dashboard", panel: "lms", label: "Lead dashboard numbers", description: "Totals and trends of enquiries across categories: new, in progress, completed, rejected, sources, growth.", level: "staff", allow: canViewLmsAnalytics,
    params: [{ key: "dateFrom", label: "From", type: "dateString" }, { key: "dateTo", label: "To", type: "dateString" }, { key: "status", label: "Status", type: "enum", options: LEAD_STATUS }, { key: "source", label: "Source", type: "string" }],
    run: async (v) => (await getDashboardStats({ dateFrom: v.dateFrom ? new Date(String(v.dateFrom)) : undefined, dateTo: v.dateTo ? new Date(`${String(v.dateTo)}T23:59:59`) : undefined, status: str(v.status) as never, source: str(v.source) ?? undefined })) as unknown as Json,
  },
  { key: "lms.stale_leads", panel: "lms", label: "Leads nobody has touched", description: "Enquiries left untouched past the stale threshold (follow-ups at risk).", level: "staff", allow: L("VIEW_LEADS"), params: [], run: async () => (await getStaleLeadsSummary()) as unknown as Json },
  { key: "lms.recent_leads", panel: "lms", label: "Recent enquiries", description: "Enquiries that arrived in the last few days.", level: "staff", allow: L("VIEW_LEADS"), params: [{ key: "days", label: "Days (default 2)", type: "number" }], run: async (v) => (await getRecentLeadsSummary(clampInt(v.days, 2))) as unknown as Json },
  { key: "lms.managed_lead_stats", panel: "lms", label: "Managed lead pipeline", description: "Managed leads: total, open, by type and stage, unassigned.", level: "staff", allow: L("VIEW_LEADS"), params: [], run: async () => (await getLeadStats()) as unknown as Json },
  {
    key: "lms.campaign_analytics", panel: "lms", label: "Campaign performance", description: "Spend, impressions, clicks, leads, cost per lead and ROI per campaign and platform.", level: "staff", allow: canManageCampaigns,
    params: [{ key: "platform", label: "Platform", type: "string" }, { key: "campaignKey", label: "Campaign key", type: "string" }, { key: "dateFrom", label: "From", type: "dateString" }, { key: "dateTo", label: "To", type: "dateString" }],
    run: async (v) => (await getCampaignAnalytics({ platform: str(v.platform) as never, campaignKey: str(v.campaignKey) ?? undefined, dateFrom: v.dateFrom ? new Date(String(v.dateFrom)) : undefined, dateTo: v.dateTo ? new Date(`${String(v.dateTo)}T23:59:59`) : undefined })) as unknown as Json,
  },
];
void getLead; void formInput;
