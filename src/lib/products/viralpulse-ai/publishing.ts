import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { smmsCan, type SmmsPermission } from "@/lib/smms-roles";
import { notDeleted } from "@/lib/products/viralpulse-ai/db";
import { PUBLISHER_MODULES } from "@/lib/products/viralpulse-ai/publishers/index";
import { attemptsForPost, cancelAttempts, claimAttempt, claimDue, ensureAttempt, reopen, type AttemptDoc } from "@/lib/products/viralpulse-ai/publishers/attempts";
import { runAttempt, type EngineDeps, type Outcome } from "@/lib/products/viralpulse-ai/publishers/engine";
import { approverStillAllowed, buildPublishPost, realDeps } from "@/lib/products/viralpulse-ai/publishers/engine-deps";
import { loadPostMedia } from "@/lib/products/viralpulse-ai/publishers/media-facts";
import { getPublishSettings } from "@/lib/products/viralpulse-ai/publishers/publish-settings";
import { isConnected } from "@/lib/products/viralpulse-ai/publishers/publisherAuth";
import { DEFAULT_TIMEZONE, checkSchedule, formatInZone, isValidTimezone, zonedToUtc, LocalTimeError } from "@/lib/products/viralpulse-ai/publishers/schedule";
import { hasErrors } from "@/lib/products/viralpulse-ai/publishers/validate";
import { stripPostDisclosureOverride, type PlatformKey, type PublishIssue, type PublishOptions } from "@/lib/products/viralpulse-ai/publishers/types";
import { EMPTY_PUBLISH, getPost, postsCollection, statusFromVariants, updatePost, type PostDoc, type VariantPublish } from "@/lib/products/viralpulse-ai/posts";
import { adsCollection } from "@/lib/products/viralpulse-ai/ads";
import { recordAudit } from "@/lib/products/viralpulse-ai/audit";
import { notifySmmsUsers } from "@/lib/products/viralpulse-ai/notifications";
import { PLATFORM_META, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import { SmmsInputError, can, ForbiddenError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { afterForCompany } from "@/lib/platform/tenancy/context";

/**
 * Publishing is kept separate from AI generation. Content reaches a platform only through:
 *   1. an explicit "Publish now" by someone with PUBLISH_CONTENT, or
 *   2. a schedule that someone with PUBLISH_CONTENT approved - checked again when it runs, so revoking the approver's permission stops it.
 * Editing or regenerating a scheduled post withdraws its approval.
 *
 * Both paths create one `publish_attempts` document per platform and hand it to the same engine (`publishers/engine.ts`): "publish now"
 * runs it in the background right after the response (`after()`), the `viralpulse-publisher` cron (every 5 minutes) runs everything
 * that is due, retrying with backoff and resuming partly finished publishes. Nothing here blocks a request on a provider.
 */

type Actor = { userId: string; email: string | null };
export const WORKER_BUDGET_MS = 240_000;

export async function smmsUsersWith(permission: SmmsPermission): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .collection<{ _id: ObjectId; roles?: string[]; permissionOverrides?: Record<string, boolean> }>("admin_users")
    .find({ roles: { $elemMatch: { $regex: "^(smms_|super_admin$)" } } }, { projection: { roles: 1, permissionOverrides: 1 } })
    .toArray();
  return rows.filter((r) => smmsCan({ roles: r.roles ?? [], permissionOverrides: r.permissionOverrides ?? {} }, permission)).map((r) => r._id.toString());
}

function need(v: SmmsViewer, ...anyOf: SmmsPermission[]) {
  if (!anyOf.some((p) => can(v, p))) throw new ForbiddenError();
}

// ── Plan (what will happen, per platform) ────────────────────────────────────

export interface PlatformPlan {
  platform: PlatformKey;
  label: string;
  /** Plain-language format, e.g. "Reel", "Carousel (3 photos)", "Short". */
  format: string;
  issues: PublishIssue[];
  blocking: boolean;
  connected: boolean;
  enabled: boolean;
  disclosure: { mode: string; nativeFlag: boolean; reason: string };
  nativeScheduling: boolean;
  /** Latest attempt for this platform, if any. */
  attempt: AttemptView | null;
  variantState: VariantPublish["state"];
  url: string | null;
}

export interface PublishPlan {
  postId: string;
  timezone: string;
  scheduledAtUtc: string | null;
  scheduledDisplay: string | null;
  approved: boolean;
  ready: boolean;
  platforms: PlatformPlan[];
}

export interface AttemptView {
  id: string;
  platform: PlatformKey;
  state: AttemptDoc["state"];
  mode: AttemptDoc["mode"];
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  errorClass: AttemptDoc["errorClass"];
  message: string | null;
  hint: string | null;
  url: string | null;
  externalId: string | null;
  warnings: string[];
  requestIds: string[];
  disclosure: AttemptDoc["disclosure"];
  createdAt: string;
  finishedAt: string | null;
  history: { at: string; state: string; note: string }[];
}

const view = (a: AttemptDoc): AttemptView => ({
  id: a._id,
  platform: a.platform,
  state: a.state,
  mode: a.mode,
  attempts: a.attempts,
  maxAttempts: a.maxAttempts,
  nextAttemptAt: a.nextAttemptAt?.toISOString() ?? null,
  errorClass: a.errorClass,
  message: a.message,
  hint: a.hint,
  url: a.url,
  externalId: a.externalId,
  warnings: a.warnings,
  requestIds: a.requestIds,
  disclosure: a.disclosure,
  createdAt: a.createdAt.toISOString(),
  finishedAt: a.finishedAt?.toISOString() ?? null,
  history: a.history.map((h) => ({ at: h.at.toISOString(), state: h.state, note: h.note })),
});

function formatName(platform: PlatformKey, o: PublishOptions, images: number, hasVideo: boolean, hasLink: boolean, vid: { width: number | null; height: number | null; durationSec: number | null } | null): string {
  switch (platform) {
    case "instagram": {
      const f = o.instagram?.format ?? (hasVideo ? "reel" : "feed");
      return f === "story" ? "Story" : f === "reel" ? "Reel" : images > 1 ? `Carousel (${images} photos)` : "Photo post";
    }
    case "facebook":
      return o.facebook?.format === "reel" ? "Reel" : hasVideo ? "Video post" : images > 1 ? `${images} photos` : images === 1 ? "Photo post" : hasLink ? "Link post" : "Text post";
    case "youtube":
      return (o.youtube?.short ?? Boolean(vid && vid.width && vid.height && vid.width <= vid.height && (vid.durationSec ?? 999) <= 180)) ? "Short" : "Video";
    case "linkedin":
      return hasVideo ? "Video post" : images > 1 ? `${images} images` : images === 1 ? "Image post" : hasLink ? "Link (article) post" : "Text post";
    case "x":
      return o.x?.thread ? "Thread" : "Post";
    default:
      return "Local post";
  }
}

export async function getPublishPlan(postId: string, viewer: SmmsViewer): Promise<PublishPlan> {
  need(viewer, "MANAGE_POSTS", "SCHEDULE_POSTS", "PUBLISH_CONTENT");
  const p = await getPost(postId);
  if (!p) throw new SmmsInputError("That post no longer exists.");
  return buildPlan(p);
}

export async function buildPlan(p: PostDoc): Promise<PublishPlan> {
  const settings = await getPublishSettings();
  const media = await loadPostMedia(p.mediaIds, p.thumbnailId);
  const attempts = await attemptsForPost(p._id);
  const tz = p.scheduledTz && isValidTimezone(p.scheduledTz) ? p.scheduledTz : settings.timezone;
  const platforms: PlatformPlan[] = [];
  for (const v of p.variants) {
    const platform = v.platform as PlatformKey;
    const mod = PUBLISHER_MODULES[platform];
    const built = buildPublishPost(p, platform, media, settings.aiDisclosureOff);
    if (!built) continue;
    const issues = mod.validate(built.post, { images: media.images, video: media.video, thumbnail: media.thumbnail });
    const connected = await isConnected(platform, p.publishOptions?.accountIds?.[platform as PostPlatform]).catch(() => false);
    const enabled = platform === "google_business" ? settings.gbpEnabled : true;
    if (!connected) issues.push({ code: "not_connected", severity: "error", message: `${mod.capabilities.label} isn't connected.`, fix: "Connect the account in Settings → Connected accounts, or publish it by hand and mark it as published." });
    if (!enabled) issues.push({ code: "platform_disabled", severity: "error", message: `${mod.capabilities.label} posting is switched off.`, fix: "Turn it on in Settings once Google has approved API access." });
    if (built.disclosure.mode === "none" && (media.images.concat(media.video ? [media.video] : [])).some((m) => m.aiGenerated)) issues.push({ code: "ai_disclosure_waived", severity: "warning", message: "AI disclosure for this media is not required by its settings.", fix: "Leave as is, or enable the disclosure." });
    const latest = attempts.find((a) => a.platform === platform) ?? null;
    platforms.push({
      platform,
      label: mod.capabilities.label,
      format: formatName(platform, built.post.options, media.images.length, Boolean(media.video), Boolean(p.link), media.video),
      issues,
      blocking: hasErrors(issues),
      connected,
      enabled,
      disclosure: built.disclosure,
      nativeScheduling: mod.capabilities.nativeScheduling,
      attempt: latest ? view(latest) : null,
      variantState: v.publish.state,
      url: v.publish.url,
    });
  }
  const pending = platforms.filter((x) => x.variantState !== "published");
  return {
    postId: p._id,
    timezone: tz,
    scheduledAtUtc: p.scheduledAt?.toISOString() ?? null,
    scheduledDisplay: p.scheduledAt ? formatInZone(p.scheduledAt, tz) : null,
    approved: Boolean(p.approvedBy),
    ready: pending.length > 0 && pending.every((x) => !x.blocking),
    platforms,
  };
}

// ── Scheduling and publishing (the contract for the UI) ──────────────────────

export interface ScheduleInput {
  /** Either a UTC instant ... */
  at?: Date | string;
  /** ... or a wall-clock time in `timezone` ("2026-11-05T09:30"). */
  local?: string;
  timezone?: string;
  approve?: boolean;
  options?: PublishOptions;
}

export async function schedulePost(postId: string, input: ScheduleInput, viewer: SmmsViewer, now = new Date()): Promise<{ scheduledAt: Date; timezone: string; approved: boolean; plan: PublishPlan }> {
  need(viewer, "SCHEDULE_POSTS", "PUBLISH_CONTENT");
  const p = await getPost(postId);
  if (!p) throw new SmmsInputError("That post no longer exists.");
  if (p.status === "archived") throw new SmmsInputError("Restore the post before scheduling it.");
  const settings = await getPublishSettings();
  const tz = input.timezone || settings.timezone || DEFAULT_TIMEZONE;
  if (!isValidTimezone(tz)) throw new SmmsInputError("That time zone isn't recognised.");
  let at: Date;
  try {
    at = input.local ? zonedToUtc(input.local, tz) : new Date(input.at ?? "");
  } catch (e) {
    throw new SmmsInputError(e instanceof LocalTimeError ? e.message : "That isn't a valid date and time.");
  }
  const chk = checkSchedule(at, now);
  if (!chk.ok) throw new SmmsInputError(`${chk.message} ${chk.fix}`);
  const merged: PostDoc = { ...p, publishOptions: stripPostDisclosureOverride({ ...(p.publishOptions ?? {}), ...(input.options ?? {}) }) };
  const plan = await buildPlan({ ...merged, scheduledAt: at, scheduledTz: tz });
  if (!plan.platforms.some((x) => x.variantState !== "published")) throw new SmmsInputError("Every platform of this post is already published.");
  const blockers = plan.platforms.filter((x) => x.variantState !== "published" && x.blocking);
  if (blockers.length) throw new SmmsInputError(`Fix these before scheduling - ${blockers.map((b) => `${b.label}: ${b.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ")}`).join(" | ")}`.slice(0, 600));
  const approve = Boolean(input.approve) && can(viewer, "PUBLISH_CONTENT");
  await cancelAttempts(postId); // a new schedule replaces any waiting attempts
  await updatePost(postId, { status: "scheduled", scheduledAt: at, scheduledTz: tz, scheduledBy: viewer.userId, approvedBy: approve ? viewer.userId : null, approvedAt: approve ? now : null, publishQueuedAt: null, publishOptions: merged.publishOptions }, viewer.userId);
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "schedule", entity: "post", entityId: postId, entityLabel: p.title, recordId: postId, summary: `${at.toISOString()} (${tz})${approve ? " · approved to auto-publish" : " · awaiting approval"}` });
  return { scheduledAt: at, timezone: tz, approved: approve, plan: { ...plan, scheduledAtUtc: at.toISOString(), scheduledDisplay: formatInZone(at, tz), approved: approve } };
}

export interface QueuedResult {
  platform: PostPlatform;
  ok: boolean;
  /** true when the publish was handed to the engine and is running or waiting (not yet confirmed by the platform). */
  queued?: boolean;
  error?: string;
  url?: string | null;
  attemptId?: string;
}

/** Hands the chosen platforms to the engine and returns immediately; the work runs in the background right after the response. */
export async function publishNow(postId: string, platforms: PostPlatform[], viewer: SmmsViewer, opts: { options?: PublishOptions } = {}): Promise<QueuedResult[]> {
  need(viewer, "PUBLISH_CONTENT");
  const p = await getPost(postId);
  if (!p) throw new SmmsInputError("That post no longer exists.");
  if (p.status === "archived") throw new SmmsInputError("Restore the post before publishing it.");
  const wanted = platforms.filter((x) => p.platforms.includes(x));
  if (wanted.length === 0) throw new SmmsInputError("Pick at least one of the post's platforms.");
  if (opts.options) await updatePost(postId, { publishOptions: stripPostDisclosureOverride({ ...(p.publishOptions ?? {}), ...opts.options }) }, viewer.userId);
  const plan = await buildPlan({ ...p, publishOptions: stripPostDisclosureOverride({ ...(p.publishOptions ?? {}), ...(opts.options ?? {}) }) });
  const results: QueuedResult[] = [];
  const ids: string[] = [];
  for (const platform of wanted) {
    const pp = plan.platforms.find((x) => x.platform === platform);
    const variant = p.variants.find((v) => v.platform === platform);
    if (variant?.publish.state === "published") {
      results.push({ platform, ok: true, url: variant.publish.url });
      continue;
    }
    if (!pp || pp.blocking) {
      const msg = pp ? pp.issues.filter((i) => i.severity === "error").map((i) => `${i.message} ${i.fix}`).join(" ") : "Not part of this post.";
      results.push({ platform, ok: false, error: msg.slice(0, 400) });
      continue;
    }
    const { attempt } = await ensureAttempt({ postId, platform, accountId: p.publishOptions?.accountIds?.[platform] ?? null, mode: "now", requestedBy: viewer.userId });
    if (attempt.state === "published") results.push({ platform, ok: true, url: attempt.url, attemptId: attempt._id });
    else {
      if (attempt.state === "failed") await reopen(attempt._id, { note: "Publish now" });
      ids.push(attempt._id);
      results.push({ platform, ok: true, queued: true, attemptId: attempt._id });
    }
  }
  if (ids.length) await kick(ids);
  return results;
}

/** Compatibility wrapper for the existing server action: now queues instead of blocking. */
export async function publishPostNow(postId: string, platforms: PostPlatform[], actor: Actor): Promise<QueuedResult[]> {
  const viewer = await viewerFor(actor);
  return publishNow(postId, platforms, viewer);
}

async function viewerFor(actor: Actor): Promise<SmmsViewer> {
  const db = await getDb();
  const u = ObjectId.isValid(actor.userId) ? await db.collection<{ _id: ObjectId; roles?: string[]; permissionOverrides?: Record<string, boolean> }>("admin_users").findOne({ _id: new ObjectId(actor.userId) }, { projection: { roles: 1, permissionOverrides: 1 } }) : null;
  const roles = u?.roles ?? [];
  return { userId: actor.userId, email: actor.email ?? "", roles, ctx: { roles, permissionOverrides: u?.permissionOverrides ?? {} } };
}

export async function retryPublish(postId: string, platform: PostPlatform, opts: { force?: boolean }, viewer: SmmsViewer): Promise<QueuedResult> {
  need(viewer, "PUBLISH_CONTENT");
  const p = await getPost(postId);
  if (!p) throw new SmmsInputError("That post no longer exists.");
  const latest = (await attemptsForPost(postId)).find((a) => a.platform === platform);
  if (!latest) return (await publishNow(postId, [platform], viewer))[0];
  if (latest.state === "published") return { platform, ok: true, url: latest.url, attemptId: latest._id };
  if (latest.state === "failed") {
    // "May already be published" needs an explicit confirmation: the retry could create a duplicate.
    if (latest.errorClass === "ambiguous" && !opts.force) throw new SmmsInputError("This platform may already have the post. Check it first; if it is not there, confirm to publish again.");
    await reopen(latest._id, { force: Boolean(opts.force), note: opts.force ? "Retry confirmed after an uncertain result" : "Retry requested" });
  } else if (latest.state === "cancelled") {
    await ensureAttempt({ postId, platform, mode: "now", requestedBy: viewer.userId });
  }
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "publish", entity: "post", entityId: postId, entityLabel: p.title, recordId: postId, summary: `${PLATFORM_META[platform].label} retry${opts.force ? " (confirmed)" : ""}` });
  const fresh = (await attemptsForPost(postId)).find((a) => a.platform === platform)!;
  await kick([fresh._id]);
  return { platform, ok: true, queued: true, attemptId: fresh._id };
}

export async function cancelScheduled(postId: string, viewer: SmmsViewer): Promise<{ cancelled: number }> {
  need(viewer, "SCHEDULE_POSTS", "PUBLISH_CONTENT");
  const p = await getPost(postId);
  if (!p) throw new SmmsInputError("That post no longer exists.");
  const n = await cancelAttempts(postId);
  if (p.status === "scheduled") await updatePost(postId, { status: p.idea || p.variants.some((x) => x.content) ? "edited" : "draft", scheduledAt: null, scheduledBy: null, approvedBy: null, approvedAt: null, publishQueuedAt: null }, viewer.userId);
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "unschedule", entity: "post", entityId: postId, entityLabel: p.title, recordId: postId, summary: n ? `${n} waiting publish${n === 1 ? "" : "es"} cancelled` : null });
  return { cancelled: n };
}

/**
 * A scheduled post's approval covers what was approved. When media it uses is replaced, or a picture's alt text (which goes out with it)
 * changes, the approval is withdrawn like a brief or content save does, and waiting attempts are cancelled so the old approval cannot fire.
 */
export async function withdrawApprovalForPosts(postIds: string[], actor: { userId: string; email: string | null }, why: string): Promise<string[]> {
  if (!postIds.length) return [];
  const posts = await postsCollection();
  const rows = await posts.find({ ...notDeleted, _id: { $in: postIds }, status: "scheduled", $or: [{ approvedBy: { $ne: null } }, { publishQueuedAt: { $ne: null } }] }, { projection: { title: 1, createdBy: 1 } }).toArray();
  for (const p of rows) {
    await cancelAttempts(p._id);
    await updatePost(p._id, { approvedBy: null, approvedAt: null, publishQueuedAt: null }, actor.userId);
    await recordAudit({ actorId: actor.userId, actorEmail: actor.email, action: "approve", entity: "post", entityId: p._id, entityLabel: p.title, recordId: p._id, summary: `Approval withdrawn: ${why}` });
    if (p.createdBy && p.createdBy !== actor.userId) await notifySmmsUsers([p.createdBy], { type: "smms_approval_withdrawn", title: `Approval withdrawn: ${p.title}`, body: `${why[0].toUpperCase()}${why.slice(1)}. It will not auto-publish until it is approved again.`, link: `/viralpulse-ai/posts/${p._id}` });
  }
  return rows.map((r) => r._id);
}

export async function withdrawApprovalForMedia(mediaId: string, actor: { userId: string; email: string | null }, why = "attached media changed"): Promise<string[]> {
  const posts = await postsCollection();
  const ids = (await posts.find({ ...notDeleted, status: "scheduled", $or: [{ mediaIds: mediaId }, { thumbnailId: mediaId }] }, { projection: { _id: 1 } }).toArray()).map((r) => r._id);
  return withdrawApprovalForPosts(ids, actor, why);
}

export async function listAttempts(postId: string, viewer: SmmsViewer): Promise<AttemptView[]> {
  need(viewer, "MANAGE_POSTS", "SCHEDULE_POSTS", "PUBLISH_CONTENT");
  if (!(await getPost(postId))) throw new SmmsInputError("That post no longer exists.");
  return (await attemptsForPost(postId)).map(view);
}

// ── Running attempts ─────────────────────────────────────────────────────────

/** Runs the given attempts in the background after the response; falls back to a detached promise outside a request (the cron picks up leftovers either way). */
async function kick(ids: string[]): Promise<void> {
  try {
    await afterForCompany(() => processAttempts({ ids }));
  } catch {
    // No request scope (called from a job or a script): the next cron run handles them.
  }
}

export interface ProcessReport {
  ran: number;
  published: number;
  failed: number;
  retrying: number;
  processing: number;
}

export async function processAttempts(o: { ids?: string[]; limit?: number; deps?: EngineDeps; budgetMs?: number; owner?: string } = {}): Promise<ProcessReport> {
  const deps = o.deps ?? realDeps;
  const owner = o.owner ?? `w-${randomUUID()}`;
  const deadline = deps.now().getTime() + (o.budgetMs ?? WORKER_BUDGET_MS);
  const claimed: AttemptDoc[] = [];
  if (o.ids) {
    for (const id of o.ids) {
      const a = await claimAttempt(id, owner, deps.now());
      if (a) claimed.push(a);
    }
  } else claimed.push(...(await claimDue(o.limit ?? 10, owner, deps.now())));
  const rep: ProcessReport = { ran: 0, published: 0, failed: 0, retrying: 0, processing: 0 };
  for (const a of claimed) {
    if (deps.now().getTime() > deadline - 30_000) {
      // Out of time: hand the lease back so the next run takes it.
      const { settle } = await import("@/lib/products/viralpulse-ai/publishers/attempts");
      await settle(a._id, owner, { state: a.state === "processing" ? "processing" : "queued", note: "Deferred to the next run", nextAttemptAt: deps.now() });
      continue;
    }
    rep.ran++;
    let out: Outcome;
    try {
      out = await runAttempt(a, { ...deps, runBudgetMs: Math.max(20_000, deadline - deps.now().getTime() - 10_000) });
    } catch (e) {
      deps.log("engine_crash", { attemptId: a._id, message: (e as Error).message });
      continue;
    }
    if (out.kind === "published") rep.published++;
    else if (out.kind === "failed") rep.failed++;
    else if (out.kind === "retry") rep.retrying++;
    else if (out.kind === "processing") rep.processing++;
    await applyOutcome(out).catch((e) => deps.log("apply_failed", { attemptId: a._id, message: (e as Error).message }));
  }
  return rep;
}

/** Mirrors an attempt's result onto the post (per-variant publish state, post status, audit, notifications). */
export async function applyOutcome(out: Outcome): Promise<void> {
  if (out.kind === "lost") return;
  const a = out.attempt;
  if (!a) return;
  const col = await postsCollection();
  const post = await col.findOne({ _id: a.postId });
  if (!post) return;
  const label = a.platform === "x" ? "X" : PLATFORM_META[a.platform as PostPlatform].label;
  const link = `/viralpulse-ai/posts/${a.postId}`;
  const actorId = a.requestedBy ?? post.approvedBy ?? "system";
  const set = async (publish: VariantPublish) => {
    await col.updateOne({ _id: a.postId, "variants.platform": a.platform }, { $set: { "variants.$.publish": publish } });
    const fresh = await col.findOne({ _id: a.postId });
    if (!fresh) return null;
    const status = statusFromVariants(fresh.variants, fresh.status === "failed" ? "edited" : fresh.status);
    await col.updateOne({ _id: a.postId }, { $set: { status, updatedAt: new Date(), ...(status === "published" ? { publishedAt: new Date() } : {}) } });
    return { ...fresh, status };
  };
  if (out.kind === "published") {
    const after = await set({ state: "published", method: "api", externalId: out.attempt.externalId, url: out.attempt.url, error: null, at: new Date(), by: actorId });
    await recordAudit({ actorId, action: "publish", entity: "post", entityId: a.postId, entityLabel: post.title, recordId: a.postId, summary: `${label} via API${a.url ? ` · ${a.url}` : ""}`, metadata: { attemptId: a._id, disclosure: a.disclosure?.mode ?? null } });
    if (after?.status === "published") {
      const who = [post.scheduledBy, post.approvedBy, a.requestedBy].filter((x): x is string => Boolean(x));
      await notifySmmsUsers([...new Set(who)], { type: "smms_published", title: `Published: ${post.title}`, body: after.variants.map((v) => PLATFORM_META[v.platform].label).join(", "), link, dedupeKey: `smms-pub-${a._id}` });
    }
  } else if (out.kind === "failed") {
    await set({ state: "failed", method: null, externalId: null, url: null, error: `${out.error.message} ${out.error.hint}`.slice(0, 400), at: new Date(), by: actorId });
    await recordAudit({ actorId, action: "publish_failed", entity: "post", entityId: a.postId, entityLabel: post.title, recordId: a.postId, summary: `${label}: ${out.error.message}`, metadata: { attemptId: a._id, class: out.error.klass } });
    const publishers = await smmsUsersWith("PUBLISH_CONTENT");
    await notifySmmsUsers([...new Set([...publishers, post.scheduledBy ?? "", a.requestedBy ?? ""].filter(Boolean))], { type: "smms_publish_failed", title: `Publishing failed on ${label}: ${post.title}`, body: `${out.error.message} ${out.error.hint}`.slice(0, 300), link, dedupeKey: `smms-fail-${a._id}-${a.attempts}` });
  } else if (out.kind === "cancelled") {
    // A scheduled publish that stopped (approval withdrawn): let the next sweep look at the post again.
    if (a.mode === "scheduled") await col.updateOne({ _id: a.postId, status: "scheduled" }, { $unset: { publishQueuedAt: "" } });
  } else if (out.kind === "retry") {
    await col.updateOne({ _id: a.postId, "variants.platform": a.platform, "variants.publish.state": { $ne: "published" } }, { $set: { "variants.$.publish.error": (a.message ?? "").slice(0, 300) } });
  }
}

// ── Manual paths kept as they were ───────────────────────────────────────────

export async function markPublishedManually(postId: string, platform: PostPlatform, url: string | null, actor: Actor): Promise<PostDoc> {
  const p = await getPost(postId);
  if (!p) throw new SmmsInputError("That post no longer exists.");
  if (url && !/^https?:\/\/\S+$/i.test(url)) throw new SmmsInputError("The post URL must be a full http(s) URL.");
  const variants = p.variants.map((v) => (v.platform === platform ? { ...v, publish: { state: "published" as const, method: "manual" as const, externalId: null, url: url || null, error: null, at: new Date(), by: actor.userId } } : v));
  if (!variants.some((v) => v.platform === platform)) throw new SmmsInputError("That platform isn't part of this post.");
  const status = statusFromVariants(variants, p.status === "failed" ? "edited" : p.status);
  await cancelAttempts(postId, platform); // a confirmed manual post ends any waiting API publish
  await updatePost(p._id, { variants, status, ...(status === "published" ? { publishedAt: new Date() } : {}) }, actor.userId);
  return p;
}

export async function resetPublish(postId: string, platform: PostPlatform, actorId: string): Promise<void> {
  const p = await getPost(postId);
  if (!p) throw new SmmsInputError("That post no longer exists.");
  const variants = p.variants.map((v) => (v.platform === platform ? { ...v, publish: EMPTY_PUBLISH } : v));
  const status = statusFromVariants(variants, p.scheduledAt ? "scheduled" : "edited");
  await updatePost(p._id, { variants, status, publishedAt: status === "published" ? p.publishedAt : null }, actorId);
}

// ── The 5-minute job ─────────────────────────────────────────────────────────

/** Page loads no longer drive publishing (the 5-minute cron does). Kept so existing layouts compile; remove the call. */
export async function maybeSweep(): Promise<void> {}

export interface SweepReport extends ProcessReport {
  queuedPosts: number;
  awaitingApproval: number;
  adsDue: number;
}

/**
 * One run for one company: (1) hand due, approved scheduled posts to the engine - each post is claimed atomically with
 * `publishQueuedAt`, so overlapping runs cannot queue it twice, and the attempt's unique key backs that up; (2) run due attempts
 * (new, retries whose backoff elapsed, media still processing), at most `batchCap`; (3) remind about due ads.
 */
export async function runDueSweep(o: { deps?: EngineDeps; now?: Date } = {}): Promise<SweepReport> {
  const now = o.now ?? new Date();
  const settings = await getPublishSettings();
  const posts = await postsCollection();
  const publishers = await smmsUsersWith("PUBLISH_CONTENT");
  let queuedPosts = 0;
  let awaitingApproval = 0;
  const due = await posts.find({ ...notDeleted, status: "scheduled", scheduledAt: { $lte: now }, publishQueuedAt: null }).sort({ scheduledAt: 1 }).limit(settings.batchCap * 3).toArray();
  for (const p of due) {
    if (queuedPosts >= settings.batchCap) break;
    if (!(await approverStillAllowed(p.approvedBy))) {
      awaitingApproval++;
      await notifySmmsUsers(publishers, { type: "smms_approval_needed", title: `Due, not approved: ${p.title}`, body: "This scheduled post is due but nobody with Publish has approved it.", link: `/viralpulse-ai/posts/${p._id}`, dedupeKey: `smms-due-${p._id}-${p.scheduledAt?.toISOString()}` });
      continue;
    }
    const claim = await posts.updateOne({ _id: p._id, status: "scheduled", publishQueuedAt: null }, { $set: { publishQueuedAt: now } });
    if (claim.modifiedCount === 0) continue;
    queuedPosts++;
    for (const v of p.variants) {
      if (v.publish.state === "published") continue;
      await ensureAttempt({ postId: p._id, platform: v.platform, accountId: p.publishOptions?.accountIds?.[v.platform] ?? null, mode: "scheduled", scheduledFor: p.scheduledAt, requestedBy: p.approvedBy });
    }
  }
  const rep = await processAttempts({ limit: settings.batchCap * 2, deps: o.deps });

  const ads = await adsCollection();
  const dueAds = await ads.find({ ...notDeleted, status: "scheduled", scheduledAt: { $lte: now } }, { projection: { name: 1, campaignId: 1, scheduledAt: 1, platform: 1 } }).limit(50).toArray();
  for (const a of dueAds) {
    await notifySmmsUsers(publishers, { type: "smms_publish_due", title: `Ad due to go live: ${a.name}`, body: `Launch it in ${PLATFORM_META[a.platform].label} and mark it live.`, link: `/viralpulse-ai/campaigns/${a.campaignId}/ads/${a._id}`, dedupeKey: `smms-ad-due-${a._id}-${a.scheduledAt?.toISOString()}` });
  }
  return { ...rep, queuedPosts, awaitingApproval, adsDue: dueAds.length };
}
