import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { getProject } from "@/lib/products/sprintos/projects";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { externalUsers } from "@/lib/portal-auth";
import { deleteDocument as deletePmsDocument } from "@/lib/products/sprintos/documents";
import { deleteDocument as deleteHrmsDocument } from "@/lib/products/talentos/documents";
import { deletePortalDocument } from "@/lib/products/clientos/documents";
import { DOCUMENT_MODULES, type DocumentModule, documentModuleLabel } from "@/lib/products/commandos/documents-shared";

export { DOCUMENT_MODULES, documentModuleLabel };
export type { DocumentModule };

/**
 * Cross-module document listing for the Director. Three real, separate
 * per-owner document stores exist — `pms_documents` (per-project),
 * `hrms_employee_documents` (per-employee), `portal_documents` (staff files
 * explicitly shared with a portal login) — none has a cross-owner admin
 * search today. Unions them with `$unionWith` (same technique as
 * `activity-log.ts`), then enriches with the owning project/employee/clientos
 * account's display name via a small batch lookup (not stored on the
 * document itself). Only current (non-superseded) versions are shown — prior
 * versions are an audit detail of the owning module, not a separate record
 * here. PRMS has no distinct document collection (contracts just embed one
 * file on the contract doc) and Career/HR résumés live embedded on
 * `career_applications`, not as standalone rows — both correctly excluded.
 */

const SOURCES: { module: DocumentModule; collection: string }[] = [
  { module: "pms", collection: "pms_documents" },
  { module: "hrms", collection: "hrms_employee_documents" },
  { module: "portal", collection: "portal_documents" },
];

export interface AdminDocumentRow {
  _id: string;
  module: DocumentModule;
  title: string;
  filename: string;
  category: string;
  size: number;
  ownerId: string;
  ownerLabel: string;
  createdAt: string;
}

export interface SearchDocumentsOptions {
  search?: string;
  module?: DocumentModule;
  page?: number;
  pageSize?: number;
}

export interface SearchDocumentsResult {
  items: AdminDocumentRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildMatch(opts: SearchDocumentsOptions, module: DocumentModule): Record<string, unknown> {
  const match: Record<string, unknown> = { deletedAt: null };
  if (module === "portal") {
    // portal_documents has no supersededById concept — every row is current.
  } else {
    match.supersededById = null;
  }
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    match.$or = module === "portal" ? [{ name: rx }, { category: rx }] : [{ title: rx }, { filename: rx }, { category: rx }];
  }
  return match;
}

const PMS_PROJECT = {
  $project: {
    _id: 1,
    module: { $literal: "pms" },
    title: 1,
    filename: 1,
    category: 1,
    size: 1,
    ownerId: "$projectId",
    createdAt: 1,
  },
};
const HRMS_PROJECT = {
  $project: {
    _id: 1,
    module: { $literal: "hrms" },
    title: 1,
    filename: 1,
    category: 1,
    size: 1,
    ownerId: "$employeeId",
    createdAt: 1,
  },
};
const PORTAL_PROJECT = {
  $project: {
    _id: 1,
    module: { $literal: "portal" },
    title: "$name",
    filename: "$name",
    category: 1,
    size: 1,
    ownerId: "$ownerUserId",
    createdAt: 1,
  },
};

function projectionFor(module: DocumentModule) {
  if (module === "pms") return PMS_PROJECT;
  if (module === "hrms") return HRMS_PROJECT;
  return PORTAL_PROJECT;
}

async function resolveOwnerLabels(rows: { module: DocumentModule; ownerId: string }[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const projectIds = [...new Set(rows.filter((r) => r.module === "pms").map((r) => r.ownerId))];
  const employeeIds = new Set(rows.filter((r) => r.module === "hrms").map((r) => r.ownerId));
  const portalIds = [...new Set(rows.filter((r) => r.module === "portal").map((r) => r.ownerId))];

  const [projects, employeeOptions, portalUsers] = await Promise.all([
    Promise.all(projectIds.map((id) => getProject(id).catch(() => null))),
    employeeIds.size > 0 ? listEmployeeOptions().catch(() => []) : Promise.resolve([]),
    portalIds.length > 0
      ? (await externalUsers()).find({ _id: { $in: portalIds } }, { projection: { email: 1 } }).toArray().catch(() => [])
      : Promise.resolve([]),
  ]);

  for (const p of projects) if (p) labels.set(`pms:${p._id}`, p.name);
  for (const e of employeeOptions) if (employeeIds.has(e._id)) labels.set(`hrms:${e._id}`, `${e.name} (${e.employeeCode})`);
  for (const u of portalUsers) labels.set(`portal:${String(u._id)}`, (u as { email?: string }).email ?? String(u._id));

  return labels;
}

export async function searchDocuments(opts: SearchDocumentsOptions = {}): Promise<SearchDocumentsResult> {
  const db = await getDb();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);

  const sources = opts.module ? SOURCES.filter((s) => s.module === opts.module) : SOURCES;
  if (sources.length === 0) return { items: [], total: 0, page, pageSize, totalPages: 1 };

  const [first, ...rest] = sources;
  const pipeline: Record<string, unknown>[] = [
    { $match: buildMatch(opts, first.module) },
    projectionFor(first.module),
    ...rest.map((s) => ({
      $unionWith: { coll: s.collection, pipeline: [{ $match: buildMatch(opts, s.module) }, projectionFor(s.module)] },
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

  const parsed = rawItems.map((doc) => ({
    _id: String(doc._id),
    module: doc.module as DocumentModule,
    title: (doc.title as string) ?? "",
    filename: (doc.filename as string) ?? "",
    category: (doc.category as string) ?? "",
    size: (doc.size as number) ?? 0,
    ownerId: (doc.ownerId as string) ?? "",
    createdAt: new Date(doc.createdAt as Date).toISOString(),
  }));

  const labels = await resolveOwnerLabels(parsed);
  const items: AdminDocumentRow[] = parsed.map((d) => ({
    ...d,
    ownerLabel: labels.get(`${d.module}:${d.ownerId}`) ?? d.ownerId,
  }));

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function deleteAdminDocument(
  module: DocumentModule,
  id: string,
  ownerId: string,
  actorId: string
): Promise<{ ok: boolean }> {
  if (module === "pms") return deletePmsDocument(id);
  if (module === "hrms") return { ok: await deleteHrmsDocument(id, actorId) };
  await deletePortalDocument(id, ownerId);
  return { ok: true };
}
