"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import {
  createMeeting,
  updateMeeting,
  cancelMeeting,
  addInvitees,
  setRsvp,
  joinMeeting,
  leaveMeeting,
  endMeeting,
  getMeeting,
  canAccessMeeting,
  type MeetingKind,
  type Rsvp,
} from "@/lib/products/huddle-ai/meetings";

async function requireUser() {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");
  return user;
}

export interface MeetingFormInput {
  title: string;
  description?: string;
  kind: MeetingKind;
  startAt?: string;
  durationMins: number;
  inviteeIds: string[];
  recordingEnabled: boolean;
  screenShareEnabled: boolean;
}

export async function createMeetingAction(input: MeetingFormInput): Promise<{ error: string } | never> {
  const user = await requireUser();
  const title = input.title?.trim() ?? "";
  if (title.length < 2) return { error: "Give the meeting a title." };

  let startAt = new Date();
  if (input.kind === "scheduled") {
    if (!input.startAt) return { error: "Pick a start time." };
    startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime())) return { error: "Invalid start time." };
  }

  const meeting = await createMeeting(
    {
      title,
      description: input.description || null,
      kind: input.kind,
      startAt,
      durationMins: Number(input.durationMins) || 30,
      inviteeIds: Array.isArray(input.inviteeIds) ? input.inviteeIds : [],
      recordingEnabled: !!input.recordingEnabled,
      screenShareEnabled: !!input.screenShareEnabled,
    },
    user.id
  );

  revalidatePath("/huddle-ai/meetings");
  redirect(input.kind === "instant" ? `/huddle-ai/meetings/${meeting._id}/room` : `/huddle-ai/meetings/${meeting._id}`);
}

export async function updateMeetingAction(
  id: string,
  patch: { title?: string; description?: string; startAt?: string; durationMins?: number; recordingEnabled?: boolean; screenShareEnabled?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    await updateMeeting(
      id,
      {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.startAt ? { startAt: new Date(patch.startAt) } : {}),
        ...(patch.durationMins !== undefined ? { durationMins: patch.durationMins } : {}),
        ...(patch.recordingEnabled !== undefined ? { recordingEnabled: patch.recordingEnabled } : {}),
        ...(patch.screenShareEnabled !== undefined ? { screenShareEnabled: patch.screenShareEnabled } : {}),
      },
      user.id
    );
    revalidatePath(`/huddle-ai/meetings/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update." };
  }
}

export async function addMeetingInviteesAction(id: string, userIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    await addInvitees(id, userIds, user.id);
    revalidatePath(`/huddle-ai/meetings/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add people." };
  }
}

export async function cancelMeetingAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    await cancelMeeting(id, user.id);
    revalidatePath("/huddle-ai/meetings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not cancel." };
  }
}

export async function setRsvpAction(id: string, rsvp: Rsvp): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await setRsvp(id, user.id, rsvp);
  revalidatePath(`/huddle-ai/meetings/${id}`);
  return { ok: true };
}

export async function joinMeetingAction(id: string): Promise<{ error: string } | never> {
  const user = await requireUser();
  const meeting = await getMeeting(id);
  if (!meeting || !(await canAccessMeeting(meeting, user))) return { error: "You're not invited to this meeting." };
  try {
    await joinMeeting(id, user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not join." };
  }

  // A meeting is a call scoped to its linked group channel — start or reuse one
  // and drop the joiner into the shared call room.
  if (!meeting.channelId) return { error: "This meeting has no room." };
  const { startCall } = await import("@/lib/products/huddle-ai/calls");
  const result = await startCall({
    scope: { type: "channel", id: meeting.channelId },
    mode: "video",
    initiatorId: user.id,
    meetingId: id,
  });
  if (!result.ok) return { error: result.error };
  redirect(`/huddle-ai/call/${result.call._id}`);
}

export async function leaveMeetingAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await leaveMeeting(id, user.id);
  revalidatePath(`/huddle-ai/meetings/${id}`);
  return { ok: true };
}

export async function endMeetingAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    await endMeeting(id, user.id);
    revalidatePath(`/huddle-ai/meetings/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not end." };
  }
}
