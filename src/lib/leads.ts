import "server-only";
import { Collection, Document, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getLeadCategories } from "@/lib/lead-categories";
import { CATEGORIES, collectionNameFor, getCategoryLabel, getSubServices, isValidCategory, type CategorySlug } from "@/lib/categories";
import type { LeadRecord, LeadAttribution } from "@/lib/lead-validation";
import type { Utm } from "@/lib/utm";
import { DEFAULT_LEAD_STATUS, type LeadStatus } from "@/lib/lead-status";
import { deleteResumeFile, readResumeFile, saveResumeFile } from "@/lib/resume-storage";
import { escapeRegExp } from "@/lib/text-search";
import { staleThresholdDate } from "@/lib/stale-days";
import { previousPeriodRange, computeGrowthPercent } from "@/lib/period-comparison";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";

export type { DashboardGranularity } from "@/lib/granularity";

export { CATEGORIES, isValidCategory, getCategoryLabel, categoryAcceptsResume, getSubServices, type CategorySlug, type SubService } from "@/lib/categories";
export { validateLeadInput, validateLeadUpdate, validateResumeFile, DEAL_VALUE_MAX, type LeadInput, type LeadAdminInput, type LeadRecord, type LeadAttribution } from "@/lib/lead-validation";
export { LEAD_STATUSES, DEFAULT_LEAD_STATUS, isValidLeadStatus, getStatusMeta, type LeadStatus } from "@/lib/lead-status";

export interface ResumeMeta {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface Lead {
  _id: ObjectId;
  category: CategorySlug;
  name: string;
  email?: string;
  phone: string;
  message?: string;
  resume?: ResumeMeta;
  subService?: string;
  status?: LeadStatus;
  notes?: string;
  source?: string;
  campaign?: string;
  campaignKey?: string;
  utm?: Utm;
  dealValue?: number;
  attribution?: LeadAttribution;
  createdAt: Date;
  updatedAt: Date;
}

interface BaseLeadFilterOptions {
  search?: string;
  status?: LeadStatus;
  source?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/** Shared by searchLeads, exportLeads, and the dashboard aggregation so filtering can't drift between them. */
function buildLeadFilter(opts: BaseLeadFilterOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.search && opts.search.trim()) {
    const regex = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }
  if (opts.status) filter.status = opts.status;
  if (opts.source) filter.source = opts.source;
  if (opts.dateFrom || opts.dateTo) {
    const range: Record<string, Date> = {};
    if (opts.dateFrom) range.$gte = opts.dateFrom;
    if (opts.dateTo) range.$lte = opts.dateTo;
    filter.createdAt = range;
  }
  return filter;
}

/** The categories whose leads the dashboards add up: the operator's built-in six, or a company's own (`lead-categories.ts`). */
async function scopedCategories(): Promise<{ slug: CategorySlug }[]> {
  const set = await getLeadCategories();
  return set.categories.map((c) => ({ slug: c.slug as CategorySlug }));
}

async function getLeadsCollection(category: CategorySlug): Promise<Collection<Omit<Lead, "_id">>> {
  const db = await getDb();
  return db.collection<Omit<Lead, "_id">>(collectionNameFor(category));
}

export async function uploadResume(file: File): Promise<ResumeMeta> {
  return saveResumeFile(file);
}

export function openResumeDownloadStream(storageKey: string) {
  return readResumeFile(storageKey);
}

export async function createLead(category: CategorySlug, data: LeadRecord & { resume?: ResumeMeta }) {
  const collection = await getLeadsCollection(category);
  const now = new Date();
  // status is never taken from caller input here — public submissions always start "new".
  const doc: Omit<Lead, "_id"> = { category, ...data, status: DEFAULT_LEAD_STATUS, createdAt: now, updatedAt: now };
  const result = await collection.insertOne(doc);
  return { _id: result.insertedId, ...doc };
}

export async function listLeads(category: CategorySlug, opts: { limit?: number; cursor?: string } = {}) {
  const collection = await getLeadsCollection(category);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  const filter = opts.cursor && ObjectId.isValid(opts.cursor) ? { _id: { $lt: new ObjectId(opts.cursor) } } : {};

  const docs = await collection
    .find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = docs.length > limit;
  const items = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;

  return { items, nextCursor };
}

export interface SearchLeadsOptions extends BaseLeadFilterOptions {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "name";
  sortDir?: "asc" | "desc";
}

export async function searchLeads(category: CategorySlug, opts: SearchLeadsOptions = {}) {
  const collection = await getLeadsCollection(category);
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);

  const filter = buildLeadFilter(opts);
  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    collection
      .find(filter)
      .sort({ [sortField]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface ExportLeadsOptions extends BaseLeadFilterOptions {
  sortBy?: "createdAt" | "name";
  sortDir?: "asc" | "desc";
  ids?: string[];
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportLeads(category: CategorySlug, opts: ExportLeadsOptions = {}): Promise<Lead[]> {
  const collection = await getLeadsCollection(category);

  const filter =
    opts.ids && opts.ids.length > 0
      ? { _id: { $in: opts.ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } }
      : buildLeadFilter(opts);

  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const docs = await collection
    .find(filter)
    .sort({ [sortField]: sortDir })
    .limit(EXPORT_ROW_LIMIT)
    .toArray();

  return docs.map((doc) => ({ ...doc, category })) as Lead[];
}

export async function getLead(category: CategorySlug, id: string) {
  if (!ObjectId.isValid(id)) return null;
  const collection = await getLeadsCollection(category);
  return collection.findOne({ _id: new ObjectId(id) });
}

export async function updateLead(category: CategorySlug, id: string, data: Partial<LeadRecord>) {
  if (!ObjectId.isValid(id)) return null;
  const collection = await getLeadsCollection(category);

  // Keys explicitly set to `undefined` mean "clear this field" — route them to
  // $unset so the document doesn't keep a stale value (or store a literal null).
  const set: Record<string, unknown> = { updatedAt: new Date() };
  const unset: Record<string, ""> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) unset[key] = "";
    else set[key] = value;
  }

  const update: Record<string, unknown> = { $set: set };
  if (Object.keys(unset).length > 0) update.$unset = unset;

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    update,
    { returnDocument: "after" }
  );
  return result;
}

export async function deleteLead(category: CategorySlug, id: string) {
  if (!ObjectId.isValid(id)) return false;
  const collection = await getLeadsCollection(category);
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return false;

  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 1 && doc.resume?.storageKey) {
    await deleteResumeFile(doc.resume.storageKey);
  }
  return result.deletedCount === 1;
}

export interface DashboardFilters extends BaseLeadFilterOptions {
  category?: CategorySlug;
  granularity?: DashboardGranularity;
}

export interface CategoryStats {
  slug: CategorySlug;
  label: string;
  total: number;
  previousPeriodTotal: number | null;
  growthPercent: number | null;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  bySubService: { subService: string; label: string; count: number }[];
  timeSeries: { date: string; count: number }[];
  /** Same dateFormat as `timeSeries`, but covering the previous-period range — zip
   * by sorted ordinal index (not calendar date) when comparing to `timeSeries`. */
  previousTimeSeries: { date: string; count: number }[];
  byWeekday: { day: string; count: number }[];
  completed: number;
  completionRate: number;
  recent: Lead[];
  funnel: { stage: string; count: number }[];
}

export interface DashboardStats {
  totalOverall: number;
  previousPeriodTotal: number | null;
  growthPercent: number | null;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byWeekday: { day: string; count: number }[];
  timeSeries: { date: string; count: number }[];
  recent: Lead[];
  topCategories: { category: string; label: string; total: number; completed: number; completionRate: number; growthPercent: number | null }[];
  funnel: { stage: string; count: number }[];
  perCategory: Record<CategorySlug, CategoryStats>;
  /** Leads still "new"/"in_progress" after STALE_DAYS — ignores the active date range (a backlog view is about what's open now), still respects category/status/source/search. */
  staleCount: number;
  staleLeads: Lead[];
}

interface FacetResult extends Document {
  total: { count: number }[];
  byStatus: { _id: string | null; count: number }[];
  bySource: { _id: string | null; count: number }[];
  byBucket: { _id: string; count: number }[];
  byWeekday: { _id: number; count: number }[];
  bySubService: { _id: string | null; count: number }[];
  completed: { count: number }[];
  recent: Lead[];
}

interface PrevFacetResult extends Document {
  total: { count: number }[];
  byBucket: { _id: string; count: number }[];
}

interface StaleFacetResult extends Document {
  count: { count: number }[];
  items: Lead[];
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildFunnel(byStatus: Record<string, number>, total: number): { stage: string; count: number }[] {
  const progressed = (byStatus.in_progress ?? 0) + (byStatus.completed ?? 0);
  return [
    { stage: "New", count: total },
    { stage: "In Progress", count: progressed },
    { stage: "Completed", count: byStatus.completed ?? 0 },
  ];
}

export async function getDashboardStats(filters: DashboardFilters = {}): Promise<DashboardStats> {
  const targetCategories = filters.category ? [filters.category] : (await scopedCategories()).map((c) => c.slug);
  const granularity = filters.granularity ?? "day";
  const dateFormat = dateFormatFor(granularity);
  const customCategories = new Map((await getLeadCategories()).categories.map((c) => [c.slug, c]));

  const matchFilter = buildLeadFilter(filters);
  const prevRange = previousPeriodRange(filters.dateFrom, filters.dateTo);
  const prevFilter = prevRange ? buildLeadFilter({ ...filters, dateFrom: prevRange.from, dateTo: prevRange.to }) : null;

  const staleThreshold = staleThresholdDate();
  const staleBaseFilter = buildLeadFilter({ ...filters, dateFrom: undefined, dateTo: undefined });
  const staleFilter: Record<string, unknown> = { ...staleBaseFilter, createdAt: { $lte: staleThreshold } };
  if (filters.status) {
    // A specific status filter is active — stale/pending only makes sense for
    // open statuses, so anything else deliberately matches nothing.
    if (filters.status !== "new" && filters.status !== "in_progress") {
      staleFilter.status = { $in: [] };
    }
  } else {
    staleFilter.status = { $in: ["new", "in_progress"] };
  }

  const perCategoryRaw = await Promise.all(
    targetCategories.map(async (slug) => {
      const collection = await getLeadsCollection(slug);
      const [result] = await collection
        .aggregate<FacetResult>([
          { $match: matchFilter },
          {
            $facet: {
              total: [{ $count: "count" }],
              byStatus: [{ $group: { _id: { $ifNull: ["$status", DEFAULT_LEAD_STATUS] }, count: { $sum: 1 } } }],
              bySource: [{ $group: { _id: { $ifNull: ["$source", "unknown"] }, count: { $sum: 1 } } }],
              byBucket: [
                { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, count: { $sum: 1 } } },
              ],
              byWeekday: [{ $group: { _id: { $dayOfWeek: "$createdAt" }, count: { $sum: 1 } } }],
              bySubService: [{ $group: { _id: { $ifNull: ["$subService", "Not specified"] }, count: { $sum: 1 } } }],
              completed: [{ $match: { status: "completed" } }, { $count: "count" }],
              recent: [{ $sort: { createdAt: -1 } }, { $limit: 10 }],
            },
          },
        ])
        .toArray();

      const [prevResult] = prevFilter
        ? await collection
            .aggregate<PrevFacetResult>([
              { $match: prevFilter },
              {
                $facet: {
                  total: [{ $count: "count" }],
                  byBucket: [
                    { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, count: { $sum: 1 } } },
                  ],
                },
              },
            ])
            .toArray()
        : [undefined];

      const [staleResult] = await collection
        .aggregate<StaleFacetResult>([
          { $match: staleFilter },
          { $facet: { count: [{ $count: "count" }], items: [{ $sort: { createdAt: 1 } }, { $limit: 5 }] } },
        ])
        .toArray();

      return { slug, result, prevResult, staleResult };
    })
  );

  const perCategory = {} as Record<CategorySlug, CategoryStats>;
  let staleCount = 0;
  let staleLeadsAll: Lead[] = [];

  for (const { slug, result, prevResult, staleResult } of perCategoryRaw) {
    const total = result?.total?.[0]?.count ?? 0;
    const completed = result?.completed?.[0]?.count ?? 0;

    const byStatus: Record<string, number> = { new: 0, in_progress: 0, completed: 0, rejected: 0 };
    for (const s of result?.byStatus ?? []) {
      const key = s._id ?? DEFAULT_LEAD_STATUS;
      byStatus[key] = (byStatus[key] ?? 0) + s.count;
    }

    const bySource: Record<string, number> = {};
    for (const s of result?.bySource ?? []) {
      const key = s._id ?? "unknown";
      bySource[key] = (bySource[key] ?? 0) + s.count;
    }

    const subServiceLabels = new Map((customCategories.get(slug)?.subServices ?? getSubServices(slug)).map((s) => [s.slug, s.label]));
    const bySubService = (result?.bySubService ?? [])
      .map((s) => {
        const key = s._id ?? "Not specified";
        return { subService: key, label: subServiceLabels.get(key) ?? key, count: s.count };
      })
      .sort((a, b) => b.count - a.count);

    const timeSeries = (result?.byBucket ?? [])
      .map((d) => ({ date: d._id, count: d.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const previousTimeSeries = (prevResult?.byBucket ?? [])
      .map((d) => ({ date: d._id, count: d.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const weekdayCounts = new Array(7).fill(0);
    for (const w of result?.byWeekday ?? []) {
      // MongoDB $dayOfWeek: 1 (Sunday) .. 7 (Saturday)
      const idx = ((w._id ?? 1) - 1 + 7) % 7;
      weekdayCounts[idx] += w.count;
    }
    const byWeekday = WEEKDAY_LABELS.map((day, i) => ({ day, count: weekdayCounts[i] }));

    const previousPeriodTotal = prevFilter ? (prevResult?.total?.[0]?.count ?? 0) : null;
    const growthPercent = computeGrowthPercent(total, previousPeriodTotal);

    perCategory[slug] = {
      slug,
      label: getCategoryLabel(slug),
      total,
      previousPeriodTotal,
      growthPercent,
      byStatus,
      bySource,
      bySubService,
      timeSeries,
      previousTimeSeries,
      byWeekday,
      completed,
      completionRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
      recent: result?.recent ?? [],
      funnel: buildFunnel(byStatus, total),
    };

    staleCount += staleResult?.count?.[0]?.count ?? 0;
    staleLeadsAll = staleLeadsAll.concat(staleResult?.items ?? []);
  }

  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = { new: 0, in_progress: 0, completed: 0, rejected: 0 };
  const bySource: Record<string, number> = {};
  const bucketMap = new Map<string, number>();
  const weekdayCounts = new Array(7).fill(0);
  const topCategories: DashboardStats["topCategories"] = [];
  let recentAll: Lead[] = [];
  let totalOverall = 0;
  let previousPeriodTotal: number | null = prevFilter ? 0 : null;

  for (const slug of targetCategories) {
    const cat = perCategory[slug];
    byCategory[slug] = cat.total;
    totalOverall += cat.total;
    if (cat.previousPeriodTotal !== null) previousPeriodTotal = (previousPeriodTotal ?? 0) + cat.previousPeriodTotal;

    topCategories.push({
      category: slug,
      label: cat.label,
      total: cat.total,
      completed: cat.completed,
      completionRate: cat.completionRate,
      growthPercent: cat.growthPercent,
    });

    for (const [key, count] of Object.entries(cat.byStatus)) byStatus[key] = (byStatus[key] ?? 0) + count;
    for (const [key, count] of Object.entries(cat.bySource)) bySource[key] = (bySource[key] ?? 0) + count;
    for (const d of cat.timeSeries) bucketMap.set(d.date, (bucketMap.get(d.date) ?? 0) + d.count);
    cat.byWeekday.forEach((w, i) => (weekdayCounts[i] += w.count));

    recentAll = recentAll.concat(cat.recent);
  }

  const timeSeries = Array.from(bucketMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byWeekday = WEEKDAY_LABELS.map((day, i) => ({ day, count: weekdayCounts[i] }));

  recentAll.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  topCategories.sort((a, b) => b.total - a.total);

  staleLeadsAll.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const growthPercent = computeGrowthPercent(totalOverall, previousPeriodTotal);
  const funnel = buildFunnel(byStatus, totalOverall);

  return {
    totalOverall,
    previousPeriodTotal,
    growthPercent,
    byCategory,
    byStatus,
    bySource,
    byWeekday,
    timeSeries,
    recent: recentAll.slice(0, 10),
    topCategories,
    funnel,
    perCategory,
    staleCount,
    staleLeads: staleLeadsAll.slice(0, 10),
  };
}

export interface StaleLeadsSummary {
  count: number;
  items: Lead[];
}

/** Global, unfiltered version of the dashboard's stale-lead facet — used by the
 * topbar notifications bell, which reflects the current real backlog across the
 * whole product rather than whatever filters happen to be active on the dashboard. */
export async function getStaleLeadsSummary(): Promise<StaleLeadsSummary> {
  const staleThreshold = staleThresholdDate();
  const filter = { status: { $in: ["new", "in_progress"] }, createdAt: { $lte: staleThreshold } };

  let count = 0;
  let items: Lead[] = [];

  await Promise.all(
    (await scopedCategories()).map(async (c) => {
      const collection = await getLeadsCollection(c.slug);
      const [result] = await collection
        .aggregate<{ count: { count: number }[]; items: Lead[] }>([
          { $match: filter },
          { $facet: { count: [{ $count: "count" }], items: [{ $sort: { createdAt: 1 } }, { $limit: 5 }] } },
        ])
        .toArray();
      count += result?.count?.[0]?.count ?? 0;
      items = items.concat(result?.items ?? []);
    })
  );

  items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return { count, items: items.slice(0, 10) };
}

export interface RecentLeadsSummary {
  count: number;
  items: Lead[];
}

/** Global, unfiltered — powers the topbar notifications bell's "Recent Activity"
 * section: leads created in the last `days` days, across every category. */
export async function getRecentLeadsSummary(days = 2): Promise<RecentLeadsSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const filter = { createdAt: { $gte: since } };

  let count = 0;
  let items: Lead[] = [];

  await Promise.all(
    (await scopedCategories()).map(async (c) => {
      const collection = await getLeadsCollection(c.slug);
      const [result] = await collection
        .aggregate<{ count: { count: number }[]; items: Lead[] }>([
          { $match: filter },
          { $facet: { count: [{ $count: "count" }], items: [{ $sort: { createdAt: -1 } }, { $limit: 5 }] } },
        ])
        .toArray();
      count += result?.count?.[0]?.count ?? 0;
      items = items.concat(result?.items ?? []);
    })
  );

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { count, items: items.slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Campaign attribution — reads leads across all 5 category collections, joined
// by `campaignKey` / `source` to imported ad-campaign data. Used by the Campaign
// Analytics module (src/lib/campaigns.ts) and its leads sub-view.
// ---------------------------------------------------------------------------

/** Lead `source` values that denote a paid ad platform. */
export const PLATFORM_LEAD_SOURCES = ["meta", "google", "linkedin"] as const;

export interface AttributedCampaignRollup {
  total: number;
  qualified: number;
  completed: number;
  /** Σ dealValue over attributed leads that reached `completed`. */
  revenue: number;
}

export interface AttributedLeadStats {
  /** Keyed by `campaignKey`. */
  byCampaignKey: Record<string, AttributedCampaignRollup>;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
  qualified: number;
  completed: number;
  revenue: number;
  timeSeries: { date: string; count: number }[];
  previousTotal: number | null;
}

interface AttributedFilter {
  campaignKeys?: string[];
  sources?: string[];
  /** Extra AND constraint on `lead.source` (e.g. the page's Source filter). */
  sourceFilter?: string;
  dateFrom?: Date;
  dateTo?: Date;
  granularity?: DashboardGranularity;
}

function attributedMatch(opts: AttributedFilter): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  const or: Record<string, unknown>[] = [];
  if (opts.campaignKeys && opts.campaignKeys.length > 0) or.push({ campaignKey: { $in: opts.campaignKeys } });
  if (opts.sources && opts.sources.length > 0) or.push({ source: { $in: opts.sources } });
  if (or.length === 0) {
    // "everything attributable": has a campaign, or came from a paid platform.
    or.push({ campaignKey: { $exists: true, $nin: [null, ""] } });
    or.push({ source: { $in: [...PLATFORM_LEAD_SOURCES] } });
  }
  match.$or = or;
  if (opts.sourceFilter) match.source = opts.sourceFilter;
  if (opts.dateFrom || opts.dateTo) {
    const range: Record<string, Date> = {};
    if (opts.dateFrom) range.$gte = opts.dateFrom;
    if (opts.dateTo) range.$lte = opts.dateTo;
    match.createdAt = range;
  }
  return match;
}

interface AttributedFacet extends Document {
  byCampaign: { _id: string | null; total: number; qualified: number; completed: number; revenue: number }[];
  bySource: { _id: string | null; count: number }[];
  byStatus: { _id: string | null; count: number }[];
  byBucket: { _id: string; count: number }[];
  total: { count: number }[];
}

export async function aggregateAttributedLeads(opts: AttributedFilter = {}): Promise<AttributedLeadStats> {
  const dateFormat = dateFormatFor(opts.granularity ?? "day");
  const match = attributedMatch(opts);
  const prevRange = previousPeriodRange(opts.dateFrom, opts.dateTo);
  const prevMatch = prevRange ? attributedMatch({ ...opts, dateFrom: prevRange.from, dateTo: prevRange.to }) : null;

  const perCat = await Promise.all(
    (await scopedCategories()).map(async (c) => {
      const collection = await getLeadsCollection(c.slug);
      const [facet] = await collection
        .aggregate<AttributedFacet>([
          { $match: match },
          {
            $facet: {
              byCampaign: [
                {
                  $group: {
                    _id: { $ifNull: ["$campaignKey", null] },
                    total: { $sum: 1 },
                    qualified: { $sum: { $cond: [{ $in: ["$status", ["in_progress", "completed"]] }, 1, 0] } },
                    completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    revenue: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, { $ifNull: ["$dealValue", 0] }, 0] } },
                  },
                },
              ],
              bySource: [{ $group: { _id: { $ifNull: ["$source", "unknown"] }, count: { $sum: 1 } } }],
              byStatus: [{ $group: { _id: { $ifNull: ["$status", DEFAULT_LEAD_STATUS] }, count: { $sum: 1 } } }],
              byBucket: [{ $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, count: { $sum: 1 } } }],
              total: [{ $count: "count" }],
            },
          },
        ])
        .toArray();

      const prevCount = prevMatch
        ? await collection.countDocuments(prevMatch)
        : null;

      return { facet, prevCount };
    })
  );

  const byCampaignKey: Record<string, AttributedCampaignRollup> = {};
  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = { new: 0, in_progress: 0, completed: 0, rejected: 0 };
  const bucket = new Map<string, number>();
  let total = 0;
  let qualified = 0;
  let completed = 0;
  let revenue = 0;
  let previousTotal: number | null = prevMatch ? 0 : null;

  for (const { facet, prevCount } of perCat) {
    for (const c of facet?.byCampaign ?? []) {
      if (!c._id) continue;
      const row = (byCampaignKey[c._id] ??= { total: 0, qualified: 0, completed: 0, revenue: 0 });
      row.total += c.total;
      row.qualified += c.qualified;
      row.completed += c.completed;
      row.revenue += c.revenue;
    }
    for (const s of facet?.bySource ?? []) bySource[s._id ?? "unknown"] = (bySource[s._id ?? "unknown"] ?? 0) + s.count;
    for (const s of facet?.byStatus ?? []) byStatus[s._id ?? DEFAULT_LEAD_STATUS] = (byStatus[s._id ?? DEFAULT_LEAD_STATUS] ?? 0) + s.count;
    for (const b of facet?.byBucket ?? []) bucket.set(b._id, (bucket.get(b._id) ?? 0) + b.count);
    total += facet?.total?.[0]?.count ?? 0;
    for (const c of facet?.byCampaign ?? []) {
      qualified += c.qualified;
      completed += c.completed;
      revenue += c.revenue;
    }
    if (prevCount !== null) previousTotal = (previousTotal ?? 0) + prevCount;
  }

  const timeSeries = Array.from(bucket.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { byCampaignKey, bySource, byStatus, total, qualified, completed, revenue, timeSeries, previousTotal };
}

export interface SearchAttributedLeadsOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LeadStatus;
  source?: string;
  campaignKey?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortDir?: "asc" | "desc";
}

/** Paginated, filtered list of attributed leads merged across every category. */
export async function searchAttributedLeads(opts: SearchAttributedLeadsOptions = {}) {
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const dir = opts.sortDir === "asc" ? 1 : -1;

  const base = attributedMatch({
    campaignKeys: opts.campaignKey ? [opts.campaignKey] : undefined,
    sourceFilter: opts.source,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
  });
  if (opts.status) base.status = opts.status;
  if (opts.search && opts.search.trim()) {
    const regex = new RegExp(escapeRegExp(opts.search.trim()), "i");
    base.$and = [{ $or: [{ name: regex }, { email: regex }, { phone: regex }, { campaign: regex }] }];
  }

  const fetchCount = page * pageSize;
  const perCat = await Promise.all(
    (await scopedCategories()).map(async (c) => {
      const collection = await getLeadsCollection(c.slug);
      const [items, count] = await Promise.all([
        collection.find(base).sort({ createdAt: dir }).limit(fetchCount).toArray(),
        collection.countDocuments(base),
      ]);
      return { items: items.map((d) => ({ ...d, category: c.slug })) as Lead[], count };
    })
  );

  const merged = perCat.flatMap((r) => r.items);
  merged.sort((a, b) => (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir);
  const total = perCat.reduce((sum, r) => sum + r.count, 0);

  return {
    items: merged.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

export interface LeadAttributionRevert {
  category: CategorySlug;
  id: string;
  previous: {
    source?: string;
    campaign?: string;
    campaignKey?: string;
    utm?: Utm;
    attribution?: LeadAttribution;
  };
}

export interface AttributeLeadsResult {
  /** Number of CSV rows that matched at least one lead. */
  rowsMatched: number;
  /** Number of CSV rows that matched no lead. */
  rowsUnmatched: number;
  /** A capped sample of the unmatched rows, for the import report. */
  unmatchedSample: { campaign: string; email?: string; phone?: string }[];
  /** Distinct leads updated (for undo). */
  reverts: LeadAttributionRevert[];
}

const CONTACT_INDEX_CAP = 50_000;

/**
 * Match imported lead-list rows to existing leads by email / last-10-digits of
 * phone, across all 5 category collections, and stamp them with the campaign.
 * Loads a lightweight contact index once rather than querying per row.
 */
export async function attributeLeadsByContact(
  rows: { email?: string; phone?: string; campaignName: string; campaignKey: string; createdAt?: Date }[],
  source: string
): Promise<AttributeLeadsResult> {
  const byEmail = new Map<string, { category: CategorySlug; id: string }[]>();
  const byPhone = new Map<string, { category: CategorySlug; id: string }[]>();

  await Promise.all(
    (await scopedCategories()).map(async (c) => {
      const collection = await getLeadsCollection(c.slug);
      const docs = await collection
        .find({}, { projection: { email: 1, phone: 1 } })
        .limit(CONTACT_INDEX_CAP)
        .toArray();
      for (const d of docs) {
        const ref = { category: c.slug, id: String(d._id) };
        if (d.email) {
          const k = d.email.trim().toLowerCase();
          (byEmail.get(k) ?? byEmail.set(k, []).get(k)!).push(ref);
        }
        if (d.phone) {
          const digits = d.phone.replace(/\D/g, "");
          if (digits.length >= 7) {
            const k = digits.slice(-10);
            (byPhone.get(k) ?? byPhone.set(k, []).get(k)!).push(ref);
          }
        }
      }
    })
  );

  // lead id -> the campaign to stamp (last row wins if a lead matches several)
  type Assignment = { category: CategorySlug; id: string; campaignName: string; campaignKey: string };
  const assignments = new Map<string, Assignment>();
  let rowsMatched = 0;
  let rowsUnmatched = 0;
  const unmatchedSample: { campaign: string; email?: string; phone?: string }[] = [];

  for (const row of rows) {
    const hits: { category: CategorySlug; id: string }[] = [];
    if (row.email) hits.push(...(byEmail.get(row.email) ?? []));
    if (row.phone) hits.push(...(byPhone.get(row.phone) ?? []));
    if (hits.length === 0) {
      rowsUnmatched += 1;
      if (unmatchedSample.length < 25) unmatchedSample.push({ campaign: row.campaignName, email: row.email, phone: row.phone });
      continue;
    }
    rowsMatched += 1;
    for (const h of hits) {
      assignments.set(`${h.category}:${h.id}`, { ...h, campaignName: row.campaignName, campaignKey: row.campaignKey });
    }
  }

  const now = new Date();
  const reverts: LeadAttributionRevert[] = [];

  const byCat = new Map<CategorySlug, Assignment[]>();
  for (const a of assignments.values()) {
    const list = byCat.get(a.category) ?? [];
    list.push(a);
    byCat.set(a.category, list);
  }

  await Promise.all(
    Array.from(byCat.entries()).map(async ([category, list]) => {
      const collection = await getLeadsCollection(category);
      for (const a of list) {
        const existing = await collection.findOne({ _id: new ObjectId(a.id) });
        if (!existing) continue;
        reverts.push({
          category,
          id: a.id,
          previous: {
            source: existing.source,
            campaign: existing.campaign,
            campaignKey: existing.campaignKey,
            utm: existing.utm,
            attribution: existing.attribution,
          },
        });
        const utm = { ...(existing.utm ?? {}) };
        if (!utm.campaign) utm.campaign = a.campaignName;
        if (!utm.source) utm.source = source;
        await collection.updateOne(
          { _id: new ObjectId(a.id) },
          {
            $set: {
              source,
              campaign: a.campaignName,
              campaignKey: a.campaignKey,
              utm,
              attribution: { method: "csv", at: now },
              updatedAt: now,
            },
          }
        );
      }
    })
  );

  return { rowsMatched, rowsUnmatched, unmatchedSample, reverts };
}

/** Restore leads to their pre-import attribution state (undo of a lead-list import). */
export async function revertLeadAttribution(reverts: LeadAttributionRevert[]): Promise<number> {
  const now = new Date();
  let restored = 0;
  const byCat = new Map<CategorySlug, LeadAttributionRevert[]>();
  for (const r of reverts) {
    if (!isValidCategory(r.category) || !ObjectId.isValid(r.id)) continue;
    (byCat.get(r.category) ?? byCat.set(r.category, []).get(r.category)!).push(r);
  }
  await Promise.all(
    Array.from(byCat.entries()).map(async ([category, list]) => {
      const collection = await getLeadsCollection(category);
      for (const r of list) {
        const set: Record<string, unknown> = { updatedAt: now };
        const unset: Record<string, ""> = {};
        for (const key of ["source", "campaign", "campaignKey", "utm", "attribution"] as const) {
          const v = r.previous[key];
          if (v === undefined || v === null) unset[key] = "";
          else set[key] = v;
        }
        const update: Record<string, unknown> = { $set: set };
        if (Object.keys(unset).length > 0) update.$unset = unset;
        const res = await collection.updateOne({ _id: new ObjectId(r.id) }, update);
        restored += res.modifiedCount;
      }
    })
  );
  return restored;
}

/** Set `source` + `campaign` on specific leads (manual bulk assignment). */
export async function assignLeadsCampaign(
  targets: { category: CategorySlug; id: string }[],
  source: string,
  campaign: string | undefined,
  campaignKey: string | undefined
): Promise<number> {
  const now = new Date();
  let updated = 0;
  const byCategory = new Map<CategorySlug, ObjectId[]>();
  for (const t of targets) {
    if (!isValidCategory(t.category) || !ObjectId.isValid(t.id)) continue;
    const list = byCategory.get(t.category) ?? [];
    list.push(new ObjectId(t.id));
    byCategory.set(t.category, list);
  }

  await Promise.all(
    Array.from(byCategory.entries()).map(async ([category, ids]) => {
      const collection = await getLeadsCollection(category);
      const set: Record<string, unknown> = { source, updatedAt: now, attribution: { method: "manual", at: now } };
      const unset: Record<string, ""> = {};
      if (campaign) {
        set.campaign = campaign;
        set.campaignKey = campaignKey;
      } else {
        unset.campaign = "";
        unset.campaignKey = "";
      }
      const update: Record<string, unknown> = { $set: set };
      if (Object.keys(unset).length > 0) update.$unset = unset;
      const res = await collection.updateMany({ _id: { $in: ids } }, update);
      updated += res.modifiedCount;
    })
  );
  return updated;
}
