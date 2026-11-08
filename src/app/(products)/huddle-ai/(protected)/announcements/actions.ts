"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { canPostAnnouncements } from "@/lib/messenger-roles";
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  archiveAnnouncement,
  publishAnnouncement,
  getAnnouncement,
  markAnnouncementRead,
  type AnnouncementAudience,
  type AnnouncementPriority,
} from "@/lib/products/huddle-ai/announcements";
import type { Attachment } from "@/lib/products/huddle-ai/attachments";

async function requireAuthor() {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");
  if (!canPostAnnouncements(user)) throw new Error("Forbidden");
  return user;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  priority: AnnouncementPriority;
  attachments: Attachment[];
  audience: AnnouncementAudience;
  scheduledFor: string | null;
  requireConfirmation: boolean;
  crossPost: boolean;
  publishNow: boolean;
}

export async function saveAnnouncementAction(
  input: AnnouncementInput,
  id?: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await requireAuthor();

  const title = input.title?.trim() ?? "";
  if (title.length < 3) return { ok: false, error: "Give the announcement a title." };
  if (!input.body?.trim()) return { ok: false, error: "The announcement body is empty." };

  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  if (scheduledFor && Number.isNaN(scheduledFor.getTime())) return { ok: false, error: "Invalid schedule date." };

  const data = {
    title,
    body: input.body,
    priority: input.priority,
    attachments: Array.isArray(input.attachments) ? input.attachments.slice(0, 10) : [],
    audience: input.audience,
    scheduledFor: input.publishNow ? null : scheduledFor,
    requireConfirmation: !!input.requireConfirmation,
    crossPost: input.crossPost !== false,
  };

  let announcementId = id;
  if (id) {
    const existing = await getAnnouncement(id);
    if (!existing || existing.authorId !== user.id) return { ok: false, error: "Announcement not found." };
    await updateAnnouncement(id, data, user.id);
  } else {
    const created = await createAnnouncement(data, user.id);
    announcementId = created._id;
  }

  if (input.publishNow && announcementId) {
    await publishAnnouncement(announcementId, user.id);
  }

  revalidatePath("/huddle-ai/announcements");
  return { ok: true, id: announcementId };
}

export async function publishAnnouncementAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireAuthor();
  const existing = await getAnnouncement(id);
  if (!existing || existing.authorId !== user.id) return { ok: false, error: "Announcement not found." };
  await publishAnnouncement(id, user.id);
  revalidatePath("/huddle-ai/announcements");
  revalidatePath(`/huddle-ai/announcements/${id}`);
  return { ok: true };
}

export async function deleteAnnouncementAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireAuthor();
  const existing = await getAnnouncement(id);
  if (existing && existing.authorId === user.id) await deleteAnnouncement(id, user.id);
  revalidatePath("/huddle-ai/announcements");
  return { ok: true };
}

export async function archiveAnnouncementAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireAuthor();
  const existing = await getAnnouncement(id);
  if (existing && existing.authorId === user.id) await archiveAnnouncement(id, user.id);
  revalidatePath("/huddle-ai/announcements");
  return { ok: true };
}

export async function acknowledgeAnnouncementAction(id: string): Promise<{ ok: boolean }> {
  const user = await getCurrentChatUser();
  if (!user) return { ok: false };
  await markAnnouncementRead(id, user.id);
  revalidatePath(`/huddle-ai/announcements/${id}`);
  return { ok: true };
}
