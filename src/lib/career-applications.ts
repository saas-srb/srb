import { lmsEvents } from "@/lib/notify/triggers/lms";
import "server-only";
import { Collection, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ApplicationRecord } from "@/lib/career-application-validation";
import { CAREER_APPLICATION_STATUSES, DEFAULT_CAREER_APPLICATION_STATUS, type CareerApplicationStatus } from "@/lib/career-application-status";
import { deleteResumeFile, readResumeFile, saveResumeFile } from "@/lib/resume-storage";
import { escapeRegExp } from "@/lib/text-search";
import { staleThresholdDate } from "@/lib/stale-days";
import { previousPeriodRange, computeGrowthPercent } from "@/lib/period-comparison";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import type { Job } from "@/types/content";
import { getRuntimeRecords } from "@/lib/products/sitecraft-ai/collections/store";

export const APPLICATIONS_COLLECTION = "career_applications";
const POSITIONS_COLLECTION = "job_positions";

export interface ResumeMeta {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface JobPosition {
  _id: ObjectId;
  slug: string;
  title: string;
  category: string;
  isOpen: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CareerApplication {
  _id: ObjectId;
  positionId: ObjectId | null;
  positionSlug: string | null;
  positionTitle: string;
  name: string;
  email: string;
  phone: string;
  coverNote?: string;
  resume: ResumeMeta;
  status: CareerApplicationStatus;
  notes?: string;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GENERAL_APPLICATION_TITLE = "General Application";

async function getApplicationsCollection(): Promise<Collection<Omit<CareerApplication, "_id">>> {
  const db = await getDb();
  return db.collection<Omit<CareerApplication, "_id">>(APPLICATIONS_COLLECTION);
}

async function getPositionsCollection(): Promise<Collection<Omit<JobPosition, "_id">>> {
  const db = await getDb();
  return db.collection<Omit<JobPosition, "_id">>(POSITIONS_COLLECTION);
}

export async function uploadResume(file: File): Promise<ResumeMeta> {
  return saveResumeFile(file);
}

export function openResumeDownloadStream(storageKey: string) {
  return readResumeFile(storageKey);
}

export async function getOpenJobPositions(): Promise<Pick<JobPosition, "slug" | "title" | "category">[]> {
  const collection = await getPositionsCollection();
  const docs = await collection.find({ isOpen: true }).sort({ title: 1 }).toArray();
  return docs.map((d) => ({ slug: d.slug, title: d.title, category: d.category }));
}

/** Includes closed positions, used to populate the admin filter dropdown so
 * past applications to now-closed roles remain filterable. */
export async function getAllJobPositions(): Promise<Pick<JobPosition, "slug" | "title" | "category">[]> {
  const collection = await getPositionsCollection();
  const docs = await collection.find({}).sort({ title: 1 }).toArray();
  return docs.map((d) => ({ slug: d.slug, title: d.title, category: d.category }));
}

export async function getOpenJobPositionBySlug(slug: string): Promise<JobPosition | null> {
  const collection = await getPositionsCollection();
  return collection.findOne({ slug, isOpen: true });
}

interface BaseApplicationFilterOptions {
  search?: string;
  status?: CareerApplicationStatus;
  positionSlug?: string;
  /** The applied-to position's stated experience requirement (e.g. "1–4 Years") —
   * applicants never report their own experience, so this reflects the role, not the
   * candidate. Sourced from the jobs listing (CMS jobs collection), not stored per-application. */
  experience?: string;
  /** The applied-to position's stated location — same caveat as `experience`. */
  location?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

const NOT_SPECIFIED = "Not specified";

/** The live job listing — the CMS jobs collection (code data + published CMS jobs). */
async function jobList(): Promise<Job[]> {
  return getRuntimeRecords<Job>("jobs");
}

function experienceForSlug(jobs: Job[], slug: string | null | undefined): string {
  return jobs.find((j) => j.slug === slug)?.experience ?? NOT_SPECIFIED;
}

function locationForSlug(jobs: Job[], slug: string | null | undefined): string {
  return jobs.find((j) => j.slug === slug)?.location ?? NOT_SPECIFIED;
}

/** Distinct experience-requirement values across every listed position, for the
 * dashboard's Experience filter. */
export async function getExperienceOptions(): Promise<string[]> {
  const jobs = await jobList();
  return Array.from(new Set(jobs.map((j) => j.experience))).sort();
}

/** Distinct location values across every listed position, for the dashboard's
 * Location filter. */
export async function getLocationOptions(): Promise<string[]> {
  const jobs = await jobList();
  return Array.from(new Set(jobs.map((j) => j.location))).sort();
}

function buildApplicationFilter(opts: BaseApplicationFilterOptions, jobs: Job[]): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.search && opts.search.trim()) {
    const regex = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }
  if (opts.status) filter.status = opts.status;

  // Position/experience/location all narrow the same `positionSlug` field — intersect
  // them into one constraint rather than letting three separate assignments clobber
  // each other on the same key.
  let slugConstraint: string[] | null = null;
  if (opts.positionSlug) slugConstraint = [opts.positionSlug];
  if (opts.experience) {
    const matches = jobs.filter((j) => j.experience === opts.experience).map((j) => j.slug);
    slugConstraint = slugConstraint ? slugConstraint.filter((s) => matches.includes(s)) : matches;
  }
  if (opts.location) {
    const matches = jobs.filter((j) => j.location === opts.location).map((j) => j.slug);
    slugConstraint = slugConstraint ? slugConstraint.filter((s) => matches.includes(s)) : matches;
  }
  if (slugConstraint) {
    filter.positionSlug = slugConstraint.length === 1 ? slugConstraint[0] : { $in: slugConstraint };
  }

  if (opts.dateFrom || opts.dateTo) {
    const range: Record<string, Date> = {};
    if (opts.dateFrom) range.$gte = opts.dateFrom;
    if (opts.dateTo) range.$lte = opts.dateTo;
    filter.createdAt = range;
  }
  return filter;
}

export async function createApplication(
  data: ApplicationRecord & { resume: ResumeMeta }
): Promise<CareerApplication> {
  const collection = await getApplicationsCollection();
  const now = new Date();

  let positionId: ObjectId | null = null;
  let positionSlug: string | null = null;
  let positionTitle = GENERAL_APPLICATION_TITLE;

  if (data.positionSlug) {
    const position = await getOpenJobPositionBySlug(data.positionSlug);
    if (!position) {
      throw new Error("INVALID_POSITION");
    }
    positionId = position._id;
    positionSlug = position.slug;
    positionTitle = position.title;
  }

  const doc: Omit<CareerApplication, "_id"> = {
    positionId,
    positionSlug,
    positionTitle,
    name: data.name,
    email: data.email,
    phone: data.phone,
    coverNote: data.coverNote,
    resume: data.resume,
    status: DEFAULT_CAREER_APPLICATION_STATUS,
    source: data.source,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(doc);
  await lmsEvents.applicationReceived({ id: String(result.insertedId), name: doc.name, positionTitle: doc.positionTitle });
  return { _id: result.insertedId, ...doc };
}

export interface SearchApplicationsOptions extends BaseApplicationFilterOptions {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "name";
  sortDir?: "asc" | "desc";
}

export async function searchApplications(opts: SearchApplicationsOptions = {}) {
  const collection = await getApplicationsCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);

  const filter = buildApplicationFilter(opts, await jobList());
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

export interface ExportApplicationsOptions extends BaseApplicationFilterOptions {
  sortBy?: "createdAt" | "name";
  sortDir?: "asc" | "desc";
  ids?: string[];
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportApplications(opts: ExportApplicationsOptions = {}): Promise<CareerApplication[]> {
  const collection = await getApplicationsCollection();

  const filter =
    opts.ids && opts.ids.length > 0
      ? { _id: { $in: opts.ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } }
      : buildApplicationFilter(opts, await jobList());

  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const docs = await collection
    .find(filter)
    .sort({ [sortField]: sortDir })
    .limit(EXPORT_ROW_LIMIT)
    .toArray();

  return docs.map((doc) => ({ ...doc })) as CareerApplication[];
}

export async function getApplication(id: string): Promise<CareerApplication | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await getApplicationsCollection();
  return collection.findOne({ _id: new ObjectId(id) });
}

export async function updateApplication(id: string, data: Partial<ApplicationRecord>) {
  if (!ObjectId.isValid(id)) return null;
  const collection = await getApplicationsCollection();
  const update = { ...data, updatedAt: new Date() };
  return collection.findOneAndUpdate({ _id: new ObjectId(id) }, { $set: update }, { returnDocument: "after" });
}

export async function deleteApplication(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await getApplicationsCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return false;

  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 1 && doc.resume?.storageKey) {
    await deleteResumeFile(doc.resume.storageKey);
  }
  return result.deletedCount === 1;
}

export interface CareerDashboardStats {
  total: number;
  previousPeriodTotal: number | null;
  growthPercent: number | null;
  byStatus: Record<string, number>;
  /** Growth % per status vs the previous period (null when there's no comparable prior period). */
  growthByStatus: Record<string, number | null>;
  /** hired / total, 0-100, rounded to 1 decimal. */
  hiringConversionRate: number;
  topPositions: { positionTitle: string; count: number }[];
  /** Positions ranked by actual hires — ignores any status filter, since this is
   * inherently about hires regardless of what the admin is currently viewing. */
  topHiringPositions: { positionTitle: string; count: number }[];
  timeSeries: { date: string; count: number }[];
  previousTimeSeries: { date: string; count: number }[];
  /** Hires per calendar month — always month-bucketed regardless of `granularity`. */
  hiredTimeSeries: { date: string; count: number }[];
  /** Applied → Review → Shortlisted → Interview → Hired, cumulative ("reached at least
   * this stage"); rejected applications are reported separately since we only know
   * their current status, not how far they got before being rejected. */
  funnel: { stage: string; count: number }[];
  /** Bucketed by the APPLIED-TO POSITION's stated requirement, not the candidate's own
   * experience (never collected) — see `BaseApplicationFilterOptions.experience`. */
  experienceDistribution: { label: string; count: number }[];
  /** Bucketed by the applied-to position's stated location — same caveat. */
  locationDistribution: { label: string; count: number }[];
  recent: CareerApplication[];
}

function buildHiringFunnel(byStatus: Record<string, number>, total: number): { stage: string; count: number }[] {
  const reachedReview =
    (byStatus.under_review ?? 0) + (byStatus.shortlisted ?? 0) + (byStatus.interview_scheduled ?? 0) + (byStatus.selected ?? 0) + (byStatus.hired ?? 0);
  const reachedShortlist = (byStatus.shortlisted ?? 0) + (byStatus.interview_scheduled ?? 0) + (byStatus.selected ?? 0) + (byStatus.hired ?? 0);
  const reachedInterview = (byStatus.interview_scheduled ?? 0) + (byStatus.selected ?? 0) + (byStatus.hired ?? 0);
  return [
    { stage: "Applied", count: total },
    { stage: "Review", count: reachedReview },
    { stage: "Shortlisted", count: reachedShortlist },
    { stage: "Interview", count: reachedInterview },
    { stage: "Hired", count: byStatus.hired ?? 0 },
  ];
}

export async function getCareerDashboardStats(
  filters: BaseApplicationFilterOptions & { granularity?: DashboardGranularity } = {}
): Promise<CareerDashboardStats> {
  const collection = await getApplicationsCollection();
  const jobs = await jobList();
  const filter = buildApplicationFilter(filters, jobs);
  const granularity = filters.granularity ?? "day";
  const dateFormat = dateFormatFor(granularity);
  const prevRange = previousPeriodRange(filters.dateFrom, filters.dateTo);
  const prevFilter = prevRange ? buildApplicationFilter({ ...filters, dateFrom: prevRange.from, dateTo: prevRange.to }, jobs) : null;

  // "Top hiring positions" is inherently about hires, not whatever status filter is
  // active — reuse every other filter but force status to "hired".
  const hiringFilter = { ...buildApplicationFilter({ ...filters, status: undefined }, jobs), status: "hired" };

  const [total, statusAgg, positionAgg, hiringPositionAgg, positionSlugAgg, byBucketAgg, hiredByMonthAgg, recent, prevTotal, prevStatusAgg, prevByBucketAgg] =
    await Promise.all([
      collection.countDocuments(filter),
      collection.aggregate<{ _id: string; count: number }>([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
      collection
        .aggregate<{ _id: string; count: number }>([
          { $match: filter },
          { $group: { _id: "$positionTitle", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ])
        .toArray(),
      collection
        .aggregate<{ _id: string; count: number }>([
          { $match: hiringFilter },
          { $group: { _id: "$positionTitle", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ])
        .toArray(),
      collection.aggregate<{ _id: string | null; count: number }>([{ $match: filter }, { $group: { _id: "$positionSlug", count: { $sum: 1 } } }]).toArray(),
      collection
        .aggregate<{ _id: string; count: number }>([
          { $match: filter },
          { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, count: { $sum: 1 } } },
        ])
        .toArray(),
      collection
        .aggregate<{ _id: string; count: number }>([
          { $match: hiringFilter },
          { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$updatedAt" } }, count: { $sum: 1 } } },
        ])
        .toArray(),
      collection.find(filter).sort({ createdAt: -1 }).limit(8).toArray(),
      prevFilter ? collection.countDocuments(prevFilter) : Promise.resolve(null),
      prevFilter
        ? collection.aggregate<{ _id: string; count: number }>([{ $match: prevFilter }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray()
        : Promise.resolve(null),
      prevFilter
        ? collection
            .aggregate<{ _id: string; count: number }>([
              { $match: prevFilter },
              { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, count: { $sum: 1 } } },
            ])
            .toArray()
        : Promise.resolve(null),
    ]);

  const byStatus: Record<string, number> = {};
  for (const s of CAREER_APPLICATION_STATUSES) byStatus[s.value] = 0;
  for (const row of statusAgg) byStatus[row._id] = row.count;

  const growthByStatus: Record<string, number | null> = {};
  if (prevStatusAgg) {
    const prevByStatus: Record<string, number> = {};
    for (const s of CAREER_APPLICATION_STATUSES) prevByStatus[s.value] = 0;
    for (const row of prevStatusAgg) prevByStatus[row._id] = row.count;
    for (const s of CAREER_APPLICATION_STATUSES) growthByStatus[s.value] = computeGrowthPercent(byStatus[s.value], prevByStatus[s.value]);
  } else {
    for (const s of CAREER_APPLICATION_STATUSES) growthByStatus[s.value] = null;
  }

  const topPositions = positionAgg.map((row) => ({ positionTitle: row._id, count: row.count }));
  const topHiringPositions = hiringPositionAgg.map((row) => ({ positionTitle: row._id, count: row.count }));

  const experienceMap = new Map<string, number>();
  const locationMap = new Map<string, number>();
  for (const row of positionSlugAgg) {
    const expLabel = experienceForSlug(jobs, row._id);
    const locLabel = locationForSlug(jobs, row._id);
    experienceMap.set(expLabel, (experienceMap.get(expLabel) ?? 0) + row.count);
    locationMap.set(locLabel, (locationMap.get(locLabel) ?? 0) + row.count);
  }
  const experienceDistribution = Array.from(experienceMap, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const locationDistribution = Array.from(locationMap, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  const timeSeries = byBucketAgg.map((d) => ({ date: d._id, count: d.count })).sort((a, b) => a.date.localeCompare(b.date));
  const previousTimeSeries = (prevByBucketAgg ?? []).map((d) => ({ date: d._id, count: d.count })).sort((a, b) => a.date.localeCompare(b.date));
  const hiredTimeSeries = hiredByMonthAgg.map((d) => ({ date: d._id, count: d.count })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    total,
    previousPeriodTotal: prevTotal,
    growthPercent: computeGrowthPercent(total, prevTotal),
    byStatus,
    growthByStatus,
    // Whole percent — KpiCard's count-up animation rounds to an integer, so a decimal
    // here would visibly truncate (e.g. 33.3% landing on "33").
    hiringConversionRate: total > 0 ? Math.round(((byStatus.hired ?? 0) / total) * 100) : 0,
    topPositions,
    topHiringPositions,
    timeSeries,
    previousTimeSeries,
    hiredTimeSeries,
    funnel: buildHiringFunnel(byStatus, total),
    experienceDistribution,
    locationDistribution,
    recent: recent as CareerApplication[],
  };
}

export interface StaleApplicationsSummary {
  count: number;
  items: CareerApplication[];
}

const OPEN_APPLICATION_STATUSES = ["new", "under_review", "shortlisted", "interview_scheduled", "selected"] as const;

/** Global, unfiltered — mirrors `getStaleLeadsSummary` in `leads.ts` for the topbar
 * notifications bell: applications still in an open status past STALE_DAYS. */
export async function getStaleApplicationsSummary(): Promise<StaleApplicationsSummary> {
  const collection = await getApplicationsCollection();
  const staleThreshold = staleThresholdDate();
  const filter = { status: { $in: OPEN_APPLICATION_STATUSES }, createdAt: { $lte: staleThreshold } };

  const [result] = await collection
    .aggregate<{ count: { count: number }[]; items: CareerApplication[] }>([
      { $match: filter },
      { $facet: { count: [{ $count: "count" }], items: [{ $sort: { createdAt: 1 } }, { $limit: 10 }] } },
    ])
    .toArray();

  return { count: result?.count?.[0]?.count ?? 0, items: result?.items ?? [] };
}

export interface RecentApplicationsSummary {
  count: number;
  items: CareerApplication[];
}

/** Global, unfiltered — mirrors `getRecentLeadsSummary` for the topbar notifications
 * bell's "Recent Activity" section: applications received in the last `days` days. */
export async function getRecentApplicationsSummary(days = 2): Promise<RecentApplicationsSummary> {
  const collection = await getApplicationsCollection();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const filter = { createdAt: { $gte: since } };

  const [result] = await collection
    .aggregate<{ count: { count: number }[]; items: CareerApplication[] }>([
      { $match: filter },
      { $facet: { count: [{ $count: "count" }], items: [{ $sort: { createdAt: -1 } }, { $limit: 10 }] } },
    ])
    .toArray();

  return { count: result?.count?.[0]?.count ?? 0, items: result?.items ?? [] };
}
