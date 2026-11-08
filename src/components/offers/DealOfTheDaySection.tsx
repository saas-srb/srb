"use client";

import { motion } from "framer-motion";
import { Flame, ArrowRight } from "lucide-react";
import CampaignCountdown from "@/components/offers/CampaignCountdown";
import { formatOfferBadge } from "@/lib/offers/constants";
import { getCategoryLabel, getSubServices } from "@/lib/categories";
import type { SerializedOffer } from "@/lib/offers/offers";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

export default function DealOfTheDaySection({ offer, onClaim }: { offer: SerializedOffer; onClaim: (offer: SerializedOffer) => void }) {
  const tx = useText();
  const serviceLabel =
    offer.subService === "all"
      ? getCategoryLabel(offer.category)
      : getSubServices(offer.category).find((s) => s.slug === offer.subService)?.label ?? getCategoryLabel(offer.category);

  return (
    <section className="py-20 sm:py-24 bg-gradient-to-br from-primary/5 via-background to-secondary/10 border-y border-border/50">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl border border-border/50 bg-background/90 backdrop-blur-md p-8 sm:p-12 text-center shadow-lg shadow-primary/5"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
            <Flame className="size-3.5" />{tx("offers.dealOfTheDaySection.today-s-tech-deal")}</span>
          <p className="mt-4 text-sm font-medium text-muted-foreground">{serviceLabel}</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{offer.title}</h2>
          <p className="mt-3 text-3xl font-black text-primary sm:text-4xl">{offer.badgeText || formatOfferBadge(offer.pricing)}</p>

          <div className="mt-6 flex justify-center">
            <CampaignCountdown endDate={offer.validUntil} startDate={offer.validFrom} label={tx("offers.dealOfTheDaySection.deal-ends-in")} />
          </div>

          <button
            type="button"
            onClick={() => onClaim(offer)}
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 shadow-lg shadow-primary/20"
          >
            {tx("offers.dealOfTheDaySection.grab-this-deal")}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}
