import "server-only";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/huddle-ai/db";
import { emit, emitMany, type EmitInput } from "@/lib/products/huddle-ai/events";
import { notify } from "@/lib/products/huddle-ai/notifications";
import { getChatUsers } from "@/lib/products/huddle-ai/users";
import type { SerializedCall, SerializedCallParticipant } from "@/lib/products/huddle-ai/call-types";
import { getChannel, listMemberIds } from "@/lib/products/huddle-ai/channels";
import { getConversation, touchConversation } from "@/lib/products/huddle-ai/conversations";
import { postMessage } from "@/lib/products/huddle-ai/messages";
import { recordAudit } from "@/lib/products/huddle-ai/audit";
import {
  DEFAULT_CALL_MAX,
  RING_TIMEOUT_MS,
  CALL_STALE_MS,
  type CallMode,
  type CallStatus,
  type CallParticipantState,
  type CallOutcome,
  type CallScope,
  type ScreenSurface,
  type IceServerConfig,
} from "@/lib/products/huddle-ai/call-constants";

/**
 * Calling & meeting sessions. Media is peer-to-peer WebRTC (`webrtc-transport.ts`);
 * this module owns the durable session + participant + history records and the
 * lifecycle sweep. Signaling rides the event log (`call_signal` kind) — see the
 * fast per-call SSE channel in `/api/huddle-ai/calls/[id]/signal-stream`.
 *
 * Scope `dm` and `channel:kind=group` calls **ring** every other member; `team`
 * / `project` channel meetings do not ring (members see a "Join" banner).
 */

export const CALL_SESSIONS_COLLECTION = "call_sessions";
export const CALL_PARTICIPANTS_COLLECTION = "call_participants";
export const CALL_HISTORY_COLLECTION = "call_history";
export const SCREEN_SHARE_LOGS_COLLECTION = "screen_share_logs";
export const CALL_NOTIFICATIONS_COLLECTION = "call_notifications";
const META_COLLECTION = "chat_meta";

export interface CallSession extends AuditFields {
  _id: string;
  scope: CallScope;
  mode: CallMode;
  status: CallStatus;
  initiatedBy: string;
  /** Non-null when launched from a scheduled `chat_meetings` record. */
  meetingId: string | null;
  participantLimit: number;
  title: string;
  /** Whether ringing applies (dm / group) vs. a silent channel meeting. */
  rings: boolean;
  startedAt: Date;
  activeAt: Date | null;
  endedAt: Date | null;
  endedReason: "hangup" | "declined" | "missed" | "empty" | null;
  /** userId currently presenting a screen, if any. */
  presenterId: string | null;
}

export interface CallParticipant {
  _id: string;
  callId: string;
  userId: string;
  state: CallParticipantState;
  role: "host" | "guest";
  invitedAt: Date;
  joinedAt: Date | null;
  leftAt: Date | null;
  handRaisedAt: Date | null;
  screenSharing: boolean;
  lastSeenAt: Date | null;
}

export type { SerializedCall, SerializedCallParticipant };

let sessionIdx = false;
let participantIdx = false;
let historyIdx = false;
let notifIdx = false;

async function sessions() {
  const db = await getDb();
  const c = db.collection<CallSession>(CALL_SESSIONS_COLLECTION);
  if (!sessionIdx) {
    sessionIdx = true;
    await Promise.all([
      c.createIndex({ "scope.type": 1, "scope.id": 1, status: 1 }).catch(() => {}),
      c.createIndex({ status: 1, startedAt: 1 }).catch(() => {}),
      c.createIndex({ meetingId: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

async function participants() {
  const db = await getDb();
  const c = db.collection<CallParticipant>(CALL_PARTICIPANTS_COLLECTION);
  if (!participantIdx) {
    participantIdx = true;
    await Promise.all([
      c.createIndex({ callId: 1, userId: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ callId: 1, state: 1 }).catch(() => {}),
      c.createIndex({ userId: 1, state: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

async function history() {
  const db = await getDb();
  const c = db.collection<Record<string, unknown> & { _id: string }>(CALL_HISTORY_COLLECTION);
  if (!historyIdx) {
    historyIdx = true;
    await Promise.all([
      c.createIndex({ "scope.type": 1, "scope.id": 1, at: -1 }).catch(() => {}),
      c.createIndex({ userId: 1, at: -1 }).catch(() => {}),
    ]);
  }
  return c;
}

async function callNotifications() {
  const db = await getDb();
  const c = db.collection<Record<string, unknown> & { _id: string }>(CALL_NOTIFICATIONS_COLLECTION);
  if (!notifIdx) {
    notifIdx = true;
    await c.createIndex({ recipientUserId: 1, seenAt: 1, createdAt: -1 }).catch(() => {});
  }
  return c;
}

// ---------------------------------------------------------------------------
// ICE config
// ---------------------------------------------------------------------------

export async function getIceServers(): Promise<IceServerConfig[]> {
  const servers: IceServerConfig[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  // The workspace's own TURN relay (Workspace → Settings → Integrations), when it has one.
  const turn = await connectionValues("turn");
  if (turn?.url) servers.push({ urls: turn.url, username: turn.username || undefined, credential: turn.credential || undefined });
  return servers;
}

function callMax(): number {
  const n = Number(process.env.MESSENGER_CALL_MAX);
  return Number.isFinite(n) && n >= 2 ? Math.min(n, 50) : DEFAULT_CALL_MAX;
}

// ---------------------------------------------------------------------------
// Membership helpers
// ---------------------------------------------------------------------------

async function scopeMemberIds(scope: CallScope): Promise<string[]> {
  if (scope.type === "dm") {
    const conv = await getConversation(scope.id);
    return conv ? [...conv.participantIds] : [];
  }
  return listMemberIds(scope.id);
}

async function scopeTitle(scope: CallScope, initiatorId: string): Promise<{ title: string; rings: boolean }> {
  if (scope.type === "dm") {
    const conv = await getConversation(scope.id);
    const otherId = conv?.participantIds.find((p) => p !== initiatorId);
    const users = otherId ? await getChatUsers([otherId]) : {};
    return { title: otherId ? users[otherId]?.displayName ?? "Direct call" : "Direct call", rings: true };
  }
  const channel = await getChannel(scope.id);
  return {
    title: channel ? (channel.kind === "group" ? channel.name : `#${channel.name}`) : "Call",
    rings: channel?.kind === "group",
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getCall(id: string): Promise<CallSession | null> {
  return (await sessions()).findOne({ _id: id, ...notDeleted });
}

export async function getActiveCallForScope(scope: CallScope): Promise<CallSession | null> {
  return (await sessions()).findOne({
    "scope.type": scope.type,
    "scope.id": scope.id,
    status: { $in: ["ringing", "active"] },
    ...notDeleted,
  });
}

export async function isParticipant(callId: string, userId: string): Promise<boolean> {
  return (await participants()).findOne({ callId, userId }) !== null;
}

export async function listRawParticipants(callId: string): Promise<CallParticipant[]> {
  return (await participants()).find({ callId }).toArray();
}

export async function serializeCall(call: CallSession, viewerId: string): Promise<SerializedCall> {
  const rows = await listRawParticipants(call._id);
  const users = await getChatUsers(rows.map((r) => r.userId));
  const now = Date.now();
  const mine = rows.find((r) => r.userId === viewerId);
  const rank: Record<CallParticipantState, number> = { joined: 0, ringing: 1, missed: 2, declined: 3, left: 4 };
  return {
    _id: call._id,
    scope: call.scope,
    mode: call.mode,
    status: call.status,
    title: call.title,
    rings: call.rings,
    initiatedBy: call.initiatedBy,
    meetingId: call.meetingId,
    presenterId: call.presenterId,
    participantLimit: call.participantLimit,
    startedAt: call.startedAt.toISOString(),
    activeAt: call.activeAt ? call.activeAt.toISOString() : null,
    endedAt: call.endedAt ? call.endedAt.toISOString() : null,
    myRole: mine?.role ?? null,
    participants: rows
      .sort((a, b) => rank[a.state] - rank[b.state])
      .map((r) => ({
        userId: r.userId,
        state: r.state,
        role: r.role,
        handRaised: r.handRaisedAt !== null,
        screenSharing: r.screenSharing,
        joinedAt: r.joinedAt ? r.joinedAt.toISOString() : null,
        online: r.state === "joined" && r.lastSeenAt !== null && now - r.lastSeenAt.getTime() < CALL_STALE_MS,
        user: users[r.userId] ?? null,
      })),
  };
}

/** userIds currently joined + heartbeat-fresh — the signaling roster. */
export async function activeRoster(callId: string): Promise<string[]> {
  const rows = await (await participants()).find({ callId, state: "joined" }).toArray();
  const cutoff = Date.now() - CALL_STALE_MS;
  return rows.filter((r) => (r.lastSeenAt ? r.lastSeenAt.getTime() > cutoff : false)).map((r) => r.userId);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export interface StartCallInput {
  scope: CallScope;
  mode: CallMode;
  initiatorId: string;
  meetingId?: string | null;
}

export async function startCall(
  input: StartCallInput
): Promise<{ ok: true; call: CallSession; reused: boolean } | { ok: false; error: string }> {
  const existing = await getActiveCallForScope(input.scope);
  if (existing) return { ok: true, call: existing, reused: true };

  const memberIds = await scopeMemberIds(input.scope);
  if (!memberIds.includes(input.initiatorId)) return { ok: false, error: "You're not a member of this conversation." };
  if (memberIds.length < 2 && input.scope.type === "dm") return { ok: false, error: "Nobody to call." };

  const resolved = await scopeTitle(input.scope, input.initiatorId);
  const title = resolved.title;
  // Scheduled meetings never ring — attendees join from the meeting page / banner.
  const rings = input.meetingId ? false : resolved.rings;
  const now = new Date();
  const call: CallSession = {
    _id: newId(),
    scope: input.scope,
    mode: input.mode,
    status: rings ? "ringing" : "active",
    initiatedBy: input.initiatorId,
    meetingId: input.meetingId ?? null,
    participantLimit: callMax(),
    title,
    rings,
    startedAt: now,
    activeAt: rings ? null : now,
    endedAt: null,
    endedReason: null,
    presenterId: null,
    ...createStamp(input.initiatorId),
  };
  await (await sessions()).insertOne(call);

  const p = await participants();
  const others = memberIds.filter((id) => id !== input.initiatorId);
  await p.insertOne({
    _id: newId(),
    callId: call._id,
    userId: input.initiatorId,
    state: "joined",
    role: "host",
    invitedAt: now,
    joinedAt: now,
    leftAt: null,
    handRaisedAt: null,
    screenSharing: false,
    lastSeenAt: now,
  });
  if (others.length > 0) {
    await p.insertMany(
      others.map((userId) => ({
        _id: newId(),
        callId: call._id,
        userId,
        state: (rings ? "ringing" : "left") as CallParticipantState,
        role: "guest" as const,
        invitedAt: now,
        joinedAt: null,
        leftAt: null,
        handRaisedAt: null,
        screenSharing: false,
        lastSeenAt: null,
      }))
    );
  }

  await emit({ scope: input.scope.type === "dm" ? { type: "dm", id: input.scope.id } : { type: "channel", id: input.scope.id }, kind: "call_state", payload: { action: "started", callId: call._id, mode: call.mode } });

  if (rings) {
    await ringParticipants(call._id, others, input.initiatorId);
  }

  await recordAudit({ actorId: input.initiatorId, action: "create", entity: "meeting", entityId: call._id, entityLabel: title, summary: `${input.mode} call` });
  return { ok: true, call, reused: false };
}

export async function ringParticipants(callId: string, userIds: string[], fromUserId: string): Promise<void> {
  const call = await getCall(callId);
  if (!call) return;
  const from = await getChatUsers([fromUserId]);
  const fromName = from[fromUserId]?.displayName ?? "Someone";

  const cn = await callNotifications();
  const events: EmitInput[] = [];
  for (const uid of userIds) {
    if (uid === fromUserId) continue;
    await cn.insertOne({ _id: newId(), callId, recipientUserId: uid, type: "incoming", seenAt: null, createdAt: new Date() });
    events.push({
      scope: { type: "user", id: uid },
      kind: "call_ring",
      // `to` is essential: a user is also subscribed to their DM partners'
      // `user:` scopes (for presence), so the ring for `uid` also reaches them.
      payload: { callId, to: uid, from: fromUserId, fromName, mode: call.mode, title: call.title, scope: call.scope },
      ttlSeconds: 60,
    });
  }
  await emitMany(events);
}

export async function joinCall(callId: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const call = await getCall(callId);
  if (!call) return { ok: false, error: "Call not found." };
  if (call.status === "ended") return { ok: false, error: "This call has ended." };

  const p = await participants();
  const joinedCount = await p.countDocuments({ callId, state: "joined" });
  const mine = await p.findOne({ callId, userId });
  if (!mine && joinedCount >= call.participantLimit) return { ok: false, error: "This call is full." };

  const now = new Date();
  await p.updateOne(
    { callId, userId },
    {
      $set: { state: "joined", joinedAt: mine?.joinedAt ?? now, leftAt: null, lastSeenAt: now },
      $setOnInsert: { _id: newId(), callId, userId, role: "guest", invitedAt: now, handRaisedAt: null, screenSharing: false },
    },
    { upsert: true }
  );

  if (call.status === "ringing") {
    await (await sessions()).updateOne({ _id: callId }, { $set: { status: "active", activeAt: now } });
  }

  await emitCallState(call, { action: "joined", userId });
  return { ok: true };
}

export async function declineCall(callId: string, userId: string): Promise<void> {
  const call = await getCall(callId);
  if (!call) return;
  await (await participants()).updateOne({ callId, userId }, { $set: { state: "declined", leftAt: new Date() } });
  await emitCallState(call, { action: "declined", userId });

  // A declined 1:1 call ends immediately.
  if (call.scope.type === "dm") await endCall(callId, userId, "declined");
}

export async function leaveCall(callId: string, userId: string): Promise<void> {
  const call = await getCall(callId);
  if (!call) return;
  await (await participants()).updateOne(
    { callId, userId },
    { $set: { state: "left", leftAt: new Date(), screenSharing: false, handRaisedAt: null } }
  );
  const set: Partial<CallSession> = {};
  if (call.presenterId === userId) set.presenterId = null;
  if (Object.keys(set).length) await (await sessions()).updateOne({ _id: callId }, { $set: set });

  await emitCallState(call, { action: "left", userId });

  const stillIn = await (await participants()).countDocuments({ callId, state: "joined" });
  if (stillIn === 0) await endCall(callId, userId, "empty");
}

export async function endCall(callId: string, actorId: string, reason: CallSession["endedReason"] = "hangup"): Promise<void> {
  const s = await sessions();
  const call = await s.findOne({ _id: callId, ...notDeleted });
  if (!call || call.status === "ended") return;

  const endedAt = new Date();
  await s.updateOne({ _id: callId }, { $set: { status: "ended", endedAt, endedReason: reason, presenterId: null, ...updateStamp(actorId) } });
  await (await participants()).updateMany(
    { callId, state: "joined" },
    { $set: { state: "left", leftAt: endedAt, screenSharing: false, handRaisedAt: null } }
  );

  await emitCallState(call, { action: "ended", reason });
  await writeHistoryAndSystemMessage(call, endedAt, reason);
}

async function emitCallState(call: CallSession, payload: Record<string, unknown>): Promise<void> {
  await emit({ scope: { type: "call", id: call._id }, kind: "call_state", payload: { ...payload, callId: call._id } });
  // Mirror lifecycle transitions onto the conversation scope so headers / lists update.
  if (payload.action === "started" || payload.action === "ended") {
    const convScope = call.scope.type === "dm" ? { type: "dm" as const, id: call.scope.id } : { type: "channel" as const, id: call.scope.id };
    await emit({ scope: convScope, kind: "call_state", payload: { ...payload, callId: call._id } });
  }
}

// ---------------------------------------------------------------------------
// In-call controls
// ---------------------------------------------------------------------------

export async function heartbeat(callId: string, userId: string): Promise<void> {
  await (await participants()).updateOne({ callId, userId, state: "joined" }, { $set: { lastSeenAt: new Date() } });
}

export async function setHand(callId: string, userId: string, raised: boolean): Promise<void> {
  const call = await getCall(callId);
  if (!call) return;
  await (await participants()).updateOne(
    { callId, userId },
    { $set: { handRaisedAt: raised ? new Date() : null } }
  );
  await emitCallState(call, { action: "hand", userId, raised });
}

export async function sendReaction(callId: string, userId: string, emoji: string): Promise<void> {
  const call = await getCall(callId);
  if (!call) return;
  await emit({ scope: { type: "call", id: callId }, kind: "call_state", payload: { action: "reaction", callId, userId, emoji: emoji.slice(0, 8) } });
}

/** Ephemeral broadcast of a participant's mic/cam state so others can show mute icons. */
export async function broadcastMediaState(callId: string, userId: string, micOn: boolean, camOn: boolean): Promise<void> {
  await emit({
    scope: { type: "call", id: callId },
    kind: "call_state",
    payload: { action: "media", callId, userId, micOn, camOn },
    ttlSeconds: 120,
  });
}

export async function setScreenShare(callId: string, userId: string, on: boolean, surface: ScreenSurface): Promise<void> {
  const call = await getCall(callId);
  if (!call) return;
  const now = new Date();
  await (await participants()).updateOne({ callId, userId }, { $set: { screenSharing: on } });
  await (await sessions()).updateOne(
    { _id: callId },
    { $set: { presenterId: on ? userId : call.presenterId === userId ? null : call.presenterId } }
  );
  const db = await getDb();
  const logs = db.collection<{ _id: string; callId: string; userId: string; surface: string; startedAt: Date; endedAt: Date | null }>(
    SCREEN_SHARE_LOGS_COLLECTION
  );
  if (on) {
    await logs.insertOne({ _id: newId(), callId, userId, surface, startedAt: now, endedAt: null });
  } else {
    await logs.updateOne({ callId, userId, endedAt: null }, { $set: { endedAt: now } });
  }
  await emitCallState(call, { action: "screen", userId, on });
}

export async function inviteToCall(callId: string, userIds: string[], actorId: string): Promise<{ ok: boolean; error?: string }> {
  const call = await getCall(callId);
  if (!call) return { ok: false, error: "Call not found." };
  if (call.status === "ended") return { ok: false, error: "This call has ended." };
  const p = await participants();
  const now = new Date();
  const fresh: string[] = [];
  for (const userId of Array.from(new Set(userIds))) {
    const existing = await p.findOne({ callId, userId });
    if (existing && (existing.state === "joined" || existing.state === "ringing")) continue;
    await p.updateOne(
      { callId, userId },
      { $set: { state: "ringing", leftAt: null }, $setOnInsert: { _id: newId(), callId, userId, role: "guest", invitedAt: now, joinedAt: null, handRaisedAt: null, screenSharing: false, lastSeenAt: null } },
      { upsert: true }
    );
    fresh.push(userId);
  }
  if (fresh.length > 0) await ringParticipants(callId, fresh, actorId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// History + inline call card
// ---------------------------------------------------------------------------

async function writeHistoryAndSystemMessage(call: CallSession, endedAt: Date, reason: CallSession["endedReason"]): Promise<void> {
  try {
    const rows = await listRawParticipants(call._id);
    const anyoneJoined = rows.some((r) => r.joinedAt !== null && r.userId !== call.initiatedBy);
    const durationSec = call.activeAt ? Math.max(0, Math.round((endedAt.getTime() - call.activeAt.getTime()) / 1000)) : 0;

    let outcome: CallOutcome = "accepted";
    if (reason === "declined") outcome = "declined";
    else if (!anyoneJoined && reason === "missed") outcome = "missed";
    else if (!anyoneJoined) outcome = "no_answer";

    const h = await history();
    const allIds = rows.map((r) => r.userId);
    await h.insertMany(
      rows.map((r) => ({
        _id: newId(),
        callId: call._id,
        scope: call.scope,
        userId: r.userId,
        mode: call.mode,
        outcome,
        direction: r.userId === call.initiatedBy ? "outgoing" : "incoming",
        counterpartIds: allIds.filter((id) => id !== r.userId),
        durationSec,
        at: endedAt,
      }))
    );

    // One inline system message in the conversation so the call card shows in-stream.
    const convScope =
      call.scope.type === "dm" ? { type: "dm" as const, id: call.scope.id } : { type: "channel" as const, id: call.scope.id };
    await postMessage({
      scope: convScope,
      authorId: call.initiatedBy,
      body: "",
      attachments: [],
      mentions: [],
      callMeta: {
        callId: call._id,
        mode: call.mode,
        outcome,
        durationSec,
        participantIds: rows.filter((r) => r.joinedAt !== null).map((r) => r.userId),
      },
    });

    if (call.scope.type === "dm") await touchConversation(call.scope.id, call.mode === "video" ? "📹 Call" : "📞 Call", call.initiatedBy);

    // Missed-call durable record for the callee's bell.
    if (outcome === "missed" || outcome === "no_answer") {
      const cn = await callNotifications();
      for (const r of rows.filter((x) => x.userId !== call.initiatedBy && x.joinedAt === null)) {
        await cn.insertOne({ _id: newId(), callId: call._id, recipientUserId: r.userId, type: "missed", seenAt: null, createdAt: endedAt });
        const from = await getChatUsers([call.initiatedBy]);
        await notify({
          recipientUserId: r.userId,
          type: "message",
          title: `Missed ${call.mode} call from ${from[call.initiatedBy]?.displayName ?? "someone"}`,
          body: null,
          link: call.scope.type === "dm" ? `/huddle-ai/dm/${call.scope.id}` : `/huddle-ai/channels`,
        });
      }
    }
  } catch {
    /* history / system message are best-effort */
  }
}

export interface CallHistoryEntry {
  callId: string;
  mode: CallMode;
  outcome: CallOutcome;
  durationSec: number;
  at: string;
  counterpartIds: string[];
}

export async function listCallHistoryForScope(scope: CallScope, limit = 50): Promise<CallHistoryEntry[]> {
  const h = await history();
  const rows = await h
    .find({ "scope.type": scope.type, "scope.id": scope.id })
    .sort({ at: -1 })
    .limit(limit)
    .toArray();
  const seen = new Set<string>();
  const out: CallHistoryEntry[] = [];
  for (const r of rows as unknown as (CallHistoryEntry & { callId: string })[]) {
    if (seen.has(r.callId)) continue;
    seen.add(r.callId);
    out.push({ callId: r.callId, mode: r.mode, outcome: r.outcome, durationSec: r.durationSec, at: new Date(r.at).toISOString(), counterpartIds: r.counterpartIds });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Missed-call badge
// ---------------------------------------------------------------------------

export async function unseenMissedCallCount(userId: string): Promise<number> {
  return (await callNotifications()).countDocuments({ recipientUserId: userId, type: "missed", seenAt: null });
}

export async function markMissedCallsSeen(userId: string): Promise<void> {
  await (await callNotifications()).updateMany(
    { recipientUserId: userId, seenAt: null },
    { $set: { seenAt: new Date() } }
  );
}

// ---------------------------------------------------------------------------
// Lifecycle sweep — throttled to once / 30s.
// ---------------------------------------------------------------------------

export async function runCallSweep(): Promise<void> {
  try {
    const db = await getDb();
    const meta = db.collection<{ _id: string; lastRun: Date }>(META_COLLECTION);
    const now = new Date();
    const claim = await meta.findOneAndUpdate(
      { _id: "call_sweep", lastRun: { $lt: new Date(now.getTime() - 30_000) } },
      { $set: { lastRun: now } },
      { returnDocument: "after" }
    );
    if (!claim) {
      const existing = await meta.findOne({ _id: "call_sweep" });
      if (existing) return;
      await meta.updateOne({ _id: "call_sweep" }, { $setOnInsert: { lastRun: now } }, { upsert: true });
    }

    const s = await sessions();

    // Unanswered ringing calls → missed.
    const ringing = await s.find({ status: "ringing", ...notDeleted }).limit(50).toArray();
    for (const call of ringing) {
      if (now.getTime() - call.startedAt.getTime() > RING_TIMEOUT_MS) {
        await (await participants()).updateMany({ callId: call._id, state: "ringing" }, { $set: { state: "missed" } });
        await endCall(call._id, call.initiatedBy, "missed");
      }
    }

    // Active calls whose every joined participant is heartbeat-stale → end.
    const active = await s.find({ status: "active", ...notDeleted }).limit(50).toArray();
    for (const call of active) {
      const roster = await activeRoster(call._id);
      if (roster.length === 0) await endCall(call._id, call.initiatedBy, "empty");
    }
  } catch {
    /* sweep failures never break a render */
  }
}
