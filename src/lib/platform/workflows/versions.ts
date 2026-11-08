import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { assertWritable } from "@/lib/platform/billing/enforce";
import { validateWorkflow, type WorkflowAction, type WorkflowCondition } from "@/lib/platform/workflows/shared";
import type { EventType } from "@/lib/platform/events/catalog";

/**
 * The version history of an automation: every save, switch on/off and restore adds a numbered version holding what the automation was after that
 * change (name, on/off, trigger, conditions, actions), who made it and why. Any earlier version can be put back; putting it back is itself a new
 * version, so nothing is ever lost. Versions go when the automation is deleted.
 */
export const WORKFLOW_VERSIONS_COLLECTION = "workflow_versions";
export const MAX_VERSIONS_KEPT = 100;

export type VersionReason = "created" | "edited" | "turned_on" | "turned_off" | "restored";
export const VERSION_REASON_LABELS: Record<VersionReason, string> = { created: "Created", edited: "Edited", turned_on: "Turned on", turned_off: "Turned off", restored: "Restored an earlier version" };

interface Snapshot { name: string; enabled: boolean; trigger: EventType; conditions: WorkflowCondition[]; actions: WorkflowAction[] }
interface VersionDoc { _id: string; workflowId: string; version: number; at: Date; by: string | null; reason: VersionReason; note: string | null; snapshot: Snapshot }
export interface WorkflowVersionView { id: string; version: number; at: string; by: string | null; reason: VersionReason; label: string; note: string | null; name: string; enabled: boolean; trigger: string; conditions: number; actions: number; current: boolean }

const col = async () => {
  const c = (await getDb()).collection<VersionDoc>(WORKFLOW_VERSIONS_COLLECTION);
  await c.createIndex({ workflowId: 1, version: -1 }).catch(() => {});
  return c;
};

export async function recordWorkflowVersion(wf: Snapshot & { _id: string }, reason: VersionReason, by: string | null, note: string | null = null): Promise<void> {
  try {
    const c = await col();
    const last = await c.findOne({ workflowId: wf._id }, { sort: { version: -1 }, projection: { version: 1 } });
    await c.insertOne({ _id: randomUUID(), workflowId: wf._id, version: (last?.version ?? 0) + 1, at: new Date(), by, reason, note, snapshot: { name: wf.name, enabled: wf.enabled, trigger: wf.trigger, conditions: wf.conditions, actions: wf.actions } });
    const old = await c.find({ workflowId: wf._id }).sort({ version: -1 }).skip(MAX_VERSIONS_KEPT).project({ _id: 1 }).toArray();
    if (old.length) await c.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  } catch (err) {
    console.error("[workflow-versions] could not record", err instanceof Error ? err.message : err); // history must never block the change itself
  }
}

export async function listWorkflowVersions(workflowId: string, limit = 40): Promise<WorkflowVersionView[]> {
  const rows = await (await col()).find({ workflowId }).sort({ version: -1 }).limit(limit).toArray();
  return rows.map((d, i) => ({ id: d._id, version: d.version, at: d.at.toISOString(), by: d.by, reason: d.reason, label: VERSION_REASON_LABELS[d.reason], note: d.note, name: d.snapshot.name, enabled: d.snapshot.enabled, trigger: d.snapshot.trigger, conditions: d.snapshot.conditions.length, actions: d.snapshot.actions.length, current: i === 0 }));
}

export async function deleteWorkflowVersions(workflowId: string): Promise<void> {
  await (await col()).deleteMany({ workflowId });
}

/** Puts an earlier version back (as a new version). Returns an error text, or null when done. */
export async function restoreWorkflowVersion(workflowId: string, versionId: string, by: string | null): Promise<string | null> {
  await assertWritable();
  const c = await col();
  const v = await c.findOne({ _id: versionId, workflowId });
  if (!v) return "That version no longer exists.";
  const checked = validateWorkflow(v.snapshot);
  if (!checked.ok) return `That version can't be restored any more: ${checked.error}`;
  const wf = (await getDb()).collection<{ _id: string }>("workflows");
  const res = await wf.updateOne({ _id: workflowId }, { $set: { ...checked.data, updatedAt: new Date() } });
  if (res.matchedCount !== 1) return "That automation no longer exists.";
  await recordWorkflowVersion({ _id: workflowId, ...checked.data }, "restored", by, `Back to version ${v.version}`);
  return null;
}
