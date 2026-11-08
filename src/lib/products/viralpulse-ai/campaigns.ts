import "server-only";
import { COLLECTIONS, smmsCollection, newId, createStamp, updateStamp, notDeleted, str, strList, dateOrNull, escapeRegex, type Stamps } from "@/lib/products/viralpulse-ai/db";
import { isAdPlatform, type AdPlatform, type ContentStatus } from "@/lib/products/viralpulse-ai/constants";
import { EMPTY_CAMPAIGN_AI, normalizeCampaignAi, type CampaignAi } from "@/lib/products/viralpulse-ai/content";
import { SmmsInputError, NotFoundError, can, ForbiddenError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { PAID_SCHEMA_VERSION, normalizeCampaignPaid, type CampaignPaid } from "@/lib/products/viralpulse-ai/ads-platforms/meta/draft";
import { AD_COLLECTIONS } from "@/lib/products/viralpulse-ai/ads-platforms/types";

/**
 * A campaign is the creative brief + AI strategy for a paid push across one or
 * more ad platforms, plus the real launch draft (`paid`, schema version 2: ad account,
 * objective, budget, ad sets, targeting) that `ads-platforms/launches.ts` turns into a
 * Meta campaign. Nothing spends until a person approves the budget and starts it.
 * Spend and results are the LMS's (CSV-imported `campaigns` +
 * `campaign_metrics`); a campaign links to them by `lmsCampaignKeys`.
 */

export interface CampaignBrief {
  name: string;
  objective: string;
  platforms: AdPlatform[];
  targetAudience: string;
  industry: string;
  location: string;
  budget: number | null;
  currency: string;
  startDate: Date | null;
  endDate: Date | null;
  cta: string;
  landingPage: string;
  offerService: string;
  /** Optional Festival Offers offer this campaign promotes (read live, never copied). */
  offerId: string | null;
  /** Optional PMS client when the campaign is run for a client. */
  clientId: string | null;
  brandInfo: string;
  keywords: string[];
  tone: string;
  language: string;
}

export interface CampaignDoc extends CampaignBrief, Stamps {
  _id: string;
  status: ContentStatus;
  ai: CampaignAi;
  /** The paid-ads launch draft (schema version 2). Older campaigns hold copy only; `getCampaign` lifts them on read. */
  paid: CampaignPaid;
  /** LMS `campaigns.nameKey`s whose imported spend/results belong to this campaign. */
  lmsCampaignKeys: string[];
  launchedAt: Date | null;
  launchedBy: string | null;
  archivedFrom: ContentStatus | null;
}

let indexesEnsured = false;
export async function campaignsCollection() {
  const col = await smmsCollection<CampaignDoc>(COLLECTIONS.campaigns);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([col.createIndex({ deletedAt: 1, updatedAt: -1 }).catch(() => {}), col.createIndex({ status: 1 }).catch(() => {})]);
  }
  return col;
}

const URL_RE = /^https?:\/\/[^\s]+$/i;

export function parseBrief(input: Record<string, unknown>): CampaignBrief {
  const name = str(input.name, 120);
  if (!name) throw new SmmsInputError("Give the campaign a name.");
  const platforms = (Array.isArray(input.platforms) ? input.platforms : []).filter(isAdPlatform);
  if (platforms.length === 0) throw new SmmsInputError("Choose at least one platform.");
  const landingPage = str(input.landingPage, 500);
  if (landingPage && !URL_RE.test(landingPage)) throw new SmmsInputError("The landing page must be a full http(s) URL.");
  const budgetRaw = input.budget === "" || input.budget === null || input.budget === undefined ? null : Number(input.budget);
  if (budgetRaw !== null && (!Number.isFinite(budgetRaw) || budgetRaw < 0)) throw new SmmsInputError("Budget must be a positive number.");
  const startDate = dateOrNull(input.startDate);
  const endDate = dateOrNull(input.endDate);
  if (startDate && endDate && endDate < startDate) throw new SmmsInputError("The end date is before the start date.");
  return {
    name,
    objective: str(input.objective, 120),
    platforms: [...new Set(platforms)],
    targetAudience: str(input.targetAudience, 1500),
    industry: str(input.industry, 120),
    location: str(input.location, 300),
    budget: budgetRaw,
    currency: str(input.currency, 3).toUpperCase() || "INR",
    startDate,
    endDate,
    cta: str(input.cta, 60),
    landingPage,
    offerService: str(input.offerService, 500),
    offerId: str(input.offerId, 64) || null,
    clientId: str(input.clientId, 64) || null,
    brandInfo: str(input.brandInfo, 3000),
    keywords: strList(input.keywords, 40, 80),
    tone: str(input.tone, 120),
    language: str(input.language, 60) || "English",
  };
}

export async function createCampaign(brief: CampaignBrief, actorId: string): Promise<CampaignDoc> {
  const col = await campaignsCollection();
  const doc: CampaignDoc = { _id: newId(), ...brief, status: "draft", ai: EMPTY_CAMPAIGN_AI, paid: normalizeCampaignPaid(null, brief), lmsCampaignKeys: [], launchedAt: null, launchedBy: null, archivedFrom: null, ...createStamp(actorId) };
  await col.insertOne(doc);
  return doc;
}

export async function getCampaign(id: string): Promise<CampaignDoc | null> {
  if (!id) return null;
  const col = await campaignsCollection();
  const doc = await col.findOne({ _id: id, ...notDeleted });
  return doc ? { ...doc, ai: normalizeCampaignAi(doc.ai), paid: normalizeCampaignPaid(doc.paid, doc) } : null;
}

export async function requireCampaign(id: string): Promise<CampaignDoc> {
  const c = await getCampaign(id);
  if (!c) throw new NotFoundError();
  return c;
}

/** Content edits move a draft/generated campaign to "edited"; a live one keeps its status. */
export function statusAfterEdit(current: ContentStatus): ContentStatus {
  return current === "draft" || current === "generated" || current === "failed" ? "edited" : current;
}

export async function updateBrief(id: string, brief: CampaignBrief, actorId: string): Promise<{ before: CampaignDoc; after: CampaignDoc }> {
  const before = await requireCampaign(id);
  if (before.status === "archived") throw new SmmsInputError("Restore the campaign before editing it.");
  const col = await campaignsCollection();
  await col.updateOne({ _id: id }, { $set: { ...brief, ...updateStamp(actorId) } });
  return { before, after: (await getCampaign(id))! };
}

export async function saveCampaignAi(id: string, ai: CampaignAi, status: ContentStatus, actorId: string): Promise<void> {
  const col = await campaignsCollection();
  await col.updateOne({ _id: id }, { $set: { ai, status, ...updateStamp(actorId) } });
}

export async function setCampaignStatus(id: string, status: ContentStatus, actorId: string, extra: Partial<CampaignDoc> = {}): Promise<void> {
  const col = await campaignsCollection();
  await col.updateOne({ _id: id }, { $set: { status, ...extra, ...updateStamp(actorId) } });
}

export async function setLmsLinks(id: string, keys: string[], actorId: string): Promise<void> {
  const col = await campaignsCollection();
  await col.updateOne({ _id: id }, { $set: { lmsCampaignKeys: strList(keys, 20, 200), ...updateStamp(actorId) } });
}

export async function duplicateCampaign(id: string, actorId: string): Promise<CampaignDoc> {
  const src = await requireCampaign(id);
  const col = await campaignsCollection();
  const hasAi = Boolean(src.ai.summary || src.ai.adConcepts.length);
  const doc: CampaignDoc = { ...src, paid: normalizeCampaignPaid(src.paid, src), _id: newId(), name: `${src.name} (copy)`.slice(0, 120), status: hasAi ? "edited" : "draft", lmsCampaignKeys: [], launchedAt: null, launchedBy: null, archivedFrom: null, ...createStamp(actorId) };
  await col.insertOne(doc);
  return doc;
}

export async function softDeleteCampaign(id: string, actorId: string): Promise<CampaignDoc> {
  const c = await requireCampaign(id);
  const [col, ads] = await Promise.all([campaignsCollection(), smmsCollection<{ _id: string; campaignId: string; deletedAt: Date | null }>(COLLECTIONS.ads)]);
  const now = new Date();
  await col.updateOne({ _id: id }, { $set: { deletedAt: now, ...updateStamp(actorId) } });
  await ads.updateMany({ campaignId: id, deletedAt: null }, { $set: { deletedAt: now } });
  return c;
}

export interface CampaignFilter {
  q?: string;
  status?: string;
  platform?: string;
  page?: number;
  pageSize?: number;
}

export async function listCampaigns(f: CampaignFilter = {}) {
  const col = await campaignsCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (f.status) filter.status = f.status;
  else filter.status = { $ne: "archived" };
  if (f.status === "all") delete filter.status;
  if (f.platform && isAdPlatform(f.platform)) filter.platforms = f.platform;
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), "i");
    filter.$or = [{ name: rx }, { objective: rx }, { offerService: rx }, { keywords: rx }];
  }
  const page = Math.max(f.page ?? 1, 1);
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const [items, total] = await Promise.all([
    col.find(filter, { projection: { ai: 0 } }).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    col.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function listCampaignOptions(): Promise<{ _id: string; name: string }[]> {
  const col = await campaignsCollection();
  const rows = await col.find({ ...notDeleted, status: { $ne: "archived" } }, { projection: { name: 1 } }).sort({ updatedAt: -1 }).limit(200).toArray();
  return rows.map((r) => ({ _id: r._id, name: r.name }));
}

export function briefPrompt(c: CampaignBrief): string {
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "not set");
  return [
    `Campaign: ${c.name}`,
    `Objective: ${c.objective || "not set"}`,
    `Platforms: ${c.platforms.join(", ")}`,
    `Target audience: ${c.targetAudience || "not set"}`,
    `Industry: ${c.industry || "not set"}`,
    `Location: ${c.location || "not set"}`,
    `Budget: ${c.budget !== null ? `${c.budget} ${c.currency}` : "not set"}`,
    `Duration: ${fmt(c.startDate)} to ${fmt(c.endDate)}`,
    `Call to action: ${c.cta || "choose the best one"}`,
    `Landing page: ${c.landingPage || "not set"}`,
    `Offer / service: ${c.offerService || "not set"}`,
    c.brandInfo && `Extra brand information: ${c.brandInfo}`,
    `Keywords: ${c.keywords.join(", ") || "suggest them"}`,
    `Tone: ${c.tone || "brand default"}`,
    `Language: ${c.language}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── paid launch draft ──────────────────────────────────────────────────────────────────────────────

/**
 * Saves the Meta launch draft (`paid`). The draft is normalised (unknown values dropped), so a form can post what it has. A campaign with a
 * launch that is delivering is edited through `editLaunch`, not here.
 */
export async function saveCampaignPaid(id: string, paid: unknown, viewer: SmmsViewer): Promise<CampaignDoc> {
  if (!can(viewer, "EDIT_CAMPAIGNS")) throw new ForbiddenError("EDIT_CAMPAIGNS");
  const c = await requireCampaign(id);
  if (c.status === "archived") throw new SmmsInputError("Restore the campaign before editing it.");
  const launches = await smmsCollection<{ _id: string; campaignId: string; active: boolean; state: string }>(AD_COLLECTIONS.launches);
  const live = await launches.findOne({ campaignId: id, active: true, state: { $in: ["ready", "creating", "partial"] } });
  if (live) throw new SmmsInputError("This campaign has a launch in Meta. Change it with the launch controls, or archive the launch first.");
  const next = normalizeCampaignPaid({ ...(paid as object), schemaVersion: PAID_SCHEMA_VERSION }, c);
  const col = await campaignsCollection();
  await col.updateOne({ _id: id }, { $set: { paid: next, status: statusAfterEdit(c.status), ...updateStamp(viewer.userId) } });
  return (await getCampaign(id))!;
}

/**
 * Persists schema version 2 on every campaign that still holds copy only (idempotent: already-lifted campaigns are skipped). Reads already
 * lift on the fly, so this only makes the stored shape match; the sync cron runs it in small batches.
 */
export async function migrateLegacyCampaigns(limit = 200): Promise<number> {
  const col = await campaignsCollection();
  const rows = await col.find({ "paid.schemaVersion": { $ne: PAID_SCHEMA_VERSION } } as never).limit(limit).toArray();
  for (const r of rows) await col.updateOne({ _id: r._id }, { $set: { paid: normalizeCampaignPaid(null, r) } });
  return rows.length;
}
