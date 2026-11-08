import type { Metadata } from "next";
import { productHref, PRODUCTS_PATH, valueLine, type StoredProduct } from "@/lib/products/shared";

/**
 * Metadata + JSON-LD for the Products pages. Pure: callers pass the
 * company's public origin (`companySiteUrl()`) — never the `siteUrl` constant.
 * The share image is the route's `opengraph-image` file.
 */

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

interface SeoCtx {
  origin: string;
  siteName: string;
  /** CMS text dictionary (see text.ts). */
  text: Record<string, string>;
}

function pageMetadata(title: string, description: string, path: string, { origin, siteName }: SeoCtx, keywords?: string[]): Metadata {
  return {
    title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    alternates: { canonical: `${origin}${path}` },
    openGraph: { title, description, url: `${origin}${path}`, siteName, type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export function listingMetadata(ctx: SeoCtx): Metadata {
  return pageMetadata(ctx.text["products.listing.meta.title"], ctx.text["products.listing.meta.description"], PRODUCTS_PATH, ctx);
}

export function productTitle(p: StoredProduct, text: Record<string, string>): string {
  return `${p.name} — ${text["products.detail.meta.suffix"] || "Product"}`;
}

export function productMetadata(p: StoredProduct, ctx: SeoCtx): Metadata {
  const description = clip(p.pitch || p.shortDescription || p.tagline, 300);
  return pageMetadata(productTitle(p, ctx.text), description, `/products/${p.slug}`, ctx, [p.name, p.category, ...(p.shortName ? [p.shortName] : [])]);
}

export function listingJsonLd(products: StoredProduct[], origin: string, text: Record<string, string>) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: text["products.listing.meta.title"],
      itemListElement: products.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${origin}${productHref(p.slug)}`,
        name: p.name,
      })),
    },
    breadcrumbLd(origin, [{ name: text["products.breadcrumb.home"], path: "/" }, { name: text["products.breadcrumb.products"], path: PRODUCTS_PATH }]),
  ];
}

export function breadcrumbLd(origin: string, items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${origin}${it.path}` })),
  };
}

/** No `offers`: there is no public pricing on the site, so none is claimed. */
export function productJsonLd(p: StoredProduct, origin: string, publisher: string, text: Record<string, string>) {
  const features = (p.features?.length ? p.features : p.keyFeatures).map((f) => f.title);
  const faq = p.faq ?? [];
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: p.name,
      description: p.pitch || p.shortDescription || valueLine(p),
      url: `${origin}${productHref(p.slug)}`,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: p.category,
      operatingSystem: "Web",
      ...(features.length ? { featureList: features } : {}),
      publisher: { "@type": "Organization", name: publisher, url: origin },
    },
    breadcrumbLd(origin, [
      { name: text["products.breadcrumb.home"], path: "/" },
      { name: text["products.breadcrumb.products"], path: PRODUCTS_PATH },
      { name: p.name, path: productHref(p.slug) },
    ]),
    ...(faq.length
      ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }]
      : []),
  ];
}
