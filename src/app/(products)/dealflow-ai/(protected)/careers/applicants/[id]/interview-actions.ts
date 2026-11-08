"use server";

import { revalidatePath } from "next/cache";
import { requireLms } from "@/lib/lms-auth";
import type { LmsPermission } from "@/lib/lms-roles";
import {
  createInterview,
  deleteInterview,
  updateInterviewStatus,
  listInterviewsForApplication,
  type InterviewMode,
  type InterviewStatus,
  type SerializedInterview,
} from "@/lib/products/clientos/interviews";
import { getApplication } from "@/lib/career-applications";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { externalUsers } from "@/lib/portal-auth";

async function requireLmsUser(permission: LmsPermission) {
  const u = await requireLms(permission);
  if (!u) throw new Error("Forbidden");
  return u;
}

async function notifyApplicant(applicationId: string, title: string, body: string) {
  const account = await (await externalUsers()).findOne({ role: "job_applicant", applicationId });
  if (account) await notifyPortalUser({ recipientUserId: account._id, type: "interview", title, body, link: "/clientos/interviews" });
}

export async function addInterviewAction(
  applicationId: string,
  input: { title: string; mode: InterviewMode; scheduledAt: string; durationMins: number; round?: string; location?: string; meetingLink?: string; panel?: string; notes?: string }
): Promise<{ error?: string }> {
  const u = await requireLmsUser("MANAGE_CAREERS");
  if (!input.title.trim() || !input.scheduledAt) return { error: "Title and date/time are required." };
  const app = await getApplication(applicationId);
  if (!app) return { error: "Application not found." };

  await createInterview(
    applicationId,
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
    u.id
  );
  await notifyApplicant(applicationId, "Interview scheduled", `${input.title} — ${new Date(input.scheduledAt).toLocaleString()}`);
  revalidatePath(`/dealflow-ai/careers/applicants/${applicationId}`);
  return {};
}

export async function setInterviewStatusAction(applicationId: string, interviewId: string, status: InterviewStatus): Promise<{ error?: string }> {
  await requireLmsUser("MANAGE_CAREERS");
  await updateInterviewStatus(interviewId, status);
  revalidatePath(`/dealflow-ai/careers/applicants/${applicationId}`);
  return {};
}

export async function removeInterviewAction(applicationId: string, interviewId: string): Promise<{ error?: string }> {
  await requireLmsUser("MANAGE_CAREERS");
  await deleteInterview(interviewId);
  revalidatePath(`/dealflow-ai/careers/applicants/${applicationId}`);
  return {};
}

export async function listInterviewsAction(applicationId: string): Promise<SerializedInterview[]> {
  await requireLmsUser("VIEW_CAREERS");
  return listInterviewsForApplication(applicationId);
}
