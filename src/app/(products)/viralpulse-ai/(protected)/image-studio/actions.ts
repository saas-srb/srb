"use server";

import { afterForCompany } from "@/lib/platform/tenancy/context";
import { run } from "@/lib/products/viralpulse-ai/run";
import { can, SmmsInputError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { cleanBrief, createEngine, type Actor } from "@/lib/products/viralpulse-ai/images/engine";
import { defaultImageDeps } from "@/lib/products/viralpulse-ai/images/deps-default";
import { getBrandKit, getImageSettings, saveBrandKit, saveImageSettings, spentToday } from "@/lib/products/viralpulse-ai/images/store";
import { toProjectView } from "@/lib/products/viralpulse-ai/images/view";
import type { BrandKit } from "@/lib/products/viralpulse-ai/images/types";
import type { ImageSettings } from "@/lib/products/viralpulse-ai/images/limits";
import { deleteMedia, getMedia, mediaCollection, mediaUsage, newUploadPath } from "@/lib/products/viralpulse-ai/media";
import { createPost, updatePost } from "@/lib/products/viralpulse-ai/posts";
import { adsCollection, updateAd } from "@/lib/products/viralpulse-ai/ads";
import { listAudit, recordAudit } from "@/lib/products/viralpulse-ai/audit";
import { notDeleted, str } from "@/lib/products/viralpulse-ai/db";
import { isPostPlatform, POST_PLATFORMS } from "@/lib/products/viralpulse-ai/constants";
import { fitsFor, goalById, GROUP_TO_POST_PLATFORM } from "@/lib/products/viralpulse-ai/images/specs";

const actorOf = (v: SmmsViewer): Actor => ({ userId: v.userId, email: v.email, canApprove: can(v, "PUBLISH_CONTENT") });
const engine = () => createEngine(defaultImageDeps());
const GEN = ["MANAGE_MEDIA", "GENERATE_AI_CONTENT"] as const;

type Bag = Record<string, unknown>;
const bag = (v: unknown): Bag => (v && typeof v === "object" && !Array.isArray(v) ? (v as Bag) : {});
const strs = (v: unknown, n = 20): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, n) : []);

export async function createProjectAction(input: Bag) {
  return run([...GEN], async (v) => {
    // The consent record's who / when are written by the engine from the session; whatever the browser sends for them is ignored.
    return { project: toProjectView(await engine().createProject(actorOf(v), bag(input))) };
  }, { revalidate: false });
}

export async function updateBriefAction(id: string, input: Bag) {
  return run([...GEN], async (v) => {
    return { project: toProjectView(await engine().updateBrief(actorOf(v), String(id), bag(input))) };
  }, { revalidate: false });
}

function outcome(o: Awaited<ReturnType<ReturnType<typeof createEngine>["generate"]>>) {
  if (o.outcome === "done") return { outcome: "done" as const, project: toProjectView(o.project) };
  if (o.outcome === "needs_manager") return { outcome: "needs_manager" as const, estimateUsd: o.estimateUsd, thresholdUsd: o.thresholdUsd, project: toProjectView(o.project) };
  return { outcome: "needs_ack" as const, flags: o.flags };
}

/** Runs the engine call, and any work it hands back to run after the response (generation continues if the person leaves the page). */
async function withDefer<T>(fn: (defer: (run: () => Promise<unknown>) => void) => Promise<T>): Promise<T> {
  let job: (() => Promise<unknown>) | null = null;
  const out = await fn((r) => { job = r; });
  if (job) {
    const j = job as () => Promise<unknown>;
    await afterForCompany(() => j().catch((e) => console.error("[image studio]", (e as Error)?.message)));
  }
  return out;
}

/** Starts drawing in the background. The page polls `getProjectAction` for progress. */
export async function generateAction(id: string, acknowledge?: string[]) {
  return run([...GEN], async (v) => withDefer(async (defer) => outcome(await engine().generate(actorOf(v), String(id), { acknowledge: acknowledge === undefined ? undefined : strs(acknowledge, 40), defer }))), { revalidate: false });
}

export async function editVariantAction(id: string, variantId: string, instruction: string, acknowledge: string[]) {
  return run([...GEN], async (v) => withDefer(async (defer) => outcome(await engine().editVariant(actorOf(v), String(id), String(variantId), String(instruction ?? ""), { acknowledge: strs(acknowledge, 40), defer }))), { revalidate: false });
}

export async function approveAction(id: string) {
  return run(["PUBLISH_CONTENT", "MANAGE_MEDIA"], async (v) => withDefer(async (defer) => outcome(await engine().approve(actorOf(v), String(id), { defer }))), { revalidate: false });
}

export async function rejectAction(id: string) {
  return run(["PUBLISH_CONTENT"], async (v) => {
    await engine().reject(actorOf(v), String(id));
    return {};
  }, { revalidate: false });
}

export async function chooseAction(id: string, ids: string[]) {
  return run([...GEN], async (v) => ({ project: toProjectView(await engine().choose(actorOf(v), String(id), strs(ids, 10))) }), { revalidate: false });
}

export async function finishAction(id: string, input: Bag) {
  return run(["MANAGE_MEDIA"], async (v) => {
    const r = await engine().finish(actorOf(v), String(id), {
      name: str(input.name, 160),
      tags: strs(input.tags, 20).map((t) => str(t, 40)).filter(Boolean),
      folder: str(input.folder, 60) || null,
      badge: !!input.badge,
      applyLogo: !!input.applyLogo,
      specKeys: strs(input.specKeys, 10),
      altText: str(input.altText, 500),
      format: input.format === "png" ? "png" : "jpeg",
    });
    return { exports: r.exports, warnings: r.warnings, project: toProjectView(r.project) };
  });
}

export async function getProjectAction(id: string) {
  return run(["MANAGE_MEDIA"], async (v) => ({ project: toProjectView(await engine().reconcile(String(id))), canApprove: can(v, "PUBLISH_CONTENT") }), { revalidate: false });
}

// ── brand kit and limits ────────────────────────────────────────────────────

export async function saveKitAction(input: Partial<BrandKit>) {
  return run(["MANAGE_INTEGRATIONS"], async (v) => {
    const kit = await saveBrandKit(bag(input) as Partial<BrandKit>, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "settings", entity: "settings", entityId: "image-kit", entityLabel: "Image brand kit", summary: "Updated the Image Studio brand kit" });
    return { kit };
  });
}

export async function saveImageSettingsAction(input: Partial<ImageSettings>) {
  return run(["MANAGE_INTEGRATIONS"], async (v) => {
    const settings = await saveImageSettings(bag(input) as Partial<ImageSettings>, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "settings", entity: "settings", entityId: "image-limits", entityLabel: "Image Studio limits", summary: "Updated Image Studio limits", metadata: { dailySpendCapUsd: settings.dailySpendCapUsd, approvalThresholdUsd: settings.approvalThresholdUsd, perUserPerMinute: settings.perUserPerMinute } });
    return { settings };
  });
}

export async function loadStudioConfigAction() {
  return run(["MANAGE_MEDIA"], async () => ({ kit: await getBrandKit(), settings: await getImageSettings() }), { revalidate: false });
}

// ── library ─────────────────────────────────────────────────────────────────

/** A company-prefixed storage path for a browser upload. */
export async function newUploadPathAction(ext: string) {
  return run(["MANAGE_MEDIA"], async () => {
    if (!/^(jpg|png|webp|gif|mp4|mov|webm)$/.test(String(ext))) throw new SmmsInputError("That file type isn't supported.");
    return { path: await newUploadPath(String(ext)) };
  }, { revalidate: false });
}

export async function bulkDeleteMediaAction(ids: string[]) {
  return run(["MANAGE_MEDIA"], async (v) => {
    const list = strs(ids, 100);
    let deleted = 0;
    const refused: { id: string; reason: string }[] = [];
    for (const id of list) {
      try {
        const m = await deleteMedia(id, v.userId);
        deleted++;
        await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "media", entityId: id, entityLabel: m.name, summary: `Deleted ${m.kind} "${m.name}" (bulk)` });
      } catch (e) {
        refused.push({ id, reason: e instanceof SmmsInputError ? e.message : "Could not delete." });
      }
    }
    return { deleted, refused };
  });
}

export async function bulkFolderTagsAction(ids: string[], folder: string | null | undefined, addTags: string[]) {
  return run(["MANAGE_MEDIA"], async (v) => {
    const col = await mediaCollection();
    const list = strs(ids, 100);
    const tags = addTags.map((t) => str(t, 40)).filter(Boolean).slice(0, 10);
    const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: v.userId };
    if (folder !== undefined) set.folder = str(folder, 60) || null;
    const res = await col.updateMany({ _id: { $in: list }, ...notDeleted }, { $set: set, ...(tags.length ? { $addToSet: { tags: { $each: tags } } } : {}) });
    return { updated: res.modifiedCount };
  });
}

export async function mediaUsageAction(id: string) {
  return run(["MANAGE_MEDIA"], async () => ({ usage: await mediaUsage(String(id)) }), { revalidate: false });
}

/** Creates a draft post with the picture attached, on the platforms the picture's shape fits. Returns where to edit it. */
export async function startPostFromMediaAction(mediaId: string) {
  return run(["MANAGE_POSTS"], async (v) => {
    const m = await getMedia(String(mediaId));
    if (!m || m.kind !== "image") throw new SmmsInputError("Choose an image from the library.");
    const fit = fitsFor(m.width, m.height).map((s) => GROUP_TO_POST_PLATFORM[s.group]).filter((p): p is (typeof POST_PLATFORMS)[number] => !!p && isPostPlatform(p));
    const platforms = [...new Set(fit.length ? fit : m.platform && isPostPlatform(m.platform) ? [m.platform] : ["instagram" as const])];
    const post = await createPost({ title: m.name, topic: m.name, serviceProduct: "", audience: "", tone: "", language: "English", objective: "", contentType: "image", platforms, link: null, plannedAt: null, campaignId: null, offerId: null, clientId: null, notes: "" }, v.userId);
    await updatePost(post._id, { mediaIds: [m._id] }, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "post", entityId: post._id, entityLabel: m.name, recordId: post._id, summary: `Started a post from library image "${m.name}"` });
    return { href: `/viralpulse-ai/posts/${post._id}/edit` };
  });
}

export async function listAdsForPickerAction() {
  return run(["CREATE_ADS"], async () => {
    const col = await adsCollection();
    const rows = await col.find({ ...notDeleted, format: "image", status: { $in: ["draft", "edited"] } }, { projection: { name: 1, campaignId: 1, platform: 1 } }).sort({ updatedAt: -1 }).limit(40).toArray();
    return { ads: rows.map((a) => ({ id: a._id, name: a.name, campaignId: a.campaignId, platform: a.platform })) };
  }, { revalidate: false });
}

export async function attachMediaToAdAction(mediaId: string, adId: string) {
  return run(["CREATE_ADS"], async (v) => {
    const m = await getMedia(String(mediaId));
    if (!m || m.kind !== "image") throw new SmmsInputError("Choose an image from the library.");
    const col = await adsCollection();
    const ad = await col.findOne({ _id: String(adId), ...notDeleted });
    if (!ad) throw new SmmsInputError("That ad no longer exists.");
    if (ad.mediaIds.includes(m._id)) throw new SmmsInputError("That image is already on this ad.");
    if (ad.mediaIds.length >= 10) throw new SmmsInputError("An ad can hold up to 10 files.");
    await updateAd(ad._id, { mediaIds: [...ad.mediaIds, m._id] }, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "ad", entityId: ad._id, entityLabel: ad.name, recordId: ad.campaignId, summary: `Attached library image "${m.name}"` });
    return { href: `/viralpulse-ai/campaigns/${ad.campaignId}/ads/${ad._id}` };
  });
}



/** Saves the wizard's brief: creates the draft project the first time, updates it afterwards. */
export async function saveDraftAction(id: string | null, input: Bag) {
  return run([...GEN], async (v) => {
    const e = engine();
    const p = id ? await e.updateBrief(actorOf(v), String(id), bag(input)) : await e.createProject(actorOf(v), bag(input));
    return { project: toProjectView(p) };
  }, { revalidate: false });
}

/** The live estimate and the day's spend for a brief that may not be saved yet. */
export async function estimateBriefAction(input: Bag) {
  return run([...GEN], async (v) => {
    const e = engine();
    const settings = await getImageSettings();
    const brief = cleanBrief(bag(input), settings);
    const est = await e.estimate(brief, settings, brief.variants);
    const goal = goalById(brief.goalId);
    const images = goal?.slides ? brief.overlayText.length : brief.variants;
    const total = Math.round(est.perImageUsd * images * 1e6) / 1e6;
    return { estimate: { perImageUsd: est.perImageUsd, totalUsd: total, images, basis: est.basis, model: est.model }, spentTodayUsd: await spentToday(new Date()), canApprove: can(v, "PUBLISH_CONTENT") };
  }, { revalidate: false });
}

export async function duplicateProjectAction(id: string) {
  return run([...GEN], async (v) => ({ id: (await engine().duplicate(actorOf(v), String(id)))._id }), { revalidate: false });
}

export async function deleteProjectAction(id: string) {
  return run([...GEN], async (v) => { await engine().remove(actorOf(v), String(id)); return {}; });
}

/** Who did what to a project, newest first (from the audit log). */
export async function projectTrailAction(id: string) {
  return run(["MANAGE_MEDIA"], async () => {
    await engine().getProject(String(id));
    const r = await listAudit({ entity: "media", recordId: String(id), pageSize: 50 });
    return { items: r.items.map((a) => ({ id: a._id, at: a.createdAt.toISOString(), by: a.actorEmail, action: String(a.action), summary: a.summary ?? "" })) };
  }, { revalidate: false });
}

export async function estimateAction(id: string) {
  return run([...GEN], async () => {
    const e = createEngine(defaultImageDeps());
    const p = await e.getProject(String(id));
    const est = await e.estimate(p.brief, await getImageSettings(), p.brief.variants);
    return { estimate: { perImageUsd: est.perImageUsd, totalUsd: est.totalUsd, images: est.images, basis: est.basis, model: est.model } };
  }, { revalidate: false });
}
