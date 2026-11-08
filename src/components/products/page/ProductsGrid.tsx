"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Boxes, LayoutGrid, Sparkles } from "lucide-react";
import FeaturedListingCard from "@/components/sections/FeaturedListingCard";
import ListingCard from "@/components/sections/ListingCard";
import { BTN_PRIMARY, BTN_SECONDARY, listingCardProps, nextImageSrc } from "@/components/products/page/cta-styles";
import { fillText } from "@/lib/products/text";
import { capabilityChips, groupByCategory, productHref, SIGNUP_PATH, type StoredProduct } from "@/lib/products/shared";
import ProductLogo from "@/components/products/ProductLogo";

/**
 * The /products listing, built like the site's other listing pages: a featured card on top (the whole connected automation platform),
 * then the filter pills of the careers board and the same `ListingCard` grid Services and Industries use.
 * Every product is in the server-rendered HTML; the pills only narrow the view.
 */
export default function ProductsGrid({ products, text }: { products: StoredProduct[]; text: Record<string, string> }) {
  const groups = useMemo(() => groupByCategory(products), [products]);
  const [active, setActive] = useState<string>("");
  const shown = active ? products.filter((p) => p.category === active) : products;
  // Where "Explore the Platform" (and the card itself) goes: an editable text key.
  const platformHref = text["products.featured.href"];
  const chips = [1, 2, 3, 4].map((n) => text[`products.featured.point${n}`]).filter(Boolean);
  const pill = (value: string, label: string, count: number) => (
    <button
      key={value || "all"}
      type="button"
      aria-pressed={active === value}
      onClick={() => setActive(value)}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        active === value ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-background border border-border/50 text-foreground hover:border-primary/40"
      }`}
    >
      {value === "" && <LayoutGrid className="h-4 w-4" aria-hidden="true" />}
      {label}
      <span className={`text-xs font-bold ${active === value ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{count}</span>
    </button>
  );
  return (
    <section id="products" className="relative bg-background py-24 sm:py-32">
      <div className="pointer-events-none absolute left-0 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/20 opacity-50 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 lg:mb-20" data-products-featured>
          <FeaturedListingCard
            icon={Boxes}
            badge={text["products.featured.badge"]}
            badgeIcon={Sparkles}
            title={text["products.featured.title"]}
            subtitle={text["products.featured.subtitle"]}
            description={text["products.featured.pitch"]}
            highlights={chips}
            href={platformHref}
            image={nextImageSrc(text["products.featured.image"])}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <Link href={SIGNUP_PATH} className={BTN_PRIMARY}>
                  {text["products.cta.startAutomating"]}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
                <Link href={platformHref} className={BTN_SECONDARY}>
                  {text["products.cta.explorePlatform"]}
                </Link>
              </div>
            }
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-8 flex items-center gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{text["products.listing.moreLabel"]}</h2>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <div role="group" aria-label={text["products.listing.filterLabel"]} className="mb-12 flex flex-wrap gap-3">
            {pill("", text["products.listing.filterAll"], products.length)}
            {groups.map((g) => pill(g.category, g.category, g.products.length))}
          </div>
        </motion.div>
        <p className="sr-only" aria-live="polite">{fillText(text["products.listing.count"], { n: shown.length })}</p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8" data-products-grid>
          {shown.map((p) => (
            <ListingCard
              key={p.slug}
              index={products.indexOf(p)}
              icon={<ProductLogo productKey={p.slug} size={44} />}
              badge={p.category}
              badgeIcon={Sparkles}
              {...listingCardProps(p)}
              highlights={capabilityChips(p, 3)}
              href={productHref(p.slug)}
              image={nextImageSrc(undefined)}
              ctaLabel={text["products.card.explore"]}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
