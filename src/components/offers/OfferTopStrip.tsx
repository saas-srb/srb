"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Flame, Sparkles, X } from "lucide-react";
import LiveCountdown from "@/components/offers/LiveCountdown";
import { isClaimHref } from "@/lib/offers/constants";
import { useOfferTracking } from "@/lib/useOfferTracking";
import type { ActiveDisplayStrip } from "@/lib/useActiveCampaignDisplay";

const CLOSED_KEY_PREFIX = "offer_strip_closed_session:";

function isClosed(campaignId: string): boolean {
  try {
    return Boolean(window.sessionStorage.getItem(CLOSED_KEY_PREFIX + campaignId));
  } catch {
    return false;
  }
}

/** Renders before <Header/> and publishes its own height via `--offer-strip-h` so the fixed Header (and <main>'s top padding) can offset around it — see (site)/layout.tsx and Header.tsx. */
export default function OfferTopStrip({
  campaign,
  strip,
  phase,
  endDate,
}: {
  campaign: { id: string; slug: string; name: string; startDate?: string };
  strip: ActiveDisplayStrip;
  phase: "live" | "upcoming";
  endDate: string;
}) {
  const upcoming = phase === "upcoming";
  // Pre-launch: count down to the start date instead of the end date — LiveCountdown always
  // counts down to whatever `endDate` it's given, so the "goes live at" moment is passed in its place.
  const countdownTarget = upcoming && campaign.startDate ? campaign.startDate : endDate;
  const [closed, setClosed] = useState(() => isClosed(campaign.id));
  const ref = useRef<HTMLDivElement>(null);
  const track = useOfferTracking(campaign.id);
  const viewedRef = useRef<string | null>(null);

  useEffect(() => {
    if (viewedRef.current === campaign.id) return;
    viewedRef.current = campaign.id;
    track("strip_view", {});
  }, [campaign.id, track]);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (closed || !el) {
      root.style.setProperty("--offer-strip-h", "0px");
      return;
    }
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--offer-strip-h", `${el.offsetHeight}px`);
    });
    observer.observe(el);
    root.style.setProperty("--offer-strip-h", `${el.offsetHeight}px`);
    return () => {
      observer.disconnect();
      root.style.setProperty("--offer-strip-h", "0px");
    };
  }, [closed]);

  function handleClose() {
    try {
      window.sessionStorage.setItem(CLOSED_KEY_PREFIX + campaign.id, "1");
    } catch {
      /* ignore */
    }
    track("strip_close", {});
    setClosed(true);
  }

  if (closed) return null;

  return (
    <div ref={ref} className="fixed inset-x-0 top-0 z-[45] w-full bg-foreground text-background">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center sm:justify-between sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-xs sm:text-sm">
          <span className="inline-flex items-center gap-1 font-bold">
            {upcoming ? <Sparkles className="size-3.5 shrink-0 text-primary" /> : <Flame className="size-3.5 shrink-0 fill-current text-primary" />}
            {strip.message}
          </span>
          {strip.discountText && <span className="font-black text-primary">{strip.discountText}</span>}
          {strip.showCountdown && <LiveCountdown endDate={countdownTarget} label={upcoming ? "Starts in" : undefined} variant="strip" onDark />}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* "Claim Offer" always lands on the Offers page so the visitor can see every live offer and choose. */}
          <Link
            href={isClaimHref(strip.ctaHref) ? "/offers" : strip.ctaHref}
            onClick={() => track("strip_click", {})}
            className="rounded-full bg-primary px-3.5 py-1 text-xs font-semibold text-primary-foreground transition-transform hover:scale-105 sm:text-sm"
          >
            {strip.ctaText}
          </Link>
          {strip.allowClose && (
            <button
              type="button"
              onClick={handleClose}
              aria-label="Dismiss offer"
              className="rounded-full p-1 text-background/70 transition-colors hover:bg-background/10 hover:text-background"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
