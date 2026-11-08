"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import OfferCard from "@/components/offers/OfferCard";
import type { SerializedOffer } from "@/lib/offers/offers";

export default function CategoryOffersSection({
  id,
  icon: Icon,
  title,
  description,
  offers,
  onClaim,
  onDetails,
  onView,
  onExpire,
  recommendedIds,
  tone = "default",
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  offers: SerializedOffer[];
  onClaim: (offer: SerializedOffer) => void;
  onDetails?: (offer: SerializedOffer) => void;
  onView?: (offer: SerializedOffer) => void;
  onExpire?: (offer: SerializedOffer) => void;
  recommendedIds?: Set<string>;
  tone?: "default" | "muted";
}) {
  if (offers.length === 0) return null;

  return (
    <section id={id} className={`py-20 sm:py-24 ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-10 flex items-start gap-4"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-md">
            <Icon className="size-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => (
            <OfferCard key={offer._id} offer={offer} onClaim={onClaim} onDetails={onDetails} onView={onView} onExpire={onExpire} recommended={recommendedIds?.has(offer._id)} />
          ))}
        </div>
      </div>
    </section>
  );
}
