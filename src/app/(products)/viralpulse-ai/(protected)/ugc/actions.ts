"use server";

import * as api from "@/lib/products/viralpulse-ai/ugc/api";
import { run } from "@/lib/products/viralpulse-ai/run";
import { listPosts } from "@/lib/products/viralpulse-ai/posts";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import type { CreateInput, Attestation } from "@/lib/products/viralpulse-ai/ugc/engine";
import type { UgcSettings } from "@/lib/products/viralpulse-ai/ugc/store";
import type { Variation } from "@/lib/products/viralpulse-ai/ugc/styles/types";
import type { ScenePlan } from "@/lib/products/viralpulse-ai/ugc/types";

/**
 * AI UGC Studio server actions. Thin wrappers over `ugc/api.ts`, which resolves the viewer from the session cookie and checks the permission
 * on every call (GENERATE_AI_CONTENT to create/script/generate, PUBLISH_CONTENT to approve larger spend, MANAGE_INTEGRATIONS for the limits,
 * MANAGE_POSTS to attach to a post). Arguments are never trusted for identity.
 */

const id = (v: unknown) => {
  if (typeof v !== "string" || !v || v.length > 80) throw new SmmsInputError("That video no longer exists.");
  return v;
};

export async function createUgcProjectAction(input: CreateInput) {
  return api.createProject(input);
}
export async function updateUgcBriefAction(projectId: string, patch: Parameters<typeof api.updateBrief>[1]) {
  return api.updateBrief(id(projectId), patch);
}
export async function changeUgcStyleAction(projectId: string, styleId: string) {
  return api.changeStyle(id(projectId), String(styleId));
}
export async function setUgcCastAction(projectId: string, cast: Variation) {
  return api.setCast(id(projectId), cast);
}
export async function generateUgcPlanAction(projectId: string, instruction?: string) {
  return api.generatePlan(id(projectId), typeof instruction === "string" ? instruction.slice(0, 500) : undefined);
}
export async function editUgcPlanAction(projectId: string, plan: ScenePlan) {
  return api.editPlan(id(projectId), plan);
}
export async function restoreUgcVersionAction(projectId: string, version: number) {
  return api.restoreVersion(id(projectId), Number(version));
}
export async function addUgcReferenceAction(projectId: string, mediaId: string, attestation: Attestation) {
  return api.addReference(id(projectId), String(mediaId), { hasConsent: attestation?.hasConsent === true, notPublicFigureOrMinor: attestation?.notPublicFigureOrMinor === true });
}
export async function removeUgcReferenceAction(projectId: string, mediaId: string) {
  return api.removeReference(id(projectId), String(mediaId));
}
export async function approveUgcAction(projectId: string, acknowledgeFlags: string[]) {
  return api.approveAndGenerate(id(projectId), { acknowledgeFlags: Array.isArray(acknowledgeFlags) ? acknowledgeFlags.filter((x) => typeof x === "string").slice(0, 40) : [] });
}
export async function redoUgcSceneAction(projectId: string, sceneIndex: number, note: string, acknowledgeFlags: string[]) {
  return api.regenerateScene(id(projectId), Number(sceneIndex), { note: typeof note === "string" ? note.slice(0, 300) : "", acknowledgeFlags: Array.isArray(acknowledgeFlags) ? acknowledgeFlags.filter((x) => typeof x === "string").slice(0, 40) : [] });
}
export async function cancelUgcAction(projectId: string) {
  return api.cancel(id(projectId));
}
export async function resumeUgcAction(projectId: string) {
  return api.resume(id(projectId));
}
export async function deleteUgcAction(projectId: string) {
  return api.deleteProject(id(projectId));
}
/** Polled by the detail screen while a video is generating; read-only. */
export async function getUgcProjectAction(projectId: string) {
  return api.getProject(id(projectId));
}
export async function ugcTrailAction(projectId: string) {
  return api.trail(id(projectId));
}
export async function ugcSrtAction(projectId: string) {
  return api.exportSrt(id(projectId));
}
export async function saveUgcSettingsAction(patch: Partial<UgcSettings>) {
  return api.saveSettings({
    dailySpendCapUsd: patch.dailySpendCapUsd,
    approvalThresholdUsd: patch.approvalThresholdUsd,
    pricePerSecUsd: patch.pricePerSecUsd,
    aiLabelDefault: patch.aiLabelDefault,
    maxConcurrentJobs: patch.maxConcurrentJobs,
    enabled: patch.enabled,
  });
}

/** Recent posts to attach a finished video to. */
export async function ugcPostChoicesAction(q: string) {
  return run(["MANAGE_POSTS"], async () => {
    const r = await listPosts({ q: String(q ?? "").slice(0, 100), pageSize: 15 });
    return { posts: r.items.map((p) => ({ id: p._id, title: p.title, platforms: p.variants.map((v) => v.platform), status: p.status })) };
  }, { revalidate: false });
}
export async function attachUgcToPostAction(projectId: string, postId: string) {
  return api.attachToPost(id(projectId), id(postId));
}

/** Copies a video's brief, style, options and cast into a new draft (the script and any rendered clips are not copied, so nothing is paid for twice). */
export async function duplicateUgcAction(projectId: string) {
  const src = await api.getProject(id(projectId));
  if (!src.ok) return src;
  const p = src.project;
  const created = await api.createProject({
    title: `Copy of ${p.title}`.slice(0, 120),
    styleId: p.styleId,
    brief: p.brief as unknown as Record<string, unknown>,
    providedFacts: p.providedFacts,
    options: p.options,
  });
  if (!created.ok) return created;
  if (p.cast) {
    const c = await api.setCast(created.project.id, p.cast);
    if (!c.ok) return c;
  }
  return { ok: true as const, id: created.project.id };
}

/* ---- style previews: real sample clips (optional, paid, confirmed) ---- */

const token = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
export async function listStyleSamplesAction() {
  return api.listStyleSamples();
}
export async function pollStyleSamplesAction() {
  return api.pollStyleSamples();
}
export async function styleSampleQuoteAction(styleId: string, seed: string) {
  return api.styleSampleQuote(token(styleId, 80), token(seed, 40));
}
export async function requestStyleSampleAction(styleId: string, seed: string, opts: { confirmUsd?: number; replace?: boolean; acknowledgeFlags?: string[] }) {
  return api.requestStyleSample(token(styleId, 80), token(seed, 40), {
    confirmUsd: typeof opts?.confirmUsd === "number" && Number.isFinite(opts.confirmUsd) ? opts.confirmUsd : undefined,
    replace: opts?.replace === true,
    acknowledgeFlags: Array.isArray(opts?.acknowledgeFlags) ? opts.acknowledgeFlags.filter((x) => typeof x === "string").slice(0, 40) : [],
  });
}
export async function deleteStyleSampleAction(key: string) {
  return api.deleteStyleSample(token(key, 120));
}

/** "Use in campaign / ad" for a finished video: checks it is ready and has one joined video, then returns the wizard link that opens step 4 with that video attached (the AI flag travels with the media row). */
export async function startCampaignFromUgcAction(projectId: string) {
  const allowed = await run(["CREATE_ADS", "CREATE_CAMPAIGNS"], async () => ({}), { revalidate: false });
  if (!allowed.ok) return allowed;
  const r = await api.getProject(id(projectId));
  if (!r.ok) return r;
  const p = r.project;
  if (p.status !== "ready") return { ok: false as const, error: "The video isn't finished yet." };
  if (!p.render?.mediaId) return { ok: false as const, error: "This video was rendered as separate scene clips, not one video. Pick a scene clip from the media library inside the ad instead." };
  return { ok: true as const, href: `/viralpulse-ai/campaigns/new?step=ads&media=${encodeURIComponent(p.render.mediaId)}&ugc=${encodeURIComponent(p.id)}` };
}
