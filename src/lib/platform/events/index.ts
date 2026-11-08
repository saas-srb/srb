import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { afterForCompany, currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { eventDef, type EventArea, type EventType } from "@/lib/platform/events/catalog";

/**
 * The company event bus. A product's lib function calls `emitEvent()` after a
 * business change; it writes one row to the company's `platform_events`
 * (the activity log / audit trail, kept ~180 days) and runs the company's
 * matching workflows after the response.
 *
 * `emitEvent` never throws and never slows the action that called it down
 * beyond one insert: everything is caught, and workflows run in `after()`.
 */

export const EVENTS_COLLECTION = "platform_events";
const TTL_SECONDS = 180 * 24 * 60 * 60;

export type EventData = Record<string, string | number | boolean | null | undefined>;

export interface EventEntity {
  type: string;
  id: string;
  label?: string | null;
  url?: string | null;
}

export interface PlatformEvent {
  _id: ObjectId;
  type: EventType;
  area: EventArea;
  at: Date;
  actorId: string | null;
  entity: { type: string; id: string; label: string | null; url: string | null };
  data: Record<string, string | number | boolean | null>;
  /** "app" for normal use, "import" for rows created by a CSV import. */
  source: string;
}

let indexed = false;
export async function eventsCollection() {
  const c = (await getDb()).collection<PlatformEvent>(EVENTS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ at: 1 }, { expireAfterSeconds: TTL_SECONDS }), c.createIndex({ type: 1, at: -1 }), c.createIndex({ actorId: 1, at: -1 })]).catch(() => {});
  }
  return c;
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

interface EventScope {
  /** Set while a workflow's actions run: events emitted there are recorded but never trigger workflows (loop guard). */
  inWorkflow?: boolean;
  source?: string;
}
const scope = new AsyncLocalStorage<EventScope>();

/** Runs workflow actions; anything they emit can't re-trigger workflows. */
export function runInWorkflowScope<T>(fn: () => T): T {
  return scope.run({ ...scope.getStore(), inWorkflow: true }, fn);
}

/** Tags every event emitted inside `fn` with where it came from (e.g. "import"). */
export function withEventSource<T>(source: string, fn: () => T): T {
  return scope.run({ ...scope.getStore(), source }, fn);
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/** One company's workflow runs happen one event at a time, in order (an import can emit hundreds). */
const queues = new Map<string, Promise<void>>();

function enqueue(companyId: string, job: () => Promise<void>): Promise<void> {
  const next = (queues.get(companyId) ?? Promise.resolve()).then(job).catch((err) => console.error("[events] workflow run failed", err));
  queues.set(companyId, next);
  void next.then(() => {
    if (queues.get(companyId) === next) queues.delete(companyId);
  });
  return next;
}

function cleanData(data: EventData | undefined): PlatformEvent["data"] {
  const out: PlatformEvent["data"] = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v === undefined) continue;
    out[k] = typeof v === "string" ? v.slice(0, 500) : v;
  }
  return out;
}

export interface EmitInput {
  entity: EventEntity;
  actorId?: string | null;
  data?: EventData;
}

/**
 * Records a business event and schedules the company's workflows for it.
 * Resolves to the stored event (or null if recording failed) — callers
 * normally ignore the result: `await emitEvent("lead.created", {...})`.
 */
export async function emitEvent(type: EventType, input: EmitInput): Promise<PlatformEvent | null> {
  try {
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return null; // outside any company (seed scripts): nothing to record against
    const def = eventDef(type);
    if (!def) return null;
    const store = scope.getStore();
    const event: PlatformEvent = {
      _id: new ObjectId(),
      type,
      area: def.area,
      at: new Date(),
      actorId: input.actorId ? String(input.actorId) : null,
      entity: { type: input.entity.type, id: String(input.entity.id), label: input.entity.label?.slice(0, 200) ?? null, url: input.entity.url ?? null },
      data: cleanData(input.data),
      source: store?.source ?? "app",
    };
    await (await eventsCollection()).insertOne(event);
    if (store?.inWorkflow) return event; // loop guard
    // Bulk imports are recorded in the activity log but never run automations —
    // a 1,000-row file must not send 1,000 emails, notifications or webhooks.
    if (event.source === "import") return event;

    const run = async () => {
      const { runWorkflowsForEvent } = await import("@/lib/platform/workflows/run");
      await runWorkflowsForEvent(event);
    };
    const job = () => enqueue(companyId, run);
    try {
      await afterForCompany(job);
    } catch {
      // Not inside a request (cron, script, test): there is no response to wait for.
      await job();
    }
    return event;
  } catch (err) {
    console.error(`[events] emit ${type} failed`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read (activity log)
// ---------------------------------------------------------------------------

export interface EventFilter {
  types?: readonly string[];
  areas?: readonly EventArea[];
  actorId?: string;
  from?: Date;
  to?: Date;
}

function toQuery(f: EventFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  if (f.types) q.type = { $in: [...f.types] };
  if (f.areas) q.area = { $in: [...f.areas] };
  if (f.actorId) q.actorId = f.actorId;
  if (f.from || f.to) q.at = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  return q;
}

export interface EventView {
  id: string;
  type: string;
  at: string;
  actorId: string | null;
  actorEmail: string | null;
  label: string | null;
  url: string | null;
  source: string;
}

/** Emails for a set of `admin_users` ids (actors are staff accounts; anything else resolves to nothing). */
export async function actorEmails(ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const valid = [...new Set(ids.filter((id): id is string => !!id && ObjectId.isValid(id)))];
  if (valid.length === 0) return new Map();
  const rows = await (await getDb())
    .collection<{ _id: ObjectId; email: string }>("admin_users")
    .find({ _id: { $in: valid.map((id) => new ObjectId(id)) } }, { projection: { email: 1 } })
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r.email]));
}

export async function listEvents(filter: EventFilter = {}, opts: { limit?: number; skip?: number } = {}): Promise<{ items: EventView[]; total: number }> {
  const c = await eventsCollection();
  const q = toQuery(filter);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const [rows, total] = await Promise.all([c.find(q).sort({ at: -1 }).skip(Math.max(opts.skip ?? 0, 0)).limit(limit).toArray(), c.countDocuments(q)]);
  const emails = await actorEmails(rows.map((r) => r.actorId));
  return {
    total,
    items: rows.map((r) => ({
      id: String(r._id),
      type: r.type,
      at: r.at.toISOString(),
      actorId: r.actorId,
      actorEmail: r.actorId ? (emails.get(r.actorId) ?? null) : null,
      label: r.entity.label,
      url: r.entity.url,
      source: r.source,
    })),
  };
}

/** Staff accounts that appear as an actor in the log — for the activity page's filter. */
export async function listEventActors(): Promise<{ id: string; email: string }[]> {
  const ids = (await (await eventsCollection()).distinct("actorId")).filter((v): v is string => typeof v === "string");
  const emails = await actorEmails(ids);
  return [...emails.entries()].map(([id, email]) => ({ id, email })).sort((a, b) => a.email.localeCompare(b.email));
}
