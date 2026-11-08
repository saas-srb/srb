import "server-only";
import { timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { nanoid } from "@/lib/dealflow-ai/nanoid";
import { isLegacyMeeting, migrateLegacyMeeting } from "@/lib/dealflow-ai/meetings/legacy";
import { generateJoinToken, hashJoinToken, linkState, tokenExpiry } from "@/lib/dealflow-ai/meetings/tokens";
import { checkRoster, type MeetingFields } from "@/lib/dealflow-ai/meetings/validate";
import type { InviteStatus, MeetingAuditEntry, MeetingDoc, MeetingParticipant, MeetingParticipantView, MeetingStatus, MeetingView } from "@/lib/dealflow-ai/meetings/types";

export type { MeetingStatus } from "@/lib/dealflow-ai/meetings/types";

/**
 * Meetings (`meeting_rooms`): any number of guests, staff and AI agents per meeting. Every change goes through `mutateMeeting`, which writes only
 * if nobody changed the meeting meanwhile (a revision counter), so two hosts clicking at once cannot lose each other's change and the status
 * can only move along scheduled -> live -> ended or scheduled -> cancelled.
 */

const COLLECTION = "meeting_rooms";

/** A meeting plus the fields the older single-client code read (agent ids, the first guest, the host's name). */
export interface MeetingRoom extends MeetingDoc {
  agentIds: string[];
  agentNames: string[];
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientCompany: string;
  salesPersonName: string;
  notes: string;
}

export interface Actor {
  id: string | null;
  name: string;
}
export const SYSTEM_ACTOR: Actor = { id: null, name: "System" };

let indexed = false;
export function resetMeetingIndexes(): void {
  indexed = false;
}
async function col() {
  const c = (await getDb()).collection(COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([
      c.createIndex({ roomId: 1 }, { unique: true }),
      c.createIndex({ status: 1, scheduledAt: 1 }),
      c.createIndex({ "participants.refId": 1 }),
    ]).catch(() => {});
  }
  return c;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDoc(raw: any): MeetingDoc {
  const base: MeetingDoc = isLegacyMeeting(raw) ? migrateLegacyMeeting(raw) : { ...raw };
  return {
    ...base,
    _id: raw._id?.toString(),
    scheduledAt: iso(raw.scheduledAt),
    createdAt: iso(raw.createdAt) || base.createdAt,
    updatedAt: iso(raw.updatedAt) || base.updatedAt,
    audit: Array.isArray(base.audit) ? base.audit : [],
    sequence: base.sequence ?? 0,
    rev: base.rev ?? 0,
    waitingRoom: base.waitingRoom ?? false,
    locked: base.locked ?? false,
    target: base.target ?? null,
    remindersSent: base.remindersSent ?? {},
  };
}

export function withCompat(d: MeetingDoc): MeetingRoom {
  const agents = d.participants.filter((p) => p.kind === "agent");
  const guest = d.participants.find((p) => p.kind === "external");
  const host = d.participants.find((p) => p.kind === "internal" && p.role === "host");
  return {
    ...d,
    agentIds: agents.map((a) => a.refId ?? "").filter(Boolean),
    agentNames: agents.map((a) => a.name),
    clientName: guest?.name ?? "",
    clientEmail: guest?.email ?? "",
    clientPhone: guest?.phone ?? "",
    clientCompany: guest?.company ?? "",
    salesPersonName: host?.name ?? "",
    notes: d.agenda?.description ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serialize = (raw: any): MeetingRoom => withCompat(toDoc(raw));

/** The browser's copy of a meeting: no token hashes; the audit log only for people allowed to see it. */
export function toMeetingView(m: MeetingDoc, opts: { audit?: boolean; now?: Date } = {}): MeetingView {
  const now = opts.now ?? new Date();
  const participants: MeetingParticipantView[] = m.participants.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { joinTokenHash, ...rest } = p;
    return { ...rest, link: p.kind === "external" ? linkState(p, now) : "none" };
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, participants: _p, audit, ...rest } = m;
  return { ...rest, id: m._id ?? m.roomId, participants, audit: opts.audit ? audit : [] };
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────

export interface MeetingFilter {
  status?: MeetingStatus | MeetingStatus[];
  /** Only meetings this staff member is listed in or created (for people who are not managers). */
  visibleTo?: string;
  participantRefId?: string;
  agentId?: string;
  fromIso?: string;
  toIso?: string;
  order?: "asc" | "desc";
  limit?: number;
}

export async function listMeetings(filter: MeetingFilter = {}): Promise<MeetingRoom[]> {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = Array.isArray(filter.status) ? { $in: filter.status } : filter.status;
  const and: Record<string, unknown>[] = [];
  if (filter.visibleTo) and.push({ $or: [{ createdBy: filter.visibleTo }, { participants: { $elemMatch: { kind: "internal", refId: filter.visibleTo } } }] });
  if (filter.participantRefId) and.push({ participants: { $elemMatch: { kind: "internal", refId: filter.participantRefId } } });
  if (filter.agentId) and.push({ participants: { $elemMatch: { kind: "agent", refId: filter.agentId } } });
  if (filter.fromIso || filter.toIso) q.scheduledAt = { ...(filter.fromIso ? { $gte: filter.fromIso } : {}), ...(filter.toIso ? { $lt: filter.toIso } : {}) };
  if (and.length) q.$and = and;
  const docs = await (await col()).find(q).sort({ scheduledAt: filter.order === "asc" ? 1 : -1 }).limit(Math.min(filter.limit ?? 300, 500)).toArray();
  return docs.map(serialize);
}

export async function getMeeting(roomId: string): Promise<MeetingRoom | null> {
  const c = await col();
  // Try by roomId slug first, then by _id
  let doc = await c.findOne({ roomId });
  if (!doc && /^[a-f\d]{24}$/i.test(roomId)) doc = await c.findOne({ _id: new ObjectId(roomId) } as never);
  return doc ? serialize(doc) : null;
}

// ── The one write path ───────────────────────────────────────────────────────────────────────────

type AuditInput = Omit<MeetingAuditEntry, "at" | "actorId" | "actorName">;
export type Mutation<T> = { set?: Partial<MeetingDoc>; audit?: AuditInput[]; result?: T } | { error: string; status?: number };
export type MutateResult<T> = { ok: true; meeting: MeetingRoom; result: T } | { ok: false; error: string; status: number };

const AUDIT_CAP = 300;

export async function mutateMeeting<T = undefined>(roomId: string, actor: Actor, fn: (m: MeetingDoc) => Mutation<T> | Promise<Mutation<T>>): Promise<MutateResult<T>> {
  const c = await col();
  for (let attempt = 0; attempt < 6; attempt++) {
    const raw = await c.findOne({ roomId });
    if (!raw) return { ok: false, error: "Meeting not found", status: 404 };
    const legacy = isLegacyMeeting(raw);
    const doc = toDoc(raw);
    const out = await fn(doc);
    if ("error" in out) return { ok: false, error: out.error, status: out.status ?? 409 };
    const now = new Date();
    const merged: MeetingDoc = { ...doc, ...(out.set ?? {}) };
    const audit = [...(doc.audit ?? []), ...(out.audit ?? []).map((a): MeetingAuditEntry => ({ at: now.toISOString(), actorId: actor.id, actorName: actor.name, ...a }))].slice(-AUDIT_CAP);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, createdAt, ...writable } = merged;
    const $set: Record<string, unknown> = { ...(legacy ? writable : (out.set ?? {})), audit, rev: (doc.rev ?? 0) + 1, updatedAt: now };
    if (legacy) $set.createdAt = raw.createdAt ?? new Date(createdAt || now);
    delete $set._id;
    const res = await c.updateOne({ _id: raw._id, ...(raw.rev === undefined ? { rev: { $exists: false } } : { rev: raw.rev }) } as never, { $set });
    if (res.matchedCount === 1) return { ok: true, meeting: serialize({ ...raw, ...$set }), result: out.result as T };
  }
  return { ok: false, error: "The meeting was changed by someone else at the same time. Try again.", status: 409 };
}

// ── Creating ─────────────────────────────────────────────────────────────────────────────────────

export interface NewMeeting {
  fields: MeetingFields;
  participants: MeetingParticipant[];
  createdBy: Actor;
}

/** Creates the meeting and a personal link for every guest. The raw tokens are returned once and never stored. */
export async function scheduleMeeting(input: NewMeeting): Promise<{ meeting: MeetingRoom; tokens: { participantId: string; token: string }[] }> {
  const rosterError = checkRoster(input.participants);
  if (rosterError) throw new MeetingInputError(rosterError);
  const now = new Date();
  const tokens: { participantId: string; token: string }[] = [];
  const expires = tokenExpiry(input.fields.scheduledAt, input.fields.durationMinutes).toISOString();
  const participants = input.participants.map((p) => {
    if (p.kind !== "external") return p;
    const token = generateJoinToken();
    tokens.push({ participantId: p.id, token });
    return { ...p, joinTokenHash: hashJoinToken(token), joinTokenExpiresAt: expires, joinTokenRevokedAt: null, invite: p.invite ?? { state: "none", at: null } satisfies InviteStatus };
  });
  const c = await col();
  for (let i = 0; i < 5; i++) {
    const roomId = `df-${nanoid(10)}`;
    const doc = {
      roomId, ...input.fields, status: "scheduled" as MeetingStatus, participants, sequence: 0, rev: 0, locked: false, startedAt: null, endedAt: null, cancelledAt: null,
      audit: [{ at: now.toISOString(), actorId: input.createdBy.id, actorName: input.createdBy.name, action: "create", detail: `${participants.length} participants` }],
      remindersSent: {}, postProcessedAt: null, timelineWrittenAt: null,
      createdBy: input.createdBy.id ?? "system", createdAt: now, updatedAt: now,
    };
    try {
      const r = await c.insertOne(doc as never);
      return { meeting: serialize({ ...doc, _id: r.insertedId }), tokens };
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  throw new Error("Could not allocate a meeting id");
}

export class MeetingInputError extends Error {}

/** Older callers pass the single-client shape; it is stored in the new shape. */
export interface LegacyMeetingInput {
  roomId: string;
  title: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientCompany?: string;
  scheduledAt: string;
  durationMinutes: number;
  status: MeetingStatus;
  agentIds: string[];
  agentNames: string[];
  salesPersonName?: string;
  notes?: string;
  clientJoinLink?: string;
  recordingUrl?: string;
  transcript?: string;
  summary?: string;
}

export async function createMeeting(data: LegacyMeetingInput): Promise<MeetingRoom> {
  const now = new Date();
  const doc = migrateLegacyMeeting({ ...data, createdAt: now, updatedAt: now });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, updatedAt, ...rest } = doc;
  const r = await (await col()).insertOne({ ...rest, createdAt: now, updatedAt: now } as never);
  return serialize({ ...rest, _id: r.insertedId, createdAt: now, updatedAt: now });
}

// ── Status machine ───────────────────────────────────────────────────────────────────────────────

const ALLOWED: Record<MeetingStatus, MeetingStatus[]> = { scheduled: ["live", "cancelled"], live: ["ended"], ended: [], cancelled: [] };
export const canTransition = (from: MeetingStatus, to: MeetingStatus): boolean => ALLOWED[from].includes(to);

export async function transitionMeeting(roomId: string, to: MeetingStatus, actor: Actor, opts: { reason?: string } = {}): Promise<MutateResult<{ changed: boolean }>> {
  return mutateMeeting<{ changed: boolean }>(roomId, actor, (m) => {
    // Already there: starting a live meeting again (a second host joining) is not an error.
    if (m.status === to) return { result: { changed: false } };
    if (!canTransition(m.status, to)) return { error: m.status === "cancelled" ? "This meeting was cancelled." : m.status === "ended" ? "This meeting has ended." : `A ${m.status} meeting cannot become ${to}.` };
    const at = new Date().toISOString();
    return {
      set: { status: to, ...(to === "live" ? { startedAt: at } : {}), ...(to === "ended" ? { endedAt: at } : {}), ...(to === "cancelled" ? { cancelledAt: at, ...(opts.reason ? { cancelReason: opts.reason.slice(0, 500) } : {}) } : {}) },
      audit: [{ action: to === "live" ? "start" : to === "ended" ? "end" : "cancel", ...(opts.reason ? { detail: opts.reason.slice(0, 200) } : {}) }],
      result: { changed: true },
    };
  });
}

/** Older callers: set a status (and optionally the transcript/summary/recording) in one go. */
export async function updateMeetingStatus(roomId: string, status: MeetingStatus, extra?: Partial<Pick<MeetingRoom, "recordingUrl" | "transcript" | "summary">>, actor: Actor = SYSTEM_ACTOR): Promise<boolean> {
  const res = await mutateMeeting(roomId, actor, (m) => {
    const move = m.status !== status;
    if (move && !canTransition(m.status, status)) return { error: "Illegal status change", status: 409 };
    const at = new Date().toISOString();
    return { set: { ...(extra ?? {}), ...(move ? { status, ...(status === "live" ? { startedAt: at } : {}), ...(status === "ended" ? { endedAt: at } : {}), ...(status === "cancelled" ? { cancelledAt: at } : {}) } : {}) }, audit: move ? [{ action: status === "live" ? "start" : status === "ended" ? "end" : "cancel" }] : [] };
  });
  return res.ok;
}

export async function deleteMeeting(roomId: string): Promise<boolean> {
  const result = await (await col()).deleteOne({ roomId });
  return result.deletedCount > 0;
}

// ── Fields, roster, links ───────────────────────────────────────────────────────────────────────

const open = (m: MeetingDoc) => (m.status === "ended" || m.status === "cancelled" ? `This meeting is ${m.status}; it can no longer be changed.` : null);

export async function updateMeetingFields(roomId: string, fields: MeetingFields, actor: Actor): Promise<MutateResult<{ rescheduled: boolean }>> {
  return mutateMeeting(roomId, actor, (m) => {
    const closed = open(m);
    if (closed) return { error: closed };
    const rescheduled = fields.scheduledAt !== m.scheduledAt || fields.durationMinutes !== m.durationMinutes;
    if (rescheduled && m.status === "live") return { error: "A meeting that has started cannot be rescheduled." };
    const expires = tokenExpiry(fields.scheduledAt, fields.durationMinutes).toISOString();
    return {
      set: {
        ...fields,
        ...(rescheduled ? {
          sequence: (m.sequence ?? 0) + 1,
          remindersSent: {},
          // Active guest links follow the new end time; revoked ones stay revoked.
          participants: m.participants.map((p) => (p.kind === "external" && p.joinTokenHash && !p.joinTokenRevokedAt ? { ...p, joinTokenExpiresAt: expires } : p)),
        } : {}),
      },
      audit: [{ action: "update", detail: rescheduled ? "rescheduled" : "details changed" }],
      result: { rescheduled },
    };
  });
}

export async function addParticipants(roomId: string, add: MeetingParticipant[], actor: Actor): Promise<MutateResult<{ tokens: { participantId: string; token: string }[] }>> {
  return mutateMeeting(roomId, actor, (m) => {
    const closed = open(m);
    if (closed) return { error: closed };
    const expires = tokenExpiry(m.scheduledAt, m.durationMinutes).toISOString();
    const tokens: { participantId: string; token: string }[] = [];
    const added = add.map((p) => {
      if (p.kind !== "external") return p;
      const token = generateJoinToken();
      tokens.push({ participantId: p.id, token });
      return { ...p, joinTokenHash: hashJoinToken(token), joinTokenExpiresAt: expires, joinTokenRevokedAt: null, invite: { state: "none", at: null } satisfies InviteStatus };
    });
    const participants = [...m.participants, ...added];
    const bad = checkRoster(participants);
    if (bad) return { error: bad, status: 400 };
    return { set: { participants }, audit: added.map((p) => ({ action: "participant_add" as const, detail: `${p.kind}: ${p.name}` })), result: { tokens } };
  });
}

export async function removeParticipant(roomId: string, participantId: string, actor: Actor): Promise<MutateResult<{ removed: MeetingParticipant }>> {
  return mutateMeeting(roomId, actor, (m) => {
    const closed = open(m);
    if (closed) return { error: closed };
    const p = m.participants.find((x) => x.id === participantId);
    if (!p) return { error: "That participant is not in this meeting.", status: 404 };
    const participants = m.participants.filter((x) => x.id !== participantId);
    const bad = checkRoster(participants);
    if (bad) return { error: bad, status: 400 };
    return { set: { participants }, audit: [{ action: "participant_remove", detail: `${p.kind}: ${p.name}` }], result: { removed: p } };
  });
}

/** Changes one participant's editable bits (agent aliases, host/cohost role, guest details). */
export async function updateParticipant(roomId: string, participantId: string, patch: Partial<Pick<MeetingParticipant, "aliases" | "role" | "name" | "email" | "phone" | "company">>, actor: Actor): Promise<MutateResult<undefined>> {
  return mutateMeeting(roomId, actor, (m) => {
    const closed = open(m);
    if (closed) return { error: closed };
    if (!m.participants.some((x) => x.id === participantId)) return { error: "That participant is not in this meeting.", status: 404 };
    const participants = m.participants.map((x) => (x.id === participantId ? { ...x, ...patch } : x));
    const bad = checkRoster(participants);
    if (bad) return { error: bad, status: 400 };
    return { set: { participants }, audit: [{ action: "update", detail: `participant ${participantId}` }] };
  });
}

/** A fresh personal link for a guest (the old one stops working). The raw token is returned once. */
export async function regenerateGuestToken(roomId: string, participantId: string, actor: Actor): Promise<MutateResult<{ token: string }>> {
  return mutateMeeting(roomId, actor, (m) => {
    const closed = open(m);
    if (closed) return { error: closed };
    const p = m.participants.find((x) => x.id === participantId);
    if (!p || p.kind !== "external") return { error: "Only guests have a personal link.", status: 404 };
    const token = generateJoinToken();
    const expires = tokenExpiry(m.scheduledAt, m.durationMinutes).toISOString();
    return {
      set: { participants: m.participants.map((x) => (x.id === participantId ? { ...x, joinTokenHash: hashJoinToken(token), joinTokenExpiresAt: expires, joinTokenRevokedAt: null } : x)) },
      audit: [{ action: "link_regenerate", detail: p.name }],
      result: { token },
    };
  });
}

export async function revokeGuestToken(roomId: string, participantId: string, actor: Actor): Promise<MutateResult<undefined>> {
  return mutateMeeting(roomId, actor, (m) => {
    const p = m.participants.find((x) => x.id === participantId);
    if (!p || p.kind !== "external") return { error: "Only guests have a personal link.", status: 404 };
    const at = new Date().toISOString();
    return {
      set: { participants: m.participants.map((x) => (x.id === participantId ? { ...x, joinTokenHash: null, joinTokenExpiresAt: null, joinTokenRevokedAt: at, waitingSince: null, admittedAt: null } : x)) },
      audit: [{ action: "link_revoke", detail: p.name }],
    };
  });
}

/** The guest a raw token belongs to in this meeting (any state: the caller decides what an expired or revoked one means). */
export function findGuestByToken(m: MeetingDoc, token: string): MeetingParticipant | null {
  const want = Buffer.from(hashJoinToken(token), "hex");
  for (const p of m.participants) {
    if (p.kind !== "external" || !p.joinTokenHash) continue;
    const have = Buffer.from(p.joinTokenHash, "hex");
    if (have.length === want.length && timingSafeEqual(have, want)) return p;
  }
  return null;
}

export async function setInviteStatus(roomId: string, participantId: string, invite: InviteStatus): Promise<void> {
  await mutateMeeting(roomId, SYSTEM_ACTOR, (m) => {
    if (!m.participants.some((p) => p.id === participantId)) return { error: "gone", status: 404 };
    return { set: { participants: m.participants.map((p) => (p.id === participantId ? { ...p, invite } : p)) } };
  });
}

export async function setRoomFlags(roomId: string, flags: { locked?: boolean; waitingRoom?: boolean }, actor: Actor): Promise<MutateResult<undefined>> {
  return mutateMeeting(roomId, actor, (m) => {
    const closed = open(m);
    if (closed) return { error: closed };
    return {
      set: flags,
      audit: [
        ...(flags.locked !== undefined && flags.locked !== !!m.locked ? [{ action: (flags.locked ? "lock" : "unlock") as MeetingAuditEntry["action"] }] : []),
        ...(flags.waitingRoom !== undefined && flags.waitingRoom !== !!m.waitingRoom ? [{ action: "update" as const, detail: `waiting room ${flags.waitingRoom ? "on" : "off"}` }] : []),
      ],
    };
  });
}

/** Waiting room: a guest asks in (waitingSince set) / a host admits or denies. */
export async function setWaiting(roomId: string, participantId: string, state: "waiting" | "admitted" | "denied", actor: Actor): Promise<MutateResult<undefined>> {
  return mutateMeeting(roomId, actor, (m) => {
    const p = m.participants.find((x) => x.id === participantId);
    if (!p) return { error: "That participant is not in this meeting.", status: 404 };
    const at = new Date().toISOString();
    const next: MeetingParticipant = state === "waiting" ? { ...p, waitingSince: p.waitingSince ?? at } : state === "admitted" ? { ...p, waitingSince: null, admittedAt: at } : { ...p, waitingSince: null, admittedAt: null };
    return { set: { participants: m.participants.map((x) => (x.id === participantId ? next : x)) }, audit: state === "waiting" ? [] : [{ action: state === "admitted" ? "admit" : "deny", detail: p.name }] };
  });
}

export async function markJoined(roomId: string, participantId: string, actor: Actor): Promise<void> {
  await mutateMeeting(roomId, actor, (m) => {
    if (!m.participants.some((p) => p.id === participantId)) return { error: "gone", status: 404 };
    const p = m.participants.find((x) => x.id === participantId)!;
    return { set: { participants: m.participants.map((x) => (x.id === participantId ? { ...x, lastJoinedAt: new Date().toISOString() } : x)) }, audit: [{ action: "join", detail: `${p.name} (${p.kind})` }] };
  });
}

/** A signed-in manager who is not on the roster joins as a participant. */
export async function addStaffToRoster(roomId: string, user: { id: string; name: string; email: string }): Promise<MutateResult<{ participant: MeetingParticipant }>> {
  return mutateMeeting(roomId, { id: user.id, name: user.name }, (m) => {
    const existing = m.participants.find((p) => p.kind === "internal" && p.refId === user.id);
    if (existing) return { result: { participant: existing } };
    const participant: MeetingParticipant = { id: `p_${nanoid(10)}`, kind: "internal", role: "participant", name: user.name, refId: user.id, email: user.email, invitedAt: new Date().toISOString() };
    const participants = [...m.participants, participant];
    if (participants.filter((p) => p.kind !== "agent").length > 50) return { error: "This meeting is full.", status: 409 };
    return { set: { participants }, audit: [{ action: "participant_add", detail: `internal: ${user.name} (joined as manager)` }], result: { participant } };
  });
}

/** Marks the reminder as sent; false when it already was (another run got there first). */
export async function claimReminder(roomId: string, which: "m60" | "m10"): Promise<boolean> {
  const res = await mutateMeeting(roomId, SYSTEM_ACTOR, (m) => {
    if (m.status !== "scheduled") return { error: "not scheduled" };
    if (m.remindersSent?.[which]) return { result: false };
    return { set: { remindersSent: { ...m.remindersSent, [which]: new Date().toISOString() } }, result: true };
  });
  return res.ok && res.result === true;
}

// ── Post-meeting ────────────────────────────────────────────────────────────────────────────────

/** First caller wins: marks the ended meeting as being summarised. Everyone else gets false (summary only once). */
export async function claimPostProcessing(roomId: string): Promise<MeetingRoom | null> {
  const res = await mutateMeeting(roomId, SYSTEM_ACTOR, (m) => {
    if (m.status !== "ended") return { error: "not ended" };
    if (m.postProcessedAt) return { result: false };
    return { set: { postProcessedAt: new Date().toISOString() }, result: true };
  });
  return res.ok && res.result === true ? res.meeting : null;
}

export async function releasePostProcessing(roomId: string): Promise<void> {
  await mutateMeeting(roomId, SYSTEM_ACTOR, () => ({ set: { postProcessedAt: null } }));
}

export async function saveMeetingResult(roomId: string, set: Partial<Pick<MeetingDoc, "transcript" | "summary" | "actionItems" | "summaryNote" | "recordingUrl">>, audit?: AuditInput): Promise<MeetingRoom | null> {
  const res = await mutateMeeting(roomId, SYSTEM_ACTOR, () => ({ set, audit: audit ? [audit] : [] }));
  return res.ok ? res.meeting : null;
}

/** True the first time; false when the timeline entry was already written. */
export async function claimTimelineWrite(roomId: string): Promise<boolean> {
  const res = await mutateMeeting(roomId, SYSTEM_ACTOR, (m) => (m.timelineWrittenAt ? { result: false } : { set: { timelineWrittenAt: new Date().toISOString() }, result: true }));
  return res.ok && res.result === true;
}

export const MEETING_STATUSES: readonly MeetingStatus[] = ["scheduled", "live", "ended", "cancelled"];
export const MEETING_TEXT_MAX = { transcript: 200_000, summary: 20_000, recordingUrl: 2048 } as const;

export type MeetingPatch = { ok: true; status: MeetingStatus; extra: Partial<Pick<MeetingRoom, "recordingUrl" | "transcript" | "summary">> } | { ok: false; error: string };

/**
 * Validates a meeting PATCH body. Only status, recordingUrl, transcript and summary are ever read (anything else in the body is ignored),
 * a recording must be an https URL without credentials, and text fields are strings under a size cap.
 */
export function parseMeetingPatch(body: unknown): MeetingPatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "A JSON object is required" };
  const b = body as Record<string, unknown>;
  if (typeof b.status !== "string" || !MEETING_STATUSES.includes(b.status as MeetingStatus)) return { ok: false, error: "A valid status is required" };
  const extra: Partial<Pick<MeetingRoom, "recordingUrl" | "transcript" | "summary">> = {};
  for (const key of ["transcript", "summary"] as const) {
    if (b[key] === undefined) continue;
    if (typeof b[key] !== "string") return { ok: false, error: `${key} must be text` };
    if ((b[key] as string).length > MEETING_TEXT_MAX[key]) return { ok: false, error: `${key} is too long` };
    extra[key] = b[key] as string;
  }
  if (b.recordingUrl !== undefined) {
    if (typeof b.recordingUrl !== "string" || b.recordingUrl.length > MEETING_TEXT_MAX.recordingUrl) return { ok: false, error: "recordingUrl must be a valid https URL" };
    let u: URL;
    try { u = new URL(b.recordingUrl); } catch { return { ok: false, error: "recordingUrl must be a valid https URL" }; }
    if (u.protocol !== "https:" || u.username || u.password) return { ok: false, error: "recordingUrl must be a valid https URL" };
    extra.recordingUrl = u.toString();
  }
  return { ok: true, status: b.status as MeetingStatus, extra };
}
