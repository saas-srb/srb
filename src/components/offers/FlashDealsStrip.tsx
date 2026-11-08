"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { formatOfferBadge } from "@/lib/offers/constants";
import LiveCountdown from "@/components/offers/LiveCountdown";
import type { SerializedOffer } from "@/lib/offers/offers";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

export default function FlashDealsStrip({ offers, onClaim }: { offers: SerializedOffer[]; onClaim: (offer: SerializedOffer) => void }) {
  const tx = useText();
  if (offers.length === 0) return null;

  return (
    <section className="border-y border-border/50 bg-foreground py-6">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-3 flex items-center gap-2 text-background">
          <Zap className="size-4 fill-current" />
          <span className="text-xs font-bold uppercase tracking-widest">{tx("offers.flashDealsStrip.flash-deals")}</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {offers.map((offer, i) => (
            <motion.button
              key={offer._id}
              type="button"
              onClick={() => onClaim(offer)}
              initial={{ opacity: 0, x: 12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="flex shrink-0 flex-col items-start gap-1 rounded-2xl border border-background/15 bg-background/10 px-4 py-3 text-left transition-colors hover:bg-background/20"
            >
              <span className="flex items-center gap-1 text-xs font-medium text-background/70">
                <Zap className="size-3 fill-current text-primary" /> {offer.title}
              </span>
              <span className="text-lg font-black text-background">{offer.badgeText || formatOfferBadge(offer.pricing)}</span>
              <LiveCountdown endDate={offer.validUntil} variant="strip" onDark />
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
