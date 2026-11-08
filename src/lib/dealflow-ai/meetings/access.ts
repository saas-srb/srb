import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { isLmsAdmin } from "@/lib/lms-roles";
import type { CurrentLmsUser } from "@/lib/lms-auth";
import { resolveMeetingAgents } from "@/lib/dealflow-ai/meeting-agents";
import { addStaffToRoster, findGuestByToken, markJoined, setWaiting, toMeetingView, transitionMeeting, type Actor, type MeetingRoom } from "@/lib/dealflow-ai/db-meetings";
import { getLiveKitCredentials, issueRoomToken, type LiveKitCredentials } from "@/lib/dealflow-ai/meetings/livekit";
import { linkState, looksLikeJoinToken, tokenExpiry } from "@/lib/dealflow-ai/meetings/tokens";
import type { MeetingParticipant, MeetingRole, MeetingView } from "@/lib/dealflow-ai/meetings/types";
import type { MeetingRoomProps } from "@/lib/dealflow-ai/meetings/room-props";

/**
 * Who may see, host and join a meeting, and the server-side issuing of room tokens. Staff come in through their session, guests through their
 * personal link; neither can choose an identity or a role (both come from the roster). AI agents never get a token: their voice is published
 * from a staff member's browser.
 */

type StaffUser = Pick<CurrentLmsUser, "id" | "email" | "roles" | "permissionOverrides">;

/** Directors and CRM managers see and host every meeting of the company. */
export function isMeetingManager(user: StaffUser): boolean {
  return isLmsAdmin(user) || user.roles.includes("lms_manager");
}

export function listedStaff(m: Pick<MeetingRoom, "participants">, userId: string): MeetingParticipant | null {
  return m.participants.find((p) => p.kind === "internal" && p.refId === userId) ?? null;
}

export function canSeeMeeting(user: StaffUser, m: Pick<MeetingRoom, "participants" | "createdBy">): boolean {
  return isMeetingManager(user) || m.createdBy === user.id || !!listedStaff(m, user.id);
}

/** Edit, cancel, lock, admit, manage the roster and links: hosts, co-hosts, the creator and managers. */
export function canHostMeeting(user: StaffUser, m: Pick<MeetingRoom, "participants" | "createdBy">): boolean {
  if (isMeetingManager(user) || m.createdBy === user.id) return true;
  const me = listedStaff(m, user.id);
  return !!me && (me.role === "host" || me.role === "cohost");
}

export async function staffActor(user: StaffUser): Promise<Actor> {
  const p = await staffProfile(user.id);
  return { id: user.id, name: p?.name || user.email };
}

export async function staffProfile(userId: string): Promise<{ name: string; email: string } | null> {
  if (!ObjectId.isValid(userId)) return null;
  const u = await (await getDb()).collection<{ _id: ObjectId; name?: string; email?: string }>("admin_users").findOne({ _id: new ObjectId(userId) }, { projection: { name: 1, email: 1 } });
  return u ? { name: (u.name ?? "").trim() || (u.email ?? "").split("@")[0], email: u.email ?? "" } : null;
}

export type JoinErrorCode = "invalid" | "expired" | "not_started" | "ended" | "cancelled" | "locked" | "waiting" | "denied" | "not_found" | "not_configured";
export type JoinResult =
  | { ok: true; props: Omit<MeetingRoomProps, "leaveHref">; participantId: string }
  | { ok: false; code: JoinErrorCode; message: string; status: number; meeting?: { title: string; scheduledAt: string; timezone: string; status: string } };

export interface JoinDeps {
  now?: () => Date;
  credentials?: () => Promise<LiveKitCredentials | null>;
  token?: typeof issueRoomToken;
}

const MESSAGES: Record<JoinErrorCode, string> = {
  invalid: "This link is not valid. Ask the host to send you a new one.",
  expired: "This link has expired. Ask the host to send you a new one.",
  not_started: "The host hasn't started this meeting yet.",
  ended: "This meeting has ended.",
  cancelled: "This meeting was cancelled.",
  locked: "The host has locked this meeting.",
  waiting: "Waiting for the host to let you in.",
  denied: "You are not part of this meeting.",
  not_found: "We couldn't find this meeting.",
  not_configured: "Video calling isn't set up for this workspace yet. Ask an administrator to connect LiveKit in Settings → Integrations.",
};
const STATUS: Record<JoinErrorCode, number> = { invalid: 403, expired: 410, not_started: 409, ended: 410, cancelled: 410, locked: 423, waiting: 202, denied: 403, not_found: 404, not_configured: 503 };

function err(code: JoinErrorCode, m?: MeetingRoom): JoinResult {
  return { ok: false, code, message: MESSAGES[code], status: STATUS[code], ...(m ? { meeting: { title: m.title, scheduledAt: m.scheduledAt, timezone: m.timezone, status: m.status } } : {}) };
}

function ttlSeconds(m: MeetingRoom, now: Date): number {
  const left = (tokenExpiry(m.scheduledAt, m.durationMinutes).getTime() - now.getTime()) / 1000;
  return Math.round(Math.min(12 * 3600, Math.max(15 * 60, left)));
}

/** What a guest may see of the meeting: titles and names, never other people's contact details, the linked record, agent goals or the log. */
export function redactForGuest(v: MeetingView): MeetingView {
  return {
    ...v,
    agenda: v.agenda ? { title: v.agenda.title, ...(v.agenda.description ? { description: v.agenda.description } : {}) } : null,
    target: null, audit: [], transcript: undefined, summary: undefined, actionItems: undefined, recordingUrl: undefined, createdBy: "", remindersSent: {},
    participants: v.participants.map((p) => ({ id: p.id, kind: p.kind, role: p.role, name: p.name, refId: p.kind === "agent" ? p.refId : null, invitedAt: p.invitedAt, link: "none" as const, ...(p.kind === "agent" ? { aliases: p.aliases } : {}) })),
  };
}

async function build(m: MeetingRoom, p: MeetingParticipant, role: MeetingRole, kind: "internal" | "external", deps: JoinDeps, now: Date, canHost: boolean, auditView: boolean): Promise<JoinResult> {
  const creds = await (deps.credentials ?? getLiveKitCredentials)();
  if (!creds) return err("not_configured", m);
  const canRunAgents = kind === "internal";
  const token = await (deps.token ?? issueRoomToken)(creds, { roomId: m.roomId, participantId: p.id, name: p.name, kind, role, canRunAgents, ttlSeconds: ttlSeconds(m, now) });
  return {
    ok: true,
    participantId: p.id,
    props: { agents: await resolveMeetingAgents(m.participants.filter((x) => x.kind === "agent" && x.refId).map((x) => x.refId!)), stateUrl: `/api/dealflow-ai/meetings/${encodeURIComponent(m.roomId)}/state`, utterancesUrl: `/api/dealflow-ai/meetings/${encodeURIComponent(m.roomId)}/utterances`, meeting: kind === "external" ? redactForGuest(toMeetingView(m, { now })) : toMeetingView(m, { audit: auditView, now }), me: { participantId: p.id, kind, role, name: p.name }, liveKit: { url: creds.url }, token, canRunAgents, isGuest: kind === "external", canHost },
  };
}

/** A signed-in staff member joins. The first host (or manager) to arrive starts the meeting. */
export async function joinAsStaff(m: MeetingRoom, user: StaffUser, deps: JoinDeps = {}): Promise<JoinResult> {
  const now = (deps.now ?? (() => new Date()))();
  if (m.status === "cancelled") return err("cancelled", m);
  if (m.status === "ended") return err("ended", m);
  let me = listedStaff(m, user.id);
  const profile = await staffProfile(user.id);
  const actor: Actor = { id: user.id, name: profile?.name || user.email };
  if (!me) {
    if (!isMeetingManager(user) && m.createdBy !== user.id) return err("denied", m);
    const added = await addStaffToRoster(m.roomId, { id: user.id, name: actor.name, email: profile?.email ?? user.email });
    if (!added.ok) return { ok: false, code: "denied", message: added.error, status: added.status };
    me = added.result.participant;
    m = added.meeting;
  }
  const canHost = canHostMeeting(user, m);
  if (m.status === "scheduled") {
    if (!canHost) return err("not_started", m);
    const t = await transitionMeeting(m.roomId, "live", actor);
    if (!t.ok) return { ok: false, code: "denied", message: t.error, status: t.status };
    m = t.meeting;
  }
  const role: MeetingRole = me.role === "participant" && canHost ? "cohost" : me.role;
  const out = await build(m, me, role, "internal", deps, now, canHost, canHost);
  if (out.ok) await markJoined(m.roomId, me.id, actor);
  return out;
}

/** A guest comes in with their personal link. Identity and name are the roster's; nothing in the request can change them. */
export async function joinAsGuest(m: MeetingRoom, rawToken: unknown, deps: JoinDeps = {}): Promise<JoinResult> {
  const now = (deps.now ?? (() => new Date()))();
  if (!looksLikeJoinToken(rawToken)) return err("invalid");
  const p = findGuestByToken(m, rawToken);
  if (!p) return err("invalid");
  const state = linkState(p, now);
  if (state === "revoked" || state === "none") return err("invalid");
  if (state === "expired") return err("expired");
  if (m.status === "cancelled") return err("cancelled", m);
  if (m.status === "ended") return err("ended", m);
  if (m.status === "scheduled") return err("not_started", m);
  if (m.locked && !p.lastJoinedAt) return err("locked", m);
  const actor: Actor = { id: null, name: p.name };
  if (m.waitingRoom && !p.admittedAt) {
    await setWaiting(m.roomId, p.id, "waiting", actor);
    return { ...err("waiting", m) };
  }
  const out = await build(m, p, "participant", "external", deps, now, false, false);
  if (out.ok) await markJoined(m.roomId, p.id, actor);
  return out;
}

/** Read-only check for the guest's pre-join page: what state is this link in, without issuing anything or marking anyone as waiting. */
export function guestLinkStatus(m: MeetingRoom, rawToken: unknown, now = new Date()): { ok: true; name: string; title: string; scheduledAt: string; timezone: string; status: string; waitingRoom: boolean; admitted: boolean } | { ok: false; code: JoinErrorCode; message: string; meeting?: { title: string; scheduledAt: string; timezone: string; status: string } } {
  const bad = (code: JoinErrorCode, mm?: MeetingRoom) => ({ ok: false as const, code, message: MESSAGES[code], ...(mm ? { meeting: { title: mm.title, scheduledAt: mm.scheduledAt, timezone: mm.timezone, status: mm.status } } : {}) });
  if (!looksLikeJoinToken(rawToken)) return bad("invalid");
  const p = findGuestByToken(m, rawToken);
  if (!p) return bad("invalid");
  const s = linkState(p, now);
  if (s === "revoked" || s === "none") return bad("invalid");
  if (s === "expired") return bad("expired");
  if (m.status === "cancelled") return bad("cancelled", m);
  if (m.status === "ended") return bad("ended", m);
  return { ok: true, name: p.name, title: m.title, scheduledAt: m.scheduledAt, timezone: m.timezone, status: m.status, waitingRoom: !!m.waitingRoom, admitted: !!p.admittedAt };
}
