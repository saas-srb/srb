import "server-only";
import type { SmmsPermission } from "@/lib/smms-roles";
import { run, type Fail, type Ok } from "@/lib/products/viralpulse-ai/run";
import { can, SmmsInputError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { smmsCollection, notDeleted, COLLECTIONS } from "@/lib/products/viralpulse-ai/db";
import { afterForCompany } from "@/lib/platform/tenancy/context";
import { defaultDeps } from "./deps-default";
import * as engine from "./engine";
import * as sampleEngine from "./engine-sample";
import { getUgcSettings, saveUgcSettings, jobsCollection, projectsCollection, NOT_SAMPLE, type ProjectDoc, type JobDoc, type UgcSettings } from "./store";
import { capabilitiesFor } from "./pricing";
import { platformDisclosures, AI_LABEL_TEXT, ILLUSTRATIVE_NOTICE } from "./policy";
import { toSrt, buildCues } from "./captions";
import type { Actor } from "./deps";
import { findFfmpeg } from "./assemble";
import { isVideoConfigured } from "./providers";
import { isOpenAIConfigured } from "@/lib/openai";
import { listAudit } from "@/lib/products/viralpulse-ai/audit";
import { istDayStart } from "./state";
import type { Variation } from "./styles/types";
import type { ScenePlan, UgcOptions } from "./types";

/**
 * The function API the UI calls (wrap each in a `"use server"` action, or call from server components). Each one resolves the viewer from
 * the session through `run`, checks the permission, and returns plain JSON.
 *
 * Permissions (no new roles): VIEW_CAMPAIGNS to read; GENERATE_AI_CONTENT to create, script and request generation; PUBLISH_CONTENT
 * (managers) to approve spend above the company threshold; MANAGE_INTEGRATIONS (admins) for the caps; MANAGE_POSTS to attach to a post.
 */

const actorOf = (v: SmmsViewer): Actor => ({ userId: v.userId, email: v.email, canApprove: can(v, "PUBLISH_CONTENT") });
const GEN: SmmsPermission[] = ["GENERATE_AI_CONTENT"];

export interface SceneJobView {
  sceneIndex: number;
  generation: number;
  status: JobDoc["status"];
  attempts: number;
  maxAttempts: number;
  error: string | null;
  estimatedUsd: number;
  costUsd: number;
  mediaId: string | null;
  nextAttemptAt: string;
}

export interface ProjectView {
  id: string;
  title: string;
  styleId: string;
  status: ProjectDoc["status"];
  brief: ProjectDoc["brief"];
  providedFacts: string[];
  cast: Variation | null;
  options: UgcOptions;
  plan: ScenePlan | null;
  planVersion: number;
  versions: { version: number; at: string; source: string; note: string }[];
  policy: ProjectDoc["policy"];
  illustrative: boolean;
  estimate: (Omit<NonNullable<ProjectDoc["estimate"]>, "at"> & { at: string }) | null;
  pendingApproval: { by: string; at: string; estimateUsd: number } | null;
  approvals: { by: string; at: string; estimateUsd: number; scope: string }[];
  references: { mediaId: string; consentBy: string; consentAt: string }[];
  render: (Omit<NonNullable<ProjectDoc["render"]>, "at"> & { at: string }) | null;
  sceneMedia: Record<string, string>;
  spendUsd: number;
  error: string | null;
  jobs: SceneJobView[];
  disclosure: { aiLabelText: string; illustrativeNotice: string; platforms: ReturnType<typeof platformDisclosures> };
  capabilities: { label: string; allowedDurations: number[]; maxReferenceImages: number };
  createdAt: string;
  updatedAt: string;
}

export function toView(p: ProjectDoc, jobs: JobDoc[] = []): ProjectView {
  const caps = capabilitiesFor(p.options.provider);
  return {
    id: p._id,
    title: p.title,
    styleId: p.styleId,
    status: p.status,
    brief: p.brief,
    providedFacts: p.providedFacts,
    cast: p.cast ?? null,
    options: p.options,
    plan: p.plan,
    planVersion: p.planVersion,
    versions: p.versions.map((v) => ({ version: v.version, at: v.at.toISOString(), source: v.source, note: v.note })),
    policy: p.policy,
    illustrative: p.illustrative,
    estimate: p.estimate ? { ...p.estimate, at: p.estimate.at.toISOString() } : null,
    pendingApproval: p.pendingApproval ? { by: p.pendingApproval.by, at: p.pendingApproval.at.toISOString(), estimateUsd: p.pendingApproval.estimateUsd } : null,
    approvals: p.approvals.map((a) => ({ by: a.by, at: a.at.toISOString(), estimateUsd: a.estimateUsd, scope: a.scope })),
    references: p.references.map((r) => ({ mediaId: r.mediaId, consentBy: r.consent.userId, consentAt: r.consent.at.toISOString() })),
    render: p.render ? { ...p.render, at: p.render.at.toISOString() } : null,
    sceneMedia: p.sceneMedia,
    spendUsd: p.spendUsd,
    error: p.error,
    jobs: jobs.map((j) => ({ sceneIndex: j.sceneIndex, generation: j.generation, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts, error: j.error, estimatedUsd: j.estimatedUsd, costUsd: j.costUsd, mediaId: j.mediaId, nextAttemptAt: j.nextAttemptAt.toISOString() })),
    disclosure: { aiLabelText: AI_LABEL_TEXT, illustrativeNotice: ILLUSTRATIVE_NOTICE, platforms: platformDisclosures(p.options.language) },
    capabilities: { label: caps.label, allowedDurations: caps.allowedDurations, maxReferenceImages: caps.maxReferenceImages },
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function view(id: string): Promise<ProjectView> {
  const p = await engine.getProjectOrThrow(id);
  return toView(p, await engine.latestJobs(p));
}

/** Starts the work right after the response instead of waiting for the next cron tick. The cron sweep remains the safety net. */
async function kick(projectId: string) {
  await afterForCompany(() => engine.runUgcSweep(defaultDeps(), { projectId }).catch((e) => console.error("[ugc kick]", (e as Error).message)));
}

export const createProject = (input: engine.CreateInput) => run(GEN, async (v) => ({ project: toView(await engine.createProject(input, actorOf(v), defaultDeps())) }));
export const updateBrief = (id: string, patch: Parameters<typeof engine.updateBrief>[1]) => run(GEN, async (v) => ({ project: toView(await engine.updateBrief(id, patch, actorOf(v), defaultDeps())) }));
export const setCast = (id: string, cast: Variation) => run(GEN, async (v) => ({ project: toView(await engine.setCast(id, cast, actorOf(v), defaultDeps())) }));
export const changeStyle = (id: string, styleId: string) => run(GEN, async (v) => ({ project: toView(await engine.changeStyle(id, styleId, actorOf(v), defaultDeps())) }));
export const generatePlan = (id: string, instruction?: string) => run(GEN, async (v) => ({ project: toView(await engine.generatePlan(id, actorOf(v), defaultDeps(), { instruction })) }));
export const editPlan = (id: string, plan: ScenePlan) => run(GEN, async (v) => ({ project: toView(await engine.editPlan(id, plan, actorOf(v), defaultDeps())) }));
export const restoreVersion = (id: string, version: number) => run(GEN, async (v) => ({ project: toView(await engine.restoreVersion(id, version, actorOf(v), defaultDeps())) }));
export const estimate = (id: string) => run(["VIEW_CAMPAIGNS"], async () => ({ estimate: await engine.estimateProject(id) }));
export const addReference = (id: string, mediaId: string, attestation: engine.Attestation) => run(GEN, async (v) => ({ project: toView(await engine.addReference(id, mediaId, attestation, actorOf(v), defaultDeps())) }));
export const removeReference = (id: string, mediaId: string) => run(GEN, async (v) => ({ project: toView(await engine.removeReference(id, mediaId, actorOf(v), defaultDeps())) }));

export async function approveAndGenerate(id: string, opts: { acknowledgeFlags?: string[] } = {}): Promise<Ok<{ outcome: "started" | "needs_manager"; estimateUsd?: number; thresholdUsd?: number; project: ProjectView }> | Fail> {
  const r = await run(GEN, async (v) => {
    const out = await engine.approveAndGenerate(id, actorOf(v), defaultDeps(), opts);
    return { outcome: out.outcome, ...(out.outcome === "needs_manager" ? { estimateUsd: out.estimateUsd, thresholdUsd: out.thresholdUsd } : {}), project: toView(out.project) };
  });
  if (r.ok && r.outcome === "started") await kick(id);
  return r;
}

export async function regenerateScene(id: string, sceneIndex: number, opts: { note?: string; acknowledgeFlags?: string[] } = {}) {
  const r = await run(GEN, async (v) => {
    const out = await engine.regenerateScene(id, sceneIndex, actorOf(v), defaultDeps(), opts);
    return { outcome: out.outcome, project: toView(out.project) };
  });
  if (r.ok && r.outcome === "started") await kick(id);
  return r;
}

export const cancel = (id: string) => run(GEN, async (v) => ({ project: toView(await engine.cancelProject(id, actorOf(v), defaultDeps())) }));
export const resume = (id: string) => run(GEN, async (v) => ({ project: toView(await engine.resumeProject(id, actorOf(v), defaultDeps())) }));
export const deleteProject = (id: string) => run(GEN, async (v) => (await engine.deleteProject(id, actorOf(v), defaultDeps()), {}));
export const getProject = (id: string) => run(["VIEW_CAMPAIGNS"], async () => ({ project: await view(id) }), { revalidate: false });
export const listProjects = (status?: ProjectDoc["status"]) =>
  run(["VIEW_CAMPAIGNS"], async () => ({ projects: (await engine.listProjectDocs({ status }, 100)).map((p) => ({ id: p._id, title: p.title, styleId: p.styleId, status: p.status, aspect: p.options.aspect, estimateUsd: p.estimate?.usd ?? null, spendUsd: p.spendUsd, secs: p.render?.durationSecs ?? p.estimate?.totalSecs ?? null, language: p.options.language, pendingApproval: !!p.pendingApproval, thumbnailId: p.render?.thumbnailId ?? null, mediaId: p.render?.mediaId ?? null, updatedAt: p.updatedAt.toISOString() })) }), { revalidate: false });

export const attachToPost = (id: string, postId: string) => run(["MANAGE_POSTS"], async (v) => ({ attached: await engine.attachToPost(id, postId, actorOf(v), defaultDeps()) }));

export const getSettings = () => run(["VIEW_CAMPAIGNS"], async () => ({ settings: await getUgcSettings() }), { revalidate: false });
export const saveSettings = (patch: Partial<UgcSettings>) =>
  run(["MANAGE_INTEGRATIONS"], async (v) => {
    const s = await saveUgcSettings(patch, v.userId);
    await defaultDeps().audit({ actorId: v.userId, actorEmail: v.email, action: "settings", entity: "ugc", entityId: "settings", entityLabel: "UGC settings", summary: `Updated UGC limits: daily cap $${s.dailySpendCapUsd}, approval above $${s.approvalThresholdUsd}`, metadata: { dailySpendCapUsd: s.dailySpendCapUsd, approvalThresholdUsd: s.approvalThresholdUsd } });
    return { settings: s };
  });

export async function exportSrt(id: string) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const p = await engine.getProjectOrThrow(id);
    if (!p.plan) throw new SmmsInputError("There's no script yet.");
    return { srt: p.render?.srt || toSrt(buildCues(p.plan)) };
  }, { revalidate: false });
}

export { smmsCollection, notDeleted, COLLECTIONS, jobsCollection };

/** Cron entry: every company's open projects (see `cron/jobs.ts`). */
export async function runUgcCron() {
  return engine.runUgcSweep(defaultDeps());
}

/** Month start in India (the product's business day), as a UTC instant. */
function istMonthStart(now: Date): Date {
  const IST = 5.5 * 3600_000;
  const l = new Date(now.getTime() + IST);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) - IST);
}

export interface UgcOverview {
  counts: Record<ProjectDoc["status"], number>;
  total: number;
  spentTodayUsd: number;
  spentMonthUsd: number;
  settings: UgcSettings;
}

/** Everything the list page's stat cards and the wizard's cap check need, in one read. */
export const overview = () =>
  run(["VIEW_CAMPAIGNS"], async () => {
    const col = await projectsCollection();
    const rows = await col.aggregate<{ _id: ProjectDoc["status"]; n: number }>([{ $match: { ...notDeleted, ...NOT_SAMPLE } }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
    const counts = { draft: 0, scripted: 0, approved: 0, generating: 0, ready: 0, failed: 0, cancelled: 0 } as Record<ProjectDoc["status"], number>;
    for (const r of rows) counts[r._id] = r.n;
    const jobs = await jobsCollection();
    const now = new Date();
    const spendSince = async (from: Date) => {
      const agg = await jobs
        .aggregate<{ usd: number }>([
          { $match: { reservedAt: { $gte: from }, status: { $in: ["queued", "submitting", "running", "succeeded"] } } },
          { $group: { _id: null, usd: { $sum: { $cond: [{ $eq: ["$status", "succeeded"] }, "$costUsd", "$estimatedUsd"] } } } },
        ])
        .toArray();
      return Math.round((agg[0]?.usd ?? 0) * 10000) / 10000;
    };
    const [spentTodayUsd, spentMonthUsd, settings] = await Promise.all([spendSince(istDayStart(now)), spendSince(istMonthStart(now)), getUgcSettings()]);
    const out: UgcOverview = { counts, total: Object.values(counts).reduce((a, b) => a + b, 0), spentTodayUsd, spentMonthUsd, settings };
    return { overview: out };
  }, { revalidate: false });

export interface UgcConnections {
  video: boolean;
  scripts: boolean;
  assembly: boolean;
}

/** What is connected, for the status cards and for disabling buttons that could only fail. Never returns a key. */
export const connections = () =>
  run(["VIEW_CAMPAIGNS"], async () => {
    const [video, scripts, ffmpeg] = await Promise.all([isVideoConfigured().catch(() => false), isOpenAIConfigured().catch(() => false), findFfmpeg().catch(() => null)]);
    const c: UgcConnections = { video, scripts, assembly: !!ffmpeg };
    return { connections: c };
  }, { revalidate: false });

export interface TrailEntry {
  id: string;
  at: string;
  by: string | null;
  action: string;
  summary: string;
}

/** The project's audit trail (create, script, approve, regenerate, cancel, attach), newest first. */
export const trail = (id: string) =>
  run(["VIEW_CAMPAIGNS"], async () => {
    await engine.getProjectOrThrow(id);
    const r = await listAudit({ entity: "ugc", recordId: id, pageSize: 50 });
    const items: TrailEntry[] = r.items.map((a) => ({ id: a._id, at: a.createdAt.toISOString(), by: a.actorEmail, action: String(a.action), summary: a.summary ?? "" }));
    return { items };
  }, { revalidate: false });

/* ---- style samples (optional, paid, explicit) ---- */

/** Every live sample of the company, for the gallery. Read-only. */
export const listStyleSamples = () => run(["VIEW_CAMPAIGNS"], async () => ({ samples: await sampleEngine.listSamples() }), { revalidate: false });

/** The exact estimate, limits and blockers shown before anyone is asked to confirm. Free; calls no provider. */
export const styleSampleQuote = (styleId: string, seed: string) =>
  run(["VIEW_CAMPAIGNS"], async (v) => ({ quote: await sampleEngine.sampleQuote(styleId, seed, actorOf(v), defaultDeps()) }), { revalidate: false });

export async function requestStyleSample(styleId: string, seed: string, opts: { confirmUsd?: number; replace?: boolean; acknowledgeFlags?: string[] }) {
  const r = await run(GEN, async (v) => ({ result: await sampleEngine.requestSample(styleId, seed, actorOf(v), defaultDeps(), opts) }));
  if (r.ok && r.result.outcome === "started" && r.result.sample) await kick(r.result.sample.projectId);
  return r;
}

/** Polled while a sample renders: nudges the queue along (the cron sweep is the safety net) and returns the current list. */
export async function pollStyleSamples() {
  return run(GEN, async () => {
    const before = await sampleEngine.listSamples();
    for (const s of before.filter((x) => x.status === "generating")) await kick(s.projectId);
    return { samples: await sampleEngine.listSamples() };
  }, { revalidate: false });
}

export const deleteStyleSample = (key: string) => run(GEN, async (v) => (await sampleEngine.deleteSample(key, actorOf(v), defaultDeps()), {}));
