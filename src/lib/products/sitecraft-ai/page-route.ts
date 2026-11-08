import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPage, type PublicPage } from "@/lib/products/sitecraft-ai/public";
import { buildPageMetadata } from "@/lib/products/sitecraft-ai/page-seo";
import { withSeoOverrides } from "@/lib/products/rankmax-ai/public";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";

/** The published CMS page at `path`, or a 404. */
export async function requirePublicPage(path: string): Promise<PublicPage> {
  const page = await getPublicPage(path);
  if (!page) notFound();
  return page;
}

/** A CMS page's metadata: its own SEO fields, with the SEO product's per-page overrides on top. */
export async function cmsPageMetadata(path: string): Promise<Metadata> {
  const [page, { brand }, siteUrl] = await Promise.all([getPublicPage(path), getSiteInfo(), companySiteUrl()]);
  if (!page?.seo) return {};
  return withSeoOverrides(path, buildPageMetadata(page.seo, path, brand.namePrimary + brand.nameAccent, siteUrl));
}
