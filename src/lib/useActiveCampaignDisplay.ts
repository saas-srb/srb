"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Audience, PopupTemplate, PopupTriggerType, PopupFrequency } from "@/lib/offers/constants";
import { setServerTime } from "@/lib/offers/live";

export interface ActiveDisplayStrip {
  message: string;
  discountText: string;
  ctaText: string;
  ctaHref: string;
  showCountdown: boolean;
  allowClose: boolean;
}

export interface ActiveDisplayPopup {
  template: PopupTemplate;
  emoji: string;
  heading: string;
  ctaText: string;
  ctaHref: string;
  showCountdown: boolean;
  trigger: { type: PopupTriggerType; value: number };
  frequency: PopupFrequency;
}

export interface ActiveDisplay {
  /** True only once the campaign window has actually started — false during the "upcoming" teaser too. */
  active: boolean;
  /** `null` when nothing to show; `"live"` for a running campaign; `"upcoming"` for a pre-launch teaser. */
  phase: "live" | "upcoming" | null;
  campaign?: { id: string; slug: string; name: string; startDate?: string; endDate: string };
  serverTime?: number;
  audience?: Audience;
  strip: ActiveDisplayStrip | null;
  popup: ActiveDisplayPopup | null;
}

const POLL_MS = 90_000; // re-check periodically so a campaign transition (expiry/rotation) shows up without a hard reload
const INACTIVE: ActiveDisplay = { active: false, phase: null, strip: null, popup: null };

/**
 * Single shared fetch for both the top strip and the popup — one request per
 * page/poll tick, never two. If the campaign API fails, this resolves to
 * "inactive" rather than throwing, so the promotional layer degrades
 * gracefully and never breaks the rest of the site.
 */
export function useActiveCampaignDisplay(): ActiveDisplay {
  const pathname = usePathname();
  const [data, setData] = useState<ActiveDisplay>(INACTIVE);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/offers/active-campaign?page=${encodeURIComponent(pathname)}`, { cache: "no-store" });
        // A failed/timed-out request (5xx, network) says nothing about whether the campaign is still live —
        // keep whatever is already on screen instead of yanking a popup out from under the visitor. Only an
        // explicit `{ active: false }` from the server removes the promotion.
        if (!res.ok) return;
        const json = (await res.json()) as ActiveDisplay;
        if (typeof json.serverTime === "number") setServerTime(json.serverTime);
        if (!cancelled) setData(json.phase ? json : INACTIVE);
      } catch {
        /* network error — keep the last good display */
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pathname]);

  return data;
}
