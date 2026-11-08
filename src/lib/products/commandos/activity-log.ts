import { panelNameMap } from "@/lib/platform/panels/store";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { ACTIVITY_LOG_MODULES, type ActivityLogModule, activityModuleLabel } from "@/lib/products/commandos/activity-log-shared";

export { ACTIVITY_LOG_MODULES, activityModuleLabel };
export type { ActivityLogModule };

/**
 * Cross-module raw activity/audit log for the Director. Every module keeps
 * its own append-only audit collection with a near-identical shape
 * (`{ actorId, actorEmail?, action, entity, entityId, entityLabel?, summary,
 * metadata?, createdAt }`) — PRMS (`prms_activity_logs`), PMS
 * (`pms_activity_logs`), Team Chat (`chat_activity_logs`), TMS
 * (`training_audit_logs`), HRMS (`hrms_audit_logs`), and Portal
 * (`portal_activity_logs`, narrower — no `actorEmail`/`metadata`). Unions them
 * with `$unionWith` (same technique as `crm-leads.ts`'s `searchAllLeads()`) so
 * one real, server-paginated timeline spans every module. CRM/LMS has no
 * audit collection at all — genuinely absent, not included.
 *
 * This is distinct from `src/lib/commandos/notifications.ts` (Phase 2): that's a
 * curated, user-facing notification feed; this is the raw event trail.
 */

/** LPMS names the entity `entityType` and stores its time as an ISO string; everything else already has the shared shape. */
const LPMS_PREP = [{ $addFields: { entity: "$entityType", createdAt: { $toDate: "$createdAt" } } }];

const SOURCES: { module: ActivityLogModule; collection: string; prep?: Record<string, unknown>[] }[] = [
  { module: "prms", collection: "prms_activity_logs" },
  { module: "pms", collection: "pms_activity_logs" },
  { module: "teamchat", collection: "chat_activity_logs" },
  { module: "tms", collection: "training_audit_logs" },
  { module: "hrms", collection: "hrms_audit_logs" },
  { module: "portal", collection: "portal_activity_logs" },
  { module: "ots", collection: "ots_activity_logs" },
  { module: "lpms", collection: "lpms_audit", prep: LPMS_PREP },
  { module: "sop", collection: "sop_activity_logs" },
  { module: "fms", collection: "fms_activity_logs" },
  { module: "smms", collection: "smms_activity_logs" },
  { module: "aibots", collection: "aibots_activity_logs" },
  { module: "cms", collection: "cms_audit" },
  { module: "dlms", collection: "dlms_activity_logs" },
  { module: "seo", collection: "seo_activity_logs" },
];

export interface AdminActivityRow {
  _id: string;
  module: ActivityLogModule;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string;
  entityLabel: string | null;
  summary: string | null;
  createdAt: string;
}

export interface SearchActivityLogOptions {
  search?: string;
  module?: ActivityLogModule;
  action?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface SearchActivityLogResult {
  items: AdminActivityRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildMatch(opts: SearchActivityLogOptions): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    match.$or = [{ actorEmail: rx }, { entityLabel: rx }, { entityId: rx }, { summary: rx }];
  }
  if (opts.action) match.action = opts.action;
  if (opts.dateFrom || opts.dateTo) {
    const range: Record<string, Date> = {};
    if (opts.dateFrom) range.$gte = opts.dateFrom;
    if (opts.dateTo) range.$lte = opts.dateTo;
    match.createdAt = range;
  }
  return match;
}

const PROJECT_STAGE = {
  $project: {
    _id: { $toString: "$_id" },
    module: 1,
    actorEmail: { $ifNull: ["$actorEmail", null] },
    action: 1,
    entity: 1,
    entityId: 1,
    entityLabel: { $ifNull: ["$entityLabel", null] },
    summary: { $ifNull: ["$summary", null] },
    createdAt: 1,
  },
};

export async function searchActivityLog(opts: SearchActivityLogOptions = {}): Promise<SearchActivityLogResult> {
  const db = await getDb();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 500);
  const match = buildMatch(opts);

  const sources = opts.module ? SOURCES.filter((s) => s.module === opts.module) : SOURCES;
  if (sources.length === 0) return { items: [], total: 0, page, pageSize, totalPages: 1 };

  const [first, ...rest] = sources;

  const pipeline: Record<string, unknown>[] = [
    ...(first.prep ?? []),
    { $match: match },
    { $addFields: { module: first.module } },
    PROJECT_STAGE,
    ...rest.map((s) => ({
      $unionWith: {
        coll: s.collection,
        pipeline: [...(s.prep ?? []), { $match: match }, { $addFields: { module: s.module } }, PROJECT_STAGE],
      },
    })),
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        total: [{ $count: "count" }],
      },
    },
  ];

  const [result] = await db.collection(first.collection).aggregate(pipeline).toArray();
  const rawItems = (result?.items ?? []) as Record<string, unknown>[];
  const total: number = result?.total?.[0]?.count ?? 0;

  const items: AdminActivityRow[] = rawItems.map((doc) => ({
    _id: String(doc._id),
    module: doc.module as ActivityLogModule,
    actorEmail: (doc.actorEmail as string) ?? null,
    action: (doc.action as string) ?? "",
    entity: (doc.entity as string) ?? "",
    entityId: (doc.entityId as string) ?? "",
    entityLabel: (doc.entityLabel as string) ?? null,
    summary: (doc.summary as string) ?? null,
    createdAt: new Date(doc.createdAt as Date).toISOString(),
  }));

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface ActivityExportRow {
  module: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string;
  entityLabel: string;
  summary: string;
  createdAt: string;
}

const EXPORT_LIMIT = 5000;

export async function exportActivityLog(opts: SearchActivityLogOptions = {}): Promise<ActivityExportRow[]> {
  const db = await getDb();
  const match = buildMatch(opts);
  const sources = opts.module ? SOURCES.filter((s) => s.module === opts.module) : SOURCES;
  if (sources.length === 0) return [];
  const [first, ...rest] = sources;

  const pipeline: Record<string, unknown>[] = [
    ...(first.prep ?? []),
    { $match: match },
    { $addFields: { module: first.module } },
    PROJECT_STAGE,
    ...rest.map((s) => ({
      $unionWith: {
        coll: s.collection,
        pipeline: [...(s.prep ?? []), { $match: match }, { $addFields: { module: s.module } }, PROJECT_STAGE],
      },
    })),
    { $sort: { createdAt: -1 } },
    { $limit: EXPORT_LIMIT },
  ];

  const rows = (await db.collection(first.collection).aggregate(pipeline).toArray()) as Record<string, unknown>[];
  const panelName = await panelNameMap();
  return rows.map((doc) => ({
    module: panelName(doc.module as string, activityModuleLabel(doc.module as string)),
    actorEmail: (doc.actorEmail as string) ?? "",
    action: (doc.action as string) ?? "",
    entity: (doc.entity as string) ?? "",
    entityId: (doc.entityId as string) ?? "",
    entityLabel: (doc.entityLabel as string) ?? "",
    summary: (doc.summary as string) ?? "",
    createdAt: new Date(doc.createdAt as Date).toISOString(),
  }));
}

/** Distinct action values across every source — powers the admin filter dropdown. */
export async function getActivityActions(): Promise<string[]> {
  const db = await getDb();
  const results = await Promise.all(SOURCES.map((s) => db.collection(s.collection).distinct("action")));
  return [...new Set(results.flat() as string[])].sort();
}
