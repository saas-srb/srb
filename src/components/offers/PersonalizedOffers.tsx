"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Timer, Wallet } from "lucide-react";
import OfferCard from "@/components/offers/OfferCard";
import { PUBLIC_AUDIENCE_TABS, type PublicAudienceTabKey } from "@/lib/offers/constants";
import { claimProgress, nowMs } from "@/lib/offers/live";
import type { SerializedOffer } from "@/lib/offers/offers";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

export interface OffersViewer {
  firstName: string | null;
  /** Signed-in portal role label, e.g. "Student". */
  roleLabel: string | null;
  credits: number;
}

const SOON_MS = 72 * 3_600_000;

function rank(a: SerializedOffer, b: SerializedOffer): number {
  // featured/deal first, then soonest-ending, then priority
  const score = (o: SerializedOffer) => (o.isDealOfTheDay ? 3 : 0) + (o.isFeatured ? 2 : 0) + (o.isFlashDeal ? 1 : 0);
  return score(b) - score(a) || new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime() || b.priority - a.priority;
}

/**
 * Two rows that make the page feel relevant instead of generic:
 *  - "Picked for you": offers matching the visitor's audience (signed-in portal role, else the tab they chose)
 *  - "Ending soon":    live offers that expire within 72 hours (the real deadline, on the server-accurate clock)
 * Renders nothing for a row that has no honest content.
 */
export default function PersonalizedOffers({
  offers,
  tab,
  viewer,
  onClaim,
  onDetails,
  onView,
  onExpire,
  onPersonalizedView,
}: {
  offers: SerializedOffer[];
  tab: PublicAudienceTabKey | null;
  viewer: OffersViewer | null;
  onClaim: (offer: SerializedOffer) => void;
  onDetails: (offer: SerializedOffer) => void;
  onView: (offer: SerializedOffer) => void;
  onExpire: (offer: SerializedOffer) => void;
  onPersonalizedView: (tab: PublicAudienceTabKey | null) => void;
}) {
  const tx = useText();
  // `nowMs()` is only meaningful client-side; evaluating it after mount keeps SSR/hydration identical.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser clock only exists client-side
    setNow(nowMs());
    const id = setInterval(() => setNow(nowMs()), 60_000);
    return () => clearInterval(id);
  }, []);

  const tabMeta = tab ? PUBLIC_AUDIENCE_TABS.find((t) => t.key === tab) : null;

  const forYou = useMemo(() => {
    if (!tabMeta) return [];
    return offers
      .filter((o) => !o.audience.includes("ALL") && o.audience.some((a) => tabMeta.matches.includes(a)))
      .sort(rank)
      .slice(0, 3);
  }, [offers, tabMeta]);

  const endingSoon = useMemo(() => {
    if (now === null) return [];
    return offers
      .filter((o) => {
        const left = new Date(o.validUntil).getTime() - now;
        return left > 0 && left <= SOON_MS && !claimProgress(o.claimedCount, o.claimLimit).soldOut;
      })
      .sort((a, b) => new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime())
      .slice(0, 3);
  }, [offers, now]);

  const forYouIds = useMemo(() => new Set(forYou.map((o) => o._id)), [forYou]);
  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = forYou.length ? tab ?? "signed-in" : null;
    if (!key || firedFor.current === key) return;
    firedFor.current = key;
    onPersonalizedView(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forYou.length, tab]);

  if (forYou.length === 0 && endingSoon.length === 0 && !(viewer && viewer.credits > 0)) return null;

  return (
    <section className="border-b border-border/50 bg-background py-14">
      <div className="mx-auto max-w-7xl space-y-12 px-6 lg:px-8">
        {viewer && viewer.credits > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4">
            <Wallet className="size-5 text-primary" />
            <p className="text-sm text-foreground">
              {viewer.firstName ? `${viewer.firstName}, you` : "You"}{tx("offers.personalizedOffers.have")}<span className="font-bold text-primary">{viewer.credits.toLocaleString("en-IN")}{tx("offers.personalizedOffers.brand-credits")}</span>{tx("offers.personalizedOffers.apply-them-on-top-of-any-offer-while-cla")}</p>
          </div>
        )}

        {forYou.length > 0 && (
          <div>
            <div className="mb-6 flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Sparkles className="size-5 text-primary" /></div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
                  {viewer?.firstName ? `Picked for you, ${viewer.firstName}` : "Picked for you"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {viewer?.roleLabel ? `Matched to your ${viewer.roleLabel.toLowerCase()} account` : tabMeta ? `Based on “${tabMeta.label}”` : ""}
                </p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {forYou.map((o) => (
                <OfferCard key={o._id} offer={o} recommended onClaim={onClaim} onDetails={onDetails} onView={onView} onExpire={onExpire} />
              ))}
            </div>
          </div>
        )}

        {endingSoon.length > 0 && (
          <div>
            <div className="mb-6 flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15"><Timer className="size-5 text-amber-600 dark:text-amber-400" /></div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">{tx("offers.personalizedOffers.ending-soon")}</h2>
                <p className="text-sm text-muted-foreground">{tx("offers.personalizedOffers.these-expire-within-3-days-once-the-time")}</p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {endingSoon.map((o) => (
                <OfferCard key={o._id} offer={o} recommended={forYouIds.has(o._id)} onClaim={onClaim} onDetails={onDetails} onView={onView} onExpire={onExpire} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
