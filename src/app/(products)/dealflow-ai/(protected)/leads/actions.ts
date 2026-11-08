"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLms } from "@/lib/lms-auth";
import type { LmsPermission } from "@/lib/lms-roles";
import {
  advanceLeadStage,
  assignLeadOwner,
  getLeadRecord,
  setLeadLink,
  mirrorLinkToAccount,
  clearLeadPortalUnread,
  setLeadDoNotContact,
} from "@/lib/lead-management/records";
import { postLeadMessage } from "@/lib/lead-management/messages";
import { recordLeadEvent } from "@/lib/lead-management/timeline";
import { provisionLeadAndAccount } from "@/lib/lead-management/provision";
import { isPortalRole } from "@/lib/portal-roles";
import type { LeadMessageAttachment } from "@/lib/lead-management/types";
import { getStudent } from "@/lib/products/cohort-ai/students";
import { getClient } from "@/lib/products/sprintos/clients";
import { getProject } from "@/lib/products/sprintos/projects";
import {
  createInterview,
  updateInterviewStatus,
  deleteInterview,
  listInterviewsForLead,
  type InterviewMode,
  type InterviewStatus,
  type SerializedInterview,
} from "@/lib/products/clientos/interviews";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { sharePortalDocument, deletePortalDocument } from "@/lib/products/clientos/documents";

async function requireLmsUser(permission: LmsPermission) {
  const u = await requireLms(permission);
  if (!u) throw new Error("Forbidden");
  return u;
}

function touch(id: string) {
  revalidatePath(`/dealflow-ai/leads/${id}`);
  revalidatePath("/dealflow-ai/leads");
  revalidatePath("/dealflow-ai/leads/list");
}

export async function advanceLeadStageAction(leadId: string, toStage: string): Promise<{ error?: string }> {
  const user = await requireLmsUser("EDIT_LEADS");
  const res = await advanceLeadStage(leadId, toStage, user.id);
  if (!res.ok) return { error: res.error };
  touch(leadId);
  return {};
}

export async function assignLeadToMeAction(leadId: string, unassign: boolean): Promise<{ error?: string }> {
  const user = await requireLmsUser("EDIT_LEADS");
  await assignLeadOwner(leadId, unassign ? null : user.id, user.id);
  touch(leadId);
  return {};
}

export async function setLeadDoNotContactAction(leadId: string, doNotContact: boolean): Promise<{ error?: string }> {
  const user = await requireLmsUser("EDIT_LEADS");
  if (typeof leadId !== "string" || typeof doNotContact !== "boolean") return { error: "Invalid request." };
  if (!(await setLeadDoNotContact(leadId, doNotContact, user.id))) return { error: "Lead not found." };
  touch(leadId);
  return {};
}

export async function addLeadNoteAction(leadId: string, body: string): Promise<{ error?: string }> {
  const user = await requireLmsUser("EDIT_LEADS");
  if (!body.trim()) return { error: "Note is empty." };
  await postLeadMessage({ leadId, body, visibility: "internal", channel: "note", authorType: "staff", authorStaffId: user.id });
  touch(leadId);
  return {};
}

export async function sendLeadMessageAction(
  leadId: string,
  body: string,
  channel: "message" | "document_request" | "interview_reminder",
  attachments?: LeadMessageAttachment[]
): Promise<{ error?: string }> {
  const user = await requireLmsUser("MESSAGE_LEADS");
  if (!body.trim() && !attachments?.length) return { error: "Message is empty." };
  await postLeadMessage({ leadId, body, visibility: "portal", channel, authorType: "staff", authorStaffId: user.id, attachments });
  touch(leadId);
  return {};
}

/** Staff opened the Communication Center — clears the "new portal reply" flag on the leads list. */
export async function clearLeadUnreadAction(leadId: string): Promise<{ error?: string }> {
  const user = await requireLmsUser("VIEW_LEADS");
  await clearLeadPortalUnread(leadId, user.id);
  return {};
}

export async function linkStudentAction(leadId: string, studentId: string): Promise<{ error?: string }> {
  const user = await requireLmsUser("EDIT_LEADS");
  const lead = await getLeadRecord(leadId);
  if (!lead) return { error: "Lead not found." };
  const student = await getStudent(studentId.trim());
  if (!student) return { error: "No Cohort AI student with that ID." };
  await setLeadLink(leadId, { studentId: student._id }, user.id);
  await mirrorLinkToAccount(lead.externalUserId, { studentId: student._id });
  await recordLeadEvent(leadId, {
    kind: "linked_student",
    title: "Linked to Cohort AI student",
    detail: `${student.fullName} (${student.studentCode ?? student._id})`,
    actor: "staff",
    actorId: user.id,
    visibleToLead: false,
  });
  touch(leadId);
  return {};
}

export async function linkClientAction(leadId: string, clientId: string, projectId: string): Promise<{ error?: string }> {
  const user = await requireLmsUser("EDIT_LEADS");
  const lead = await getLeadRecord(leadId);
  if (!lead) return { error: "Lead not found." };
  const client = await getClient(clientId.trim());
  if (!client) return { error: "No SprintOS client with that ID." };
  let linkedProjectId: string | null = null;
  if (projectId.trim()) {
    const project = await getProject(projectId.trim());
    if (!project) return { error: "No SprintOS project with that ID." };
    if (project.clientId !== client._id) return { error: "That project belongs to a different client." };
    linkedProjectId = project._id;
  }
  await setLeadLink(leadId, { clientId: client._id, projectId: linkedProjectId }, user.id);
  await mirrorLinkToAccount(lead.externalUserId, { clientId: client._id });
  await recordLeadEvent(leadId, {
    kind: "linked_project",
    title: "Linked to SprintOS client",
    detail: client.companyName,
    actor: "staff",
    actorId: user.id,
    visibleToLead: false,
  });
  touch(leadId);
  return {};
}

export async function addLeadInterviewAction(
  leadId: string,
  input: {
    title: string;
    mode: InterviewMode;
    scheduledAt: string;
    durationMins: number;
    round?: string;
    location?: string;
    meetingLink?: string;
    panel?: string;
    notes?: string;
  }
): Promise<{ error?: string }> {
  const user = await requireLmsUser("EDIT_LEADS");
  const lead = await getLeadRecord(leadId);
  if (!lead) return { error: "Lead not found." };
  if (lead.type !== "job_applicant") return { error: "Interviews are only for job applicant leads." };
  if (!input.title.trim() || !input.scheduledAt) return { error: "Title and date/time are required." };

  await createInterview(
    lead.applicationId ?? leadId,
    {
      title: input.title,
      mode: input.mode,
      scheduledAt: new Date(input.scheduledAt).toISOString(),
      durationMins: input.durationMins,
      round: input.round ?? null,
      location: input.location ?? null,
      meetingLink: input.meetingLink ?? null,
      panel: input.panel ?? null,
      notes: input.notes ?? null,
    },
    user.id,
    leadId
  );
  await recordLeadEvent(leadId, {
    kind: "interview_scheduled",
    title: `Interview scheduled: ${input.title}`,
    detail: new Date(input.scheduledAt).toLocaleString(),
    actor: "staff",
    actorId: user.id,
    visibleToLead: true,
  });
  await notifyPortalUser({
    recipientUserId: lead.externalUserId,
    type: "interview",
    title: "Interview scheduled",
    body: `${input.title} — ${new Date(input.scheduledAt).toLocaleString()}`,
    link: "/clientos/interviews",
  });
  touch(leadId);
  return {};
}

export async function setLeadInterviewStatusAction(
  leadId: string,
  interviewId: string,
  status: InterviewStatus
): Promise<{ error?: string }> {
  const user = await requireLmsUser("EDIT_LEADS");
  await updateInterviewStatus(interviewId, status);
  await recordLeadEvent(leadId, {
    kind: "interview_updated",
    title: `Interview marked ${status}`,
    actor: "staff",
    actorId: user.id,
    visibleToLead: true,
  });
  touch(leadId);
  return {};
}

export async function removeLeadInterviewAction(leadId: string, interviewId: string): Promise<{ error?: string }> {
  await requireLmsUser("EDIT_LEADS");
  await deleteInterview(interviewId);
  touch(leadId);
  return {};
}

export async function listLeadInterviewsAction(leadId: string): Promise<SerializedInterview[]> {
  await requireLmsUser("VIEW_LEADS");
  const lead = await getLeadRecord(leadId);
  return listInterviewsForLead(leadId, lead?.applicationId ?? null);
}

export async function shareLeadDocumentAction(leadId: string, formData: FormData): Promise<{ error?: string }> {
  const user = await requireLmsUser("EDIT_LEADS");
  const lead = await getLeadRecord(leadId);
  if (!lead) return { error: "Lead not found." };
  const file = formData.get("file");
  const category = String(formData.get("category") ?? "General").trim() || "General";
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (file.size > 15 * 1024 * 1024) return { error: "File must be 15 MB or smaller." };

  await sharePortalDocument(lead.externalUserId, file, { category, uploadedBy: user.id, leadId });
  await recordLeadEvent(leadId, {
    kind: "document_shared",
    title: `Shared: ${file.name}`,
    detail: category,
    actor: "staff",
    actorId: user.id,
    visibleToLead: true,
  });
  await notifyPortalUser({
    recipientUserId: lead.externalUserId,
    type: "document",
    title: "A document was shared with you",
    body: `${category}: ${file.name}`,
    link: "/clientos/documents",
  });
  touch(leadId);
  return {};
}

export async function deleteLeadDocumentAction(leadId: string, docId: string): Promise<{ error?: string }> {
  await requireLmsUser("EDIT_LEADS");
  const lead = await getLeadRecord(leadId);
  if (!lead) return { error: "Lead not found." };
  await deletePortalDocument(docId, lead.externalUserId);
  touch(leadId);
  return {};
}

export async function createManualLeadAction(input: {
  name: string;
  email: string;
  phone: string;
  type: string;
  message?: string;
}): Promise<{ error?: string; leadId?: string }> {
  const user = await requireLmsUser("CREATE_LEADS");
  const { name, email, phone, type } = input;
  if (!name.trim() || !email.trim() || !phone.trim()) return { error: "Name, email and phone are required." };
  if (!isPortalRole(type)) return { error: "Pick a valid lead type." };
  const result = await provisionLeadAndAccount({
    source: "manual",
    type,
    name,
    email,
    phone,
    message: input.message ?? null,
    actorId: user.id,
  });
  revalidatePath("/dealflow-ai/leads");
  redirect(`/dealflow-ai/leads/${result.leadId}`);
}
