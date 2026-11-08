"use client";

import { motion } from "framer-motion";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";
import { useOfferTracking } from "@/lib/useOfferTracking";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

export default function FinalCtaSection({
  hasCampaign,
  campaignId,
  onExploreOffers,
}: {
  hasCampaign: boolean;
  campaignId?: string;
  onExploreOffers: () => void;
}) {
  const tx = useText();
  const { contact } = useSiteInfo();
  const track = useOfferTracking(campaignId ?? "");
  return (
    <section className="relative overflow-hidden border-t border-border/50 py-24 sm:py-28 bg-primary/5">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="mx-auto max-w-7xl px-6 lg:px-8 flex flex-col items-center text-center relative z-10">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className="max-w-2xl">
          <h2 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl mb-6">
            {tx("offers.finalCtaSection.your-next-project-or-career-move-could-c")}</h2>
          <p className="text-lg text-muted-foreground mb-10">
            {hasCampaign ? tx("offers.finalCtaSection.live") : tx("offers.finalCtaSection.upcoming")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              onClick={onExploreOffers}
              className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground hover:scale-105 transition-all shadow-lg shadow-primary/20 w-full sm:w-auto"
            >
              {tx("offers.finalCtaSection.explore-offers")}<ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-8 py-4 text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-all w-full sm:w-auto"
            >
              {tx("offers.finalCtaSection.talk-to-brand")}</a>
            <a
              href={contact.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => campaignId && track("whatsapp_click", {})}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-8 py-4 text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-all w-full sm:w-auto"
            >
              <MessageCircle className="size-4" />{tx("offers.finalCtaSection.whatsapp-us")}</a>
          </div>
          <p className="pt-8 text-sm text-muted-foreground">
            {tx("offers.finalCtaSection.or-call-us-directly-at")}{" "}
            <a href={contact.phoneHref} onClick={() => campaignId && track("call_click", {})} className="font-semibold text-primary hover:underline">
              {contact.phoneDisplay}
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
