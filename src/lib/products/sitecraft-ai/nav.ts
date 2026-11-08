import "server-only";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { hasProductCatalog } from "@/lib/products/server";
import { isProductsHref } from "@/lib/products/shared";
import { COLLECTIONS, CMS_SITE_TAG, expireSiteCache, newId, createStamp, updateStamp, type Stamps } from "@/lib/products/sitecraft-ai/db";

/**
 * Header navigation. One doc per item (top-level column when `parentId` is
 * null, else a nested item under a column) rather than one giant array doc,
 * so reordering can use the same fractional-key pattern as everything else.
 * The same data drives both the desktop mega-menu and the mobile menu — the
 * two were previously separate, near-duplicated literal arrays in
 * `Header.tsx`; this collapses them into one source of truth.
 */
export interface CmsNavItemDoc extends Stamps {
  _id: string;
  parentId: string | null;
  label: string;
  href: string;
  description: string | null;
  iconKey: string;
  /** Optional sub-heading this item is listed under in the mega-menu (e.g. a product category). */
  group?: string | null;
  featuredTitle: string | null;
  featuredDescription: string | null;
  featuredImage: string | null;
  /** Where the featured card links to. Empty = the menu's own link (`href`). */
  featuredHref?: string | null;
  orderKey: number;
  enabled: boolean;
}

async function col() {
  const db = await getDb();
  return db.collection<CmsNavItemDoc>(COLLECTIONS.nav);
}

export async function listNavItems(): Promise<CmsNavItemDoc[]> {
  const c = await col();
  return c.find({}, { sort: { orderKey: 1 } }).toArray();
}

export async function createNavItem(
  input: { parentId: string | null; label: string; href: string; description?: string; iconKey?: string; group?: string; featuredTitle?: string; featuredDescription?: string; featuredImage?: string; featuredHref?: string },
  actorId: string
): Promise<CmsNavItemDoc> {
  const c = await col();
  const last = await c.find({ parentId: input.parentId ?? null }, { sort: { orderKey: -1 }, limit: 1 }).toArray();
  const doc: CmsNavItemDoc = {
    _id: newId(),
    parentId: input.parentId ?? null,
    label: input.label.trim(),
    href: input.href.trim(),
    description: input.description?.trim() || null,
    iconKey: input.iconKey || "Sparkles",
    group: input.group?.trim() || null,
    featuredTitle: input.featuredTitle?.trim() || null,
    featuredDescription: input.featuredDescription?.trim() || null,
    featuredImage: input.featuredImage?.trim() || null,
    featuredHref: input.featuredHref?.trim() || null,
    orderKey: (last[0]?.orderKey ?? 0) + 1024,
    enabled: true,
    ...createStamp(actorId),
  };
  await c.insertOne(doc);
  expireSiteCache();
  return doc;
}

export async function updateNavItem(id: string, patch: Partial<Omit<CmsNavItemDoc, "_id" | "parentId">>, actorId: string): Promise<void> {
  const c = await col();
  await c.updateOne({ _id: id }, { $set: { ...patch, ...updateStamp(actorId) } });
  expireSiteCache();
}

export async function reorderNavItem(id: string, orderKey: number, actorId: string): Promise<void> {
  await updateNavItem(id, { orderKey }, actorId);
}

export async function deleteNavItem(id: string): Promise<void> {
  const c = await col();
  await c.deleteOne({ _id: id });
  await c.deleteMany({ parentId: id }); // also remove its nested items
  expireSiteCache();
}

// ── Public read shape ────────────────────────────────────────────────────

export interface PublicNavChild {
  name: string;
  href: string;
  description: string | null;
  iconKey: string;
  /** Sub-heading the item is listed under; null = ungrouped. */
  group: string | null;
}
export interface PublicNavTop {
  name: string;
  href: string;
  iconKey: string;
  /** Always populated (falls back to the item's own label/href/icon) — `FeaturedCard` in Header.tsx renders it unconditionally, matching the code-defined default nav's shape. */
  featured: { title: string; description: string; image: string; href: string | null };
  items: PublicNavChild[];
}

async function loadNav(): Promise<PublicNavTop[]> {
  const items = await listNavItems();
  const enabled = items.filter((i) => i.enabled);
  const tops = enabled.filter((i) => !i.parentId);
  return tops.map((top) => ({
    name: top.label,
    href: top.href,
    iconKey: top.iconKey,
    featured: {
      title: top.featuredTitle || top.label,
      description: top.featuredDescription ?? "",
      image: top.featuredImage ?? "",
      href: top.featuredHref || null,
    },
    items: enabled
      .filter((i) => i.parentId === top._id)
      .map((i) => ({ name: i.label, href: i.href, description: i.description, iconKey: i.iconKey, group: i.group ?? null })),
  }));
}

const cachedNav = companyCache(loadNav, ["cms-nav-v1"], { tags: [CMS_SITE_TAG], revalidate: 3600 });

/** The header menu. If the CMS is unreachable this throws, and Next.js keeps serving the last good render. */
export async function getPublicNav(): Promise<PublicNavTop[]> {
  const nav = await cachedNav();
  // Products are the platform owner's own pages; never show the item on another company's site.
  return dropProductsNav(nav);
}

/** The nav without any Products entry (a top-level item or a nested link into /products). Pure; exported for tests. */
export function withoutProducts(nav: PublicNavTop[]): PublicNavTop[] {
  return nav.filter((t) => !isProductsHref(t.href)).map((t) => ({ ...t, items: t.items.filter((i) => !isProductsHref(i.href)) }));
}

async function dropProductsNav(nav: PublicNavTop[]): Promise<PublicNavTop[]> {
  return (await hasProductCatalog()) ? nav : withoutProducts(nav);
}
