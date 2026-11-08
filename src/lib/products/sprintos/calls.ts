import "server-only";
import { getDb } from "@/lib/mongodb";
import { registerCallSettledHandler } from "@/lib/products/agentos/calls/engine";
import { registerDoNotContactProvider, type DoNotContactQuery } from "@/lib/products/agentos/calls/dnc";
import type { CallDoc, CallTarget } from "@/lib/products/agentos/calls/types";
import { buildAiCallEntry, loosePhoneRegex, phonesMatch, type AiCallEntry } from "@/lib/products/call-writeback";
import { registerTargetAuthorizer } from "@/lib/products/agentos/calls/integrations";
import { canManageProjects, hasPmsAccess } from "@/lib/pms-roles";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";
import { ACTIVITY_LOGS_COLLECTION, type ActivityLog } from "@/lib/products/sprintos/activity";
import { CLIENTS_COLLECTION, type Client } from "@/lib/products/sprintos/clients";
import { PROJECTS_COLLECTION, type Project } from "@/lib/products/sprintos/projects";
import { notDeleted } from "@/lib/products/sprintos/db";
import { registerBriefingProvider } from "@/lib/products/agentos/calls/briefing";
import { sprintosBriefing } from "@/lib/products/sprintos/call-briefing";

/**
 * SprintOS x AI calls. A call after a project closes has target { product: "sprintos", entityType: "project", entityId: <project id> }
 * (or entityType "client" from a client page). When it settles, the engine tells us once and we add one entry to the project's
 * activity trail (that is the project timeline). The entry's id is derived from the call id, so a repeated notification is a no-op
 * and nothing already in the trail is changed. `doNotContact` on a client is a person's decision and blocks every outbound call
 * to that client's contact number.
 */

export const SPRINTOS_PRODUCT = "sprintos";

export async function writeBackProjectCall(call: CallDoc): Promise<boolean> {
  const t = call.target;
  if (t?.product !== SPRINTOS_PRODUCT || (t.entityType !== "project" && t.entityType !== "client")) return false;
  const db = await getDb();
  let projectId: string | null = null;
  let label = t.label || null;
  if (t.entityType === "project") {
    const p = await db.collection<Project>(PROJECTS_COLLECTION).findOne({ _id: t.entityId, ...notDeleted }, { projection: { name: 1 } });
    if (!p) return false;
    projectId = t.entityId;
    label = p.name;
  } else if (!(await db.collection<Client>(CLIENTS_COLLECTION).findOne({ _id: t.entityId, ...notDeleted } as never, { projection: { _id: 1 } }))) return false;

  const entry = buildAiCallEntry(call);
  const head = `AI call (${entry.purposeLabel}, ${entry.status.replace(/_/g, " ")})`;
  const summary = entry.summary ? `${head}: ${entry.summary.slice(0, 300)}` : head;
  const _id = `aicall:${call._id}`;
  const r = await db.collection<Omit<ActivityLog, "_id"> & { _id: string }>(ACTIVITY_LOGS_COLLECTION).updateOne(
    { _id },
    {
      $setOnInsert: {
        actorId: call.initiatedBy?.userId ?? "system",
        actorEmail: call.initiatedBy?.email ?? null,
        action: "comment",
        entity: t.entityType,
        entityId: t.entityId,
        entityLabel: label,
        summary,
        metadata: { aiCall: entry as unknown as Record<string, unknown> },
        projectId,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
  return r.upsertedCount === 1;
}

/** AI call snapshots for a project (newest first), read from its activity trail. */
export async function getProjectAiCalls(projectId: string, limit = 20): Promise<AiCallEntry[]> {
  const rows = await (await getDb())
    .collection<ActivityLog>(ACTIVITY_LOGS_COLLECTION)
    .find({ projectId, "metadata.aiCall": { $exists: true } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map((r) => (r.metadata as { aiCall: AiCallEntry }).aiCall);
}

export async function setClientDoNotContact(clientId: string, value: boolean): Promise<boolean> {
  const r = await (await getDb()).collection(CLIENTS_COLLECTION).updateOne({ _id: clientId as never, ...notDeleted }, { $set: { doNotContact: value === true } });
  return r.matchedCount === 1;
}

export async function isClientDoNotContact(clientId: string): Promise<boolean> {
  const c = await (await getDb()).collection(CLIENTS_COLLECTION).findOne({ _id: clientId as never, doNotContact: true }, { projection: { _id: 1 } });
  return Boolean(c);
}

/** True when the target's client, or any flagged client with the same contact number, asked not to be contacted. */
export async function isSprintosDoNotContact(q: DoNotContactQuery): Promise<boolean> {
  const db = await getDb();
  const t = q.target;
  if (t?.product === SPRINTOS_PRODUCT) {
    let clientId: string | null = null;
    if (t.entityType === "client") clientId = t.entityId;
    else if (t.entityType === "project") clientId = (await db.collection<Project>(PROJECTS_COLLECTION).findOne({ _id: t.entityId }, { projection: { clientId: 1 } }))?.clientId ?? null;
    if (clientId && (await isClientDoNotContact(clientId))) return true;
  }
  // By number, not by scanning the flagged list: find only clients whose contact phone contains these digits, then confirm each is the same line.
  const re = loosePhoneRegex(q.phone);
  if (!re) return false;
  const cursor = db.collection<Client>(CLIENTS_COLLECTION).find({ doNotContact: true, "primaryContact.phone": re } as never, { projection: { primaryContact: 1 } });
  for await (const c of cursor) if (phonesMatch(c.primaryContact?.phone, q.phone)) return true;
  return false;
}

/**
 * Who may point a call at a project or a client: people who manage projects (the project page only offers the calls to them) and the
 * record must exist and not be deleted. Employees who are merely on a project's team cannot start calls about it.
 */
export async function authorizeSprintosTarget(viewer: AibotsViewer, target: CallTarget): Promise<boolean> {
  if (target.product !== SPRINTOS_PRODUCT || (target.entityType !== "project" && target.entityType !== "client")) return false;
  if (!hasPmsAccess(viewer.roles) || !canManageProjects(viewer.ctx)) return false;
  const db = await getDb();
  if (target.entityType === "project") return Boolean(await db.collection<Project>(PROJECTS_COLLECTION).findOne({ _id: target.entityId, ...notDeleted }, { projection: { _id: 1 } }));
  return Boolean(await db.collection<Client>(CLIENTS_COLLECTION).findOne({ _id: target.entityId, ...notDeleted } as never, { projection: { _id: 1 } }));
}
registerTargetAuthorizer(SPRINTOS_PRODUCT, authorizeSprintosTarget);

registerCallSettledHandler(SPRINTOS_PRODUCT, async (call) => {
  await writeBackProjectCall(call);
});
registerDoNotContactProvider(SPRINTOS_PRODUCT, isSprintosDoNotContact);
registerBriefingProvider(SPRINTOS_PRODUCT, sprintosBriefing);
