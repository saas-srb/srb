import "server-only";
import { notFound } from "next/navigation";
import { getRecords } from "@/lib/products/sitecraft-ai/collections/store";
import { cache } from "react";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { getPublicPage } from "@/lib/products/sitecraft-ai/public";
import { resolveProductsText } from "@/lib/products/text";
import { isProductsHref, type StoredProduct } from "@/lib/products/shared";

/**
 * Products are a CMS collection any company can fill in. A company that has published products gets the Products pages
 * (catalogue, product pages, navigation links); one that has none gets 404s and no links, and never reads another
 * company's data — the records are company-scoped like every other CMS collection.
 */
const publishedProducts = cache(async (): Promise<StoredProduct[]> => (await getRecords("products")) as StoredProduct[]);

/** Whether this company has published products (and so a Products section). */
export async function hasProductCatalog(): Promise<boolean> {
  return (await publishedProducts()).length > 0;
}

/** 404 unless this company has published products. */
export async function requireProductsSite(): Promise<void> {
  if ((await publishedProducts()).length === 0) notFound();
}


/**
 * The company's published products, in catalogue order. Returns `null` (not an empty list) when it has none, so callers
 * cannot mistake "no product catalogue here" for "an empty one".
 */
export async function loadProducts(): Promise<StoredProduct[] | null> {
  const all = await publishedProducts();
  return all.length > 0 ? all : null;
}

/** Like `loadProducts()` but a 404 when the company has no products. */
export async function requireProducts(): Promise<StoredProduct[]> {
  const products = await loadProducts();
  if (!products) notFound();
  return products;
}

export async function requireProduct(slug: string): Promise<{ product: StoredProduct; all: StoredProduct[] }> {
  const all = await requireProducts();
  const product = all.find((p) => p.slug === slug);
  if (!product) notFound();
  return { product, all };
}

/** The site's text dictionary for the Products pages: code defaults overlaid with CMS → Site Identity text. */
export async function getProductsText(): Promise<Record<string, string>> {
  return resolveProductsText((await getSiteInfo()).text);
}

/** Removes Products items from a header/footer list when the company has no products (links that would lead to a 404). */
export async function dropProductsLinks<T extends { href: string }>(items: T[]): Promise<T[]> {
  return (await publishedProducts()).length > 0 ? items : items.filter((i) => !isProductsHref(i.href));
}

/**
 * The wording the interactive preview (`ProductMockup`) reads (`catalog.productMockup.*`). It lives in the catalogue
 * page's section config, so it is read from there — only those keys, to keep the page payload small.
 */
export async function getMockupText(): Promise<Record<string, string>> {
  const page = await getPublicPage("/services/our-saas-product");
  const section = page?.sections.find((s) => s.type === "saas-product-catalog");
  const dict = (section?.config as { text?: Record<string, string> } | undefined)?.text ?? {};
  return Object.fromEntries(Object.entries(dict).filter(([k]) => k.startsWith("catalog.productMockup.")));
}
