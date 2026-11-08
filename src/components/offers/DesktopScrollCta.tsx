"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";
import { useOfferTracking } from "@/lib/useOfferTracking";
import { formatOfferBadge } from "@/lib/offers/constants";
import type { SerializedOffer } from "@/lib/offers/offers";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

/** Desktop counterpart to `StickyMobileClaimBar` — a small floating CTA that appears once the visitor has scrolled past the hero. */
export default function DesktopScrollCta({
  campaignId,
  offer,
  onClaim,
}: {
  campaignId: string;
  offer: SerializedOffer | null;
  onClaim: (offer: SerializedOffer) => void;
}) {
  const tx = useText();
  const [visible, setVisible] = useState(false);
  const track = useOfferTracking(campaignId);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > window.innerHeight * 0.9);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!offer) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 hidden sm:block">
      <AnimatePresence>
        {visible && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            onClick={() => {
              track("scroll_cta_click", { offerId: offer._id, category: offer.category });
              onClaim(offer);
            }}
            className="group flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105"
          >
            <Flame className="size-4" />
            {offer.badgeText || formatOfferBadge(offer.pricing)}
            <span className="hidden underline underline-offset-2 group-hover:inline">{tx("offers.desktopScrollCta.claim-offer")}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
