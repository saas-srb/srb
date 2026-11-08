"use client";

import { Sparkles, History } from "lucide-react";
import NotifyMeForm from "@/components/offers/NotifyMeForm";
import EvergreenSection from "@/components/offers/EvergreenSection";
import StateWatcher from "@/components/offers/StateWatcher";
import HowItWorksSection from "@/components/offers/HowItWorksSection";
import WhyUsSection from "@/components/offers/WhyUsSection";
import OffersFaqSection from "@/components/offers/OffersFaqSection";
import { formatDate } from "@/lib/utils";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

/** State: no live and no scheduled campaign. Never an empty page — a lead-capture hero plus everything that is always true about the company. */
export default function OffersFallback({
  serverTime,
  lastEnded,
  faqs,
}: {
  serverTime: number;
  lastEnded: { name: string; endedAt: string } | null;
  faqs: { question: string; answer: string }[];
}) {
  const tx = useText();
  return (
    <div className="flex min-h-screen flex-col selection:bg-primary/30">
      <StateWatcher serverTime={serverTime} pollMs={90_000} />

      <section className="relative overflow-hidden border-b border-border/50 bg-background pt-28 pb-16 lg:pt-36 lg:pb-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] -top-[20%] h-[60%] w-[60%] rounded-full bg-primary/15 blur-[120px] animate-blob" />
          <div className="absolute right-[5%] top-[10%] h-[50%] w-[50%] rounded-full bg-secondary/15 blur-[100px] animate-blob animation-delay-2000" />
        </div>
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-2 lg:px-8">
          <div className="space-y-5 text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/50 px-4 py-2 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-primary" />{tx("offers.offersFallback.next-offers-in-the-making")}</span>
            <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">{tx("offers.offersFallback.no-campaign-is-live-but-the-next-one-is-")}</h1>
            <p className="text-lg leading-relaxed text-muted-foreground">
              {tx("offers.offersFallback.festival-and-seasonal-offers-on-software")}</p>
            {lastEnded && (
              <p className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground">
                <History className="size-3.5" /> “{lastEnded.name}{tx("offers.offersFallback.ended")}{formatDate(lastEnded.endedAt)}{tx("offers.offersFallback.don-t-miss-the-next-one")}</p>
            )}
          </div>
          <NotifyMeForm campaignId={null} source="none" withMessage cta={tx("offers.offersFallback.get-first-access")} />
        </div>
      </section>

      <EvergreenSection />
      <HowItWorksSection />
      <WhyUsSection />
      <OffersFaqSection faqs={faqs} />
    </div>
  );
}
