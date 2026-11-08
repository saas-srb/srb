import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { smmsCollection, notDeleted, updateStamp } from "@/lib/products/viralpulse-ai/db";
import { can, ForbiddenError, NotFoundError, SmmsInputError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { getCampaign, campaignsCollection } from "@/lib/products/viralpulse-ai/campaigns";
import { listAdsForCampaign } from "@/lib/products/viralpulse-ai/ads";
import type { SmmsPermission } from "@/lib/smms-roles";
import { AD_COLLECTIONS, err, result, type FieldError, type ValidationResult } from "./types";
import { defaultDeps, type AdsDeps, type MediaLite } from "./deps";
import { MetaApiError } from "./meta/errors";
import type { MetaClient } from "./meta/client";
import { uploadImage, uploadVideo } from "./meta/assets";
import { getAdAccountInfo, type AdAccountInfo } from "./meta/account";
import { buildAdPayload, buildAdSetPayload, buildCampaignPayload, buildCreativePayload, buildTargetingSpec, type CreativeAssets } from "./meta/build";
import { normalizeAdPaid, normalizeCampaignPaid, type MetaAdDraft, type MetaCampaignDraft, type MetaTargetingDraft } from "./meta/draft";
import { validateMetaLaunch, type AdForValidation, type MediaFacts } from "./meta/validate";
import { commitmentOf, evaluateGuard, formatMinorPlain, getGuard, setKillSwitch, type Commitment, type GuardSettings, type GuardVerdict } from "./guard";
import { readStatuses } from "./meta/sync";
import { withCompanyLease } from "@/lib/products/viralpulse-ai/lease";

/**
 * The paid-ads launch service for Meta. One launch = one Meta campaign (with its ad sets, creatives and ads) created from a campaign's
 * draft. The life of a launch:
 *   createLaunch   builds everything PAUSED (no spend), in order, recording every external id the moment it exists. A failure either
 *                  deletes what was created (rejected input) or leaves the launch `partial` for `resumeLaunch` (temporary problem).
 *   approveLaunch  a person with the approval permission accepts the budget; who, when, what amounts are recorded.
 *   activateLaunch checks approval, the company spend guard and the ad account, then switches everything on.
 *   pause / resume / archive / editLaunch   afterwards.
 * Money is the ad account currency's minor unit. Every function checks the caller's permission and runs inside the company's own database.
 */

export type LaunchState = "creating" | "partial" | "ready" | "rolled_back" | "failed";
export type Delivery = "paused" | "active" | "archived";

export interface LaunchAdSnapshot {
  id: string;
  name: string;
  headline: string;
  primaryText: string;
  description: string;
  mediaIds: string[];
  format: "image" | "video";
  meta: MetaAdDraft;
}

export interface LaunchObjects {
  campaign?: string;
  adSets: Record<string, string>;
  creatives: Record<string, string>;
  ads: Record<string, string>;
  images: Record<string, string>;
  videos: Record<string, string>;
}

export interface LaunchApproval {
  by: string;
  byEmail: string | null;
  at: Date;
  note: string;
  committedDailyMinor: number;
  committedTotalMinor: number | null;
  currency: string;
  secondApproverRequired: boolean;
}

export interface LaunchEvent {
  at: Date;
  by: string;
  type: string;
  note: string;
}

export interface LaunchDoc {
  _id: string;
  platform: "meta";
  campaignId: string;
  active: boolean;
  state: LaunchState;
  delivery: Delivery;
  adAccountId: string;
  actId: string;
  pageAccountId: string;
  pageId: string;
  instagramUserId: string | null;
  currency: string;
  draftHash: string;
  idempotencyKey: string;
  campaign: MetaCampaignDraft;
  campaignName: string;
  ads: LaunchAdSnapshot[];
  commitment: Commitment;
  objects: LaunchObjects;
  pending: { kind: string; key: string; startedAt: Date } | null;
  approval: LaunchApproval | null;
  lock: { holder: string; until: Date } | null;
  lastError: { message: string; paths: string[]; at: Date } | null;
  compensation: { deleted: string[]; failed: { id: string; kind: string; message: string }[] } | null;
  attempts: number;
  review: Record<string, { status: string | null; effectiveStatus: string | null; issues: string[]; at: Date }>;
  externalStatus: { campaign: string | null; at: Date } | null;
  lastSyncAt: Date | null;
  syncDeferredUntil: Date | null;
  events: LaunchEvent[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  activatedBy: string | null;
  activatedAt: Date | null;
}

let ensured = false;
export async function launchesCollection() {
  const col = await smmsCollection<LaunchDoc>(AD_COLLECTIONS.launches);
  if (!ensured) {
    ensured = true;
    await Promise.all([
      col.createIndex({ campaignId: 1, platform: 1 }, { unique: true, partialFilterExpression: { active: true } }).catch(() => {}),
      col.createIndex({ campaignId: 1, createdAt: -1 }).catch(() => {}),
      col.createIndex({ active: 1, delivery: 1 }).catch(() => {}),
    ]);
  }
  return col;
}
export function resetLaunchIndexCacheForTests() {
  ensured = false;
}

export class LaunchValidationError extends SmmsInputError {
  constructor(message: string, readonly errors: FieldError[]) {
    super(message);
  }
}
export class LaunchBlockedError extends SmmsInputError {
  constructor(message: string, readonly reasons: string[] = []) {
    super(message);
  }
}

const assertCan = (v: SmmsViewer, p: SmmsPermission) => {
  if (!can(v, p)) throw new ForbiddenError(p);
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const event = (by: string, type: string, note: string): LaunchEvent => ({ at: new Date(), by, type, note: note.slice(0, 300) });

// ── loading the draft ────────────────────────────────────────────────────────────────────────────────

export interface LoadedDraft {
  campaignName: string;
  campaign: MetaCampaignDraft;
  ads: LaunchAdSnapshot[];
  clientId: string | null;
}

export async function loadDraft(campaignId: string): Promise<LoadedDraft> {
  const c = await getCampaign(campaignId);
  if (!c) throw new NotFoundError();
  const ads = (await listAdsForCampaign(campaignId)).filter((a) => (a.platform === "facebook" || a.platform === "instagram") && a.status !== "archived");
  const paid = normalizeCampaignPaid(c.paid, c);
  return {
    campaignName: c.name,
    clientId: c.clientId,
    campaign: paid.meta,
    ads: ads.map((a) => ({
      id: a._id,
      name: a.name,
      headline: a.content.headline,
      primaryText: a.content.primaryText,
      description: a.content.description,
      mediaIds: a.mediaIds,
      format: a.format,
      meta: normalizeAdPaid(a.paid, { cta: a.content.cta, landingPage: c.landingPage, format: a.format }).meta,
    })),
  };
}

const toFacts = (m: MediaLite): MediaFacts => ({ id: m.id, kind: m.kind, contentType: m.contentType, size: m.size, width: m.width, height: m.height, durationSec: m.durationSec });
const forValidation = (a: LaunchAdSnapshot): AdForValidation => ({ id: a.id, name: a.name, format: a.format, headline: a.headline, primaryText: a.primaryText, description: a.description, mediaIds: a.mediaIds, meta: a.meta });
const mediaIdsOf = (ads: LaunchAdSnapshot[]) => [...new Set(ads.flatMap((a) => [...a.mediaIds, ...a.meta.cards.map((c) => c.mediaId)]))];

export interface ValidateOutcome extends ValidationResult {
  account: AdAccountInfo | null;
  commitment: Commitment;
  guard: GuardVerdict | null;
}

/** Field-level validation of a campaign's Meta draft. Reads the ad account live when one is chosen, so minimum budgets and status are real. */
export async function validateLaunch(campaignId: string, deps: AdsDeps = defaultDeps): Promise<ValidateOutcome> {
  const d = await loadDraft(campaignId);
  const extra: FieldError[] = [];
  let account: AdAccountInfo | null = null;
  if (d.campaign.adAccountId) {
    const acct = await deps.getAccount(d.campaign.adAccountId);
    if (!acct || acct.provider !== "meta_ad_account") extra.push(err("meta.adAccountId", "account_unknown", "Choose one of the connected Meta ad accounts."));
    else if (!acct.enabled) extra.push(err("meta.adAccountId", "account_disabled", "This ad account is switched off in Settings > Connected accounts."));
    else {
      try {
        account = await deps.withMeta(acct.id, (c) => getAdAccountInfo(c, acct.externalId));
      } catch (e) {
        extra.push(err("meta.adAccountId", "account_unreadable", e instanceof Error ? e.message : "The ad account could not be read."));
      }
    }
  }
  if (d.campaign.pageAccountId) {
    const p = await deps.getAccount(d.campaign.pageAccountId);
    if (!p || p.provider !== "facebook_page") extra.push(err("meta.pageAccountId", "page_unknown", "Choose one of the connected Facebook Pages."));
  }
  if (d.campaign.instagramAccountId) {
    const p = await deps.getAccount(d.campaign.instagramAccountId);
    if (!p || p.provider !== "instagram_business") extra.push(err("meta.instagramAccountId", "instagram_unknown", "Choose one of the connected Instagram accounts."));
  }
  const media = (await deps.getMedia(mediaIdsOf(d.ads))).map(toFacts);
  const r = validateMetaLaunch({ campaign: d.campaign, ads: d.ads.map(forValidation), media, account, now: deps.now() });
  const all = [...extra, ...r.errors, ...r.warnings];
  const res = result(all);
  const commitment = commitmentOf(d.campaign, deps.now());
  let guard: GuardVerdict | null = null;
  if (account) guard = await guardFor(account.currency, commitment, null);
  return { ...res, account, commitment, guard };
}

async function guardFor(currency: string, commitment: Commitment, excludeId: string | null): Promise<GuardVerdict> {
  const col = await launchesCollection();
  const running = await col.find({ active: true, delivery: "active", currency, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).toArray();
  return evaluateGuard(await getGuard(), currency, commitment, running.map((l) => l.commitment));
}

// ── field paths for API errors ───────────────────────────────────────────────────────────────────────

const BLAME: Record<string, string> = {
  daily_budget: "budget", lifetime_budget: "budget", budget: "budget", targeting: "targeting", bid_amount: "bidAmountMinor", bid_strategy: "bidStrategy", end_time: "endTime", start_time: "startTime", name: "name",
  promoted_object: "promotedObject", optimization_goal: "optimizationGoal", billing_event: "billingEvent", destination_type: "destinationType", spend_cap: "spendCap", special_ad_categories: "specialAdCategories",
  objective: "objective", dsa_beneficiary: "dsaBeneficiary", dsa_payor: "dsaPayor", attribution_spec: "attribution", link: "link", message: "primaryText", call_to_action: "ctaType", url_tags: "urlTags", conversion_domain: "conversionDomain",
};

export function pathsForError(e: MetaApiError, ctx: { kind: "campaign" | "adset" | "creative" | "ad" | "asset"; adSetIndex?: number; adId?: string; mediaId?: string }): string[] {
  const fields = [...e.blame.map((b) => BLAME[b.split(".")[0]] ?? null), e.field].filter((x): x is string => Boolean(x));
  const uniq = [...new Set(fields)];
  const base = ctx.kind === "campaign" ? "meta" : ctx.kind === "adset" ? `meta.adSets[${ctx.adSetIndex ?? 0}]` : ctx.kind === "asset" ? `media[${ctx.mediaId}]` : `ads[${ctx.adId}]`;
  if (ctx.kind === "creative" || ctx.kind === "ad") return uniq.length ? uniq.map((f) => (["primaryText", "name"].includes(f) ? `${base}.${f}` : `${base}.meta.${f}`)) : [base];
  return uniq.length ? uniq.map((f) => `${base}.${f}`) : [base];
}

// ── creation ─────────────────────────────────────────────────────────────────────────────────────────

export interface LaunchOutcome {
  ok: boolean;
  launch: LaunchDoc;
  /** True when this call returned an existing launch instead of creating one. */
  existing?: boolean;
  /** Field-level problems from Meta, addressed like validateLaunch paths. */
  errors: FieldError[];
  message: string | null;
}

async function patch(id: string, set: Record<string, unknown>, push?: LaunchEvent): Promise<LaunchDoc> {
  const col = await launchesCollection();
  const r = await col.findOneAndUpdate({ _id: id }, { $set: { ...set, updatedAt: new Date() }, ...(push ? { $push: { events: { $each: [push], $slice: -100 } } } : {}) } as never, { returnDocument: "after" });
  if (!r) throw new NotFoundError();
  return r;
}

async function acquire(id: string, holder: string, now: Date): Promise<LaunchDoc | null> {
  const col = await launchesCollection();
  return col.findOneAndUpdate({ _id: id, $or: [{ lock: null }, { "lock.until": { $lt: now } }] }, { $set: { lock: { holder, until: new Date(now.getTime() + 5 * 60_000) } } }, { returnDocument: "after" });
}
async function release(id: string) {
  await (await launchesCollection()).updateOne({ _id: id }, { $set: { lock: null } });
}

async function findExisting(c: MetaClient, kind: "campaign" | "adset" | "ad" | "creative", parent: string, actId: string, name: string, since: Date): Promise<string | null> {
  const path = kind === "campaign" ? `${actId}/campaigns` : kind === "adset" ? `${parent}/adsets` : kind === "ad" ? `${parent}/ads` : `${actId}/adcreatives`;
  const rows = await c.getAll<{ id: string; name?: string; created_time?: string }>(path, { fields: "id,name,created_time" }, 3);
  const floor = since.getTime() - 120_000;
  const hit = rows.filter((r) => r.name === name && (!r.created_time || new Date(r.created_time).getTime() >= floor)).sort((a, b) => (b.created_time ?? "").localeCompare(a.created_time ?? ""))[0];
  return hit?.id ?? null;
}

/** Creates one external object once: skips if recorded, adopts it if a previous attempt created it without us hearing back. */
async function createOnce(l: { _id: string }, c: MetaClient, o: { kind: "campaign" | "adset" | "ad" | "creative"; key: string; parent: string; actId: string; name: string; payload: Record<string, unknown>; path: string }): Promise<string> {
  const col = await launchesCollection();
  const startedAt = new Date();
  const cur = await col.findOne({ _id: l._id });
  const wasPending = cur?.pending && cur.pending.kind === o.kind && cur.pending.key === o.key ? cur.pending.startedAt : null;
  await col.updateOne({ _id: l._id }, { $set: { pending: { kind: o.kind, key: o.key, startedAt: wasPending ?? startedAt } } });
  if (wasPending) {
    const found = await findExisting(c, o.kind, o.parent, o.actId, o.name, wasPending);
    if (found) return found;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await c.post<{ id?: string }>(o.path, o.payload);
      if (!r.id) throw new MetaApiError("Meta did not return an id for the new object.", 200, null, null, "unknown", false);
      return r.id;
    } catch (e) {
      if (e instanceof MetaApiError && e.ambiguous && attempt < 2) {
        // The create may have run. Look before creating again so a retry can never make a second copy.
        const found = await findExisting(c, o.kind, o.parent, o.actId, o.name, wasPending ?? startedAt).catch(() => null);
        if (found) return found;
        continue;
      }
      throw e;
    }
  }
}

class StepError extends Error {
  constructor(readonly cause: MetaApiError | Error, readonly ctx: { kind: "campaign" | "adset" | "creative" | "ad" | "asset"; adSetIndex?: number; adId?: string; mediaId?: string }) {
    super(cause.message);
  }
}
const wrap = async <T>(ctx: StepError["ctx"], fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    throw new StepError(e as Error, ctx);
  }
};

async function recordObject(id: string, path: string, value: string) {
  await (await launchesCollection()).updateOne({ _id: id }, { $set: { [`objects.${path}`]: value, pending: null, updatedAt: new Date() } });
}

async function buildAll(launch: LaunchDoc, deps: AdsDeps, by: string): Promise<void> {
  const media = new Map((await deps.getMedia(mediaIdsOf(launch.ads))).map((m) => [m.id, m]));
  await deps.withMeta(launch.adAccountId, async (c) => {
    const acct = await getAdAccountInfo(c, launch.actId).catch(() => null);
    const objects = (await (await launchesCollection()).findOne({ _id: launch._id }))!.objects;
    const assets: CreativeAssets = { imageHashes: { ...objects.images }, videoIds: { ...objects.videos } };
    // 1. assets
    for (const mid of mediaIdsOf(launch.ads)) {
      const m = media.get(mid);
      if (!m) throw new StepError(new MetaApiError("A media item used by an ad no longer exists.", 404, null, null, "validation", false), { kind: "asset", mediaId: mid });
      if (m.kind === "image" && !assets.imageHashes[mid]) {
        const h = await wrap({ kind: "asset", mediaId: mid }, () => uploadImage(c, launch.actId, deps.byteSource(m), m.name));
        assets.imageHashes[mid] = h;
        await recordObject(launch._id, `images.${mid}`, h);
      }
      if (m.kind === "video" && !assets.videoIds[mid]) {
        const v = await wrap({ kind: "asset", mediaId: mid }, () => uploadVideo(c, launch.actId, deps.byteSource(m), m.name, { sleep: deps.sleep }));
        assets.videoIds[mid] = v;
        await recordObject(launch._id, `videos.${mid}`, v);
      }
    }
    // 2. campaign
    let campaignId = objects.campaign;
    if (!campaignId) {
      campaignId = await wrap({ kind: "campaign" }, () => createOnce(launch, c, { kind: "campaign", key: "campaign", parent: launch.actId, actId: launch.actId, name: launch.campaignName, payload: buildCampaignPayload(launch.campaign, launch.campaignName), path: `${launch.actId}/campaigns` }));
      await recordObject(launch._id, "campaign", campaignId);
    }
    // 3. ad sets
    const setIds: Record<string, string> = { ...objects.adSets };
    for (const [i, s] of launch.campaign.adSets.entries()) {
      if (setIds[s.key]) continue;
      const id = await wrap({ kind: "adset", adSetIndex: i }, () =>
        createOnce(launch, c, { kind: "adset", key: s.key, parent: campaignId!, actId: launch.actId, name: s.name, payload: buildAdSetPayload(s, launch.campaign, campaignId!, launch.pageId, { dsaPayor: acct?.defaultDsaPayor, dsaBeneficiary: acct?.defaultDsaBeneficiary }), path: `${launch.actId}/adsets` }));
      setIds[s.key] = id;
      await recordObject(launch._id, `adSets.${s.key}`, id);
    }
    // 4. creatives and ads
    const kinds = Object.fromEntries([...media.values()].map((m) => [m.id, m.kind])) as Record<string, "image" | "video">;
    for (const a of launch.ads) {
      let creativeId = objects.creatives[a.id];
      if (!creativeId) {
        const payload = buildCreativePayload({ name: a.name, headline: a.headline, primaryText: a.primaryText, description: a.description, mediaIds: a.mediaIds, mediaKinds: kinds, meta: a.meta, pageId: launch.pageId, instagramUserId: launch.instagramUserId }, assets);
        creativeId = await wrap({ kind: "creative", adId: a.id }, () => createOnce(launch, c, { kind: "creative", key: a.id, parent: launch.actId, actId: launch.actId, name: a.name.slice(0, 100), payload, path: `${launch.actId}/adcreatives` }));
        await recordObject(launch._id, `creatives.${a.id}`, creativeId);
      }
      if (!objects.ads[a.id]) {
        const adSetId = setIds[a.meta.adSetKey!];
        const id = await wrap({ kind: "ad", adId: a.id }, () => createOnce(launch, c, { kind: "ad", key: a.id, parent: adSetId, actId: launch.actId, name: a.name, payload: buildAdPayload(a.name, adSetId, creativeId!, a.meta), path: `${launch.actId}/ads` }));
        await recordObject(launch._id, `ads.${a.id}`, id);
      }
    }
  });
  void by;
}

/** Deletes created objects, newest first. Anything that cannot be deleted stays recorded on the launch (never orphaned silently). */
async function compensate(launch: LaunchDoc, deps: AdsDeps): Promise<{ deleted: string[]; failed: { id: string; kind: string; message: string }[] }> {
  const fresh = (await (await launchesCollection()).findOne({ _id: launch._id }))!;
  const o = fresh.objects;
  const order: { kind: string; id: string }[] = [
    ...Object.values(o.ads).map((id) => ({ kind: "ad", id })),
    ...Object.values(o.creatives).map((id) => ({ kind: "creative", id })),
    ...Object.values(o.adSets).map((id) => ({ kind: "adset", id })),
    ...(o.campaign ? [{ kind: "campaign", id: o.campaign }] : []),
  ];
  const deleted: string[] = [];
  const failed: { id: string; kind: string; message: string }[] = [];
  if (order.length === 0) return { deleted, failed };
  await deps.withMeta(launch.adAccountId, async (c) => {
    for (const item of order) {
      try {
        await c.del(item.id);
        deleted.push(item.id);
      } catch (e) {
        // An object that is already gone counts as deleted.
        if (e instanceof MetaApiError && e.kind === "validation" && /does not exist|cannot be loaded/i.test(e.message)) deleted.push(item.id);
        else failed.push({ id: item.id, kind: item.kind, message: e instanceof Error ? e.message.slice(0, 200) : "delete failed" });
      }
    }
  }).catch((e) => {
    for (const item of order) if (!deleted.includes(item.id) && !failed.some((f) => f.id === item.id)) failed.push({ id: item.id, kind: item.kind, message: e instanceof Error ? e.message.slice(0, 200) : "delete failed" });
  });
  return { deleted, failed };
}

async function runBuild(launch: LaunchDoc, deps: AdsDeps, by: string): Promise<LaunchOutcome> {
  const got = await acquire(launch._id, randomUUID(), deps.now());
  if (!got) throw new LaunchBlockedError("This launch is being worked on right now. Try again in a minute.");
  await patch(launch._id, { state: "creating", attempts: got.attempts + 1 });
  try {
    await buildAll(got, deps, by);
    const done = await patch(launch._id, { state: "ready", delivery: "paused", lastError: null, pending: null }, event(by, "created", "All objects created paused in Meta."));
    await deps.audit({ actorId: by, action: "create", entity: "campaign", entityId: launch.campaignId, entityLabel: launch.campaignName, recordId: launch.campaignId, summary: "Meta launch created (paused, no spend yet)", metadata: { launchId: launch._id, objects: Object.keys(done.objects.ads).length } });
    return { ok: true, launch: done, errors: [], message: null };
  } catch (e) {
    const step = e instanceof StepError ? e : new StepError(e as Error, { kind: "campaign" });
    const api = step.cause instanceof MetaApiError ? step.cause : null;
    const paths = api ? pathsForError(api, step.ctx) : [];
    const errors = paths.length ? paths.map((p) => err(p, `meta_${api!.code ?? "error"}${api!.subcode ? `_${api!.subcode}` : ""}`, api!.message)) : [err("meta", "meta_error", step.message)];
    const temporary = api ? api.retryable : false;
    const last = { message: step.message.slice(0, 400), paths, at: new Date() };
    const fresh = (await (await launchesCollection()).findOne({ _id: launch._id }))!;
    if (temporary) {
      const doc = await patch(launch._id, { state: "partial", lastError: last }, event(by, "partial", `Stopped by a temporary problem: ${last.message}`));
      await deps.audit({ actorId: by, action: "publish_failed", entity: "campaign", entityId: launch.campaignId, entityLabel: launch.campaignName, recordId: launch.campaignId, summary: "Meta launch paused part-way; it can be resumed", metadata: { launchId: launch._id } });
      return { ok: false, launch: doc, errors, message: `${step.message} Nothing is spending. You can resume the launch; what was already created is kept.` };
    }
    // Rejected input or a permission problem: take back what was created.
    const comp = await compensate(fresh, deps);
    const allGone = comp.failed.length === 0;
    const doc = await patch(
      launch._id,
      { state: allGone ? "rolled_back" : "partial", active: !allGone, lastError: last, compensation: comp, pending: null },
      event(by, allGone ? "rolled_back" : "compensation_failed", allGone ? `Create failed (${last.message}); ${comp.deleted.length} created objects removed.` : `Create failed; ${comp.failed.length} objects could not be removed and are recorded.`),
    );
    if (!allGone) await deps.notify({ title: "A Meta ad launch left objects behind", body: `${launch.campaignName}: ${comp.failed.length} created object(s) could not be removed. Open the launch to retry cleanup.`, link: `/viralpulse-ai/campaigns/${launch.campaignId}`, dedupeKey: `ads-orphan:${launch._id}` });
    await deps.audit({ actorId: by, action: "publish_failed", entity: "campaign", entityId: launch.campaignId, entityLabel: launch.campaignName, recordId: launch.campaignId, summary: allGone ? "Meta launch rejected; partial objects removed" : "Meta launch rejected; some objects could not be removed", metadata: { launchId: launch._id } });
    return { ok: false, launch: doc, errors, message: step.message };
  } finally {
    await release(launch._id);
  }
}

export async function createLaunch(campaignId: string, viewer: SmmsViewer, deps: AdsDeps = defaultDeps): Promise<LaunchOutcome> {
  assertCan(viewer, "CREATE_ADS");
  assertCan(viewer, "EDIT_CAMPAIGNS");
  const col = await launchesCollection();
  const d = await loadDraft(campaignId);
  const hash = sha(stable({ c: d.campaign, a: d.ads.map((a) => ({ ...a, id: a.id })) }));
  const existing = await col.findOne({ campaignId, platform: "meta", active: true });
  if (existing) {
    if (existing.state === "ready" && existing.draftHash === hash) return { ok: true, launch: existing, existing: true, errors: [], message: null };
    if (existing.state === "partial" || existing.state === "creating") {
      if (existing.state === "creating" && existing.lock && existing.lock.until > deps.now()) throw new LaunchBlockedError("This launch is being created right now.");
      if (existing.draftHash === hash) return resumeLaunch(existing._id, viewer, deps);
      throw new LaunchBlockedError("An earlier launch of this campaign did not finish. Resume it or roll it back before launching again.");
    }
    throw new LaunchBlockedError("This campaign already has a launch in Meta. Edit that launch, or archive it before creating another.");
  }
  const v = await validateLaunch(campaignId, deps);
  if (!v.ok) throw new LaunchValidationError("Fix the highlighted fields before launching.", v.errors);
  if (v.guard && v.commitment.dailyMinor > 0) {
    // Creation spends nothing, but a plan that can never be activated should fail now, not after the objects exist.
    const hard = v.guard.reasons.filter((r) => !/No spending limit|kill switch/i.test(r));
    if (hard.length) throw new LaunchBlockedError("This launch is above your spending limits.", hard);
  }
  const campaign = d.campaign;
  const adAcct = (await deps.getAccount(campaign.adAccountId!))!;
  const page = (await deps.getAccount(campaign.pageAccountId!))!;
  const ig = campaign.instagramAccountId ? await deps.getAccount(campaign.instagramAccountId) : null;
  const now = deps.now();
  const doc: LaunchDoc = {
    _id: randomUUID(),
    platform: "meta",
    campaignId,
    active: true,
    state: "creating",
    delivery: "paused",
    adAccountId: adAcct.id,
    actId: adAcct.externalId,
    pageAccountId: page.id,
    pageId: page.externalId,
    instagramUserId: ig?.externalId ?? null,
    currency: v.account!.currency,
    draftHash: hash,
    idempotencyKey: `${campaignId}:${hash.slice(0, 16)}`,
    campaign,
    campaignName: d.campaignName,
    ads: d.ads,
    commitment: v.commitment,
    objects: { adSets: {}, creatives: {}, ads: {}, images: {}, videos: {} },
    pending: null,
    approval: null,
    lock: null,
    lastError: null,
    compensation: null,
    attempts: 0,
    review: {},
    externalStatus: null,
    lastSyncAt: null,
    syncDeferredUntil: null,
    events: [event(viewer.userId, "requested", "Launch requested.")],
    createdBy: viewer.userId,
    createdAt: now,
    updatedAt: now,
    activatedBy: null,
    activatedAt: null,
  };
  try {
    await col.insertOne(doc);
  } catch (e) {
    // A concurrent request created it first: return that one, never a second.
    const other = await col.findOne({ campaignId, platform: "meta", active: true });
    if (other) return { ok: other.state === "ready", launch: other, existing: true, errors: [], message: null };
    throw e;
  }
  return runBuild(doc, deps, viewer.userId);
}

export async function resumeLaunch(launchId: string, viewer: SmmsViewer, deps: AdsDeps = defaultDeps): Promise<LaunchOutcome> {
  assertCan(viewer, "CREATE_ADS");
  const l = await requireLaunch(launchId);
  if (l.state !== "partial" && l.state !== "creating") throw new LaunchBlockedError("Only an unfinished launch can be resumed.");
  const hash = (await currentHash(l.campaignId)).hash;
  if (hash !== l.draftHash) throw new LaunchBlockedError("The campaign changed since this launch started. Roll it back and launch again.");
  return runBuild(l, deps, viewer.userId);
}

async function currentHash(campaignId: string) {
  const d = await loadDraft(campaignId);
  return { hash: sha(stable({ c: d.campaign, a: d.ads })) };
}

/** Removes everything an unfinished launch created, then frees the campaign for a new launch. */
export async function rollbackLaunch(launchId: string, viewer: SmmsViewer, deps: AdsDeps = defaultDeps): Promise<LaunchDoc> {
  assertCan(viewer, "CREATE_ADS");
  const l = await requireLaunch(launchId);
  if (l.delivery === "active") throw new LaunchBlockedError("Pause the launch before rolling it back.");
  if (l.state === "rolled_back") return l;
  const got = await acquire(launchId, randomUUID(), deps.now());
  if (!got) throw new LaunchBlockedError("This launch is being worked on right now.");
  try {
    const comp = await compensate(l, deps);
    const gone = comp.failed.length === 0;
    return await patch(launchId, { state: gone ? "rolled_back" : "partial", active: !gone, compensation: comp, delivery: "paused" }, event(viewer.userId, gone ? "rolled_back" : "compensation_failed", `${comp.deleted.length} removed, ${comp.failed.length} could not be removed.`));
  } finally {
    await release(launchId);
  }
}

// ── reading ──────────────────────────────────────────────────────────────────────────────────────────

export async function getLaunch(id: string): Promise<LaunchDoc | null> {
  return (await launchesCollection()).findOne({ _id: id });
}
async function requireLaunch(id: string): Promise<LaunchDoc> {
  const l = await getLaunch(id);
  if (!l) throw new NotFoundError();
  return l;
}
export async function listLaunches(campaignId: string): Promise<LaunchDoc[]> {
  return (await launchesCollection()).find({ campaignId }).sort({ createdAt: -1 }).toArray();
}
export async function getActiveLaunchForCampaign(campaignId: string): Promise<LaunchDoc | null> {
  return (await launchesCollection()).findOne({ campaignId, platform: "meta", active: true });
}

// ── approval, activation, pause, archive ────────────────────────────────────────────────────────────

export class ApprovalRequiredError extends LaunchBlockedError {}

export function approvalCovers(l: Pick<LaunchDoc, "approval" | "commitment">): boolean {
  const a = l.approval;
  if (!a) return false;
  if (l.commitment.dailyMinor > a.committedDailyMinor) return false;
  if (l.commitment.totalMinor === null) return a.committedTotalMinor === null;
  return a.committedTotalMinor === null || l.commitment.totalMinor <= a.committedTotalMinor;
}

export async function approveLaunch(launchId: string, viewer: SmmsViewer, input: { note?: string } = {}, deps: AdsDeps = defaultDeps): Promise<LaunchDoc> {
  assertCan(viewer, "APPROVE_AD_SPEND");
  const l = await requireLaunch(launchId);
  if (l.state !== "ready") throw new LaunchBlockedError("Only a launch that was created in Meta can be approved.");
  if (l.delivery === "archived") throw new LaunchBlockedError("An archived launch cannot be approved.");
  return doApprove(l, viewer, input.note ?? "", deps);
}

async function doApprove(l: LaunchDoc, viewer: SmmsViewer, note: string, deps: AdsDeps): Promise<LaunchDoc> {
  const verdict = await guardFor(l.currency, l.commitment, l._id);
  const hard = verdict.reasons.filter((r) => !/No spending limit/i.test(r));
  if (hard.length) throw new LaunchBlockedError("This launch is above your spending limits, so it cannot be approved as it is.", hard);
  if (verdict.needsSecondApprover && viewer.userId === l.createdBy) throw new LaunchBlockedError("This launch is above the approval threshold. Someone other than its creator must approve it.");
  const approval: LaunchApproval = { by: viewer.userId, byEmail: viewer.email, at: deps.now(), note: note.trim().slice(0, 500), committedDailyMinor: l.commitment.dailyMinor, committedTotalMinor: l.commitment.totalMinor, currency: l.currency, secondApproverRequired: verdict.needsSecondApprover };
  const doc = await patch(l._id, { approval }, event(viewer.userId, "approved", `Approved ${formatMinorPlain(l.commitment.dailyMinor, l.currency)}/day${l.commitment.totalMinor !== null ? `, ${formatMinorPlain(l.commitment.totalMinor, l.currency)} total` : ", no end date"}.`));
  await deps.audit({ actorId: viewer.userId, actorEmail: viewer.email, action: "approve", entity: "campaign", entityId: l.campaignId, entityLabel: l.campaignName, recordId: l.campaignId, summary: "Ad spend approved", metadata: { launchId: l._id, dailyMinor: approval.committedDailyMinor, totalMinor: approval.committedTotalMinor ?? -1, currency: l.currency } });
  return doc;
}

export async function revokeApproval(launchId: string, viewer: SmmsViewer, deps: AdsDeps = defaultDeps): Promise<LaunchDoc> {
  assertCan(viewer, "APPROVE_AD_SPEND");
  const l = await requireLaunch(launchId);
  const doc = await patch(launchId, { approval: null }, event(viewer.userId, "approval_revoked", "Approval withdrawn."));
  if (l.delivery === "active") return pauseLaunch(launchId, viewer, deps);
  return doc;
}

async function setStatuses(l: LaunchDoc, status: "ACTIVE" | "PAUSED", deps: AdsDeps): Promise<void> {
  const ids = status === "ACTIVE"
    ? [...Object.values(l.objects.ads), ...Object.values(l.objects.adSets), ...(l.objects.campaign ? [l.objects.campaign] : [])]
    : [...(l.objects.campaign ? [l.objects.campaign] : [])];
  await deps.withMeta(l.adAccountId, async (c) => {
    const done: string[] = [];
    try {
      for (const id of ids) {
        await c.post(id, { status }, { idempotentWrite: true });
        done.push(id);
      }
    } catch (e) {
      if (status === "ACTIVE") for (const id of done.reverse()) await c.post(id, { status: "PAUSED" }, { idempotentWrite: true }).catch(() => {});
      throw e;
    }
  });
}

const SPEND_LOCK_ID = "ads-spend-lock";

/**
 * One spend decision at a time per company. The daily / monthly caps are checked against what is delivering NOW, so two activations (or an
 * edit and an activation) running together could each see room that the other is about to use. The check and the switch-on therefore run
 * under a company lease (see `lease.ts`).
 */
export function withSpendLock<T>(deps: Pick<AdsDeps, "now" | "sleep">, fn: () => Promise<T>, o: { waitMs?: number; leaseMs?: number } = {}): Promise<T> {
  return withCompanyLease(SPEND_LOCK_ID, { now: deps.now, sleep: deps.sleep, waitMs: o.waitMs ?? 20_000, leaseMs: o.leaseMs ?? 90_000, busy: () => new LaunchBlockedError("Another change to ad spending is in progress. Try again in a moment.") }, fn);
}

export async function activateLaunch(launchId: string, viewer: SmmsViewer, deps: AdsDeps = defaultDeps): Promise<LaunchDoc> {
  assertCan(viewer, "PUBLISH_CONTENT");
  return withSpendLock(deps, () => activateLocked(launchId, viewer, deps));
}

async function activateLocked(launchId: string, viewer: SmmsViewer, deps: AdsDeps): Promise<LaunchDoc> {
  const l = await requireLaunch(launchId);
  if (l.state !== "ready") throw new LaunchBlockedError("The launch is not fully created in Meta yet.");
  if (l.delivery === "archived") throw new LaunchBlockedError("An archived launch cannot be started.");
  if (l.delivery === "active") return l;
  if (!l.approval) throw new ApprovalRequiredError("Someone with the approval permission must approve the budget before this can start spending.");
  if (!approvalCovers(l)) throw new ApprovalRequiredError("The budget changed since it was approved. It needs to be approved again.");
  const verdict = await guardFor(l.currency, l.commitment, l._id);
  if (!verdict.ok) throw new LaunchBlockedError("The spending limits do not allow this to start.", verdict.reasons);
  // The second-approver rule is judged against the limits as they are NOW, not as they were when the approval was given.
  if (verdict.needsSecondApprover && l.approval.by === l.createdBy) throw new ApprovalRequiredError("Under the current approval rules someone other than the launch's creator must approve it. Ask another approver to approve it again.");
  const info = await deps.withMeta(l.adAccountId, (c) => getAdAccountInfo(c, l.actId));
  if (info.status !== null && info.status !== 1) throw new LaunchBlockedError(`The Meta ad account is not active (${info.statusLabel}). Fix it in Meta Business settings first.`);
  await setStatuses(l, "ACTIVE", deps);
  // The kill switch can be turned on while this was switching things on: look again, and undo if so.
  if ((await getGuard()).killSwitch) {
    await setStatuses(l, "PAUSED", deps);
    throw new LaunchBlockedError("The ads kill switch was turned on while this was starting, so it was paused again.");
  }
  const doc = await patch(launchId, { delivery: "active", activatedBy: viewer.userId, activatedAt: deps.now() }, event(viewer.userId, "activated", "Started in Meta."));
  await deps.audit({ actorId: viewer.userId, actorEmail: viewer.email, action: "status", entity: "campaign", entityId: l.campaignId, entityLabel: l.campaignName, recordId: l.campaignId, summary: "Ads switched on in Meta", metadata: { launchId } });
  return doc;
}

export async function pauseLaunch(launchId: string, viewer: SmmsViewer, deps: AdsDeps = defaultDeps): Promise<LaunchDoc> {
  assertCan(viewer, "PUBLISH_CONTENT");
  const l = await requireLaunch(launchId);
  if (l.state !== "ready") throw new LaunchBlockedError("The launch is not created in Meta.");
  if (l.delivery === "archived") throw new LaunchBlockedError("An archived launch cannot be paused.");
  await setStatuses(l, "PAUSED", deps);
  const doc = await patch(launchId, { delivery: "paused" }, event(viewer.userId, "paused", "Paused in Meta."));
  await deps.audit({ actorId: viewer.userId, actorEmail: viewer.email, action: "status", entity: "campaign", entityId: l.campaignId, entityLabel: l.campaignName, recordId: l.campaignId, summary: "Ads paused in Meta", metadata: { launchId } });
  return doc;
}

/** Resume is activate: it re-checks approval and the spend guard. */
export const resumeDelivery = activateLaunch;

export async function archiveLaunch(launchId: string, viewer: SmmsViewer, deps: AdsDeps = defaultDeps): Promise<LaunchDoc> {
  assertCan(viewer, "PUBLISH_CONTENT");
  const l = await requireLaunch(launchId);
  if (l.state !== "ready") throw new LaunchBlockedError("The launch is not created in Meta.");
  if (l.objects.campaign) await deps.withMeta(l.adAccountId, (c) => c.post(l.objects.campaign!, { status: "ARCHIVED" }, { idempotentWrite: true }));
  const doc = await patch(launchId, { delivery: "archived", active: false }, event(viewer.userId, "archived", "Archived in Meta."));
  await deps.audit({ actorId: viewer.userId, actorEmail: viewer.email, action: "archive", entity: "campaign", entityId: l.campaignId, entityLabel: l.campaignName, recordId: l.campaignId, summary: "Launch archived in Meta", metadata: { launchId } });
  return doc;
}

export interface PauseResult {
  launchId: string;
  campaignName: string;
  /** Why it was a candidate: our records say it delivers, the last sync said Meta delivers, or a live read said so. */
  found: "recorded_active" | "meta_active" | "live_read" | "unverified";
  ok: boolean;
  error?: string;
}

/**
 * Pauses everything that is, or may be, spending: launches our records call active AND launches whose last synced (or a live) Meta status
 * is ACTIVE although our records say paused (somebody switched them on in Meta, or a pause never reached it). A launch whose Meta status
 * cannot be read is paused anyway: pausing is safe to repeat. Returns one result per launch.
 */
export async function pauseAllRunning(viewer: SmmsViewer, deps: AdsDeps = defaultDeps, opts: { reason?: string } = {}): Promise<{ paused: number; failed: number; results: PauseResult[] }> {
  assertCan(viewer, "APPROVE_AD_SPEND");
  const col = await launchesCollection();
  const candidates = await col.find({ active: true, state: "ready", delivery: { $ne: "archived" }, "objects.campaign": { $exists: true, $ne: null } }).toArray();
  const reason = opts.reason ?? "Paused by the kill switch.";
  const results: PauseResult[] = [];
  for (const l of candidates) {
    const campaign = l.objects.campaign!;
    let found: PauseResult["found"] | null = l.delivery === "active" ? "recorded_active" : l.externalStatus?.campaign === "ACTIVE" ? "meta_active" : null;
    try {
      if (!found) {
        try {
          const st = (await deps.withMeta(l.adAccountId, (c) => readStatuses(c, "campaign", [campaign]))).get(campaign);
          if (st?.status === "ACTIVE" || st?.effectiveStatus === "ACTIVE") found = "live_read";
          else if (st?.status === "PAUSED" || st?.status === "ARCHIVED" || st?.status === "DELETED") continue;
          else found = "unverified";
        } catch {
          found = "unverified";
        }
      }
      await setStatuses(l, "PAUSED", deps);
      await patch(l._id, { delivery: "paused", externalStatus: { campaign: "PAUSED", at: deps.now() } }, event(viewer.userId, "paused", reason));
      results.push({ launchId: l._id, campaignName: l.campaignName, found, ok: true });
    } catch (e) {
      const message = (e instanceof Error ? e.message : "pause failed").slice(0, 300);
      await patch(l._id, {}, event(viewer.userId, "pause_failed", `${reason} Could not pause in Meta: ${message}`)).catch(() => {});
      results.push({ launchId: l._id, campaignName: l.campaignName, found: found ?? "unverified", ok: false, error: message });
    }
  }
  return { paused: results.filter((r) => r.ok && r.found !== "unverified").length, failed: results.filter((r) => !r.ok).length, results };
}

/**
 * Turning the kill switch ON must stop spend, not only block new starts: the switch is set first (so nothing can start meanwhile), then
 * everything delivering is paused in Meta, one recorded result per launch, and the admins are told. Anything that could not be paused
 * stays flagged and is retried by every ads sync while the switch is on.
 */
export async function engageKillSwitch(viewer: SmmsViewer, deps: AdsDeps = defaultDeps): Promise<{ guard: GuardSettings; paused: number; failed: number; results: PauseResult[] }> {
  assertCan(viewer, "APPROVE_AD_SPEND");
  const guard = await setKillSwitch(true, viewer.userId);
  const r = await pauseAllRunning(viewer, deps);
  await deps.audit({ actorId: viewer.userId, actorEmail: viewer.email, action: "status", entity: "campaign", entityId: "ads-guard", entityLabel: "Ad spending limits", recordId: "ads-guard", summary: `Ads kill switch turned on: ${r.paused} paused${r.failed ? `, ${r.failed} could not be paused` : ""}`, metadata: { results: r.results.map((x) => ({ launchId: x.launchId, found: x.found, ok: x.ok, error: x.error ?? null })) } });
  await deps.notify({
    title: r.failed ? `Ads kill switch is on: ${r.failed} campaign${r.failed === 1 ? "" : "s"} could not be paused` : "Ads kill switch is on: all ads paused",
    body: r.failed ? `${r.paused} paused. Not paused: ${r.results.filter((x) => !x.ok).map((x) => x.campaignName).join(", ").slice(0, 300)}. Pause them in Meta Ads Manager; the sync keeps trying.` : `${r.paused} running campaign${r.paused === 1 ? "" : "s"} paused. Nothing can start until it is turned off.`,
    link: "/viralpulse-ai/campaigns",
    dedupeKey: `ads-killswitch:${guard.killSwitchAt?.getTime() ?? Date.now()}`,
  }).catch(() => {});
  return { guard, ...r };
}

// ── editing after launch ─────────────────────────────────────────────────────────────────────────────

export interface LaunchEdit {
  campaign?: { name?: string; spendCapMinor?: number | null; stopTime?: string | null; budgetMinor?: number };
  adSets?: Record<string, { name?: string; budgetMinor?: number; bidAmountMinor?: number; endTime?: string | null; targeting?: MetaTargetingDraft }>;
  ads?: Record<string, { name?: string; copy?: { headline?: string; primaryText?: string; description?: string; link?: string; urlTags?: string } }>;
}

/**
 * Changes only what Meta allows after creation: names, budgets, bids, end times, targeting, spend cap and ad copy (a new creative is
 * created and swapped in; Meta re-reviews the ad). A change that raises the committed budget while delivering is refused: pause, edit,
 * get the new amount approved, start again.
 */
export async function editLaunch(launchId: string, viewer: SmmsViewer, edit: LaunchEdit, deps: AdsDeps = defaultDeps): Promise<LaunchDoc> {
  assertCan(viewer, "EDIT_CAMPAIGNS");
  return withSpendLock(deps, () => editLocked(launchId, viewer, edit, deps));
}

async function editLocked(launchId: string, viewer: SmmsViewer, edit: LaunchEdit, deps: AdsDeps): Promise<LaunchDoc> {
  const l = await requireLaunch(launchId);
  if (l.state !== "ready" || l.delivery === "archived") throw new LaunchBlockedError("Only a created, not archived launch can be edited.");
  const next: MetaCampaignDraft = JSON.parse(JSON.stringify(l.campaign));
  const ads: LaunchAdSnapshot[] = JSON.parse(JSON.stringify(l.ads));
  const calls: { id: string; body: Record<string, unknown> }[] = [];
  const e = edit.campaign;
  if (e && l.objects.campaign) {
    const body: Record<string, unknown> = {};
    if (e.name !== undefined) body.name = e.name.trim().slice(0, 400);
    if (e.spendCapMinor !== undefined) {
      next.spendCapMinor = e.spendCapMinor;
      body.spend_cap = e.spendCapMinor ?? 922337203685478;
    }
    if (e.stopTime !== undefined) {
      next.stopTime = e.stopTime;
      body.stop_time = e.stopTime ?? 0;
    }
    if (e.budgetMinor !== undefined) {
      if (!next.campaignBudget) throw new SmmsInputError("This launch has its budget on the ad sets.");
      if (!(e.budgetMinor > 0)) throw new SmmsInputError("The budget must be above zero.");
      next.campaignBudget.amountMinor = e.budgetMinor;
      body[next.campaignBudget.type === "daily" ? "daily_budget" : "lifetime_budget"] = e.budgetMinor;
    }
    if (Object.keys(body).length) calls.push({ id: l.objects.campaign, body });
  }
  for (const [key, p] of Object.entries(edit.adSets ?? {})) {
    const s = next.adSets.find((x) => x.key === key);
    const id = l.objects.adSets[key];
    if (!s || !id) throw new SmmsInputError("That ad set is not part of this launch.");
    const body: Record<string, unknown> = {};
    if (p.name !== undefined) {
      s.name = p.name.trim().slice(0, 400);
      body.name = s.name;
    }
    if (p.budgetMinor !== undefined) {
      if (!s.budget) throw new SmmsInputError("This launch has its budget on the campaign.");
      if (!(p.budgetMinor > 0)) throw new SmmsInputError("The budget must be above zero.");
      s.budget.amountMinor = p.budgetMinor;
      body[s.budget.type === "daily" ? "daily_budget" : "lifetime_budget"] = p.budgetMinor;
    }
    if (p.bidAmountMinor !== undefined) {
      s.bidAmountMinor = p.bidAmountMinor;
      body.bid_amount = p.bidAmountMinor;
    }
    if (p.endTime !== undefined) {
      s.endTime = p.endTime;
      body.end_time = p.endTime ?? 0;
    }
    if (p.targeting) {
      s.targeting = p.targeting;
      body.targeting = buildTargetingSpec(p.targeting);
    }
    if (Object.keys(body).length) calls.push({ id, body });
  }
  const creativeSwaps: { adId: string; snapshot: LaunchAdSnapshot }[] = [];
  for (const [adId, p] of Object.entries(edit.ads ?? {})) {
    const a = ads.find((x) => x.id === adId);
    const extId = l.objects.ads[adId];
    if (!a || !extId) throw new SmmsInputError("That ad is not part of this launch.");
    if (p.name !== undefined) {
      a.name = p.name.trim().slice(0, 400);
      calls.push({ id: extId, body: { name: a.name } });
    }
    if (p.copy) {
      if (p.copy.headline !== undefined) a.headline = p.copy.headline;
      if (p.copy.primaryText !== undefined) a.primaryText = p.copy.primaryText;
      if (p.copy.description !== undefined) a.description = p.copy.description;
      if (p.copy.link !== undefined) a.meta.link = p.copy.link;
      if (p.copy.urlTags !== undefined) a.meta.urlTags = p.copy.urlTags;
      creativeSwaps.push({ adId, snapshot: a });
    }
  }
  // Same rules as at launch time (live account facts).
  const media = (await deps.getMedia(mediaIdsOf(ads))).map(toFacts);
  const info = await deps.withMeta(l.adAccountId, (c) => getAdAccountInfo(c, l.actId));
  const v = validateMetaLaunch({ campaign: next, ads: ads.map(forValidation), media, account: info, now: deps.now() });
  if (!v.ok) throw new LaunchValidationError("Fix the highlighted fields.", v.errors);
  const commitment = commitmentOf(next, deps.now());
  const raises = commitment.dailyMinor > l.commitment.dailyMinor || (l.commitment.totalMinor !== null && (commitment.totalMinor === null || commitment.totalMinor > l.commitment.totalMinor));
  if (raises && l.delivery === "active") throw new ApprovalRequiredError("This raises the budget while ads are running. Pause the launch, make the change, get it approved, then start it again.");
  const guard = raises ? await guardFor(l.currency, commitment, l._id) : null;
  if (guard && !guard.ok && l.delivery === "active") throw new LaunchBlockedError("The spending limits do not allow this budget.", guard.reasons);
  // Apply to Meta.
  const newCreatives: Record<string, string> = {};
  await deps.withMeta(l.adAccountId, async (c) => {
    for (const call of calls) await c.post(call.id, call.body, { idempotentWrite: true });
    if (creativeSwaps.length) {
      const mediaAll = new Map((await deps.getMedia(mediaIdsOf(ads))).map((m) => [m.id, m]));
      const kinds = Object.fromEntries([...mediaAll.values()].map((m) => [m.id, m.kind])) as Record<string, "image" | "video">;
      const assets: CreativeAssets = { imageHashes: l.objects.images, videoIds: l.objects.videos };
      for (const sw of creativeSwaps) {
        const payload = buildCreativePayload({ name: sw.snapshot.name, headline: sw.snapshot.headline, primaryText: sw.snapshot.primaryText, description: sw.snapshot.description, mediaIds: sw.snapshot.mediaIds, mediaKinds: kinds, meta: sw.snapshot.meta, pageId: l.pageId, instagramUserId: l.instagramUserId }, assets);
        const cr = await c.post<{ id: string }>(`${l.actId}/adcreatives`, payload);
        await c.post(l.objects.ads[sw.adId], { creative: { creative_id: cr.id } }, { idempotentWrite: true });
        newCreatives[sw.adId] = cr.id;
      }
    }
  });
  const set: Record<string, unknown> = { campaign: next, ads, commitment, campaignName: edit.campaign?.name ? edit.campaign.name.trim() : l.campaignName };
  for (const [adId, id] of Object.entries(newCreatives)) set[`objects.creatives.${adId}`] = id;
  const doc = await patch(launchId, set, event(viewer.userId, "edited", `Edited after launch (${[...calls.map((x) => Object.keys(x.body).join("+")), ...creativeSwaps.map(() => "creative")].join(", ").slice(0, 200)}).`));
  await deps.audit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "campaign", entityId: l.campaignId, entityLabel: l.campaignName, recordId: l.campaignId, summary: "Launch edited in Meta", metadata: { launchId } });
  return doc;
}

// ── manual path ─────────────────────────────────────────────────────────────────────────────────────

/** Keeps `updatedAt` honest for callers that touch campaign docs. */
export async function touchCampaign(campaignId: string, actorId: string): Promise<void> {
  const col = await campaignsCollection();
  await col.updateOne({ _id: campaignId, ...notDeleted }, { $set: updateStamp(actorId) });
}
