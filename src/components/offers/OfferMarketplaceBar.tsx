"use client";

import { Search, X } from "lucide-react";
import { OFFER_TYPES, type OfferType } from "@/lib/offers/constants";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

export type MarketplaceSort = "featured" | "ending" | "discount" | "popular";

const SORTS = (tx: (key: string) => string): { value: MarketplaceSort; label: string }[] => ([
  { value: "featured", label: tx("offers.offerMarketplaceBar.featured-2") },
  { value: "ending", label: tx("offers.offerMarketplaceBar.ending-soonest") },
  { value: "discount", label: tx("offers.offerMarketplaceBar.biggest-discount") },
  { value: "popular", label: tx("offers.offerMarketplaceBar.most-claimed") },
]);

/**
 * Filter / search / sort strip for the offer marketplace. Type chips only show
 * types that actually have live offers (with a real count) — an empty chip
 * would be a dead end.
 */
export default function OfferMarketplaceBar({
  counts,
  type,
  onType,
  query,
  onQuery,
  sort,
  onSort,
  total,
}: {
  counts: Partial<Record<OfferType, number>>;
  type: OfferType | null;
  onType: (t: OfferType | null) => void;
  query: string;
  onQuery: (q: string) => void;
  sort: MarketplaceSort;
  onSort: (s: MarketplaceSort) => void;
  total: number;
}) {
  const tx = useText();
  const available = OFFER_TYPES.filter((t) => (counts[t.value] ?? 0) > 0);

  return (
    <section id="offer-marketplace" className="sticky top-[calc(88px+var(--offer-strip-h,0px))] z-30 border-b border-border/50 bg-background/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl space-y-3 px-6 py-4 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={tx("offers.offerMarketplaceBar.search-offers-course-developer-hiring-ai")}
              className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-9 text-sm outline-none focus:border-ring"
              aria-label="Search offers"
            />
            {query && (
              <button type="button" onClick={() => onQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </label>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as MarketplaceSort)}
            className="h-10 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-ring"
            aria-label="Sort offers"
          >
            {SORTS(tx).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          <button
            type="button"
            onClick={() => onType(null)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${type === null ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-foreground hover:border-primary hover:text-primary"}`}
          >
            {tx("offers.offerMarketplaceBar.all-offers")}<span className="opacity-70">{total}</span>
          </button>
          {available.map((t) => (
            <button
              key={t.value}
              type="button"
              title={t.blurb}
              onClick={() => onType(type === t.value ? null : t.value)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${type === t.value ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-foreground hover:border-primary hover:text-primary"}`}
            >
              {t.label} <span className="opacity-70">{counts[t.value]}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
