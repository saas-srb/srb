"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, CalendarClock, Users, ShieldCheck, Share2, ArrowRight, ListChecks } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CountdownPill, useRemaining } from "@/components/offers/LiveCountdown";
import { formatOfferBadge, getServiceHref, getAudienceLabel, estimateSavings, unitSuffix, getOfferTypeLabel } from "@/lib/offers/constants";
import { claimProgress } from "@/lib/offers/live";
import { getCategoryLabel } from "@/lib/categories";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { SerializedOffer } from "@/lib/offers/offers";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

const STEPS = (tx: (key: string) => string) => ([
  "Tap “Claim Offer” and share your contact details.",
  "Our team confirms your discount and eligibility within one working day.",
  "Start your project, program or hiring at the offer price.",
]);

function Body({ offer, onClaim, onShare }: { offer: SerializedOffer; onClaim: (offer: SerializedOffer) => void; onShare: (offer: SerializedOffer) => void }) {
  const tx = useText();
  const remaining = useRemaining(offer.validUntil);
  const { original, savings, final } = estimateSavings(offer.pricing);
  const progress = claimProgress(offer.claimedCount, offer.claimLimit);
  const ended = remaining !== null && remaining <= 0;
  const canClaim = !ended && !progress.soldOut;
  const suffix = unitSuffix(offer.pricing.unit);
  const eligibility = [
    ...(offer.eligibility?.length ? offer.eligibility : offer.audience.includes("ALL") ? ["Open to everyone"] : offer.audience.map(getAudienceLabel)),
    ...(offer.segment === "new_user" ? ["First-time customers only — emails that already have an account or claim are not eligible"] : []),
    ...(offer.segment === "existing_user" ? ["Existing customers only — sign in to your portal with the same email to claim"] : []),
  ];

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {remaining !== null && !ended && <CountdownPill remaining={remaining} />}
        {ended && <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{tx("offers.offerDetailsSheet.offer-ended")}</span>}
        {progress.soldOut && <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-[11px] font-semibold text-destructive">{tx("offers.offerDetailsSheet.sold-out")}</span>}
      </div>

      <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
        <p className="text-2xl font-black text-primary">{offer.badgeText || formatOfferBadge(offer.pricing)}</p>
        {original !== null ? (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-background p-2"><p className="text-muted-foreground">{tx("offers.offerDetailsSheet.regular")}</p><p className="mt-0.5 font-semibold line-through">{formatCurrency(original, offer.pricing.currency)}{suffix}</p></div>
            <div className="rounded-xl bg-background p-2"><p className="text-muted-foreground">{tx("offers.offerDetailsSheet.you-save")}</p><p className="mt-0.5 font-semibold text-green-600 dark:text-green-400">{formatCurrency(savings, offer.pricing.currency)}{suffix}</p></div>
            <div className="rounded-xl bg-background p-2"><p className="text-muted-foreground">{tx("offers.offerDetailsSheet.offer-price")}</p><p className="mt-0.5 font-bold">{final !== null ? formatCurrency(final, offer.pricing.currency) + suffix : "—"}</p></div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{tx("offers.offerDetailsSheet.custom-quote-we-price-this-after-a-short")}</p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{tx("offers.offerDetailsSheet.final-pricing-including-any-coupon-is-al")}</p>
      </div>

      {(offer.offerTypes?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {offer.offerTypes!.map((t) => <span key={t} className="rounded-full border border-primary/30 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{getOfferTypeLabel(t)}</span>)}
        </div>
      )}

      {offer.description && <p className="text-sm leading-relaxed text-muted-foreground">{offer.description}</p>}

      {offer.linked && (
        <Link href={offer.linked.href} className="flex items-center justify-between rounded-2xl border border-border/50 px-4 py-3 text-sm hover:border-primary">
          <span><span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{tx("offers.offerDetailsSheet.related")}{offer.linked.kind}</span><span className="font-semibold text-foreground">{offer.linked.label}</span></span>
          <ArrowRight className="size-4 text-primary" />
        </Link>
      )}

      {offer.benefits.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground"><CheckCircle2 className="size-4 text-primary" />{tx("offers.offerDetailsSheet.what-you-get")}</h3>
          <ul className="space-y-1.5">
            {offer.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {b}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground"><Users className="size-4 text-primary" />{tx("offers.offerDetailsSheet.who-is-eligible")}</h3>
        <ul className="space-y-1.5">
          {eligibility.map((e) => (
            <li key={e} className="text-sm text-muted-foreground">• {e}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground"><CalendarClock className="size-4 text-primary" />{tx("offers.offerDetailsSheet.validity")}</h3>
        <p className="text-sm text-muted-foreground">{formatDate(offer.validFrom)}{tx("offers.offerDetailsSheet.to")}{formatDate(offer.validUntil)} — {getCategoryLabel(offer.category)}</p>
        {progress.limit !== null && (
          <p className="mt-1 text-sm text-muted-foreground">{progress.claimed}{tx("offers.offerDetailsSheet.of")}{progress.limit}{tx("offers.offerDetailsSheet.claimed")}{progress.remaining ? `, ${progress.remaining} left` : ""}.</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground"><ListChecks className="size-4 text-primary" />{tx("offers.offerDetailsSheet.how-it-works")}</h3>
        <ol className="space-y-2">
          {STEPS(tx).map((step, i) => (
            <li key={step} className="flex gap-2.5 text-sm text-muted-foreground">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground"><ShieldCheck className="size-3.5 text-primary" />{tx("offers.offerDetailsSheet.good-to-know")}</p>
        {tx("offers.offerDetailsSheet.coupons-stack-with-this-offer-but-the-to")}</section>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          disabled={!canClaim}
          onClick={() => onClaim(offer)}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ended ? "Offer ended" : progress.soldOut ? "Sold out" : offer.ctaText || "Claim this offer"}
          {canClaim && <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />}
        </button>
        <div className="flex items-center justify-between gap-2 text-xs">
          <Link href={getServiceHref(offer.category, offer.subService)} className="text-muted-foreground hover:text-primary hover:underline">{tx("offers.offerDetailsSheet.learn-more-about-this-service")}</Link>
          <button type="button" onClick={() => onShare(offer)} className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-primary">
            <Share2 className="size-3.5" />{tx("offers.offerDetailsSheet.share")}</button>
        </div>
      </div>
    </div>
  );
}

export default function OfferDetailsSheet({
  offer,
  onOpenChange,
  onClaim,
  onShare,
}: {
  offer: SerializedOffer | null;
  onOpenChange: (open: boolean) => void;
  onClaim: (offer: SerializedOffer) => void;
  onShare: (offer: SerializedOffer) => void;
}) {
  // Keep the last offer mounted during the exit animation so the sheet doesn't blank out mid-close.
  const [last, setLast] = useState<SerializedOffer | null>(offer);
  if (offer && offer !== last) setLast(offer);
  const shown = offer ?? last;

  return (
    <Sheet open={Boolean(offer)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0">
        <SheetHeader className="border-b border-border/50">
          <SheetTitle>{shown ? shown.title : "Offer details"}</SheetTitle>
          <SheetDescription>{shown ? `${getCategoryLabel(shown.category)} · festival offer` : ""}</SheetDescription>
        </SheetHeader>
        {shown && <Body key={shown._id} offer={shown} onClaim={onClaim} onShare={onShare} />}
      </SheetContent>
    </Sheet>
  );
}
