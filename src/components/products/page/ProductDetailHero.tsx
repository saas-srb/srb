"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LogIn, Sparkles, type LucideIcon } from "lucide-react";
import PageHero from "@/components/sections/PageHero";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/products/page/cta-styles";
import { ctaTarget, hasOwnAi, pageContent, productHeroImage, resolveCtas, SIGNUP_PATH, type StoredProduct } from "@/lib/products/shared";
import type { ProductCtaKind } from "@/types/content";
import ProductLogo from "@/components/products/ProductLogo";

const CTA_TEXT_KEY: Record<Exclude<ProductCtaKind, "none">, string> = {
  "get-started": "products.cta.getStarted",
  "request-demo": "products.cta.requestDemo",
  "start-using": "products.cta.startUsing",
};

/**
 * The product's calls to action: Get Started + Request Demo (unless the record overrides them), a line inviting the visitor
 * to create their own business automation, and, for existing customers, Start Using.
 */
export function ProductCtas({ product, text }: { product: StoredProduct; text: Record<string, string> }) {
  const { primary, secondary, startUsing } = resolveCtas(product);
  const render = (kind: ProductCtaKind, cls: string) => {
    const t = ctaTarget(kind, startUsing);
    if (!t || kind === "none") return null;
    const content = (
      <>
        {text[CTA_TEXT_KEY[kind]]}
        {cls === BTN_PRIMARY && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />}
      </>
    );
    return t.href.startsWith("#") ? (
      <a href={t.href} className={cls}>{content}</a>
    ) : (
      <Link href={t.href} className={cls} {...(t.href === SIGNUP_PATH ? { "data-signup-cta": "hero" } : {})}>{content}</Link>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        {render(primary, BTN_PRIMARY)}
        {render(secondary, BTN_SECONDARY)}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        {text["products.cta.automateHint"]}
        <Link href={SIGNUP_PATH} data-signup-cta="hero-automation" className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {text["products.cta.createAutomation"]}
        </Link>
      </p>
      {startUsing && primary !== "start-using" && secondary !== "start-using" && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <LogIn className="h-4 w-4 text-primary" aria-hidden="true" />
          {text["products.cta.startUsingHint"]}
          <Link href={startUsing} className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {text["products.cta.startUsing"]}
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * A product's hero: the service-page `PageHero` (photo wash, blobs, mouse-follow grid, image card with floating badges),
 * with the product's own breadcrumb, calls to action and a strip of its key facts underneath.
 */
export default function ProductDetailHero({ product, text }: { product: StoredProduct; text: Record<string, string> }) {
  const c = pageContent(product);
  const name = product.shortName || product.name;
  const ProductHeroMark = (({ className }: { className?: string }) => <ProductLogo productKey={product.slug} className={className} />) as LucideIcon;
  return (
    <PageHero
      category="products"
      categoryLabel={product.category}
      title={product.name}
      subtitle={product.tagline}
      description={c.pitch}
      icon={ProductHeroMark}
      image={productHeroImage(product, text)}
      crumbs={[{ label: text["products.breadcrumb.home"], href: "/" }, { label: text["products.breadcrumb.products"], href: "/products" }, { label: name }]}
      actions={<ProductCtas product={product} text={text} />}
      floatingBadges={[
        { title: product.badge || name, text: product.category },
        hasOwnAi(product) ? { title: text["products.card.ai"], text: name } : { title: text["products.breadcrumb.products"], text: name },
      ]}
      longTitle
    >
      {c.facts.length > 0 && (
        <motion.dl
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          data-product-facts
        >
          {c.facts.map((f) => (
            <div key={f.label} className="rounded-2xl border border-border/50 bg-background/70 p-5 backdrop-blur-md transition-colors hover:border-primary/30">
              <dd className="text-xl font-bold leading-snug text-foreground [overflow-wrap:anywhere]">{f.value}</dd>
              <dt className="mt-1 text-sm text-muted-foreground">{f.label}</dt>
            </div>
          ))}
        </motion.dl>
      )}
    </PageHero>
  );
}
