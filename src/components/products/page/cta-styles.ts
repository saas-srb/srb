import type { StoredProduct } from "@/lib/products/shared";

/** The site's two button styles (as in PageHero / the service pages): solid for the main action, outlined for the secondary one. */
export const BTN_PRIMARY =
  "group inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background shadow-lg shadow-foreground/10 transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
export const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border/50 bg-muted/30 px-6 py-3 text-sm font-bold text-foreground transition-all hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** The photo used behind the listing cards' soft colour wash (always an allowed `next/image` host). */
export const PRODUCT_CARD_IMAGE = "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop";

/**
 * `next/image` only loads hosts listed in next.config.ts; an editor-supplied URL on another host would make it throw,
 * so a text-key image is used only when it is on an allowed host, else the fallback.
 */
export const nextImageSrc = (url: string | undefined, fallback: string = PRODUCT_CARD_IMAGE): string => {
  try {
    return url && new URL(url).hostname === "images.unsplash.com" ? url : fallback;
  } catch {
    return fallback;
  }
};

/** What a card shows for a product, mapped onto the site's listing card. */
export const listingCardProps = (p: StoredProduct) => ({
  title: p.name,
  subtitle: p.valueLine || p.tagline,
  description: p.shortDescription || p.tagline,
});
