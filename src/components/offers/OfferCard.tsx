"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Flame, ArrowRight, CheckCircle2, Users, Sparkles, CalendarClock, Info, Link2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CountdownPill, useRemaining } from "@/components/offers/LiveCountdown";
import { formatOfferBadge, getServiceHref, getAudienceLabel, estimateSavings, getOfferTypeLabel, unitSuffix } from "@/lib/offers/constants";
import { getUrgency, URGENCY_STYLES, claimProgress, nowMs } from "@/lib/offers/live";
import { getCategoryLabel, getSubServices } from "@/lib/categories";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { SerializedOffer } from "@/lib/offers/offers";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

function subServiceLabel(offer: SerializedOffer): string {
  if (offer.subService === "all") return getCategoryLabel(offer.category);
  return getSubServices(offer.category).find((s) => s.slug === offer.subService)?.label ?? getCategoryLabel(offer.category);
}

/** The two most informative marketplace tags (the urgency-only ones are already conveyed by the status chip / countdown). */
function typeChips(offer: SerializedOffer): string[] {
  const skip = new Set(["limited_time", "flash"]);
  return (offer.offerTypes ?? []).filter((t) => !skip.has(t)).slice(0, 2).map(getOfferTypeLabel);
}

/** Human-readable "who is this for" chips. */
function audienceChips(offer: SerializedOffer): string[] {
  if (offer.audience.includes("ALL")) return ["Open to everyone"];
  return offer.audience.slice(0, 3).map(getAudienceLabel);
}

export default function OfferCard({
  offer,
  onClaim,
  onDetails,
  onView,
  onExpire,
  recommended = false,
  compact = false,
}: {
  offer: SerializedOffer;
  onClaim: (offer: SerializedOffer) => void;
  onDetails?: (offer: SerializedOffer) => void;
  /** Fired once when the card actually scrolls into view (real viewability, not page load). */
  onView?: (offer: SerializedOffer) => void;
  /** Fired once when this offer's countdown reaches zero while the visitor is watching. */
  onExpire?: (offer: SerializedOffer) => void;
  recommended?: boolean;
  compact?: boolean;
}) {
  const tx = useText();
  const [expired, setExpired] = useState(false);
  const remaining = useRemaining(offer.validUntil, () => {
    setExpired(true);
    onExpire?.(offer);
  });
  const badge = offer.badgeText || formatOfferBadge(offer.pricing);
  const { original, savings, final } = estimateSavings(offer.pricing);
  const progress = claimProgress(offer.claimedCount, offer.claimLimit);
  const notStarted = new Date(offer.validFrom).getTime() > nowMs();
  const ended = expired || (remaining !== null && remaining <= 0);
  const urgency = remaining !== null ? getUrgency(remaining) : null;
  const canClaim = !ended && !progress.soldOut && !notStarted;

  // One status chip, most important state wins.
  let status: { label: string; className: string } | null = null;
  if (ended) status = { label: tx("offers.offerCard.ended"), className: URGENCY_STYLES.ended.chip };
  else if (progress.soldOut) status = { label: tx("offers.offerCard.sold-out"), className: URGENCY_STYLES.critical.chip };
  else if (notStarted) status = { label: tx("offers.offerCard.starts-soon"), className: URGENCY_STYLES.upcoming.chip };
  else if (progress.almostGone) status = { label: `Only ${progress.remaining} ${offer.limitKind === "quantity" ? "left" : "slots left"}`, className: URGENCY_STYLES.urgent.chip };
  else if (urgency && urgency.label) status = { label: urgency.label, className: URGENCY_STYLES[urgency.level].chip };
  else status = { label: tx("offers.offerCard.live-now"), className: "bg-green-500/15 text-green-600 dark:text-green-400" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      onViewportEnter={() => onView?.(offer)}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4 }}
      className={`flex flex-col rounded-3xl border bg-background/95 p-6 backdrop-blur-md transition-transform hover:-translate-y-1 ${
        recommended ? "border-primary/50" : "border-border/50"
      } ${ended ? "opacity-70" : ""} ${compact ? "min-w-[260px]" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-primary">
          <Flame className="size-3.5" /> {offer.isDealOfTheDay ? "Deal of the Day" : offer.isFlashDeal || offer.offerTypes?.includes("flash") ? "Flash Deal" : offer.offerTypes?.includes("hourly") ? "Hourly Rate Offer" : offer.offerTypes?.includes("combo") ? "Combo Offer" : offer.offerTypes?.includes("first_time") ? "Welcome Offer" : offer.offerTypes?.includes("renewal") ? "Renewal Offer" : "Festival Offer"}
        </span>
        {recommended ? (
          <Badge className="gap-1"><Sparkles className="size-3" />{tx("offers.offerCard.for-you")}</Badge>
        ) : offer.isFeatured ? (
          <Badge variant="secondary">{tx("offers.offerCard.most-popular")}</Badge>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {status && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>}
        {!ended && !notStarted && remaining !== null && <CountdownPill remaining={remaining} />}
      </div>

      <p className="text-xs font-medium text-muted-foreground">{subServiceLabel(offer)}</p>
      <h3 className="mt-1 text-lg font-bold text-foreground">{offer.title}</h3>
      {offer.description && !compact && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{offer.description}</p>}

      <div className="mt-4">
        <p className="text-2xl font-black tracking-tight text-primary">{badge}</p>
        {original !== null && (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
            {offer.pricing.unit && offer.pricing.unit !== "fixed" ? (
              <>
                <span className="text-muted-foreground">{tx("offers.offerCard.regular")}</span>
                <span className="text-muted-foreground line-through">{formatCurrency(original, offer.pricing.currency)}{unitSuffix(offer.pricing.unit)}</span>
                {final !== null && <span className="font-bold text-foreground">{tx("offers.offerCard.offer")}{formatCurrency(final, offer.pricing.currency)}{unitSuffix(offer.pricing.unit)}</span>}
              </>
            ) : (
              <>
                <span className="text-muted-foreground line-through">{formatCurrency(original, offer.pricing.currency)}</span>
                {final !== null && <span className="font-bold text-foreground">{formatCurrency(final, offer.pricing.currency)}</span>}
                {savings > 0 && <span className="text-xs font-semibold text-green-600 dark:text-green-400">{tx("offers.offerCard.save")}{formatCurrency(savings, offer.pricing.currency)}</span>}
              </>
            )}
          </p>
        )}
      </div>

      {!compact && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {audienceChips(offer).map((chip) => (
            <span key={chip} className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Users className="size-3" /> {chip}
            </span>
          ))}
        </div>
      )}

      {!compact && (typeChips(offer).length > 0 || offer.linked) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {typeChips(offer).map((t) => (
            <span key={t} className="rounded-full border border-primary/30 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{t}</span>
          ))}
          {offer.linked && (
            <Link href={offer.linked.href} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-primary hover:underline">
              <Link2 className="size-3" /> {offer.linked.label}
            </Link>
          )}
        </div>
      )}

      {offer.benefits.length > 0 && !compact && (
        <ul className="mt-4 space-y-1.5">
          {offer.benefits.slice(0, 3).map((b) => (
            <li key={b} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-primary" /> {b}
            </li>
          ))}
          {offer.benefits.length > 3 && (
            <li className="pl-6 text-xs text-muted-foreground">
              +{offer.benefits.length - 3}{tx("offers.offerCard.more")}{" "}
              <button type="button" onClick={() => onDetails?.(offer)} className="font-medium text-primary hover:underline">{tx("offers.offerCard.see-all")}</button>
            </li>
          )}
        </ul>
      )}

      {/* Real scarcity only: a bar exists solely when the admin set a claim limit; otherwise show honest social proof (a true claim count). */}
      {!compact && progress.limit !== null && progress.percent !== null && (
        <div className="mt-4" aria-label={`${progress.claimed} of ${progress.limit} claimed`}>
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Zap className="size-3 text-primary" />{offer.limitKind === "quantity" ? "Limited quantity" : "Limited slots"} · {progress.claimed}/{progress.limit}{tx("offers.offerCard.claimed")}</span>
            <span>{progress.soldOut ? "Sold out" : offer.limitKind === "quantity" ? `${progress.remaining} left in stock` : `${progress.remaining} slots left`}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full transition-[width] duration-700 ${progress.almostGone || progress.soldOut ? "bg-destructive" : "bg-primary"}`} style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}
      {!compact && progress.limit === null && progress.claimed >= 5 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users className="size-3.5 text-primary" /> {progress.claimed.toLocaleString("en-IN")}{tx("offers.offerCard.people-have-claimed-this")}</p>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" />{tx("offers.offerCard.valid-until")}{formatDate(offer.validUntil)}
      </p>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          disabled={!canClaim}
          onClick={() => onClaim(offer)}
          className="group inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform enabled:hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ended ? "Offer ended" : progress.soldOut ? "Sold out" : notStarted ? "Not started yet" : (offer.ctaText || "Claim Offer")}
          {canClaim && <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />}
        </button>
        {onDetails && (
          <button
            type="button"
            onClick={() => onDetails(offer)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Info className="size-4" />{tx("offers.offerCard.details")}</button>
        )}
      </div>
      <Link href={getServiceHref(offer.category, offer.subService)} className="mt-3 text-center text-xs text-muted-foreground hover:text-primary hover:underline">
        {tx("offers.offerCard.learn-more-about-this-service")}</Link>
    </motion.div>
  );
}
