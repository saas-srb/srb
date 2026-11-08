import "server-only";
import { COLLECTIONS, smmsCollection, newId } from "@/lib/products/viralpulse-ai/db";

/**
 * Version history + AI usage ledger in one append-only collection.
 *
 *  • Every AI output for a campaign / ad / post is stored as a new version
 *    (`source: "ai"`), and so is every manual save (`"edit"`) and restore
 *    (`"restore"`) — so any earlier version can be viewed and restored.
 *  • AI Content Generator runs are stored against `targetType: "workspace"`.
 *  • Image generations are ledger rows (`kind: "image"`) pointing at the
 *    media item they produced.
 *
 * Token counts and cost live on the AI rows, which is what the dashboard sums.
 */

export type TargetType = "campaign" | "ad" | "post" | "workspace" | "media";
export type VersionSource = "ai" | "edit" | "restore";

export interface GenerationDoc {
  _id: string;
  targetType: TargetType;
  targetId: string;
  /** Per target, increasing from 1. */
  version: number;
  source: VersionSource;
  /** What was produced: "campaign_strategy", "ad_creative", "post", "image", a generator type, … */
  kind: string;
  /** The refinement instruction for a regenerate, if any. */
  instruction: string | null;
  /** Short human label ("Instagram video ad", the brief topic…) for lists. */
  label: string;
  platform: string | null;
  snapshot: unknown;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  userId: string;
  userEmail: string | null;
  createdAt: Date;
}

let indexesEnsured = false;
export async function generationsCollection() {
  const col = await smmsCollection<GenerationDoc>(COLLECTIONS.generations);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      col.createIndex({ targetType: 1, targetId: 1, version: -1 }).catch(() => {}),
      col.createIndex({ source: 1, createdAt: -1 }).catch(() => {}),
      col.createIndex({ userId: 1, createdAt: -1 }).catch(() => {}),
    ]);
  }
  return col;
}

export async function recordVersion(v: Omit<GenerationDoc, "_id" | "version" | "createdAt" | "model" | "inputTokens" | "outputTokens" | "costUsd" | "durationMs" | "instruction" | "platform"> & Partial<Pick<GenerationDoc, "model" | "inputTokens" | "outputTokens" | "costUsd" | "durationMs" | "instruction" | "platform">>): Promise<number> {
  const col = await generationsCollection();
  const last = await col.find({ targetType: v.targetType, targetId: v.targetId }, { projection: { version: 1 } }).sort({ version: -1 }).limit(1).next();
  const version = (last?.version ?? 0) + 1;
  await col.insertOne({
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    durationMs: 0,
    instruction: null,
    platform: null,
    ...v,
    _id: newId(),
    version,
    createdAt: new Date(),
  });
  return version;
}

export interface VersionListItem {
  _id: string;
  version: number;
  source: VersionSource;
  kind: string;
  instruction: string | null;
  model: string | null;
  userEmail: string | null;
  createdAt: string;
}

export async function listVersions(targetType: TargetType, targetId: string, limit = 50): Promise<VersionListItem[]> {
  const col = await generationsCollection();
  const rows = await col.find({ targetType, targetId }, { projection: { snapshot: 0 } }).sort({ version: -1 }).limit(limit).toArray();
  return rows.map((r) => ({ _id: r._id, version: r.version, source: r.source, kind: r.kind, instruction: r.instruction, model: r.model, userEmail: r.userEmail, createdAt: r.createdAt.toISOString() }));
}

export async function getVersion(targetType: TargetType, targetId: string, versionId: string): Promise<GenerationDoc | null> {
  const col = await generationsCollection();
  return col.findOne({ _id: versionId, targetType, targetId });
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function countUserAiToday(userId: string): Promise<number> {
  const col = await generationsCollection();
  return col.countDocuments({ userId, source: "ai", createdAt: { $gte: startOfToday() } });
}

export interface RecentGeneration {
  _id: string;
  targetType: TargetType;
  targetId: string;
  kind: string;
  label: string;
  platform: string | null;
  userEmail: string | null;
  createdAt: string;
}

export async function recentAiGenerations(limit = 8, userId?: string): Promise<RecentGeneration[]> {
  const col = await generationsCollection();
  const rows = await col
    .find({ source: "ai", ...(userId ? { userId } : {}) }, { projection: { snapshot: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map((r) => ({ _id: r._id, targetType: r.targetType, targetId: r.targetId, kind: r.kind, label: r.label, platform: r.platform, userEmail: r.userEmail, createdAt: r.createdAt.toISOString() }));
}

/** A workspace run with its output, for the generator's history product. */
export async function listWorkspaceRuns(userId: string, limit = 20): Promise<GenerationDoc[]> {
  const col = await generationsCollection();
  return col.find({ targetType: "workspace", userId }).sort({ createdAt: -1 }).limit(limit).toArray();
}
