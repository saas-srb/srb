import type { Metadata } from "next";
import { jsonForScript } from "@/lib/security/json-script";
import { withSeoOverrides } from "@/lib/products/rankmax-ai/public";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { getMockupText, getProductsText, requireProduct } from "@/lib/products/server";
import { productJsonLd, productMetadata } from "@/lib/products/seo";
import { detailSectionTones, productHref, SIGNUP_PATH } from "@/lib/products/shared";
import ProductDetailHero from "@/components/products/page/ProductDetailHero";
import {
  AiSection, AutomationSection, BenefitsSection, CompareSection, FaqSection, FeaturesSection, IntegrationsSection, OverviewSection,
  ProblemSection, RelatedSection, UseCasesSection, WhoForSection,
} from "@/components/products/page/ProductDetailSections";
import { ProductsCtaBand } from "@/components/products/page/ProductsSections";
import DetailCTA from "@/components/sections/DetailCTA";
import { fillText } from "@/lib/products/text";

/**
 * /products/<slug> — one long-form page per product. Owner's site only (a tenant host, or an unknown
 * slug, is a 404). Rendered per request like the CMS catch-all: the same path is a different site per host.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { product } = await requireProduct((await params).slug);
  const [text, { brand }, origin] = await Promise.all([getProductsText(), getSiteInfo(), companySiteUrl()]);
  return withSeoOverrides(productHref(product.slug), productMetadata(product, { origin, siteName: brand.namePrimary + brand.nameAccent, text }));
}

export default async function ProductPage({ params }: Props) {
  const { product, all } = await requireProduct((await params).slug);
  const [text, mockupText, { brand }, origin] = await Promise.all([getProductsText(), getMockupText(), getSiteInfo(), companySiteUrl()]);
  const tones = detailSectionTones(product, all);
  return (
    <div className="flex min-h-screen flex-col overflow-hidden">
      {productJsonLd(product, origin, brand.namePrimary + brand.nameAccent, text).map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
      ))}
      <ProductDetailHero product={product} text={text} />
      <ProblemSection product={product} text={text} tones={tones} />
      <CompareSection product={product} text={text} tones={tones} />
      <OverviewSection product={product} text={text} mockupText={mockupText} tones={tones} />
      {/* Mid-page signup band: the site's own CTA band, routed to the company registration. */}
      <DetailCTA
        id="create-workspace"
        heading={text["products.detail.band.title"]}
        description={fillText(text["products.detail.band.description"], { name: product.shortName || product.name })}
        ctaLabel={text["products.cta.createAutomation"]}
        ctaHref={SIGNUP_PATH}
        checklist={[text["products.detail.band.check1"], text["products.detail.band.check2"], text["products.detail.band.check3"]]}
      />
      <FeaturesSection product={product} text={text} tones={tones} />
      <AiSection product={product} text={text} tones={tones} />
      <AutomationSection product={product} text={text} tones={tones} />
      <UseCasesSection product={product} text={text} tones={tones} />
      <BenefitsSection product={product} text={text} tones={tones} />
      <WhoForSection product={product} text={text} tones={tones} />
      <IntegrationsSection product={product} text={text} tones={tones} />
      <FaqSection product={product} text={text} tones={tones} />
      <RelatedSection product={product} all={all} text={text} tones={tones} />
      <ProductsCtaBand
        products={all}
        text={text}
        title={fillText(text["products.detail.cta.title"], { name: product.shortName || product.name })}
        description={text["products.detail.cta.description"]}
        defaultProduct={product.name}
        source={`product:${product.slug}`}
      />
    </div>
  );
}
