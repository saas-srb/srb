import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import type { LeadStatus } from "@/lib/lead-status";

/**
 * Cross-category Leads listing for the Director CRM product. `src/lib/leads.ts`
 * stores each category's leads in its own collection (`leads_software_development`,
 * …) — real server-side pagination across all of them needs a Mongo `$unionWith`
 * aggregation rather than 5 separate queries merged in JS (which can't paginate
 * correctly once any collection is large). Row mutations still go through the
 * existing per-category `updateLead`/`deleteLead` in `src/lib/leads.ts` unchanged,
 * using the `category` field this aggregation attaches to every row.
 */

export interface AdminLeadRow {
  _id: string;
  category: CategorySlug;
  name: string;
  email: string | null;
  phone: string;
  status: LeadStatus | null;
  source: string | null;
  subService: string | null;
  dealValue: number | null;
  createdAt: string;
}

export interface SearchAllLeadsOptions {
  search?: string;
  category?: CategorySlug;
  status?: LeadStatus;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "name" | "dealValue";
  sortDir?: "asc" | "desc";
}

export interface SearchAllLeadsResult {
  items: AdminLeadRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildMatch(opts: SearchAllLeadsOptions): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    match.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (opts.status) match.status = opts.status;
  if (opts.dateFrom || opts.dateTo) {
    const range: Record<string, Date> = {};
    if (opts.dateFrom) range.$gte = opts.dateFrom;
    if (opts.dateTo) range.$lte = opts.dateTo;
    match.createdAt = range;
  }
  return match;
}

export async function searchAllLeads(opts: SearchAllLeadsOptions = {}): Promise<SearchAllLeadsResult> {
  const db = await getDb();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const match = buildMatch(opts);

  const categories = opts.category ? CATEGORIES.filter((c) => c.slug === opts.category) : CATEGORIES;
  if (categories.length === 0) return { items: [], total: 0, page, pageSize, totalPages: 1 };

  const [first, ...rest] = categories;
  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const pipeline: Record<string, unknown>[] = [
    { $match: match },
    { $addFields: { category: first.slug } },
    ...rest.map((c) => ({
      $unionWith: { coll: c.collection, pipeline: [{ $match: match }, { $addFields: { category: c.slug } }] },
    })),
    { $sort: { [sortField]: sortDir } },
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

  const items: AdminLeadRow[] = rawItems.map((doc) => ({
    _id: String(doc._id),
    category: doc.category as CategorySlug,
    name: (doc.name as string) ?? "",
    email: (doc.email as string) ?? null,
    phone: (doc.phone as string) ?? "",
    status: (doc.status as LeadStatus) ?? null,
    source: (doc.source as string) ?? null,
    subService: (doc.subService as string) ?? null,
    dealValue: typeof doc.dealValue === "number" ? doc.dealValue : null,
    createdAt: new Date(doc.createdAt as Date).toISOString(),
  }));

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

/** Sum of every category's own lead count — used to sanity-check the `$unionWith` total. */
export async function countAllLeadsByCategory(): Promise<Record<CategorySlug, number>> {
  const db = await getDb();
  const entries = await Promise.all(
    CATEGORIES.map(async (c) => [c.slug, await db.collection(c.collection).countDocuments({})] as const)
  );
  return Object.fromEntries(entries) as Record<CategorySlug, number>;
}
