import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { assertWritable } from "@/lib/platform/billing/enforce";
import type { EventType } from "@/lib/platform/events/catalog";
import { deleteWorkflowVersions, recordWorkflowVersion } from "@/lib/platform/workflows/versions";
import { MAX_WORKFLOWS_PER_COMPANY, validateWorkflow, type WorkflowAction, type WorkflowCondition, type WorkflowRunView, type WorkflowView } from "@/lib/platform/workflows/shared";

/**
 * Company automations: Trigger (an event type) → Conditions (all must match)
 * → Actions (email, in-app notification, webhook). Stored per company in
 * `workflows`; every execution is logged to `workflow_runs` (kept 90 days).
 * Execution lives in `run.ts`.
 */

export const WORKFLOWS_COLLECTION = "workflows";
export const WORKFLOW_RUNS_COLLECTION = "workflow_runs";
const RUNS_TTL_SECONDS = 90 * 24 * 60 * 60;

export interface WorkflowDoc {
  _id: string;
  name: string;
  enabled: boolean;
  trigger: EventType;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  secret: string;
  lastRun: { status: "success" | "failed"; at: Date; error: string | null } | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRunDoc {
  _id: string;
  workflowId: string;
  eventId: string | null;
  eventType: string;
  label: string | null;
  status: "success" | "failed";
  error: string | null;
  results: { action: string; ok: boolean; detail: string }[];
  test: boolean;
  at: Date;
}

let indexed = false;
export async function workflowCollections() {
  const db = await getDb();
  const workflows = db.collection<WorkflowDoc>(WORKFLOWS_COLLECTION);
  const runs = db.collection<WorkflowRunDoc>(WORKFLOW_RUNS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([workflows.createIndex({ trigger: 1, enabled: 1 }), runs.createIndex({ workflowId: 1, at: -1 }), runs.createIndex({ at: 1 }, { expireAfterSeconds: RUNS_TTL_SECONDS })]).catch(() => {});
  }
  return { workflows, runs };
}

function view(d: WorkflowDoc): WorkflowView {
  return {
    id: d._id,
    name: d.name,
    enabled: d.enabled,
    trigger: d.trigger,
    conditions: d.conditions,
    actions: d.actions,
    secret: d.secret,
    lastRun: d.lastRun ? { status: d.lastRun.status, at: d.lastRun.at.toISOString(), error: d.lastRun.error } : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export type WorkflowResult = { ok: true; workflow: WorkflowView } | { ok: false; error: string };

export async function listWorkflows(): Promise<WorkflowView[]> {
  const { workflows } = await workflowCollections();
  return (await workflows.find({}).sort({ createdAt: -1 }).limit(MAX_WORKFLOWS_PER_COMPANY).toArray()).map(view);
}

export async function getWorkflow(id: string): Promise<WorkflowView | null> {
  const { workflows } = await workflowCollections();
  const doc = await workflows.findOne({ _id: id });
  return doc ? view(doc) : null;
}

export async function createWorkflow(raw: unknown, actorId: string | null, actorLabel: string | null = actorId): Promise<WorkflowResult> {
  await assertWritable();
  const v = validateWorkflow(raw);
  if (!v.ok) return v;
  const { workflows } = await workflowCollections();
  if ((await workflows.countDocuments({})) >= MAX_WORKFLOWS_PER_COMPANY) {
    return { ok: false, error: `A workspace can have at most ${MAX_WORKFLOWS_PER_COMPANY} automations. Delete one you no longer use.` };
  }
  const now = new Date();
  const doc: WorkflowDoc = { _id: randomUUID(), ...v.data, secret: `whsec_${randomBytes(24).toString("hex")}`, lastRun: null, createdBy: actorId, createdAt: now, updatedAt: now };
  await workflows.insertOne(doc);
  await recordWorkflowVersion(doc, "created", actorLabel);
  return { ok: true, workflow: view(doc) };
}

export async function updateWorkflow(id: string, raw: unknown, actorLabel: string | null = null): Promise<WorkflowResult> {
  await assertWritable();
  const v = validateWorkflow(raw);
  if (!v.ok) return v;
  const { workflows } = await workflowCollections();
  const doc = await workflows.findOneAndUpdate({ _id: id }, { $set: { ...v.data, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) return { ok: false, error: "That automation no longer exists." };
  await recordWorkflowVersion(doc, "edited", actorLabel);
  return { ok: true, workflow: view(doc) };
}

export async function setWorkflowEnabled(id: string, enabled: boolean, actorLabel: string | null = null): Promise<boolean> {
  await assertWritable();
  const { workflows } = await workflowCollections();
  const doc = await workflows.findOneAndUpdate({ _id: id }, { $set: { enabled, updatedAt: new Date() } }, { returnDocument: "after" });
  if (doc) await recordWorkflowVersion(doc, enabled ? "turned_on" : "turned_off", actorLabel);
  return !!doc;
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  await assertWritable();
  const { workflows, runs } = await workflowCollections();
  const res = await workflows.deleteOne({ _id: id });
  if (res.deletedCount === 1) {
    await runs.deleteMany({ workflowId: id });
    await deleteWorkflowVersions(id);
  }
  return res.deletedCount === 1;
}

export async function listWorkflowRuns(workflowId: string, limit = 50): Promise<WorkflowRunView[]> {
  const { runs } = await workflowCollections();
  const rows = await runs.find({ workflowId }).sort({ at: -1 }).limit(Math.min(Math.max(limit, 1), 200)).toArray();
  return rows.map((r) => ({ id: r._id, status: r.status, error: r.error, at: r.at.toISOString(), test: r.test, eventType: r.eventType, label: r.label, results: r.results }));
}
