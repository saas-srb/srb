import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, smmsCollection, createStamp, notDeleted, type Stamps } from "@/lib/products/viralpulse-ai/db";
import type { Variation } from "./styles/types";
import type { ConsentRecord, PolicyResult, ProductBrief, ProjectStatus, SceneJobStatus, ScenePlan, UgcOptions } from "./types";

/** Persistence for AI UGC Studio: projects, scene jobs and the studio settings. Everything is company-scoped by the shared data layer. */

export const UGC_COLLECTIONS = { projects: "ugc_projects", jobs: "ugc_jobs" } as const;

export interface PlanVersion {
  version: number;
  at: Date;
  by: string | null;
  source: "ai" | "edit" | "revision";
  note: string;
  plan: ScenePlan;
}

export interface Estimate {
  usd: number;
  totalSecs: number;
  perScene: { index: number; secs: number; usd: number }[];
  provider: string;
  model: string;
  planVersion: number;
  at: Date;
}

export interface Approval {
  by: string;
  email: string | null;
  at: Date;
  estimateUsd: number;
  planVersion: number;
  /** "project" or "scene:<n>" for a regeneration. */
  scope: string;
  flagsAcknowledged: string[];
}

export interface Reference {
  mediaId: string;
  consent: ConsentRecord;
}

export interface RenderInfo {
  mediaId: string | null;
  thumbnailId: string | null;
  durationSecs: number;
  strategy: "assembled" | "single" | "clips-only";
  labelBurned: boolean;
  captionsBurned: boolean;
  srt: string;
  at: Date;
}

export interface ProjectDoc extends Stamps {
  _id: string;
  title: string;
  styleId: string;
  brief: ProductBrief;
  providedFacts: string[];
  options: UgcOptions;
  status: ProjectStatus;
  plan: ScenePlan | null;
  planVersion: number;
  factsUsed: Record<string, string[]>;
  versions: PlanVersion[];
  policy: PolicyResult | null;
  illustrative: boolean;
  estimate: Estimate | null;
  /** Someone without approval rights asked a manager to approve this spend. */
  pendingApproval: { by: string; email: string | null; at: Date; estimateUsd: number } | null;
  approvals: Approval[];
  references: Reference[];
  /** The cast and look chosen in the wizard (style variation, possibly edited); the script keeps to it. */
  cast?: Variation | null;
  /** Latest generation number per scene index (key = index as string). */
  sceneGen: Record<string, number>;
  render: RenderInfo | null;
  /** Library media id of each scene's latest clip (key = index). */
  sceneMedia: Record<string, string>;
  spendUsd: number;
  cancelRequested: boolean;
  error: string | null;
  finalizeLease: { token: string; until: Date } | null;
  planCostUsd: number;
  /** "style-sample": a one-scene preview clip of a style (company-level, not a user's video). Never listed with the videos. */
  kind?: "style-sample";
  sample?: { key: string; styleId: string; seed: string };
}

export interface JobDoc extends Stamps {
  _id: string;
  projectId: string;
  sceneIndex: number;
  generation: number;
  /** projectId:sceneIndex:generation: the idempotency key (unique). */
  requestKey: string;
  planVersion: number;
  status: SceneJobStatus;
  provider: string;
  model: string;
  providerJobId: string | null;
  prompt: string;
  aspect: "9:16" | "16:9";
  resolution: "720p" | "1080p";
  durationSecs: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lease: { token: string; until: Date } | null;
  pollErrors: number;
  error: string | null;
  errorCode: string | null;
  estimatedUsd: number;
  costUsd: number;
  actualSecs: number | null;
  mediaId: string | null;
  storageKey: string | null;
  reservedAt: Date;
  submittedAt: Date | null;
  finishedAt: Date | null;
}

export interface UgcSettings {
  enabled: boolean;
  defaultProvider: "omni" | "veo";
  defaultModel: string;
  /** Total estimated+actual spend allowed per day (IST), USD. 0 = no video generation. */
  dailySpendCapUsd: number;
  /** Spend above this needs someone with approval rights (publish permission). 0 = every generation needs a manager. */
  approvalThresholdUsd: number;
  maxConcurrentJobs: number;
  maxAttemptsPerScene: number;
  aiLabelDefault: boolean;
  /** Overrides the built-in USD per second (e.g. the company's negotiated rate). null = built-in. */
  pricePerSecUsd: number | null;
}

export const DEFAULT_UGC_SETTINGS: UgcSettings = {
  enabled: true,
  defaultProvider: "omni",
  defaultModel: "gemini-omni-1.1-flash",
  dailySpendCapUsd: 25,
  approvalThresholdUsd: 5,
  maxConcurrentJobs: 3,
  maxAttemptsPerScene: 3,
  aiLabelDefault: true,
  pricePerSecUsd: null,
};

let ensured = false;
export async function projectsCollection() {
  const col = await smmsCollection<ProjectDoc>(UGC_COLLECTIONS.projects);
  if (!ensured) {
    ensured = true;
    await ensureJobIndexes();
    await col.createIndex({ status: 1, updatedAt: -1 }).catch(() => {});
    await col.createIndex({ createdAt: -1 }).catch(() => {});
    await col.createIndex({ "sample.key": 1, createdAt: 1 }, { sparse: true }).catch(() => {});
  }
  return col;
}

async function ensureJobIndexes() {
  const col = await smmsCollection<JobDoc>(UGC_COLLECTIONS.jobs);
  await Promise.all([
    col.createIndex({ requestKey: 1 }, { unique: true }).catch(() => {}),
    col.createIndex({ projectId: 1, sceneIndex: 1, generation: -1 }).catch(() => {}),
    col.createIndex({ status: 1, nextAttemptAt: 1 }).catch(() => {}),
    col.createIndex({ reservedAt: -1 }).catch(() => {}),
  ]);
}

export async function jobsCollection() {
  await projectsCollection();
  return smmsCollection<JobDoc>(UGC_COLLECTIONS.jobs);
}

export async function getProjectDoc(id: string): Promise<ProjectDoc | null> {
  if (!id) return null;
  return (await projectsCollection()).findOne({ _id: id, ...notDeleted });
}

export async function getUgcSettings(): Promise<UgcSettings> {
  const db = await getDb();
  const doc = await db.collection<{ _id: string; ugc?: Partial<UgcSettings> }>(COLLECTIONS.settings).findOne({ _id: "main" });
  return { ...DEFAULT_UGC_SETTINGS, ...(doc?.ugc ?? {}) };
}

export async function saveUgcSettings(patch: Partial<UgcSettings>, actorId: string): Promise<UgcSettings> {
  const cur = await getUgcSettings();
  const clampN = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const next: UgcSettings = {
    enabled: patch.enabled === undefined ? cur.enabled : !!patch.enabled,
    defaultProvider: patch.defaultProvider === "veo" ? "veo" : patch.defaultProvider === "omni" ? "omni" : cur.defaultProvider,
    defaultModel: typeof patch.defaultModel === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,63}$/.test(patch.defaultModel) ? patch.defaultModel : cur.defaultModel,
    dailySpendCapUsd: clampN(patch.dailySpendCapUsd, 0, 100000, cur.dailySpendCapUsd),
    approvalThresholdUsd: clampN(patch.approvalThresholdUsd, 0, 100000, cur.approvalThresholdUsd),
    maxConcurrentJobs: Math.round(clampN(patch.maxConcurrentJobs, 1, 20, cur.maxConcurrentJobs)),
    maxAttemptsPerScene: Math.round(clampN(patch.maxAttemptsPerScene, 1, 6, cur.maxAttemptsPerScene)),
    aiLabelDefault: patch.aiLabelDefault === undefined ? cur.aiLabelDefault : !!patch.aiLabelDefault,
    pricePerSecUsd: patch.pricePerSecUsd === null ? null : patch.pricePerSecUsd === undefined ? cur.pricePerSecUsd : clampN(patch.pricePerSecUsd, 0.001, 20, cur.pricePerSecUsd ?? 0.1),
  };
  const db = await getDb();
  await db.collection(COLLECTIONS.settings).updateOne({ _id: "main" } as never, { $set: { ugc: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
  return next;
}

export { createStamp };

/** Filter that keeps style samples out of the list of videos. */
export const NOT_SAMPLE = { kind: { $ne: "style-sample" } } as const;
