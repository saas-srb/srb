import { getPrompt } from "@/lib/prompts/store";
import "server-only";
import { generateStructured, generateImage, platformGuide, refineBlock } from "@/lib/products/viralpulse-ai/ai";
import { brandPrompt } from "@/lib/products/viralpulse-ai/brand";
import { recordVersion } from "@/lib/products/viralpulse-ai/generations";
import { briefPrompt, saveCampaignAi, type CampaignDoc } from "@/lib/products/viralpulse-ai/campaigns";
import { updateAd, type AdDoc } from "@/lib/products/viralpulse-ai/ads";
import { postBriefPrompt, reconcileVariants, updatePost, type PostDoc } from "@/lib/products/viralpulse-ai/posts";
import { saveAiImage, type MediaDoc } from "@/lib/products/viralpulse-ai/media";
import { normalizeAd, normalizeCampaignAi, normalizeCreative, normalizeVariant, normalizeWorkspace, normalizeImage, type WorkspaceOutput, type ImageCreative } from "@/lib/products/viralpulse-ai/content";
import { findFormat, imageSizeFor, GENERATOR_TYPES, PLATFORM_META, isPostPlatform, type ContentStatus, type GeneratorType, type Platform } from "@/lib/products/viralpulse-ai/constants";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import type { SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";

/**
 * Brief + brand context → OpenAI → a new stored version. Each function writes
 * the result onto its record (status → "generated") and appends a version row,
 * so earlier outputs can always be restored. None of them publishes anything.
 */

type Actor = Pick<SmmsViewer, "userId" | "email">;

/** Generating on a scheduled item keeps it on the calendar but withdraws its publish approval — changed content must be re-approved. */
function statusAfterGenerate(current: ContentStatus): { status: ContentStatus; clearApproval: boolean } {
  if (current === "scheduled") return { status: "scheduled", clearApproval: true };
  return { status: "generated", clearApproval: false };
}

function assertEditable(status: ContentStatus, what: string) {
  if (status === "archived") throw new SmmsInputError(`Restore the ${what} before generating new content.`);
  if (status === "published") throw new SmmsInputError(`This ${what} is already published — duplicate it to create a new version.`);
}

// ── Campaign strategy ───────────────────────────────────────────────────────

export async function generateCampaignStrategy(c: CampaignDoc, actor: Actor, instruction: string | null) {
  assertEditable(c.status, "campaign");
  const input = [
    await brandPrompt({ clientId: c.clientId, offerId: c.offerId }),
    `CAMPAIGN BRIEF:\n${briefPrompt(c)}`,
    `PLATFORM RULES:\n${platformGuide(c.platforms)}`,
    await getPrompt("smms.task.campaign"),
    await refineBlock(c.ai, instruction),
  ].join("\n\n");
  const r = await generateStructured({ userId: actor.userId, schema: "campaign", input, normalize: normalizeCampaignAi });
  await saveCampaignAi(c._id, r.data, statusAfterGenerate(c.status).status, actor.userId);
  const version = await recordVersion({ targetType: "campaign", targetId: c._id, source: "ai", kind: "campaign_strategy", label: c.name, snapshot: r.data, userId: actor.userId, userEmail: actor.email, instruction, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs });
  return { version, data: r.data };
}

// ── Ad creative ─────────────────────────────────────────────────────────────

export async function generateAdCreative(ad: AdDoc, c: CampaignDoc, actor: Actor, instruction: string | null) {
  assertEditable(ad.status, "ad");
  const meta = PLATFORM_META[ad.platform];
  const fmt = findFormat(ad.platform, ad.formatKey);
  const input = [
    await brandPrompt({ clientId: c.clientId, offerId: c.offerId }),
    `CAMPAIGN BRIEF:\n${briefPrompt(c)}`,
    c.ai.summary && `CAMPAIGN STRATEGY: ${c.ai.summary}\nKey messages: ${c.ai.keyMessages.join("; ")}`,
    `PLATFORM RULES:\n${platformGuide([ad.platform])}`,
    `AD: ${ad.name} — a ${ad.format} ad for ${meta.label}${fmt ? `, format ${fmt.label} (${fmt.width}x${fmt.height})` : ""}.`,
    ad.content.headline && `Starting point from the campaign concept: headline "${ad.content.headline}"; primary text "${ad.content.primaryText.slice(0, 600)}"`,
    await getPrompt("smms.task.ad", { hashtag_advice: meta.hashtagAdvice, format: ad.format, empty_image_note: await getPrompt("smms.empty_image_note") }) +
      (ad.format === "video" ? await getPrompt("smms.task.ad_video") : await getPrompt("smms.task.ad_image")),
    await refineBlock(ad.content, instruction),
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await generateStructured({ userId: actor.userId, schema: "ad", input, normalize: normalizeAd });
  const next = statusAfterGenerate(ad.status);
  await updateAd(ad._id, { content: r.data, status: next.status, ...(next.clearApproval ? { approvedBy: null, approvedAt: null } : {}) }, actor.userId);
  const version = await recordVersion({ targetType: "ad", targetId: ad._id, source: "ai", kind: `${ad.format}_ad`, label: `${ad.name} · ${meta.label}`, platform: ad.platform, snapshot: r.data, userId: actor.userId, userEmail: actor.email, instruction, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs });
  return { version };
}

// ── Social post ─────────────────────────────────────────────────────────────

function postSnapshot(p: Pick<PostDoc, "idea" | "creative" | "variants">) {
  return { idea: p.idea, creative: p.creative, variants: p.variants.map((v) => ({ platform: v.platform, title: v.title, content: v.content, caption: v.caption, cta: v.cta, hashtags: v.hashtags, keywords: v.keywords })) };
}
export { postSnapshot };

export async function generatePostContent(p: PostDoc, actor: Actor, instruction: string | null) {
  assertEditable(p.status, "post");
  const input = [
    await brandPrompt({ clientId: p.clientId, offerId: p.offerId }),
    `POST BRIEF:\n${postBriefPrompt(p)}`,
    `PLATFORM RULES:\n${platformGuide(p.platforms)}`,
    await getPrompt("smms.task.post", { platforms: p.platforms.join(", "), creative: p.contentType === "video" ? await getPrompt("smms.task.post_video") : await getPrompt("smms.task.post_image") }),
    await refineBlock(postSnapshot(p), instruction),
  ].join("\n\n");
  const r = await generateStructured({
    userId: actor.userId,
    schema: "post",
    input,
    normalize: (v) => {
      const o = (v ?? {}) as { idea?: unknown; creative?: unknown; variants?: unknown };
      const list = Array.isArray(o.variants) ? o.variants : [];
      return { idea: typeof o.idea === "string" ? o.idea.slice(0, 3000) : "", creative: normalizeCreative(o.creative), variants: list.map((x) => ({ platform: (x as { platform?: unknown }).platform, ...normalizeVariant(x) })) };
    },
  });
  const variants = reconcileVariants(p.variants, p.platforms).map((v) => {
    const gen = r.data.variants.find((g) => g.platform === v.platform);
    return gen ? { ...v, ...normalizeVariant(gen) } : v;
  });
  const next = statusAfterGenerate(p.status);
  const snapshot = { idea: r.data.idea, creative: r.data.creative, variants: r.data.variants.filter((v) => isPostPlatform(v.platform)) };
  await updatePost(p._id, { idea: r.data.idea, creative: r.data.creative, variants, status: next.status, ...(next.clearApproval ? { approvedBy: null, approvedAt: null } : {}) }, actor.userId);
  const version = await recordVersion({ targetType: "post", targetId: p._id, source: "ai", kind: "post", label: p.title, platform: p.platforms.length === 1 ? p.platforms[0] : null, snapshot, userId: actor.userId, userEmail: actor.email, instruction, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs });
  return { version };
}

/** Regenerate just one platform's version of a post. */
export async function regenerateVariant(p: PostDoc, platform: string, actor: Actor, instruction: string | null) {
  assertEditable(p.status, "post");
  const current = p.variants.find((v) => v.platform === platform);
  if (!current) throw new SmmsInputError("That platform isn't part of this post.");
  const input = [
    await brandPrompt({ clientId: p.clientId, offerId: p.offerId }),
    `POST BRIEF:\n${postBriefPrompt(p)}`,
    p.idea && `CORE IDEA: ${p.idea}`,
    `PLATFORM RULES:\n${platformGuide([platform])}`,
    await getPrompt("smms.task.variant", { platform: PLATFORM_META[platform as Platform].label }),
    await refineBlock(current, instruction),
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await generateStructured({ userId: actor.userId, schema: "variant", input, normalize: normalizeVariant });
  const variants = p.variants.map((v) => (v.platform === platform ? { ...v, ...r.data } : v));
  const next = statusAfterGenerate(p.status);
  await updatePost(p._id, { variants, status: next.status, ...(next.clearApproval ? { approvedBy: null, approvedAt: null } : {}) }, actor.userId);
  const version = await recordVersion({ targetType: "post", targetId: p._id, source: "ai", kind: "post_variant", label: `${p.title} · ${PLATFORM_META[platform as Platform].label}`, platform, snapshot: postSnapshot({ ...p, variants }), userId: actor.userId, userEmail: actor.email, instruction, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs });
  return { version };
}

// ── Images ──────────────────────────────────────────────────────────────────

/** Generates an image from a prompt into the media library, sized for the platform format. */
export async function generateImageToLibrary(opts: { prompt: string; platform: string | null; formatKey: string | null; name: string; actor: Actor; link?: { targetType: "ad" | "post"; targetId: string } }): Promise<MediaDoc> {
  const fmt = opts.platform ? findFormat(opts.platform, opts.formatKey) : null;
  const size = fmt ? imageSizeFor(fmt.width, fmt.height) : "1024x1024";
  const [w, h] = size.split("x").map(Number);
  const r = await generateImage({ userId: opts.actor.userId, prompt: opts.prompt, size });
  const media = await saveAiImage(r.data, { name: opts.name, creativePrompt: opts.prompt, platform: opts.platform, width: w, height: h, ai: { aiGenerated: true, provider: "openai", model: r.model, projectId: "", role: "image", disclosureRequired: true } }, opts.actor.userId);
  await recordVersion({ targetType: "media", targetId: media._id, source: "ai", kind: "image", label: opts.name, platform: opts.platform, snapshot: { prompt: opts.prompt, size, link: opts.link ?? null }, userId: opts.actor.userId, userEmail: opts.actor.email, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs });
  return media;
}

/** Writes a creative prompt (and concept) for a library image or video from its description. */
export async function generateMediaPrompt(m: MediaDoc, actor: Actor): Promise<ImageCreative> {
  const input = [
    await brandPrompt(),
    `MEDIA: a ${m.kind} named "${m.name}"${m.platform ? ` for ${PLATFORM_META[m.platform as Platform].label}` : ""}.`,
    m.description && `Description: ${m.description}`,
    m.caption && `Caption: ${m.caption}`,
    m.creativePrompt && `Existing prompt: ${m.creativePrompt}`,
    await getPrompt("smms.task.image_prompt", { what: m.kind === "video" ? await getPrompt("smms.task.image_prompt_video") : await getPrompt("smms.task.image_prompt_image") }),
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await generateStructured({ userId: actor.userId, schema: "imagePrompt", input, normalize: normalizeImage });
  await recordVersion({ targetType: "media", targetId: m._id, source: "ai", kind: "creative_prompt", label: m.name, platform: m.platform, snapshot: r.data, userId: actor.userId, userEmail: actor.email, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs });
  return r.data;
}

// ── AI Content Generator workspace ──────────────────────────────────────────

export interface WorkspaceInput {
  type: GeneratorType;
  platform: string;
  brief: string;
  audience: string;
  tone: string;
  language: string;
  count: number;
  offerId: string | null;
  clientId: string | null;
}


export async function runWorkspace(input: WorkspaceInput, actor: Actor): Promise<{ id: string; output: WorkspaceOutput }> {
  if (!input.brief.trim()) throw new SmmsInputError("Describe what you want to generate.");
  const n = Math.min(Math.max(Math.round(input.count) || 3, 1), 10);
  const typeLabel = GENERATOR_TYPES.find((g) => g.value === input.type)?.label ?? input.type;
  const prompt = [
    await brandPrompt({ clientId: input.clientId, offerId: input.offerId }),
    `PLATFORM: ${input.platform ? `${PLATFORM_META[input.platform as Platform]?.label ?? input.platform}\n${platformGuide([input.platform])}` : "Not specified — make it work across social platforms"}`,
    `BRIEF: ${input.brief}`,
    input.audience && `Audience: ${input.audience}`,
    `Tone: ${input.tone || "brand default"}. Language: ${input.language || "English"}.`,
    await getPrompt("smms.task.workspace", { type_label: typeLabel, task: await getPrompt(`smms.workspace.${input.type}`, { n }), platform: input.platform || "any" }),
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await generateStructured({ userId: actor.userId, schema: "workspace", input: prompt, normalize: normalizeWorkspace });
  const id = crypto.randomUUID();
  await recordVersion({ targetType: "workspace", targetId: id, source: "ai", kind: input.type, label: input.brief.slice(0, 120), platform: input.platform || null, snapshot: { input, output: r.data }, userId: actor.userId, userEmail: actor.email, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs });
  return { id, output: r.data };
}
