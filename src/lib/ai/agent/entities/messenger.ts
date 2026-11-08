import "server-only";
import * as Channels from "@/app/(products)/huddle-ai/(protected)/channels/actions";
import * as Groups from "@/app/(products)/huddle-ai/(protected)/groups/actions";
import * as Ann from "@/app/(products)/huddle-ai/(protected)/announcements/actions";
import * as Meet from "@/app/(products)/huddle-ai/(protected)/meetings/actions";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { resolveScope } from "@/lib/products/huddle-ai/route-helpers";
import { postMessage, listMessages } from "@/lib/products/huddle-ai/messages";
import { advanceChannelRead, listMemberChannels, listBrowsableChannels } from "@/lib/products/huddle-ai/channels";
import { advanceDirectRead, getOrCreateDirect, listConversationsForUser, serializeConversations } from "@/lib/products/huddle-ai/conversations";
import { listForViewer, listForAuthor } from "@/lib/products/huddle-ai/announcements";
import { listMeetingsForUser } from "@/lib/products/huddle-ai/meetings";
import { searchUsers } from "@/lib/products/huddle-ai/users";
import { getChatUser } from "@/lib/products/huddle-ai/users";
import { canPostAnnouncements, canCreateTeamChannel } from "@/lib/messenger-roles";
import { getDb } from "@/lib/mongodb";
import { viaAction, f, fail, str } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, FieldDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * Team chat (Messenger) for the agent: read what happened in the channels and conversations the person is in, post messages, run channels,
 * groups, announcements and meetings. It only ever sees conversations the person is a member of (private DMs are theirs alone).
 */

const chatCtx = (u: AgentUser) => ({ roles: u.roles, permissionOverrides: u.permissionOverrides });
const memberScope = async (u: AgentUser): Promise<Json | null> => {
  const rows = await (await getDb()).collection<{ channelId: string }>("channel_members").find({ userId: u.id }, { projection: { channelId: 1 } }).toArray();
  const ids = rows.map((r) => r.channelId);
  return { $or: [{ visibility: "public", kind: "team" }, { _id: { $in: ids } }] };
};

export const MESSENGER_ENTITIES: EntityDef[] = [
  { key: "messenger.channel", panel: "messenger", label: "Channel / group", description: "Team channels, project channels and groups you can see (public ones plus those you belong to).", collection: "chat_channels", idType: "string", titleField: "name", search: ["name", "topic", "description"], read: "any", scope: memberScope, baseFilter: { archived: { $ne: true } } },
  { key: "messenger.meeting", panel: "messenger", label: "Meeting", description: "Meetings you host or are invited to.", collection: "chat_meetings", idType: "string", titleField: "title", search: ["title"], read: "any", scope: async (u) => ({ $or: [{ hostId: u.id }, { inviteeIds: u.id }] }) },
  { key: "messenger.activity", panel: "messenger", label: "Audit log", description: "Who changed what in Messenger.", collection: "chat_activity_logs", idType: "string", search: ["entityLabel", "summary", "actorEmail"], read: "admin" },
];

const act = (key: string, label: string, description: string, params: FieldDef[], run: (v: Json, u: AgentUser) => Promise<unknown>, success: string, opts: { destructive?: boolean; allow?: (u: AgentUser) => boolean } = {}): ActionDef => ({
  key, panel: "messenger", label, description, params, level: "any", allow: opts.allow, destructive: opts.destructive, run: (v, u) => viaAction(() => run(v, u), success),
});

const CH_VIS = ["public", "private"];

export const MESSENGER_ACTIONS: ActionDef[] = [
  act("messenger.send_message", "Send a chat message", "Post a message to a channel/group (scopeType channel) or a direct conversation (scopeType dm). Others will see it as coming from you.", [f.enum("scopeType", "Where", ["channel", "dm"], true), f.str("scopeId", "Channel id or direct-conversation id", true), f.text("body", "Message", true), f.list("mentions", "User ids to mention")], async (v) => {
    const user = await getCurrentChatUser();
    if (!user) return fail("Please sign in again.");
    const resolved = await resolveScope(v.scopeType, v.scopeId, user);
    if (!resolved.canPost) return fail("You can't post in this conversation.");
    const m = await postMessage({ scope: resolved.scope, authorId: user.id, body: String(v.body ?? ""), mentions: (v.mentions as string[]) ?? [] });
    if (resolved.scope.type === "channel") await advanceChannelRead(resolved.scope.id, user.id, m.seq);
    else await advanceDirectRead(resolved.scope.id, user.id, m.seq);
    return { ok: true, id: m._id, result: "Message sent." };
  }, "Message sent."),
  act("messenger.start_direct", "Start a direct conversation", "Open (or find) the one-to-one conversation with someone; returns its id for send_message.", [f.ref("userId", "Person (workspace.user id)", "workspace.user", true)], async (v) => {
    const user = await getCurrentChatUser();
    if (!user) return fail("Please sign in again.");
    const r = await getOrCreateDirect({ id: user.id, roles: user.roles }, String(v.userId));
    return r.ok ? { ok: true, id: r.conversation._id, result: "Conversation ready." } : fail(r.error);
  }, "Conversation ready."),
  act("messenger.create_channel", "Create a team channel", "A public or private channel with optional members.", [f.str("name", "Name", true), f.text("description", "Description"), f.enum("visibility", "Visibility", CH_VIS, true), f.list("memberIds", "Members (user ids)")], (v) => Channels.createChannelAction({ name: String(v.name ?? ""), description: str(v.description) ?? undefined, visibility: v.visibility as "public", memberIds: (v.memberIds as string[]) ?? [] }), "Channel created.", { allow: (u) => canCreateTeamChannel(chatCtx(u)) }),
  act("messenger.create_group", "Create a group chat", "A private group with at least one other person.", [f.str("name", "Name", true), f.text("description", "Description"), f.list("memberIds", "Members (user ids)")], (v) => Groups.createGroupAction({ name: String(v.name ?? ""), description: str(v.description) ?? undefined, memberIds: (v.memberIds as string[]) ?? [] }), "Group created."),
  act("messenger.join_channel", "Join a channel", "Join a public channel by its slug.", [f.str("slug", "Channel slug", true)], (v) => Channels.joinChannelAction(String(v.slug)), "Joined."),
  act("messenger.add_members", "Add people to a channel or group", "Add members.", [f.ref("channelId", "Channel id", "messenger.channel", true), f.list("userIds", "User ids")], (v) => Channels.addChannelMembersAction(String(v.channelId), (v.userIds as string[]) ?? []), "Members added."),
  act("messenger.remove_member", "Remove someone from a channel or group", "Remove a member (you can always remove yourself).", [f.ref("channelId", "Channel id", "messenger.channel", true), f.str("userId", "User id", true)], (v) => Channels.removeChannelMemberAction(String(v.channelId), String(v.userId)), "Member removed.", { destructive: true }),
  act("messenger.set_member_role", "Change a member's role in a channel", "Make someone owner / admin / member of a channel.", [f.ref("channelId", "Channel id", "messenger.channel", true), f.str("userId", "User id", true), f.enum("role", "Role", ["owner", "admin", "member"], true)], (v) => Channels.setChannelMemberRoleAction(String(v.channelId), String(v.userId), v.role as "admin"), "Role changed."),
  act("messenger.update_channel", "Edit a channel", "Change a channel's name, description, topic or visibility.", [f.ref("channelId", "Channel id", "messenger.channel", true), f.str("name", "Name"), f.text("description", "Description"), f.str("topic", "Topic"), f.enum("visibility", "Visibility", CH_VIS)], (v) => { const { channelId, ...patch } = v; return Channels.updateChannelAction(String(channelId), patch as never); }, "Channel updated."),
  act("messenger.archive_channel", "Archive or restore a channel", "Archive a channel (or bring it back).", [f.ref("channelId", "Channel id", "messenger.channel", true), f.bool("archived", "Archive (false = restore)")], (v) => Channels.archiveChannelAction(String(v.channelId), v.archived !== false), "Done.", { destructive: true }),
  act("messenger.post_announcement", "Write or publish an announcement", "Create an announcement for an audience, and publish it now or schedule it.", [f.str("title", "Title", true), f.text("body", "Announcement text", true), f.enum("priority", "Priority", ["normal", "important", "urgent"]), f.json("audience", "Audience: {type:'all'} or {type:'departments'|'roles'|'users'|'channels', ids:[…]}", true), f.str("scheduledFor", "Schedule for (ISO) instead of now"), f.bool("requireConfirmation", "Require people to confirm they read it"), f.bool("crossPost", "Also post in channels"), f.bool("publishNow", "Publish now")], (v) => Ann.saveAnnouncementAction({ title: String(v.title ?? ""), body: String(v.body ?? ""), priority: (str(v.priority) ?? "normal") as never, attachments: [], audience: v.audience as never, scheduledFor: str(v.scheduledFor), requireConfirmation: v.requireConfirmation === true, crossPost: v.crossPost !== false, publishNow: v.publishNow !== false }), "Announcement saved.", { allow: (u) => canPostAnnouncements(chatCtx(u)), destructive: true }),
  act("messenger.acknowledge_announcement", "Confirm you read an announcement", "Mark an announcement as read.", [f.str("announcementId", "Announcement id", true)], (v) => Ann.acknowledgeAnnouncementAction(String(v.announcementId)), "Marked as read."),
  act("messenger.delete_announcement", "Delete one of your announcements", "Delete an announcement you wrote.", [f.str("announcementId", "Announcement id", true)], (v) => Ann.deleteAnnouncementAction(String(v.announcementId)), "Announcement deleted.", { destructive: true, allow: (u) => canPostAnnouncements(chatCtx(u)) }),
  act("messenger.schedule_meeting", "Schedule or start a meeting", "A scheduled or instant video meeting with invitees.", [f.str("title", "Title", true), f.text("description", "Description"), f.enum("kind", "Kind", ["scheduled", "instant"], true), f.str("startAt", "Start (ISO, for scheduled)"), f.num("durationMins", "Duration (minutes)"), f.list("inviteeIds", "Invitees (user ids)"), f.bool("recordingEnabled", "Allow recording"), f.bool("screenShareEnabled", "Allow screen sharing")], (v) => Meet.createMeetingAction({ title: String(v.title ?? ""), description: str(v.description) ?? undefined, kind: v.kind as "scheduled", startAt: str(v.startAt) ?? undefined, durationMins: Number(v.durationMins) || 30, inviteeIds: (v.inviteeIds as string[]) ?? [], recordingEnabled: v.recordingEnabled === true, screenShareEnabled: v.screenShareEnabled !== false }), "Meeting created."),
  act("messenger.update_meeting", "Change a meeting", "Edit a meeting's title, time, duration or options.", [f.str("meetingId", "Meeting id", true), f.str("title", "Title"), f.text("description", "Description"), f.str("startAt", "Start (ISO)"), f.num("durationMins", "Duration"), f.bool("recordingEnabled", "Allow recording"), f.bool("screenShareEnabled", "Allow screen sharing")], (v) => { const { meetingId, ...patch } = v; return Meet.updateMeetingAction(String(meetingId), patch as never); }, "Meeting updated."),
  act("messenger.invite_to_meeting", "Invite people to a meeting", "Add invitees.", [f.str("meetingId", "Meeting id", true), f.list("userIds", "Invitees (user ids)")], (v) => Meet.addMeetingInviteesAction(String(v.meetingId), (v.userIds as string[]) ?? []), "Invitations sent."),
  act("messenger.cancel_meeting", "Cancel a meeting", "Cancel a scheduled meeting (invitees are told).", [f.str("meetingId", "Meeting id", true)], (v) => Meet.cancelMeetingAction(String(v.meetingId)), "Meeting cancelled.", { destructive: true }),
  act("messenger.rsvp_meeting", "Reply to a meeting invitation", "Say whether you will attend.", [f.str("meetingId", "Meeting id", true), f.enum("rsvp", "Reply", ["accepted", "declined", "tentative"], true)], (v) => Meet.setRsvpAction(String(v.meetingId), v.rsvp as never), "Reply recorded."),
  act("messenger.end_meeting", "End a meeting", "End a running meeting (host only).", [f.str("meetingId", "Meeting id", true)], (v) => Meet.endMeetingAction(String(v.meetingId)), "Meeting ended.", { destructive: true }),
];

export const MESSENGER_REPORTS: ReportDef[] = [
  {
    key: "messenger.read_conversation", panel: "messenger", label: "Read a conversation", description: "The latest messages of a channel/group (scopeType channel) or one of your direct conversations (dm) — for summaries and catch-up.", level: "any",
    params: [f.enum("scopeType", "Where", ["channel", "dm"], true), f.str("scopeId", "Channel id or conversation id", true), f.num("limit", "How many messages (default 30, max 100)")],
    run: async (v) => {
      const user = await getCurrentChatUser();
      if (!user) return fail("Please sign in again.");
      const resolved = await resolveScope(v.scopeType, v.scopeId, user);
      const me = await getChatUser(user.id);
      const messages = await listMessages({ scope: resolved.scope, viewerId: user.id, starredIds: me?.starredMessageIds ?? [], limit: Math.min(Math.max(Number(v.limit) || 30, 1), 100) });
      return { messages: messages.map((m) => ({ at: m.createdAt, from: m.author?.displayName ?? m.authorId, text: m.deleted ? "(deleted)" : m.body, replies: m.thread?.replyCount ?? 0 })) } as unknown as Json;
    },
  },
  {
    key: "messenger.my_conversations", panel: "messenger", label: "My channels and conversations", description: "Channels you belong to, public channels you could join, and your direct conversations with their ids.", level: "any", params: [],
    run: async (_v, u) => {
      const [mine, browse, dms] = await Promise.all([listMemberChannels(u.id), listBrowsableChannels(u.id), listConversationsForUser(u.id)]);
      const convos = await serializeConversations(dms, u.id).catch(() => []);
      return { channels: mine.map((c) => ({ id: c._id, name: c.name, kind: c.kind, slug: c.slug })), joinable: browse.slice(0, 40).map((c) => ({ id: c._id, name: c.name, slug: c.slug })), direct: (convos as unknown as Json[]).map((c) => ({ id: c.id ?? c._id, with: (c.other as Json | undefined)?.name ?? c.title, last: c.lastMessagePreview })) } as unknown as Json;
    },
  },
  {
    key: "messenger.announcements", panel: "messenger", label: "Announcements", description: "Announcements addressed to you (and the ones you wrote).", level: "any", params: [f.bool("mine", "Only the ones I wrote")],
    run: async (v, u) => ({ announcements: v.mine === true ? await listForAuthor(u.id, u.id) : await listForViewer({ id: u.id, roles: u.roles as never }) }) as unknown as Json,
  },
  { key: "messenger.meetings", panel: "messenger", label: "My meetings", description: "Upcoming and recent meetings you host or are invited to.", level: "any", params: [], run: async (_v, u) => ({ meetings: await listMeetingsForUser(u.id, "all") }) as unknown as Json },
  { key: "messenger.find_people", panel: "messenger", label: "Find a person to message", description: "Search the directory by name or email.", level: "any", params: [f.str("q", "Name or email", true)], run: async (v) => ({ people: await searchUsers(String(v.q ?? ""), 10) }) as unknown as Json },
];
