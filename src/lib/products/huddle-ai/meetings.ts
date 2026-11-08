import "server-only";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/huddle-ai/db";
import { emit } from "@/lib/products/huddle-ai/events";
import { notify } from "@/lib/products/huddle-ai/notifications";
import { getChatUsers, type DirectoryUser } from "@/lib/products/huddle-ai/users";
import { getPresence, type PresenceStatus } from "@/lib/products/huddle-ai/presence";
import { createChannel, addMembers } from "@/lib/products/huddle-ai/channels";
import { recordAudit } from "@/lib/products/huddle-ai/audit";
import type { ChatRole } from "@/lib/messenger-roles";

/**
 * Voice & video meetings — **architecture-ready** for a future WebRTC / SFU
 * integration. This module owns the durable meeting record, invites, RSVP,
 * a linked group channel for meeting chat, and the lifecycle sweep. Real-time
 * media is handled client-side through the pluggable `MeetingTransport`
 * (`src/lib/huddle-ai/meeting-transport.ts`); today's `local` transport shows
 * the joiner their own camera/mic/screen with no signaling server. Swapping in
 * a `webrtc-mesh` or `sfu` transport does not touch this file.
 */

export const MEETINGS_COLLECTION = "chat_meetings";
export const PARTICIPANTS_COLLECTION = "meeting_participants";
const META_COLLECTION = "chat_meta";

export type MeetingKind = "instant" | "scheduled";
export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";
export type ParticipantRole = "host" | "cohost" | "attendee";
export type Rsvp = "yes" | "no" | "maybe" | null;
export type MeetingTransportKind = "local" | "webrtc-mesh" | "sfu";

export interface Meeting extends AuditFields {
  _id: string;
  title: string;
  description: string | null;
  hostId: string;
  kind: MeetingKind;
  startAt: Date;
  durationMins: number;
  status: MeetingStatus;
  /** Linked group channel id for meeting chat + shared files. */
  channelId: string | null;
  joinCode: string;
  recordingEnabled: boolean;
  screenShareEnabled: boolean;
  /** WebRTC seam — see `meeting-transport.ts`. */
  transport: MeetingTransportKind;
  roomId: string;
  /** Set once the lifecycle sweep has fired the "starting soon" reminder. */
  reminderSentAt: Date | null;
  endedAt: Date | null;
}

export interface MeetingParticipant {
  _id: string;
  meetingId: string;
  userId: string;
  role: ParticipantRole;
  rsvp: Rsvp;
  invitedAt: Date;
  joinedAt: Date | null;
  leftAt: Date | null;
}

export interface SerializedMeeting
  extends Omit<Meeting, "createdAt" | "updatedAt" | "deletedAt" | "startAt" | "reminderSentAt" | "endedAt"> {
  createdAt: string;
  updatedAt: string;
  startAt: string;
  endsAt: string;
  endedAt: string | null;
  hostName: string;
  myRole: ParticipantRole | null;
  myRsvp: Rsvp;
  participantCount: number;
}

export interface SerializedParticipant {
  userId: string;
  role: ParticipantRole;
  rsvp: Rsvp;
  joinedAt: string | null;
  inMeeting: boolean;
  user: DirectoryUser | null;
  presence: PresenceStatus;
}

let meetingIdx = false;
let participantIdx = false;

async function meetings() {
  const db = await getDb();
  const c = db.collection<Meeting>(MEETINGS_COLLECTION);
  if (!meetingIdx) {
    meetingIdx = true;
    await Promise.all([
      c.createIndex({ startAt: -1 }).catch(() => {}),
      c.createIndex({ hostId: 1 }).catch(() => {}),
      c.createIndex({ status: 1, startAt: 1 }).catch(() => {}),
      c.createIndex({ joinCode: 1 }, { unique: true }).catch(() => {}),
    ]);
  }
  return c;
}

async function participants() {
  const db = await getDb();
  const c = db.collection<MeetingParticipant>(PARTICIPANTS_COLLECTION);
  if (!participantIdx) {
    participantIdx = true;
    await Promise.all([
      c.createIndex({ meetingId: 1, userId: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ userId: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

function makeCode(): string {
  const raw = randomBytes(6).toString("hex");
  return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 12)}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getMeeting(id: string): Promise<Meeting | null> {
  return (await meetings()).findOne({ _id: id, ...notDeleted });
}

export async function getMeetingByCode(code: string): Promise<Meeting | null> {
  return (await meetings()).findOne({ joinCode: code, ...notDeleted });
}

export async function getParticipant(meetingId: string, userId: string): Promise<MeetingParticipant | null> {
  return (await participants()).findOne({ meetingId, userId });
}

export async function canAccessMeeting(meeting: Meeting, user: { id: string; roles: ChatRole[] }): Promise<boolean> {
  if (meeting.hostId === user.id) return true;
  return (await getParticipant(meeting._id, user.id)) !== null;
}

async function serialize(meeting: Meeting, viewerId: string): Promise<SerializedMeeting> {
  const [hosts, mine, count] = await Promise.all([
    getChatUsers([meeting.hostId]),
    getParticipant(meeting._id, viewerId),
    (await participants()).countDocuments({ meetingId: meeting._id }),
  ]);
  return {
    _id: meeting._id,
    title: meeting.title,
    description: meeting.description,
    hostId: meeting.hostId,
    kind: meeting.kind,
    durationMins: meeting.durationMins,
    status: meeting.status,
    channelId: meeting.channelId,
    joinCode: meeting.joinCode,
    recordingEnabled: meeting.recordingEnabled,
    screenShareEnabled: meeting.screenShareEnabled,
    transport: meeting.transport,
    roomId: meeting.roomId,
    createdBy: meeting.createdBy,
    updatedBy: meeting.updatedBy,
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
    startAt: meeting.startAt.toISOString(),
    endsAt: new Date(meeting.startAt.getTime() + meeting.durationMins * 60000).toISOString(),
    endedAt: meeting.endedAt ? meeting.endedAt.toISOString() : null,
    hostName: hosts[meeting.hostId]?.displayName ?? "Unknown",
    myRole: mine?.role ?? null,
    myRsvp: mine?.rsvp ?? null,
    participantCount: count,
  };
}

export async function listMeetingsForUser(
  userId: string,
  scope: "upcoming" | "past" | "all" = "all"
): Promise<SerializedMeeting[]> {
  const myRows = await (await participants()).find({ userId }).project<{ meetingId: string }>({ meetingId: 1 }).toArray();
  const ids = myRows.map((r) => r.meetingId);
  const filter: Record<string, unknown> = { ...notDeleted, $or: [{ _id: { $in: ids } }, { hostId: userId }] };

  if (scope === "upcoming") {
    filter.status = { $in: ["scheduled", "live"] };
  } else if (scope === "past") {
    filter.status = { $in: ["ended", "cancelled"] };
  }

  const rows = await (await meetings()).find(filter).sort({ startAt: scope === "past" ? -1 : 1 }).limit(100).toArray();
  return Promise.all(rows.map((m) => serialize(m, userId)));
}

export async function getMeetingDetail(id: string, viewerId: string): Promise<SerializedMeeting | null> {
  const m = await getMeeting(id);
  return m ? serialize(m, viewerId) : null;
}

export async function listParticipants(meetingId: string): Promise<SerializedParticipant[]> {
  const rows = await (await participants()).find({ meetingId }).toArray();
  const users = await getChatUsers(rows.map((r) => r.userId));
  const presence = await getPresence(rows.map((r) => r.userId));
  const rank: Record<ParticipantRole, number> = { host: 0, cohost: 1, attendee: 2 };
  return rows
    .sort((a, b) => rank[a.role] - rank[b.role])
    .map((r) => ({
      userId: r.userId,
      role: r.role,
      rsvp: r.rsvp,
      joinedAt: r.joinedAt ? r.joinedAt.toISOString() : null,
      inMeeting: r.joinedAt !== null && r.leftAt === null,
      user: users[r.userId] ?? null,
      presence: presence[r.userId] ?? "offline",
    }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateMeetingInput {
  title: string;
  description?: string | null;
  kind: MeetingKind;
  startAt: Date;
  durationMins: number;
  inviteeIds: string[];
  recordingEnabled: boolean;
  screenShareEnabled: boolean;
}

export async function createMeeting(input: CreateMeetingInput, hostId: string): Promise<Meeting> {
  const c = await meetings();
  const now = new Date();
  const code = makeCode();
  const invitees = Array.from(new Set(input.inviteeIds.filter((id) => id && id !== hostId)));

  // Linked group channel for meeting chat + shared files.
  let channelId: string | null = null;
  try {
    const channel = await createChannel(
      { kind: "group", name: `Meeting: ${input.title}`.slice(0, 60), description: input.description ?? null, visibility: "private", memberIds: invitees },
      hostId
    );
    channelId = channel._id;
  } catch {
    /* meeting chat is optional */
  }

  const doc: Meeting = {
    _id: newId(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    hostId,
    kind: input.kind,
    startAt: input.kind === "instant" ? now : input.startAt,
    durationMins: Math.min(Math.max(Math.round(input.durationMins) || 30, 5), 480),
    status: input.kind === "instant" ? "live" : "scheduled",
    channelId,
    joinCode: code,
    recordingEnabled: input.recordingEnabled,
    screenShareEnabled: input.screenShareEnabled,
    transport: "local",
    roomId: code,
    reminderSentAt: null,
    endedAt: null,
    ...createStamp(hostId),
  };
  await c.insertOne(doc);

  const p = await participants();
  await p.insertOne({
    _id: newId(),
    meetingId: doc._id,
    userId: hostId,
    role: "host",
    rsvp: "yes",
    invitedAt: now,
    joinedAt: null,
    leftAt: null,
  });
  if (invitees.length > 0) {
    await p.insertMany(
      invitees.map((userId) => ({
        _id: newId(),
        meetingId: doc._id,
        userId,
        role: "attendee" as ParticipantRole,
        rsvp: null,
        invitedAt: now,
        joinedAt: null,
        leftAt: null,
      }))
    );
  }

  const hosts = await getChatUsers([hostId]);
  const hostName = hosts[hostId]?.displayName ?? "Someone";
  const when =
    doc.kind === "instant"
      ? "now"
      : doc.startAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  await Promise.all(
    invitees.map((uid) =>
      notify({
        recipientUserId: uid,
        type: "channel_invite",
        title: `${hostName} invited you to a meeting`,
        body: `${doc.title} · ${when}`,
        link: `/huddle-ai/meetings/${doc._id}`,
        dedupeKey: `meeting_invite:${doc._id}:${uid}`,
      }).then(() =>
        emit({ scope: { type: "user", id: uid }, kind: "notification", payload: { kind: "meeting_invite", meetingId: doc._id }, actorId: hostId })
      )
    )
  );

  await recordAudit({ actorId: hostId, action: "create", entity: "meeting", entityId: doc._id, entityLabel: doc.title, summary: `${doc.kind} meeting` });
  return doc;
}

export async function updateMeeting(
  id: string,
  patch: Partial<Pick<Meeting, "title" | "description" | "startAt" | "durationMins" | "recordingEnabled" | "screenShareEnabled">>,
  actorId: string
): Promise<void> {
  const c = await meetings();
  const existing = await c.findOne({ _id: id, ...notDeleted });
  if (!existing) throw new Error("Meeting not found.");
  if (existing.hostId !== actorId) throw new Error("Only the host can edit this meeting.");
  if (existing.status === "ended" || existing.status === "cancelled") throw new Error("This meeting is over.");

  const set: Record<string, unknown> = { ...updateStamp(actorId) };
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.startAt !== undefined) set.startAt = patch.startAt;
  if (patch.durationMins !== undefined) set.durationMins = Math.min(Math.max(Math.round(patch.durationMins), 5), 480);
  if (patch.recordingEnabled !== undefined) set.recordingEnabled = patch.recordingEnabled;
  if (patch.screenShareEnabled !== undefined) set.screenShareEnabled = patch.screenShareEnabled;
  await c.updateOne({ _id: id }, { $set: set });
}

export async function addInvitees(meetingId: string, userIds: string[], actorId: string): Promise<void> {
  const meeting = await getMeeting(meetingId);
  if (!meeting || meeting.hostId !== actorId) throw new Error("Only the host can invite people.");
  const p = await participants();
  const now = new Date();
  const fresh = Array.from(new Set(userIds.filter((id) => id && id !== meeting.hostId)));
  for (const userId of fresh) {
    await p.updateOne(
      { meetingId, userId },
      { $setOnInsert: { _id: newId(), meetingId, userId, role: "attendee", rsvp: null, invitedAt: now, joinedAt: null, leftAt: null } },
      { upsert: true }
    );
  }
  if (meeting.channelId) await addMembers(meeting.channelId, fresh, actorId).catch(() => {});
  await Promise.all(
    fresh.map((uid) =>
      notify({
        recipientUserId: uid,
        type: "channel_invite",
        title: "You were added to a meeting",
        body: meeting.title,
        link: `/huddle-ai/meetings/${meetingId}`,
        dedupeKey: `meeting_invite:${meetingId}:${uid}`,
      })
    )
  );
}

export async function cancelMeeting(id: string, actorId: string): Promise<void> {
  const c = await meetings();
  const existing = await c.findOne({ _id: id, ...notDeleted });
  if (!existing || existing.hostId !== actorId) throw new Error("Only the host can cancel this meeting.");
  await c.updateOne({ _id: id }, { $set: { status: "cancelled", ...updateStamp(actorId) } });

  const rows = await (await participants()).find({ meetingId: id }).toArray();
  await Promise.all(
    rows
      .filter((r) => r.userId !== actorId)
      .map((r) =>
        notify({
          recipientUserId: r.userId,
          type: "channel_invite",
          title: `Meeting cancelled: ${existing.title}`,
          body: null,
          link: `/huddle-ai/meetings`,
        })
      )
  );
}

export async function setRsvp(meetingId: string, userId: string, rsvp: Rsvp): Promise<void> {
  await (await participants()).updateOne(
    { meetingId, userId },
    { $set: { rsvp } },
    { upsert: false }
  );
}

export async function joinMeeting(meetingId: string, userId: string): Promise<void> {
  const c = await meetings();
  const meeting = await c.findOne({ _id: meetingId, ...notDeleted });
  if (!meeting) throw new Error("Meeting not found.");
  if (meeting.status === "cancelled") throw new Error("This meeting was cancelled.");
  if (meeting.status === "ended") throw new Error("This meeting has ended.");

  if (meeting.status === "scheduled") {
    await c.updateOne({ _id: meetingId }, { $set: { status: "live" } });
    await emit({ scope: { type: "user", id: meeting.hostId }, kind: "notification", payload: { kind: "meeting_live", meetingId }, actorId: userId });
  }
  await (await participants()).updateOne(
    { meetingId, userId },
    { $set: { joinedAt: new Date(), leftAt: null }, $setOnInsert: { _id: newId(), meetingId, userId, role: "attendee", rsvp: "yes", invitedAt: new Date() } },
    { upsert: true }
  );
}

export async function leaveMeeting(meetingId: string, userId: string): Promise<void> {
  await (await participants()).updateOne({ meetingId, userId }, { $set: { leftAt: new Date() } });
}

export async function endMeeting(meetingId: string, actorId: string): Promise<void> {
  const c = await meetings();
  const meeting = await c.findOne({ _id: meetingId, ...notDeleted });
  if (!meeting) return;
  if (meeting.hostId !== actorId) throw new Error("Only the host can end this meeting.");
  await c.updateOne({ _id: meetingId }, { $set: { status: "ended", endedAt: new Date(), ...updateStamp(actorId) } });
}

// ---------------------------------------------------------------------------
// Lifecycle sweep — throttled to once / 2 minutes.
// ---------------------------------------------------------------------------

export async function runMeetingSweep(): Promise<void> {
  try {
    const db = await getDb();
    const meta = db.collection<{ _id: string; lastRun: Date }>(META_COLLECTION);
    const now = new Date();
    const claim = await meta.findOneAndUpdate(
      { _id: "meeting_sweep", lastRun: { $lt: new Date(now.getTime() - 2 * 60 * 1000) } },
      { $set: { lastRun: now } },
      { returnDocument: "after" }
    );
    if (!claim) {
      const existing = await meta.findOne({ _id: "meeting_sweep" });
      if (existing) return;
      await meta.updateOne({ _id: "meeting_sweep" }, { $setOnInsert: { lastRun: now } }, { upsert: true });
    }

    const c = await meetings();

    // "Starting soon" reminders — 10 min before, once.
    const soon = new Date(now.getTime() + 10 * 60 * 1000);
    const upcoming = await c.find({ status: "scheduled", reminderSentAt: null, startAt: { $lte: soon, $gte: now }, ...notDeleted }).limit(20).toArray();
    for (const m of upcoming) {
      const rows = await (await participants()).find({ meetingId: m._id, rsvp: { $ne: "no" } }).toArray();
      await Promise.all(
        rows.map((r) =>
          notify({
            recipientUserId: r.userId,
            type: "channel_invite",
            title: `Starting soon: ${m.title}`,
            body: "Your meeting begins in about 10 minutes.",
            link: `/huddle-ai/meetings/${m._id}`,
            dedupeKey: `meeting_reminder:${m._id}:${r.userId}`,
          })
        )
      );
      await c.updateOne({ _id: m._id }, { $set: { reminderSentAt: now } });
    }

    // Auto-end meetings well past their scheduled window.
    const overdue = await c
      .find({ status: { $in: ["scheduled", "live"] }, ...notDeleted })
      .limit(50)
      .toArray();
    for (const m of overdue) {
      const endBy = new Date(m.startAt.getTime() + (m.durationMins + 30) * 60000);
      if (now > endBy) {
        await c.updateOne({ _id: m._id }, { $set: { status: "ended", endedAt: now } });
      }
    }
  } catch {
    /* sweep failures never break a render */
  }
}
