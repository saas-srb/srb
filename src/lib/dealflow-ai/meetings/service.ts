import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { hasLmsAccess } from "@/lib/lms-roles";
import { nanoid } from "@/lib/dealflow-ai/nanoid";
import { scheduleMeeting, MeetingInputError, type MeetingRoom } from "@/lib/dealflow-ai/db-meetings";
import { checkRoster, normalizeParticipant, parseMeetingFields, type Directory } from "@/lib/dealflow-ai/meetings/validate";
import { staffProfile } from "@/lib/dealflow-ai/meetings/access";
import type { MeetingParticipant } from "@/lib/dealflow-ai/meetings/types";
import type { Actor } from "@/lib/dealflow-ai/db-meetings";

/** Turning a scheduling request into a stored meeting. Names and emails of staff and agents are read here, never taken from the request. */

export interface StaffOption {
  id: string;
  name: string;
  email: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Company users who can use the CRM (the room page needs it) and can sign in. */
export async function listStaffOptions(q = "", limit = 200): Promise<StaffOption[]> {
  const filter: Record<string, unknown> = { status: { $nin: BLOCKED_STATUSES } };
  if (q.trim()) filter.$or = [{ name: { $regex: escapeRe(q.trim().slice(0, 60)), $options: "i" } }, { email: { $regex: escapeRe(q.trim().slice(0, 60)), $options: "i" } }];
  const rows = await (await getDb()).collection<{ _id: ObjectId; name?: string; email?: string; roles?: string[] }>("admin_users").find(filter, { projection: { name: 1, email: 1, roles: 1 } }).sort({ name: 1 }).limit(Math.min(limit, 500)).toArray();
  return rows.filter((r) => hasLmsAccess(r.roles)).map((r) => ({ id: String(r._id), name: (r.name ?? "").trim() || (r.email ?? "").split("@")[0], email: r.email ?? "" }));
}

export interface TargetOption {
  product: "dealflow-ai";
  entityType: "lead" | "applicant";
  entityId: string;
  label: string;
  detail: string;
}

/** Leads and job applicants to link a meeting to (so the agents can be briefed and the result is written back). */
export async function searchTargets(q: string, limit = 8): Promise<TargetOption[]> {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const re = { $regex: escapeRe(term), $options: "i" };
  const db = await getDb();
  const [leads, apps] = await Promise.all([
    db.collection("lead_records").find({ deletedAt: null, $or: [{ name: re }, { email: re }, { phone: re }] } as never, { projection: { name: 1, email: 1, type: 1 } }).limit(limit).toArray(),
    db.collection("career_applications").find({ $or: [{ name: re }, { email: re }, { phone: re }] } as never, { projection: { name: 1, email: 1, positionTitle: 1 } }).limit(limit).toArray(),
  ]);
  return [
    ...leads.map((l) => ({ product: "dealflow-ai" as const, entityType: "lead" as const, entityId: String(l._id), label: String(l.name ?? "Lead"), detail: `Lead${l.email ? ` · ${l.email}` : ""}` })),
    ...apps.map((a) => ({ product: "dealflow-ai" as const, entityType: "applicant" as const, entityId: String(a._id), label: String(a.name ?? "Applicant"), detail: `Applicant${a.positionTitle ? ` · ${a.positionTitle}` : ""}` })),
  ].slice(0, limit * 2);
}

export interface ServiceDeps {
  /** The AgentOS voice agents the user may bring in (id and name). */
  agents: () => Promise<{ id: string; name: string }[]>;
  staff?: (ids: string[]) => Promise<Map<string, { name: string; email: string }>>;
}

export async function loadDirectory(raw: unknown, deps: ServiceDeps): Promise<Directory> {
  const list = Array.isArray(raw) ? raw : [];
  const staffIds = [...new Set(list.filter((p): p is { kind: string; refId: string } => typeof p === "object" && p !== null && (p as { kind?: unknown }).kind === "internal" && typeof (p as { refId?: unknown }).refId === "string").map((p) => p.refId))].slice(0, 100);
  const staff = new Map<string, { name: string; email: string }>();
  if (deps.staff) for (const [k, v] of await deps.staff(staffIds)) staff.set(k, v);
  else for (const o of await listStaffOptions("", 500)) if (staffIds.includes(o.id)) staff.set(o.id, { name: o.name, email: o.email });
  return { staff, agents: new Map((await deps.agents()).map((a) => [a.id, { name: a.name }])) };
}

export type CreateResult = { ok: true; meeting: MeetingRoom; tokens: { participantId: string; token: string }[]; sendInvites: boolean } | { ok: false; error: string; status: number };

export async function createMeetingFromInput(raw: unknown, user: { id: string; email: string }, deps: ServiceDeps, now = new Date()): Promise<CreateResult> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Invalid request", status: 400 };
  const body = raw as Record<string, unknown>;
  const fields = parseMeetingFields(body, now);
  if (!fields.ok) return { ok: false, error: fields.error, status: 400 };
  if (!Array.isArray(body.participants)) return { ok: false, error: "Add the people who should join.", status: 400 };
  const dir = await loadDirectory(body.participants, deps);
  const creator = await staffProfile(user.id);
  const input = [...body.participants] as unknown[];
  const hasHost = input.some((p) => typeof p === "object" && p !== null && (p as { kind?: unknown; role?: unknown }).kind === "internal" && (p as { role?: unknown }).role === "host");
  const creatorListed = input.some((p) => typeof p === "object" && p !== null && (p as { kind?: unknown; refId?: unknown }).kind === "internal" && (p as { refId?: unknown }).refId === user.id);
  // The person scheduling hosts it unless they chose another host.
  if (!hasHost && !creatorListed) {
    dir.staff.set(user.id, { name: creator?.name ?? user.email, email: creator?.email ?? user.email });
    input.unshift({ kind: "internal", refId: user.id, role: "host" });
  } else if (!hasHost) {
    const i = input.findIndex((p) => typeof p === "object" && p !== null && (p as { refId?: unknown }).refId === user.id);
    input[i] = { ...(input[i] as object), role: "host" };
  }
  const participants: MeetingParticipant[] = [];
  for (const p of input) {
    const n = normalizeParticipant(p, dir, () => `p_${nanoid(10)}`, now);
    if (!n.ok) return { ok: false, error: n.error, status: 400 };
    participants.push(n.value);
  }
  const bad = checkRoster(participants);
  if (bad) return { ok: false, error: bad, status: 400 };
  try {
    const actor: Actor = { id: user.id, name: creator?.name ?? user.email };
    const { meeting, tokens } = await scheduleMeeting({ fields: fields.value, participants, createdBy: actor });
    return { ok: true, meeting, tokens, sendInvites: body.sendInvites !== false };
  } catch (e) {
    if (e instanceof MeetingInputError) return { ok: false, error: e.message, status: 400 };
    throw e;
  }
}
