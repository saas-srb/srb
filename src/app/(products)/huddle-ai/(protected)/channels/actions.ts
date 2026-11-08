"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { canCreateTeamChannel, isChatAdmin } from "@/lib/messenger-roles";
import {
  createChannel,
  getChannel,
  getChannelBySlug,
  getMembership,
  joinChannel,
  addMembers,
  removeMember,
  setMemberRole,
  updateChannel,
  archiveChannel,
  type ChannelVisibility,
  type MemberRole,
} from "@/lib/products/huddle-ai/channels";
import { recordAudit } from "@/lib/products/huddle-ai/audit";

async function requireUser() {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");
  return user;
}

export async function createChannelAction(input: {
  name: string;
  description?: string;
  visibility: ChannelVisibility;
  memberIds?: string[];
}): Promise<{ error: string } | never> {
  const user = await requireUser();
  if (!canCreateTeamChannel(user)) return { error: "You don't have permission to create channels." };
  const name = input.name.trim();
  if (name.length < 2) return { error: "Give the channel a name." };

  const channel = await createChannel(
    { kind: "team", name, description: input.description, visibility: input.visibility, memberIds: input.memberIds },
    user.id
  );
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "channel",
    entityId: channel._id,
    entityLabel: channel.name,
    summary: `${input.visibility} team channel`,
  });
  revalidatePath("/huddle-ai/channels", "layout");
  redirect(`/huddle-ai/channels/${channel.slug}`);
}

export async function joinChannelAction(slug: string): Promise<{ error: string } | never> {
  const user = await requireUser();
  const channel = await getChannelBySlug(slug);
  if (!channel) return { error: "Channel not found." };
  if (channel.visibility === "private" && !isChatAdmin(user)) {
    return { error: "This channel is private — ask a member to add you." };
  }
  await joinChannel(channel._id, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "join", entity: "channel", entityId: channel._id, entityLabel: channel.name });
  revalidatePath("/huddle-ai/channels", "layout");
  redirect(`/huddle-ai/channels/${channel.slug}`);
}

export async function addChannelMembersAction(channelId: string, userIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const channel = await getChannel(channelId);
  if (!channel) return { ok: false, error: "Channel not found." };
  const membership = await getMembership(channelId, user.id);
  if (!isChatAdmin(user) && membership?.role !== "owner" && membership?.role !== "admin" && channel.visibility === "private") {
    return { ok: false, error: "Only channel admins can add members to a private channel." };
  }
  await addMembers(channelId, userIds, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "add_member", entity: "channel_member", entityId: channelId, entityLabel: channel.name, metadata: { userIds } });
  revalidatePath("/huddle-ai/channels", "layout");
  return { ok: true };
}

export async function removeChannelMemberAction(channelId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const channel = await getChannel(channelId);
  if (!channel) return { ok: false, error: "Channel not found." };
  const membership = await getMembership(channelId, user.id);
  const canModerate = isChatAdmin(user) || membership?.role === "owner" || membership?.role === "admin";
  if (!canModerate && targetUserId !== user.id) return { ok: false, error: "You can only remove yourself." };
  await removeMember(channelId, targetUserId, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "remove_member", entity: "channel_member", entityId: channelId, entityLabel: channel.name, metadata: { targetUserId } });
  revalidatePath("/huddle-ai/channels", "layout");
  return { ok: true };
}

export async function setChannelMemberRoleAction(channelId: string, targetUserId: string, role: MemberRole): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const membership = await getMembership(channelId, user.id);
  if (!isChatAdmin(user) && membership?.role !== "owner") return { ok: false, error: "Only the channel owner can change roles." };
  await setMemberRole(channelId, targetUserId, role, user.id);
  revalidatePath("/huddle-ai/channels", "layout");
  return { ok: true };
}

export async function updateChannelAction(
  channelId: string,
  patch: { name?: string; description?: string; topic?: string; visibility?: ChannelVisibility }
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const channel = await getChannel(channelId);
  if (!channel) return { ok: false, error: "Channel not found." };
  const membership = await getMembership(channelId, user.id);
  const canEdit = isChatAdmin(user) || membership?.role === "owner" || membership?.role === "admin";
  if (!canEdit) return { ok: false, error: "You don't have permission to edit this channel." };
  await updateChannel(channelId, patch, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "channel", entityId: channelId, entityLabel: channel.name });
  revalidatePath("/huddle-ai/channels", "layout");
  return { ok: true };
}

export async function archiveChannelAction(channelId: string, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const channel = await getChannel(channelId);
  if (!channel) return { ok: false, error: "Channel not found." };
  const membership = await getMembership(channelId, user.id);
  if (!isChatAdmin(user) && membership?.role !== "owner") return { ok: false, error: "Only the channel owner can archive it." };
  await archiveChannel(channelId, user.id, archived);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: archived ? "archive" : "unarchive", entity: "channel", entityId: channelId, entityLabel: channel.name });
  revalidatePath("/huddle-ai/channels", "layout");
  return { ok: true };
}
