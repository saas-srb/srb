"use client";

import { useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Lock, CalendarClock, Sparkles, Bell, Percent, Layers, Users, ArrowRight, Flag } from "lucide-react";
import CampaignCountdown from "@/components/offers/CampaignCountdown";
import CampaignBackdrop from "@/components/offers/CampaignBackdrop";
import { CountdownPill, useRemaining } from "@/components/offers/LiveCountdown";
import NotifyMeForm from "@/components/offers/NotifyMeForm";
import AddToCalendar from "@/components/offers/AddToCalendar";
import StateWatcher from "@/components/offers/StateWatcher";
import EvergreenSection from "@/components/offers/EvergreenSection";
import HowItWorksSection from "@/components/offers/HowItWorksSection";
import OffersFaqSection from "@/components/offers/OffersFaqSection";
import { formatOfferBadge, getAudienceLabel, getOfferTypeLabel, getThemePreset } from "@/lib/offers/constants";
import { formatDateTime, formatDate } from "@/lib/utils";
import type { SerializedCampaign } from "@/lib/offers/campaigns";
import type { SerializedOffer } from "@/lib/offers/offers";
import type { UpcomingCampaign } from "@/lib/offers/state";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

function Unlocks({ startsAt }: { startsAt: string }) {
  const remaining = useRemaining(startsAt);
  if (remaining === null || remaining <= 0) return null;
  return <CountdownPill remaining={remaining} />;
}

function PreviewCard({ offer }: { offer: SerializedOffer }) {
  const tx = useText();
  const types = (offer.offerTypes ?? []).slice(0, 3).map(getOfferTypeLabel);
  return (
    <div className="relative flex flex-col rounded-3xl border border-border/50 bg-background/95 p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Lock className="size-3.5" />{tx("offers.offersUpcoming.sneak-peek")}</span>
        <Unlocks startsAt={offer.validFrom} />
      </div>
      <h3 className="text-lg font-bold text-foreground">{offer.title}</h3>
      <p className="mt-2 text-2xl font-black tracking-tight text-primary">{offer.badgeText || formatOfferBadge(offer.pricing)}</p>
      {types.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {types.map((t) => <span key={t} className="rounded-full border border-primary/30 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{t}</span>)}
        </div>
      )}
      {offer.benefits.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          {offer.benefits.slice(0, 3).map((b) => <li key={b}>• {b}</li>)}
        </ul>
      )}
      <p className="mt-4 flex flex-wrap gap-1.5">
        {(offer.audience.includes("ALL") ? [tx("offers.offersUpcoming.open-to-everyone")] : offer.audience.slice(0, 2).map(getAudienceLabel)).map((a) => (
          <span key={a} className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"><Users className="size-3" />{a}</span>
        ))}
      </p>
      <p className="mt-4 text-xs text-muted-foreground">{tx("offers.offersUpcoming.exact-pricing-is-revealed-when-the-campa")}</p>
    </div>
  );
}

/**
 * States `coming_soon` and `future` — one component, two emphases:
 *  - coming_soon: urgency-forward (pulsing badge, countdown first, notify CTA above the fold)
 *  - future: planning-forward (timeline, what-to-expect, reminders)
 */
export default function OffersUpcoming({
  variant,
  campaign,
  preview,
  later,
  serverTime,
  faqs,
}: {
  variant: "coming_soon" | "future";
  campaign: SerializedCampaign;
  preview: SerializedOffer[];
  later: UpcomingCampaign[];
  serverTime: number;
  faqs: { question: string; answer: string }[];
}) {
  const tx = useText();
  const notifyRef = useRef<HTMLDivElement>(null);
  const preset = getThemePreset(campaign.themePreset);
  const primary = campaign.theme.primaryColor;
  const accent = campaign.theme.accentColor;

  const facts = useMemo(() => {
    const maxPct = preview.reduce((m, o) => Math.max(m, o.pricing.mode === "percentage" ? o.pricing.percentage ?? 0 : 0), 0);
    const typeCounts = new Map<string, number>();
    for (const o of preview) for (const t of o.offerTypes ?? []) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    const types = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const audiences = new Set<string>();
    for (const o of preview) for (const a of o.audience) audiences.add(a);
    return { maxPct, types, audienceCount: audiences.has("ALL") ? null : audiences.size };
  }, [preview]);

  const daysAway = Math.max(0, Math.ceil((new Date(campaign.startDate).getTime() - serverTime) / 86400000));
  const goNotify = () => notifyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="flex min-h-screen flex-col selection:bg-primary/30">
      <StateWatcher serverTime={serverTime} startsAt={campaign.startDate} />

      <section className="relative overflow-hidden border-b border-white/10 bg-[#0a0d16] pt-28 pb-20 text-white lg:pt-36 lg:pb-28">
        <CampaignBackdrop preset={campaign.themePreset} primaryColor={primary} accentColor={accent} image={campaign.bannerImage} />

        <div className="relative z-10 mx-auto max-w-5xl space-y-6 px-6 text-center lg:px-8">
          <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
            {variant === "coming_soon" ? <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" /><span className="relative inline-flex size-2.5 rounded-full bg-primary" /></span> : preset?.emoji ? <span aria-hidden="true">{preset.emoji}</span> : <Flag className="size-4 text-primary" />}
            {variant === "coming_soon" ? tx("offers.offersUpcoming.coming-soon") : tx("offers.offersUpcoming.scheduled").replace("{days}", `${daysAway} ${daysAway === 1 ? "day" : "days"}`)}
          </motion.span>

          <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)] sm:text-6xl lg:text-7xl">{campaign.theme.bannerHeadline ?? campaign.name}</h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-white/80">
            {campaign.theme.bannerSubheadline ?? `${campaign.name} is almost here — exclusive limited-time offers on software, AI, training, internships and developer hiring.`}
          </p>

          <CampaignCountdown endDate={campaign.startDate} label={tx("offers.offersUpcoming.goes-live-in")} showUrgency={false} onDark />

          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/75">
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4 text-primary" />{tx("offers.offersUpcoming.starts")}{formatDateTime(campaign.startDate)}</span>
            <span>{tx("offers.offersUpcoming.runs-until")}{formatDate(campaign.endDate)}</span>
          </p>

          <div className="flex flex-col items-center justify-center gap-3 pt-1 sm:flex-row">
            <button type="button" onClick={goNotify} className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-105">
              <Bell className="size-4" />{tx("offers.offersUpcoming.notify-me-when-it-s-live")}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </button>
            <AddToCalendar name={campaign.name} startsAt={campaign.startDate} endsAt={campaign.endDate} description={campaign.theme.bannerSubheadline} />
          </div>
        </div>
      </section>

      {/* What to expect — every number is derived from the real preview offers */}
      <section className="border-b border-border/50 bg-muted/10 py-14">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{tx("offers.offersUpcoming.what-to-expect")}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-border/50 bg-background p-5"><Layers className="size-5 text-primary" /><p className="mt-2 text-3xl font-black text-foreground">{preview.length || "New"}</p><p className="text-sm text-muted-foreground">{preview.length ? "offers already lined up" : "offers being finalised"}</p></div>
            <div className="rounded-3xl border border-border/50 bg-background p-5"><Percent className="size-5 text-primary" /><p className="mt-2 text-3xl font-black text-foreground">{facts.maxPct ? `Up to ${facts.maxPct}%` : "Special pricing"}</p><p className="text-sm text-muted-foreground">{facts.maxPct ? "off on the biggest deal" : "across services and courses"}</p></div>
            <div className="rounded-3xl border border-border/50 bg-background p-5"><Users className="size-5 text-primary" /><p className="mt-2 text-3xl font-black text-foreground">{facts.audienceCount ?? "Everyone"}</p><p className="text-sm text-muted-foreground">{facts.audienceCount ? "audience groups covered" : "is eligible for something"}</p></div>
          </div>
          {facts.types.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {facts.types.map(([t, n]) => <span key={t} className="rounded-full border border-primary/30 bg-background px-3.5 py-1.5 text-xs font-semibold text-primary">{getOfferTypeLabel(t)} · {n}</span>)}
            </div>
          )}
        </div>
      </section>

      {variant === "future" && (
        <section className="bg-background py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-8">
            <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{tx("offers.offersUpcoming.campaign-timeline")}</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                { label: tx("offers.offersUpcoming.today"), date: formatDate(new Date(serverTime).toISOString()), note: tx("offers.offersUpcoming.sign-up-to-be-notified"), active: false },
                { label: tx("offers.offersUpcoming.goes-live"), date: formatDateTime(campaign.startDate), note: tx("offers.offersUpcoming.offers-unlock-claims-open"), active: true },
                { label: tx("offers.offersUpcoming.ends"), date: formatDate(campaign.endDate), note: tx("offers.offersUpcoming.last-day-to-claim"), active: false },
              ].map((step) => (
                <li key={step.label} className={`rounded-3xl border p-5 ${step.active ? "border-primary/50 bg-primary/5" : "border-border/50"}`}>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">{step.label}</p>
                  <p className="mt-1 font-bold text-foreground">{step.date}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.note}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {preview.length > 0 && (
        <section className="bg-background py-16">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mb-8 flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary"><Sparkles className="size-5 text-white" /></span>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{tx("offers.offersUpcoming.sneak-peek-of-the-offers")}</h2>
                <p className="text-sm text-muted-foreground">{tx("offers.offersUpcoming.each-one-unlocks-with-its-own-countdown-")}</p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {preview.slice(0, 9).map((o) => <PreviewCard key={o._id} offer={o} />)}
            </div>
            {preview.length > 9 && <p className="mt-6 text-center text-sm text-muted-foreground">+ {preview.length - 9}{tx("offers.offersUpcoming.more-offers-at-launch")}</p>}
          </div>
        </section>
      )}

      <section className="border-y border-border/50 bg-muted/10 py-16">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 lg:grid-cols-2 lg:px-8">
          <div className="space-y-4">
            <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{tx("offers.offersUpcoming.be-first-in-line")}</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>{tx("offers.offersUpcoming.one-heads-up-the-moment")}{campaign.name}{tx("offers.offersUpcoming.goes-live-2")}</li>
              <li>{tx("offers.offersUpcoming.claim-before-limited-slots-and-quantitie")}</li>
              <li>{tx("offers.offersUpcoming.have-a-portal-account-you-ll-also-get-an")}</li>
            </ul>
          </div>
          <div ref={notifyRef} id="notify">
            <NotifyMeForm campaignId={campaign._id} campaignName={campaign.name} source={variant} />
          </div>
        </div>
      </section>

      {later.length > 0 && (
        <section className="bg-background py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-8">
            <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">{tx("offers.offersUpcoming.also-on-the-calendar")}</h2>
            <ul className="mt-5 space-y-3">
              {later.map(({ campaign: c, offerCount }) => (
                <li key={c._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 px-5 py-4">
                  <div>
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{tx("offers.offersUpcoming.starts-2")}{formatDateTime(c.startDate)}{offerCount ? ` · ${offerCount} offers` : ""}</p>
                  </div>
                  <Unlocks startsAt={c.startDate} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <EvergreenSection heading={tx("offers.offersUpcoming.explore-while-you-wait")} />
      <HowItWorksSection />
      <OffersFaqSection faqs={faqs} />
    </div>
  );
}
