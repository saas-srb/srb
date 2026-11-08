import "server-only";
import { stripPostDisclosureOverride } from "@/lib/products/viralpulse-ai/publishers/types";
import { getMediaMany, toMediaCard, validMediaIds, type MediaCard } from "@/lib/products/viralpulse-ai/media";
import { listAccounts } from "@/lib/products/viralpulse-ai/accounts/service";
import type { AccountProvider } from "@/lib/products/viralpulse-ai/accounts/types";
import { PUBLISHER_MODULES } from "@/lib/products/viralpulse-ai/publishers/index";
import { getPublishSettings } from "@/lib/products/viralpulse-ai/publishers/publish-settings";
import { getPost, createPost, parsePostBrief, reconcileVariants, requirePost, updatePost, type PostDoc } from "@/lib/products/viralpulse-ai/posts";
import { normalizeVariant } from "@/lib/products/viralpulse-ai/content";
import { statusAfterEdit, listCampaignOptions } from "@/lib/products/viralpulse-ai/campaigns";
import { recordVersion } from "@/lib/products/viralpulse-ai/generations";
import { postSnapshot } from "@/lib/products/viralpulse-ai/generate";
import { briefPickers } from "@/lib/products/viralpulse-ai/page-data";
import { getBrandSnapshot } from "@/lib/products/viralpulse-ai/brand";
import { isOpenAIConfigured } from "@/lib/openai";
import { recordAudit } from "@/lib/products/viralpulse-ai/audit";
import { can, SmmsInputError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { PLATFORM_META, POST_PLATFORMS, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import { buildPublishOptions, finalLink, metaFromState, postContentType, sanitizeWizardState, stateFromPost, objectiveLabel, parseHandoff, defaultContentType, type Handoff, type PostLike, type WizardAccount, type WizardState } from "./helpers";

const PLATFORM_OF: Partial<Record<AccountProvider, PostPlatform>> = { facebook_page: "facebook", instagram_business: "instagram", youtube_channel: "youtube", linkedin_member: "linkedin", linkedin_organization: "linkedin", x_account: "x", gbp_location: "google_business" };

export interface WizardCaps {
  label: string;
  captionLimit: number;
  hashtagLimit: number | null;
  nativeAiLabel: boolean;
  nativeScheduling: boolean;
  needsAppApproval: string | null;
  behindFlag: string | null;
  unverified: string[];
}

export interface WizardInit {
  state: WizardState;
  postStatus: string | null;
  /** Why the wizard can't be edited (published, archived), or null. */
  lockedReason: string | null;
  accounts: WizardAccount[];
  media: MediaCard[];
  campaigns: { _id: string; name: string }[];
  offers: { _id: string; title: string; badge: string }[];
  clients: { _id: string; name: string }[];
  services: string[];
  caps: Record<PostPlatform, WizardCaps>;
  settings: { timezone: string; aiDisclosureOff: boolean; gbpEnabled: boolean };
  can: { publish: boolean; schedule: boolean; generate: boolean; upload: boolean; settings: boolean; metrics: boolean };
  aiReady: boolean;
  brandName: string;
  versionCount: number;
  nowIso: string;
}

export async function wizardAccounts(): Promise<WizardAccount[]> {
  const rows = await listAccounts();
  const out: WizardAccount[] = [];
  for (const a of rows) {
    const platform = PLATFORM_OF[a.provider];
    if (!platform || a.disconnected) continue;
    out.push({ id: a.id, platform, providerLabel: a.providerLabel, name: a.name, handle: a.handle, status: a.status, enabled: a.enabled, isDefault: a.isDefault, daysLeft: a.daysLeft, expiresAt: a.expiresAt, missingRequired: a.missingRequired, lastError: a.lastError, kind: a.provider });
  }
  return out;
}

export function postLike(p: PostDoc): PostLike {
  return {
    id: p._id, title: p.title, topic: p.topic, serviceProduct: p.serviceProduct, audience: p.audience, tone: p.tone, language: p.language, objective: p.objective,
    contentType: p.contentType, platforms: p.platforms, link: p.link, campaignId: p.campaignId, offerId: p.offerId, clientId: p.clientId, notes: p.notes, idea: p.idea,
    variants: p.variants.map((v) => ({ platform: v.platform, title: v.title, content: v.content, caption: v.caption, cta: v.cta, hashtags: v.hashtags, keywords: v.keywords })),
    mediaIds: p.mediaIds, thumbnailId: p.thumbnailId, scheduledAtIso: p.scheduledAt?.toISOString() ?? null, plannedAtIso: p.plannedAt?.toISOString() ?? null, scheduledTz: p.scheduledTz ?? null,
    publishOptions: p.publishOptions, wizard: p.wizard,
  };
}

export async function loadWizardInit(postId: string | null, handoff: Handoff, viewer: SmmsViewer, defaults: { campaignId?: string } = {}): Promise<WizardInit | null> {
  const [settings, accounts, pickers, campaigns, brand, aiReady] = await Promise.all([getPublishSettings(), wizardAccounts(), briefPickers(), listCampaignOptions(), getBrandSnapshot(), isOpenAIConfigured()]);
  let state: WizardState;
  let post: PostDoc | null = null;
  if (postId) {
    post = await getPost(postId);
    if (!post) return null;
    state = stateFromPost(postLike(post), settings.timezone);
  } else {
    state = sanitizeWizardState({}, settings.timezone);
    if (defaults.campaignId && campaigns.some((c) => c._id === defaults.campaignId)) state.campaignId = defaults.campaignId;
  }
  // Hand-off from the Image Studio / UGC Studio: the files and where they came from. Only files that exist and are readable are taken.
  const handed = handoff.mediaIds.length ? await getMediaMany(handoff.mediaIds) : [];
  if (handed.length) {
    state.mediaIds = [...new Set([...state.mediaIds, ...handed.map((m) => m._id)])].slice(0, 20);
    state.handoff = handoff.source ?? "library";
    if (!post) {
      const pl = handoff.platform ?? (handed.some((m) => m.kind === "video") ? "instagram" : "instagram");
      state.platforms = [pl];
      state.contentTypes = { [pl]: handed.some((m) => m.kind === "video") ? (pl === "youtube" ? "video" : pl === "instagram" || pl === "facebook" ? "reel" : "video") : defaultContentType(pl) };
      const first = accounts.find((a) => a.platform === pl && a.enabled);
      if (first) state.accountIds = { [pl]: first.id };
    }
  }
  const ids = [...new Set([...state.mediaIds, ...(state.thumbnailId ? [state.thumbnailId] : [])])];
  const media = ids.length ? (await getMediaMany(ids)).map(toMediaCard) : [];
  state.mediaIds = state.mediaIds.filter((id) => media.some((m) => m._id === id));
  const caps = Object.fromEntries(POST_PLATFORMS.map((p) => {
    const c = PUBLISHER_MODULES[p].capabilities;
    return [p, { label: c.label, captionLimit: c.captionLimit, hashtagLimit: c.hashtagLimit, nativeAiLabel: c.nativeAiLabel, nativeScheduling: c.nativeScheduling, needsAppApproval: c.needsAppApproval, behindFlag: c.behindFlag ?? null, unverified: c.unverified }];
  })) as Record<PostPlatform, WizardCaps>;
  const lockedReason = !post ? null : post.status === "archived" ? "This post is archived. Restore it to edit." : post.variants.length > 0 && post.variants.every((v) => v.publish.state === "published") ? "Every platform of this post is published. Duplicate it to reuse the content." : null;
  if (!state.schedule.local) state.schedule.local = "";
  return {
    state, postStatus: post?.status ?? null, lockedReason, accounts, media, campaigns, offers: pickers.offers, clients: pickers.clients, services: pickers.services, caps,
    settings: { timezone: settings.timezone, aiDisclosureOff: settings.aiDisclosureOff, gbpEnabled: settings.gbpEnabled },
    can: { publish: can(viewer, "PUBLISH_CONTENT"), schedule: can(viewer, "SCHEDULE_POSTS") || can(viewer, "PUBLISH_CONTENT"), generate: can(viewer, "GENERATE_AI_CONTENT") && aiReady, upload: can(viewer, "MANAGE_MEDIA"), settings: can(viewer, "MANAGE_INTEGRATIONS"), metrics: can(viewer, "VIEW_ANALYTICS") },
    aiReady, brandName: brand.companyName, versionCount: 0, nowIso: new Date().toISOString(),
  };
}

export { parseHandoff };

// ── Saving ───────────────────────────────────────────────────────────────────

export interface SaveResult {
  id: string;
  savedAt: string;
  version: number | null;
  created: boolean;
}

/**
 * Writes the wizard state to the post (creating it the first time). Published platforms are never changed. `checkpoint` records a
 * version in the post's history (done on Next / when sending, not on every autosave). Editing a scheduled post withdraws its approval.
 */
export async function saveWizardDraft(raw: unknown, opts: { checkpoint: boolean }, viewer: SmmsViewer): Promise<SaveResult> {
  const settings = await getPublishSettings();
  const s = sanitizeWizardState(raw, settings.timezone);
  const mediaIds = await validMediaIds(s.mediaIds, ["image", "video"]);
  const kinds = mediaIds.length ? (await getMediaMany(mediaIds)).map((m) => m.kind) : [];
  const thumb = s.thumbnailId ? (await validMediaIds([s.thumbnailId], ["image"]))[0] ?? null : null;
  const link = finalLink(s.link, s.utm);
  const brief = parsePostBrief({
    title: s.title, topic: s.topic, serviceProduct: s.serviceProduct, audience: s.audience, tone: s.tone, language: s.language, objective: s.objective ? objectiveLabel(s.objective) : "",
    contentType: postContentType(s, kinds), platforms: s.platforms, link, campaignId: s.campaignId, offerId: s.offerId, clientId: s.clientId, notes: s.notes,
  });
  brief.plannedAt = null;
  let existing: PostDoc | null = null;
  if (s.postId) {
    existing = await requirePost(s.postId);
    if (existing.status === "archived") throw new SmmsInputError("Restore the post before editing it.");
    const removed = existing.variants.filter((v) => v.publish.state === "published" && !brief.platforms.includes(v.platform));
    if (removed.length) throw new SmmsInputError(`${removed.map((v) => PLATFORM_META[v.platform].label).join(", ")} is already published and can't be removed.`);
  }
  const base = existing ?? (await createPost(brief, viewer.userId));
  const variants = reconcileVariants(base.variants, brief.platforms).map((cur) => {
    const d = s.variants[cur.platform];
    if (!d || cur.publish.state === "published") return cur;
    return { ...cur, ...normalizeVariant({ ...d, caption: cur.caption }) };
  });
  const options = stripPostDisclosureOverride(buildPublishOptions(s, base.publishOptions));
  const status = statusAfterEdit(base.status);
  const changedContent = JSON.stringify(postSnapshot({ idea: base.idea, creative: base.creative, variants: base.variants })) !== JSON.stringify(postSnapshot({ idea: base.idea, creative: base.creative, variants }));
  await updatePost(base._id, {
    ...brief, variants, mediaIds, thumbnailId: thumb, publishOptions: options, wizard: metaFromState(s), status,
    ...(base.status === "scheduled" && base.approvedBy ? { approvedBy: null, approvedAt: null } : {}),
  }, viewer.userId);
  let version: number | null = null;
  if (opts.checkpoint && (changedContent || !existing)) {
    version = await recordVersion({ targetType: "post", targetId: base._id, source: "edit", kind: "post", label: brief.title, snapshot: postSnapshot({ idea: base.idea, creative: base.creative, variants }), userId: viewer.userId, userEmail: viewer.email });
  }
  if (!existing) await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "create", entity: "post", entityId: base._id, entityLabel: brief.title, recordId: base._id, summary: brief.platforms.map((x) => PLATFORM_META[x].label).join(", ") });
  return { id: base._id, savedAt: new Date().toISOString(), version, created: !existing };
}
