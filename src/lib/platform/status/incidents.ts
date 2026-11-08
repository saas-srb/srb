import "server-only";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { INCIDENT_COMPONENTS, INCIDENT_IMPACTS, INCIDENT_STATUSES, type IncidentImpact, type IncidentStatus, type IncidentView } from "@/lib/platform/status/shared";

/**
 * The incident record behind the public status page: what went wrong, when, how it was handled and when it ended. Written by platform staff
 * in the Platform Console (Administration → Incidents) and shown on /status; platform-wide, never per company.
 */
export const INCIDENTS_COLLECTION = "status_incidents";

interface IncidentDoc {
  _id: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  components: string[];
  startedAt: Date;
  resolvedAt: Date | null;
  updates: { at: Date; status: IncidentStatus; message: string }[];
  createdBy: string;
}

const col = async () => (await getPlatformDb()).collection<IncidentDoc>(INCIDENTS_COLLECTION);
const view = (d: IncidentDoc): IncidentView => ({
  id: d._id,
  title: d.title,
  impact: d.impact,
  status: d.status,
  components: d.components,
  startedAt: d.startedAt.toISOString(),
  resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
  updates: d.updates.map((u) => ({ at: u.at.toISOString(), status: u.status, message: u.message })),
});

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function listIncidents(days = 90): Promise<IncidentView[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await (await col()).find({ $or: [{ resolvedAt: null }, { startedAt: { $gte: since } }, { resolvedAt: { $gte: since } }] }).sort({ startedAt: -1 }).limit(200).toArray();
  return rows.map(view);
}

export type IncidentResult = { ok: true; id: string } | { ok: false; error: string };

export interface NewIncident { title: string; impact: string; components: string[]; message: string; startedAt?: string }

export async function createIncident(input: NewIncident, actorId: string): Promise<IncidentResult> {
  const title = clean(input.title, 140);
  const message = clean(input.message, 2000);
  if (!title) return { ok: false, error: "Give the incident a short title." };
  if (!message) return { ok: false, error: "Say what is happening." };
  const impact = INCIDENT_IMPACTS.find((i) => i.key === input.impact)?.key;
  if (!impact) return { ok: false, error: "Choose how bad it is." };
  const components = (input.components ?? []).filter((c) => (INCIDENT_COMPONENTS as readonly string[]).includes(c));
  const at = input.startedAt ? new Date(input.startedAt) : new Date();
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60_000 && impact !== "maintenance") return { ok: false, error: "The start time can't be in the future." };
  const id = randomUUID();
  const status: IncidentStatus = "investigating";
  await (await col()).insertOne({ _id: id, title, impact, status, components, startedAt: at, resolvedAt: null, updates: [{ at: new Date(), status, message }], createdBy: actorId });
  await recordPlatformAudit({ actorId, action: "incident.create", target: { type: "incident", id }, details: { title, impact } });
  return { ok: true, id };
}

/** Adds an update; moving to "resolved" ends the incident (at `endedAt` when the real end was earlier than now). */
export async function updateIncident(id: string, input: { status: string; message: string; endedAt?: string }, actorId: string): Promise<IncidentResult> {
  const status = INCIDENT_STATUSES.find((s) => s.key === input.status)?.key;
  const message = clean(input.message, 2000);
  if (!status) return { ok: false, error: "Choose a status." };
  if (!message) return { ok: false, error: "Say what changed." };
  const c = await col();
  const cur = await c.findOne({ _id: id });
  if (!cur) return { ok: false, error: "That incident no longer exists." };
  const set: Partial<IncidentDoc> = { status };
  if (status === "resolved") {
    const end = input.endedAt ? new Date(input.endedAt) : new Date();
    if (Number.isNaN(end.getTime()) || end.getTime() < cur.startedAt.getTime()) return { ok: false, error: "The end time can't be before the start." };
    set.resolvedAt = new Date(Math.min(end.getTime(), Date.now()));
  } else if (cur.resolvedAt) {
    set.resolvedAt = null; // reopened
  }
  await c.updateOne({ _id: id }, { $set: set, $push: { updates: { at: new Date(), status, message } } });
  await recordPlatformAudit({ actorId, action: status === "resolved" ? "incident.resolve" : "incident.update", target: { type: "incident", id }, details: { status } });
  return { ok: true, id };
}

export async function deleteIncident(id: string, actorId: string): Promise<{ ok: boolean }> {
  const r = await (await col()).deleteOne({ _id: id });
  if (r.deletedCount) await recordPlatformAudit({ actorId, action: "incident.delete", target: { type: "incident", id } });
  return { ok: r.deletedCount > 0 };
}
