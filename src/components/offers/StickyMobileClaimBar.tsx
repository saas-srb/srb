"use client";

import { formatOfferBadge } from "@/lib/offers/constants";
import type { SerializedOffer } from "@/lib/offers/offers";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

/** Lightweight always-accessible CTA on mobile — mirrors the spec's "sticky CTA" requirement. */
export default function StickyMobileClaimBar({
  topOffer,
  onClaim,
}: {
  topOffer: SerializedOffer | null;
  onClaim: (offer: SerializedOffer) => void;
}) {
  const tx = useText();
  if (!topOffer) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:hidden">
      <button
        type="button"
        onClick={() => onClaim(topOffer)}
        className="flex w-full items-center justify-between gap-3 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
      >
        <span>🔥 {topOffer.badgeText || formatOfferBadge(topOffer.pricing)}</span>
        <span className="underline underline-offset-2">{tx("offers.stickyMobileClaimBar.claim-offer")}</span>
      </button>
    </div>
  );
}
