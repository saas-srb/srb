import "server-only";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { hasProductCatalog } from "@/lib/products/server";
import { isProductsHref } from "@/lib/products/shared";
import { COLLECTIONS, CMS_SITE_TAG, expireSiteCache, newId, createStamp, updateStamp, type Stamps } from "@/lib/products/sitecraft-ai/db";

/** Footer columns + links. Contact details, social links and the footer's other text are Site Identity (`site-info.ts`). */
export interface CmsFooterColumnDoc extends Stamps {
  _id: string;
  title: string;
  orderKey: number;
  viewAllHref: string | null;
  viewAllLabel: string | null;
}
export interface CmsFooterLinkDoc extends Stamps {
  _id: string;
  columnId: string;
  label: string;
  href: string;
  emphasized: boolean;
  orderKey: number;
}

async function cols() {
  const db = await getDb();
  return { columns: db.collection<CmsFooterColumnDoc>(`${COLLECTIONS.footer}_columns`), links: db.collection<CmsFooterLinkDoc>(`${COLLECTIONS.footer}_links`) };
}

export async function listFooterColumns(): Promise<CmsFooterColumnDoc[]> {
  const { columns } = await cols();
  return columns.find({}, { sort: { orderKey: 1 } }).toArray();
}

export async function listFooterLinks(): Promise<CmsFooterLinkDoc[]> {
  const { links } = await cols();
  return links.find({}, { sort: { orderKey: 1 } }).toArray();
}

export async function createFooterColumn(input: { title: string; viewAllHref?: string; viewAllLabel?: string }, actorId: string): Promise<CmsFooterColumnDoc> {
  const { columns } = await cols();
  const last = await columns.find({}, { sort: { orderKey: -1 }, limit: 1 }).toArray();
  const doc: CmsFooterColumnDoc = {
    _id: newId(),
    title: input.title.trim(),
    orderKey: (last[0]?.orderKey ?? 0) + 1024,
    viewAllHref: input.viewAllHref?.trim() || null,
    viewAllLabel: input.viewAllLabel?.trim() || null,
    ...createStamp(actorId),
  };
  await columns.insertOne(doc);
  expireSiteCache();
  return doc;
}

export async function updateFooterColumn(id: string, patch: Partial<Omit<CmsFooterColumnDoc, "_id">>, actorId: string): Promise<void> {
  const { columns } = await cols();
  await columns.updateOne({ _id: id }, { $set: { ...patch, ...updateStamp(actorId) } });
  expireSiteCache();
}

export async function deleteFooterColumn(id: string): Promise<void> {
  const { columns, links } = await cols();
  await columns.deleteOne({ _id: id });
  await links.deleteMany({ columnId: id });
  expireSiteCache();
}

export async function createFooterLink(input: { columnId: string; label: string; href: string; emphasized?: boolean }, actorId: string): Promise<CmsFooterLinkDoc> {
  const { links } = await cols();
  const last = await links.find({ columnId: input.columnId }, { sort: { orderKey: -1 }, limit: 1 }).toArray();
  const doc: CmsFooterLinkDoc = {
    _id: newId(),
    columnId: input.columnId,
    label: input.label.trim(),
    href: input.href.trim(),
    emphasized: input.emphasized === true,
    orderKey: (last[0]?.orderKey ?? 0) + 1024,
    ...createStamp(actorId),
  };
  await links.insertOne(doc);
  expireSiteCache();
  return doc;
}

export async function updateFooterLink(id: string, patch: Partial<Omit<CmsFooterLinkDoc, "_id" | "columnId">>, actorId: string): Promise<void> {
  const { links } = await cols();
  await links.updateOne({ _id: id }, { $set: { ...patch, ...updateStamp(actorId) } });
  expireSiteCache();
}

export async function deleteFooterLink(id: string): Promise<void> {
  const { links } = await cols();
  await links.deleteOne({ _id: id });
  expireSiteCache();
}

// ── Public read shape ────────────────────────────────────────────────────

export interface PublicFooterColumn {
  title: string;
  viewAllHref: string | null;
  viewAllLabel: string | null;
  links: { label: string; href: string; emphasized: boolean }[];
}

async function loadFooter(): Promise<PublicFooterColumn[]> {
  const [columns, links] = await Promise.all([listFooterColumns(), listFooterLinks()]);
  return columns.map((c) => ({
    title: c.title,
    viewAllHref: c.viewAllHref,
    viewAllLabel: c.viewAllLabel,
    links: links.filter((l) => l.columnId === c._id).map((l) => ({ label: l.label, href: l.href, emphasized: l.emphasized })),
  }));
}

const cachedFooter = companyCache(loadFooter, ["cms-footer-v1"], { tags: [CMS_SITE_TAG], revalidate: 3600 });

/** The footer's link columns. If the CMS is unreachable this throws, and Next.js keeps serving the last good render. */
export async function getPublicFooter(): Promise<PublicFooterColumn[]> {
  const columns = await cachedFooter();
  // Products links are the platform owner's own; never show them on another company's site.
  return (await hasProductCatalog()) ? columns : withoutProductsLinks(columns);
}

/** The footer without links into /products. Pure; exported for tests. */
export function withoutProductsLinks(columns: PublicFooterColumn[]): PublicFooterColumn[] {
  return columns.map((c) => ({ ...c, links: c.links.filter((l) => !isProductsHref(l.href)) }));
}
