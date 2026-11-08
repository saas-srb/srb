import type { Metadata } from "next";
import { jsonForScript } from "@/lib/security/json-script";
import { withSeoOverrides } from "@/lib/products/rankmax-ai/public";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { getProductsText, requireProducts } from "@/lib/products/server";
import { listingJsonLd, listingMetadata } from "@/lib/products/seo";
import { PRODUCTS_PATH } from "@/lib/products/shared";
import ProductsHero from "@/components/products/page/ProductsHero";
import ProductsGrid from "@/components/products/page/ProductsGrid";
import { ProductsAiSuite, ProductsConnected, ProductsCtaBand } from "@/components/products/page/ProductsSections";

/**
 * /products — the company's product portfolio, from its published product records. A company without any gets a 404
 * (`requireProducts`).
 * It renders per request, like the CMS catch-all: the same path is a different site per host.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await requireProducts();
  const [text, { brand }, origin] = await Promise.all([getProductsText(), getSiteInfo(), companySiteUrl()]);
  return withSeoOverrides(PRODUCTS_PATH, listingMetadata({ origin, siteName: brand.namePrimary + brand.nameAccent, text }));
}

export default async function ProductsPage() {
  const products = await requireProducts();
  const [text, origin] = await Promise.all([getProductsText(), companySiteUrl()]);
  return (
    <div className="flex min-h-screen flex-col overflow-hidden">
      {listingJsonLd(products, origin, text).map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
      ))}
      <ProductsHero text={text} />
      <ProductsGrid products={products} text={text} />
      <ProductsConnected products={products} text={text} />
      <ProductsAiSuite products={products} text={text} />
      <ProductsCtaBand products={products} text={text} title={text["products.listing.cta.title"]} description={text["products.listing.cta.description"]} source="products-page" />
    </div>
  );
}
