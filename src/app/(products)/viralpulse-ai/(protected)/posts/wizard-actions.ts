"use server";

import { run } from "@/lib/products/viralpulse-ai/run";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { requirePost } from "@/lib/products/viralpulse-ai/posts";
import { generatePostContent, regenerateVariant } from "@/lib/products/viralpulse-ai/generate";
import { cancelScheduled, getPublishPlan, listAttempts, publishNow, retryPublish, schedulePost, smmsUsersWith, withdrawApprovalForMedia } from "@/lib/products/viralpulse-ai/publishing";
import { notifySmmsUsers } from "@/lib/products/viralpulse-ai/notifications";
import { getMedia, updateMediaMeta } from "@/lib/products/viralpulse-ai/media";
import { recordAudit } from "@/lib/products/viralpulse-ai/audit";
import { saveWizardDraft } from "@/lib/products/viralpulse-ai/post-wizard/server";
import { isPostPlatform, PLATFORM_META, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";

/**
 * Server actions of the post wizard. Each resolves the viewer from the session (`run`) and re-checks its permission; the
 * publishing contract (`publishing.ts`) re-checks again, so nothing here can publish without PUBLISH_CONTENT.
 */

const id = (v: unknown): string => {
  if (typeof v !== "string" || !v || v.length > 64) throw new SmmsInputError("Unknown post.");
  return v;
};
const platformOf = (v: unknown): PostPlatform => {
  if (!isPostPlatform(v)) throw new SmmsInputError("Unknown platform.");
  return v;
};

export async function saveWizardAction(state: unknown, checkpoint: boolean) {
  return run(["MANAGE_POSTS"], async (v) => ({ saved: await saveWizardDraft(state, { checkpoint: checkpoint === true }, v) }), { revalidate: false });
}

type VariantOut = { platform: PostPlatform; title: string; content: string; hashtags: string[]; keywords: string[]; cta: string };

async function variantsOf(postId: string): Promise<VariantOut[]> {
  const p = await requirePost(postId);
  return p.variants.map((x) => ({ platform: x.platform, title: x.title, content: x.content || x.caption, hashtags: x.hashtags, keywords: x.keywords, cta: x.cta }));
}

/** Writes a version for every selected platform from the brief (the "Generate the whole draft with AI" button). The post must be saved first. */
export async function generateDraftAction(postId: string, instruction: string) {
  return run(["MANAGE_POSTS", "GENERATE_AI_CONTENT"], async (v) => {
    const p = await requirePost(id(postId));
    await generatePostContent(p, v, typeof instruction === "string" && instruction.trim() ? instruction.trim().slice(0, 1000) : null);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "generate", entity: "post", entityId: p._id, entityLabel: p.title, recordId: p._id, summary: "Whole draft from the wizard" });
    return { variants: await variantsOf(p._id) };
  });
}

/** Rewrites one platform's version in that platform's style. */
export async function adaptPlatformAction(postId: string, platform: string, instruction: string) {
  return run(["MANAGE_POSTS", "GENERATE_AI_CONTENT"], async (v) => {
    const p = await requirePost(id(postId));
    const pl = platformOf(platform);
    await regenerateVariant(p, pl, v, typeof instruction === "string" && instruction.trim() ? instruction.trim().slice(0, 1000) : null);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "regenerate", entity: "post", entityId: p._id, entityLabel: p.title, recordId: p._id, summary: `${PLATFORM_META[pl].label} version adapted from the wizard` });
    return { variants: await variantsOf(p._id) };
  });
}

/** The problem list and per-platform plan (what `publishNow` / `schedulePost` will check). */
export async function wizardPlanAction(postId: string) {
  return run(["MANAGE_POSTS"], async (v) => ({ plan: await getPublishPlan(id(postId), v) }), { revalidate: false });
}

export interface SubmitInput {
  postId: string;
  mode: "now" | "schedule";
  local?: string;
  timezone?: string;
  approve?: boolean;
  platforms?: string[];
}

export async function submitPostAction(input: SubmitInput) {
  return run(["MANAGE_POSTS"], async (v) => {
    const postId = id(input?.postId);
    const p = await requirePost(postId);
    if (input.mode === "now") {
      const wanted = (Array.isArray(input.platforms) ? input.platforms : p.platforms).filter(isPostPlatform);
      const results = await publishNow(postId, wanted, v);
      return { mode: "now" as const, results, scheduled: null };
    }
    const r = await schedulePost(postId, { local: String(input.local ?? ""), timezone: typeof input.timezone === "string" ? input.timezone : undefined, approve: input.approve === true }, v);
    if (!r.approved) {
      // Nobody with Publish has approved it yet: tell them it is waiting.
      const approvers = (await smmsUsersWith("PUBLISH_CONTENT")).filter((u) => u !== v.userId);
      if (approvers.length) await notifySmmsUsers(approvers, { type: "smms_approval_needed", title: `Approval needed: ${p.title}`, body: `Scheduled for ${r.plan.scheduledDisplay ?? r.scheduledAt.toISOString()}. It publishes only after someone with Publish approves it.`, link: `/viralpulse-ai/posts/${postId}`, dedupeKey: `smms-approve-${postId}-${r.scheduledAt.toISOString()}` });
    }
    return { mode: "schedule" as const, results: null, scheduled: { at: r.scheduledAt.toISOString(), display: r.plan.scheduledDisplay, approved: r.approved } };
  });
}

export async function attemptsAction(postId: string) {
  return run(["MANAGE_POSTS"], async (v) => {
    const attempts = await listAttempts(id(postId), v);
    const p = await requirePost(id(postId));
    return { attempts, status: p.status, scheduledAt: p.scheduledAt?.toISOString() ?? null, approved: Boolean(p.approvedBy), variants: p.variants.map((x) => ({ platform: x.platform, state: x.publish.state, url: x.publish.url, error: x.publish.error })) };
  }, { revalidate: false });
}

export async function retryAttemptAction(postId: string, platform: string, force: boolean) {
  return run(["MANAGE_POSTS", "PUBLISH_CONTENT"], async (v) => ({ result: await retryPublish(id(postId), platformOf(platform), { force: force === true }, v) }));
}

export async function cancelScheduleAction(postId: string) {
  return run(["MANAGE_POSTS"], async (v) => ({ cancelled: (await cancelScheduled(id(postId), v)).cancelled }));
}

/** Saves the alt text of a library picture (it is what Instagram, LinkedIn and X receive). Keeps every other field of the item. */
export async function setAltTextAction(mediaId: string, altText: string) {
  return run(["MANAGE_MEDIA"], async (v) => {
    const m = await getMedia(id(mediaId));
    if (!m) throw new SmmsInputError("That file no longer exists.");
    if (m.kind !== "image") throw new SmmsInputError("Only pictures have alt text.");
    await updateMediaMeta(m._id, { name: m.name, description: m.description, altText: String(altText ?? "").slice(0, 500), tags: m.tags, platform: m.platform, creativePrompt: m.creativePrompt, caption: m.caption, folder: m.folder ?? undefined }, v.userId);
    if (m.altText !== String(altText ?? "").slice(0, 500)) await withdrawApprovalForMedia(m._id, v, "alt text of attached media changed");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "media", entityId: m._id, entityLabel: m.name, summary: "Alt text" });
    return {};
  });
}
