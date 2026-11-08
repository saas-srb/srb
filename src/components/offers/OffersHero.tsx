"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import CampaignCountdown from "@/components/offers/CampaignCountdown";
import CampaignBackdrop from "@/components/offers/CampaignBackdrop";
import { PUBLIC_AUDIENCE_TABS, getThemePreset, type PublicAudienceTabKey } from "@/lib/offers/constants";
import type { SerializedCampaign } from "@/lib/offers/campaigns";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};
const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

export default function OffersHero({
  campaign,
  onSelectAudience,
  onCampaignEnd,
}: {
  campaign: SerializedCampaign | null;
  onSelectAudience: (key: PublicAudienceTabKey) => void;
  onCampaignEnd?: () => void;
}) {
  const tx = useText();
  const headline = campaign?.theme.bannerHeadline ?? tx("offers.offersHero.headline");
  const subheadline = campaign?.theme.bannerSubheadline ?? tx("offers.offersHero.subheadline");
  const preset = campaign ? getThemePreset(campaign.themePreset) : null;
  const primaryColor = campaign?.theme.primaryColor;
  const accentColor = campaign?.theme.accentColor;

  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-[#0a0d16] pt-28 pb-20 text-white lg:pt-36 lg:pb-28">
      <CampaignBackdrop preset={campaign?.themePreset} primaryColor={primaryColor} accentColor={accentColor} image={campaign?.bannerImage} />

      <div className="mx-auto max-w-5xl px-6 lg:px-8 text-center relative z-10">
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
          <motion.div
            variants={fadeIn}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md"
          >
            {preset?.emoji ? (
              <span className="text-base leading-none" aria-hidden="true">{preset.emoji}</span>
            ) : (
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            )}
            <span>{campaign ? campaign.name : tx("offers.offersHero.badge")}</span>
          </motion.div>

          {headline && <motion.h1 variants={fadeIn} className="text-4xl font-black tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)] sm:text-6xl lg:text-7xl">
            {headline}
          </motion.h1>}
          {subheadline && <motion.p variants={fadeIn} className="mx-auto max-w-2xl text-lg leading-relaxed text-white/80">
            {subheadline}
          </motion.p>}

          {!campaign && (
            <motion.p variants={fadeIn} className="text-sm text-white/70">
              {tx("offers.offersHero.no-festival-campaign-is-live-right-now-c")}{" "}
              <a href="/services" className="text-primary underline-offset-2 hover:underline">
                {tx("offers.offersHero.full-range-of-services")}</a>{" "}
              {tx("offers.offersHero.in-the-meantime")}</motion.p>
          )}

          {campaign && (
            <motion.div variants={fadeIn}>
              <CampaignCountdown endDate={campaign.endDate} startDate={campaign.startDate} onExpire={onCampaignEnd} onDark />
            </motion.div>
          )}

          {campaign && (
            <motion.div variants={fadeIn} className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
              {PUBLIC_AUDIENCE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onSelectAudience(tab.key)}
                  className="group inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition-all hover:border-white hover:bg-white/20"
                >
                  {tab.cta} →
                </button>
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
