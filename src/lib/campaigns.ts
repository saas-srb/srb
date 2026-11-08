import "server-only";
import { Document, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import { computeGrowthPercent } from "@/lib/period-comparison";
import { campaignKeyFor, type CampaignPlatform } from "@/lib/utm";
import {
  isValidPlatform,
  type CampaignDeliveryStatus,
  type ImportKind,
} from "@/lib/campaign-platforms";
import {
  parseCsv,
  validateLeadCsv,
  validateMetricCsv,
  type CanonicalMetricRow,
} from "@/lib/campaign-csv";
import {
  aggregateAttributedLeads,
  attributeLeadsByContact,
  revertLeadAttribution,
  type AttributedCampaignRollup,
  type LeadAttributionRevert,
} from "@/lib/leads";

/* -------------------------------------------------------------------------- */
/*  Documents                                                                  */
/* -------------------------------------------------------------------------- */

export interface CampaignDoc {
  _id: ObjectId;
  platform: CampaignPlatform;
  name: string;
  nameKey: string;
  externalId?: string;
  status: CampaignDeliveryStatus;
  objective?: string;
  firstReportDate?: Date;
  lastReportDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignMetricDoc {
  _id: ObjectId;
  campaignId: ObjectId;
  platform: CampaignPlatform;
  nameKey: string;
  date: Date;
  breakdown: string;
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  linkClicks?: number;
  leadsReported?: number;
  importId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignImportDoc {
  _id: ObjectId;
  adminId: ObjectId;
  platform: CampaignPlatform;
  kind: ImportKind;
  filename: string;
  fileSize: number;
  status: "completed" | "completed_with_errors" | "failed" | "reverted";
  rowsTotal: number;
  rowsImported: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsError: number;
  errors: { row: number; message: string }[];
  currency?: string;
  // performance undo
  undoable: boolean;
  insertedMetricIds?: ObjectId[];
  metricSnapshots?: { id: string; previous: Partial<CampaignMetricDoc> }[];
  createdCampaignIds?: ObjectId[];
  // leads undo
  leadsMatched?: number;
  leadsUnmatched?: number;
  unmatchedSample?: { campaign: string; email?: string; phone?: string }[];
  leadReverts?: LeadAttributionRevert[];
  createdAt: Date;
}

export type ImportResult = Pick<
  CampaignImportDoc,
  | "platform"
  | "kind"
  | "filename"
  | "status"
  | "rowsTotal"
  | "rowsImported"
  | "rowsUpdated"
  | "rowsSkipped"
  | "rowsError"
  | "errors"
  | "currency"
  | "leadsMatched"
  | "leadsUnmatched"
  | "unmatchedSample"
> & { importId: string };

const ERROR_CAP = 100;
const SNAPSHOT_CAP = 5000;
const UNMATCHED_SAMPLE_CAP = 25;

/* -------------------------------------------------------------------------- */
/*  Collections + indexes                                                      */
/* -------------------------------------------------------------------------- */

let indexesEnsured = false;

async function collections() {
  const db = await getDb();
  const campaigns = db.collection<Omit<CampaignDoc, "_id">>("campaigns");
  const metrics = db.collection<Omit<CampaignMetricDoc, "_id">>("campaign_metrics");
  const imports = db.collection<Omit<CampaignImportDoc, "_id">>("campaign_imports");

  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      campaigns.createIndex({ platform: 1, nameKey: 1 }, { unique: true }).catch(() => {}),
      metrics.createIndex({ campaignId: 1, date: 1, breakdown: 1 }, { unique: true }).catch(() => {}),
      metrics.createIndex({ platform: 1, date: 1 }).catch(() => {}),
      metrics.createIndex({ nameKey: 1 }).catch(() => {}),
      imports.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return { campaigns, metrics, imports };
}

export async function ensureCampaignIndexes() {
  await collections();
}

/* -------------------------------------------------------------------------- */
/*  Import: performance report                                                 */
/* -------------------------------------------------------------------------- */

export async function importPerformanceCsv(
  adminId: string,
  platform: CampaignPlatform,
  filename: string,
  fileSize: number,
  text: string
): Promise<ImportResult> {
  const { campaigns, metrics, imports } = await collections();
  const parsed = parseCsv(text);
  const result = validateMetricCsv(platform, parsed);

  const importId = new ObjectId();
  const now = new Date();
  let rowsImported = 0;
  let rowsUpdated = 0;
  const insertedMetricIds: ObjectId[] = [];
  const createdCampaignIds: ObjectId[] = [];
  const metricSnapshots: { id: string; previous: Partial<CampaignMetricDoc> }[] = [];

  // group valid rows by campaign so we upsert each campaign once
  const byCampaign = new Map<string, CanonicalMetricRow[]>();
  for (const row of result.valid) {
    (byCampaign.get(row.campaignKey) ?? byCampaign.set(row.campaignKey, []).get(row.campaignKey)!).push(row);
  }

  for (const [nameKey, rows] of byCampaign) {
    const sample = rows[0];
    const dates = rows.map((r) => r.date.getTime());
    const existing = await campaigns.findOne({ platform, nameKey });
    const campaignSet: Record<string, unknown> = {
      name: sample.campaignName,
      status: sample.status,
      updatedAt: now,
      lastReportDate: new Date(Math.max(...dates)),
    };
    if (sample.externalId) campaignSet.externalId = sample.externalId;
    if (sample.objective) campaignSet.objective = sample.objective;

    const upserted = await campaigns.findOneAndUpdate(
      { platform, nameKey },
      {
        $set: campaignSet,
        $min: { firstReportDate: new Date(Math.min(...dates)) },
        $setOnInsert: { platform, nameKey, createdAt: now },
      },
      { upsert: true, returnDocument: "after" }
    );
    const campaignId = upserted!._id;
    if (!existing) createdCampaignIds.push(campaignId);

    for (const row of rows) {
      const key = { campaignId, date: row.date, breakdown: row.breakdown };
      const prev = await metrics.findOne(key);
      const doc = {
        campaignId,
        platform,
        nameKey,
        date: row.date,
        breakdown: row.breakdown,
        spend: row.spend,
        currency: row.currency,
        impressions: row.impressions,
        clicks: row.clicks,
        linkClicks: row.linkClicks,
        leadsReported: row.leadsReported,
        importId,
        updatedAt: now,
      };
      if (prev) {
        rowsUpdated += 1;
        if (metricSnapshots.length < SNAPSHOT_CAP) {
          metricSnapshots.push({
            id: String(prev._id),
            previous: {
              spend: prev.spend, currency: prev.currency, impressions: prev.impressions,
              clicks: prev.clicks, linkClicks: prev.linkClicks, leadsReported: prev.leadsReported,
              importId: prev.importId,
            },
          });
        }
        await metrics.updateOne({ _id: prev._id }, { $set: doc });
      } else {
        rowsImported += 1;
        const ins = await metrics.insertOne({ ...doc, createdAt: now });
        insertedMetricIds.push(ins.insertedId);
      }
    }
  }

  const rowsError = result.errors.length;
  const undoable = metricSnapshots.length < SNAPSHOT_CAP;
  const status: CampaignImportDoc["status"] =
    result.valid.length === 0 ? "failed" : rowsError > 0 ? "completed_with_errors" : "completed";

  await imports.insertOne({
    _id: importId,
    adminId: new ObjectId(adminId),
    platform,
    kind: "performance",
    filename,
    fileSize,
    status,
    rowsTotal: result.rowsTotal,
    rowsImported,
    rowsUpdated,
    rowsSkipped: rowsError,
    rowsError,
    errors: result.errors.slice(0, ERROR_CAP),
    currency: result.currency,
    undoable,
    insertedMetricIds,
    metricSnapshots: undoable ? metricSnapshots : [],
    createdCampaignIds,
    createdAt: now,
  } as CampaignImportDoc);

  return {
    importId: String(importId),
    platform, kind: "performance", filename, status,
    rowsTotal: result.rowsTotal, rowsImported, rowsUpdated, rowsSkipped: rowsError, rowsError,
    errors: result.errors.slice(0, ERROR_CAP), currency: result.currency,
  };
}

/* -------------------------------------------------------------------------- */
/*  Import: lead list                                                          */
/* -------------------------------------------------------------------------- */

export async function importLeadListCsv(
  adminId: string,
  platform: CampaignPlatform,
  filename: string,
  fileSize: number,
  text: string
): Promise<ImportResult> {
  const { campaigns, imports } = await collections();
  const parsed = parseCsv(text);
  const result = validateLeadCsv(platform, parsed);

  const importId = new ObjectId();
  const now = new Date();
  const createdCampaignIds: ObjectId[] = [];

  // register every campaign named in the file so it shows up even without perf data
  const campaignNames = new Map<string, string>();
  for (const row of result.valid) campaignNames.set(row.campaignKey, row.campaignName);
  for (const [nameKey, name] of campaignNames) {
    const existing = await campaigns.findOne({ platform, nameKey });
    await campaigns.updateOne(
      { platform, nameKey },
      { $set: { name, updatedAt: now }, $setOnInsert: { platform, nameKey, status: "unknown", createdAt: now } },
      { upsert: true }
    );
    if (!existing) {
      const created = await campaigns.findOne({ platform, nameKey });
      if (created) createdCampaignIds.push(created._id);
    }
  }

  const attribution = await attributeLeadsByContact(result.valid, platform);
  const unmatchedSample = attribution.unmatchedSample.slice(0, UNMATCHED_SAMPLE_CAP);

  const rowsError = result.errors.length;
  const status: CampaignImportDoc["status"] =
    result.valid.length === 0 ? "failed" : rowsError > 0 ? "completed_with_errors" : "completed";

  await imports.insertOne({
    _id: importId,
    adminId: new ObjectId(adminId),
    platform,
    kind: "leads",
    filename,
    fileSize,
    status,
    rowsTotal: result.rowsTotal,
    rowsImported: attribution.rowsMatched,
    rowsUpdated: 0,
    rowsSkipped: rowsError,
    rowsError,
    errors: result.errors.slice(0, ERROR_CAP),
    undoable: true,
    createdCampaignIds,
    leadsMatched: attribution.rowsMatched,
    leadsUnmatched: attribution.rowsUnmatched,
    unmatchedSample: attribution.rowsUnmatched > 0 ? unmatchedSample : [],
    leadReverts: attribution.reverts,
    createdAt: now,
  } as CampaignImportDoc);

  return {
    importId: String(importId),
    platform, kind: "leads", filename, status,
    rowsTotal: result.rowsTotal,
    rowsImported: attribution.rowsMatched,
    rowsUpdated: 0,
    rowsSkipped: rowsError,
    rowsError,
    errors: result.errors.slice(0, ERROR_CAP),
    leadsMatched: attribution.rowsMatched,
    leadsUnmatched: attribution.rowsUnmatched,
    unmatchedSample: attribution.rowsUnmatched > 0 ? unmatchedSample : [],
  };
}

/* -------------------------------------------------------------------------- */
/*  Undo                                                                       */
/* -------------------------------------------------------------------------- */

export async function undoImport(importId: string): Promise<{ error?: string; ok?: true }> {
  if (!ObjectId.isValid(importId)) return { error: "Not found." };
  const { campaigns, metrics, imports } = await collections();
  const imp = (await imports.findOne({ _id: new ObjectId(importId) })) as CampaignImportDoc | null;
  if (!imp) return { error: "Not found." };
  if (imp.status === "reverted") return { error: "This import was already undone." };

  if (imp.kind === "performance") {
    if (!imp.undoable) return { error: "This import is too large to undo automatically." };
    if (imp.insertedMetricIds?.length) {
      await metrics.deleteMany({ _id: { $in: imp.insertedMetricIds } });
    }
    for (const snap of imp.metricSnapshots ?? []) {
      await metrics.updateOne({ _id: new ObjectId(snap.id) }, { $set: snap.previous });
    }
  } else {
    await revertLeadAttribution(imp.leadReverts ?? []);
  }

  // drop campaigns that this import created and that are now empty
  for (const cid of imp.createdCampaignIds ?? []) {
    const stillHasMetrics = await metrics.countDocuments({ campaignId: cid }, { limit: 1 });
    if (!stillHasMetrics) await campaigns.deleteOne({ _id: cid });
  }

  await imports.updateOne({ _id: imp._id }, { $set: { status: "reverted" } });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface CampaignImportSummary {
  id: string;
  platform: CampaignPlatform;
  kind: ImportKind;
  filename: string;
  status: CampaignImportDoc["status"];
  rowsImported: number;
  rowsUpdated: number;
  rowsError: number;
  errors: { row: number; message: string }[];
  leadsMatched?: number;
  leadsUnmatched?: number;
  undoable: boolean;
  createdAt: string;
}

export async function listImports(limit = 10): Promise<CampaignImportSummary[]> {
  const { imports } = await collections();
  const docs = await imports.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  return (docs as CampaignImportDoc[]).map((d) => ({
    id: String(d._id),
    platform: d.platform,
    kind: d.kind,
    filename: d.filename,
    status: d.status,
    rowsImported: d.rowsImported,
    rowsUpdated: d.rowsUpdated,
    rowsError: d.rowsError,
    errors: d.errors ?? [],
    leadsMatched: d.leadsMatched,
    leadsUnmatched: d.leadsUnmatched,
    undoable: d.undoable && d.status !== "reverted",
    createdAt: d.createdAt.toISOString(),
  }));
}

export interface CampaignFilterInput {
  platform?: CampaignPlatform;
  status?: CampaignDeliveryStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface CampaignOption {
  key: string;
  name: string;
  platform: CampaignPlatform;
  status: CampaignDeliveryStatus;
}

export async function listCampaigns(filter: CampaignFilterInput = {}): Promise<CampaignOption[]> {
  const { campaigns } = await collections();
  const q: Record<string, unknown> = {};
  if (filter.platform) q.platform = filter.platform;
  if (filter.status) q.status = filter.status;
  if (filter.dateFrom || filter.dateTo) {
    // campaigns whose reporting window overlaps the range
    if (filter.dateTo) q.firstReportDate = { $lte: filter.dateTo };
    if (filter.dateFrom) q.lastReportDate = { $gte: filter.dateFrom };
  }
  const docs = await campaigns.find(q).sort({ name: 1 }).toArray();
  return (docs as CampaignDoc[]).map((d) => ({ key: d.nameKey, name: d.name, platform: d.platform, status: d.status }));
}

/* -------------------------------------------------------------------------- */
/*  Analytics                                                                  */
/* -------------------------------------------------------------------------- */

export interface CampaignRow {
  key: string;
  name: string;
  platform: CampaignPlatform;
  status: CampaignDeliveryStatus;
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  linkClicks: number;
  ctr: number | null;
  cpc: number | null;
  leadsReported: number;
  leadsAttributed: number;
  cpl: number | null;
  qualified: number;
  cpql: number | null;
  completed: number;
  cac: number | null;
  revenue: number;
  roas: number | null;
  roiPercent: number | null;
}

export interface CampaignAnalytics {
  currency: string;
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    leadsReported: number;
    leadsAttributed: number;
    qualified: number;
    completed: number;
    revenue: number;
    cpl: number | null;
    cpql: number | null;
    cac: number | null;
    roas: number | null;
    roiPercent: number | null;
    leadsGrowthPercent: number | null;
  };
  campaigns: CampaignRow[];
  byPlatform: { platform: CampaignPlatform; spend: number; leadsAttributed: number; revenue: number }[];
  timeSeries: { date: string; spend: number; leads: number }[];
  hasData: boolean;
}

export interface CampaignAnalyticsFilters {
  platform?: CampaignPlatform;
  source?: string;
  campaignKey?: string;
  status?: CampaignDeliveryStatus;
  dateFrom?: Date;
  dateTo?: Date;
  granularity?: DashboardGranularity;
}

const ratio = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 100) / 100 : null);

interface MetricAgg extends Document {
  _id: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  leadsReported: number;
  currencies: string[];
}

export async function getCampaignAnalytics(filters: CampaignAnalyticsFilters = {}): Promise<CampaignAnalytics> {
  await ensureCampaignIndexes();
  const { campaigns, metrics } = await collections();
  const granularity = filters.granularity ?? "day";
  const dateFormat = dateFormatFor(granularity);

  // resolve the campaign set in scope
  const campaignQuery: Record<string, unknown> = {};
  if (filters.platform) campaignQuery.platform = filters.platform;
  if (filters.status) campaignQuery.status = filters.status;
  if (filters.campaignKey) campaignQuery.nameKey = filters.campaignKey;
  const scopedCampaigns = (await campaigns.find(campaignQuery).toArray()) as CampaignDoc[];
  const campaignIds = scopedCampaigns.map((c) => c._id);
  const scopedKeys = scopedCampaigns.map((c) => c.nameKey);

  if (scopedCampaigns.length === 0) {
    return {
      currency: "INR",
      totals: {
        spend: 0, impressions: 0, clicks: 0, leadsReported: 0, leadsAttributed: 0,
        qualified: 0, completed: 0, revenue: 0,
        cpl: null, cpql: null, cac: null, roas: null, roiPercent: null, leadsGrowthPercent: null,
      },
      campaigns: [],
      byPlatform: [],
      timeSeries: [],
      hasData: false,
    };
  }

  const metricMatch: Record<string, unknown> = { campaignId: { $in: campaignIds } };
  if (filters.dateFrom || filters.dateTo) {
    const range: Record<string, Date> = {};
    if (filters.dateFrom) range.$gte = filters.dateFrom;
    if (filters.dateTo) range.$lte = filters.dateTo;
    metricMatch.date = range;
  }

  const [perCampaignMetrics, metricSeries] = await Promise.all([
    metrics.aggregate<MetricAgg>([
      { $match: metricMatch },
      {
        $group: {
          _id: "$campaignId",
          spend: { $sum: "$spend" },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          linkClicks: { $sum: { $ifNull: ["$linkClicks", 0] } },
          leadsReported: { $sum: { $ifNull: ["$leadsReported", 0] } },
          currencies: { $addToSet: "$currency" },
        },
      },
    ]).toArray(),
    metrics.aggregate<{ _id: string; spend: number }>([
      { $match: metricMatch },
      { $group: { _id: { $dateToString: { format: dateFormat, date: "$date" } }, spend: { $sum: "$spend" } } },
    ]).toArray(),
  ]);

  // attributed leads for exactly the campaigns in scope (join by campaignKey)
  const leadStats = await aggregateAttributedLeads({
    campaignKeys: scopedKeys,
    sourceFilter: filters.source,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    granularity,
  });

  const metricByCampaign = new Map(perCampaignMetrics.map((m) => [String(m._id), m]));
  const currency = perCampaignMetrics.flatMap((m) => m.currencies)[0] ?? "INR";

  const rows: CampaignRow[] = scopedCampaigns.map((c) => {
    const m = metricByCampaign.get(String(c._id));
    const lead: AttributedCampaignRollup = leadStats.byCampaignKey[c.nameKey] ?? { total: 0, qualified: 0, completed: 0, revenue: 0 };
    const spend = round2(m?.spend ?? 0);
    const impressions = m?.impressions ?? 0;
    const clicks = m?.clicks ?? 0;
    const revenue = round2(lead.revenue);
    return {
      key: c.nameKey,
      name: c.name,
      platform: c.platform,
      status: c.status,
      spend,
      currency,
      impressions,
      clicks,
      linkClicks: m?.linkClicks ?? 0,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null,
      cpc: ratio(spend, clicks),
      leadsReported: m?.leadsReported ?? 0,
      leadsAttributed: lead.total,
      cpl: ratio(spend, lead.total),
      qualified: lead.qualified,
      cpql: ratio(spend, lead.qualified),
      completed: lead.completed,
      cac: ratio(spend, lead.completed),
      revenue,
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
      roiPercent: spend > 0 ? Math.round(((revenue - spend) / spend) * 1000) / 10 : null,
    };
  });

  // keep only campaigns that have either spend or attributed leads in range
  const activeRows = rows.filter((r) => r.spend > 0 || r.leadsAttributed > 0 || r.leadsReported > 0);
  activeRows.sort((a, b) => b.spend - a.spend);

  const totalsSpend = round2(activeRows.reduce((s, r) => s + r.spend, 0));
  const totalsRevenue = round2(activeRows.reduce((s, r) => s + r.revenue, 0));
  const totalsLeads = activeRows.reduce((s, r) => s + r.leadsAttributed, 0);
  const totalsQualified = activeRows.reduce((s, r) => s + r.qualified, 0);
  const totalsCompleted = activeRows.reduce((s, r) => s + r.completed, 0);

  const byPlatformMap = new Map<CampaignPlatform, { spend: number; leadsAttributed: number; revenue: number }>();
  for (const r of activeRows) {
    const p = byPlatformMap.get(r.platform) ?? { spend: 0, leadsAttributed: 0, revenue: 0 };
    p.spend = round2(p.spend + r.spend);
    p.leadsAttributed += r.leadsAttributed;
    p.revenue = round2(p.revenue + r.revenue);
    byPlatformMap.set(r.platform, p);
  }

  // merge spend + lead time series
  const seriesMap = new Map<string, { spend: number; leads: number }>();
  for (const s of metricSeries) seriesMap.set(s._id, { spend: round2(s.spend), leads: 0 });
  for (const s of leadStats.timeSeries) {
    const e = seriesMap.get(s.date) ?? { spend: 0, leads: 0 };
    e.leads = s.count;
    seriesMap.set(s.date, e);
  }
  const timeSeries = Array.from(seriesMap.entries())
    .map(([date, v]) => ({ date, spend: v.spend, leads: v.leads }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    currency,
    totals: {
      spend: totalsSpend,
      impressions: activeRows.reduce((s, r) => s + r.impressions, 0),
      clicks: activeRows.reduce((s, r) => s + r.clicks, 0),
      leadsReported: activeRows.reduce((s, r) => s + r.leadsReported, 0),
      leadsAttributed: totalsLeads,
      qualified: totalsQualified,
      completed: totalsCompleted,
      revenue: totalsRevenue,
      cpl: ratio(totalsSpend, totalsLeads),
      cpql: ratio(totalsSpend, totalsQualified),
      cac: ratio(totalsSpend, totalsCompleted),
      roas: totalsSpend > 0 ? Math.round((totalsRevenue / totalsSpend) * 100) / 100 : null,
      roiPercent: totalsSpend > 0 ? Math.round(((totalsRevenue - totalsSpend) / totalsSpend) * 1000) / 10 : null,
      leadsGrowthPercent: computeGrowthPercent(leadStats.total, leadStats.previousTotal),
    },
    campaigns: activeRows,
    byPlatform: Array.from(byPlatformMap.entries()).map(([platform, v]) => ({ platform, ...v })),
    timeSeries,
    hasData: activeRows.length > 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* re-exports used by routes / actions */
export { isValidPlatform, campaignKeyFor };
export type { CanonicalMetricRow };
