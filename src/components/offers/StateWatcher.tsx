"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRemaining } from "@/components/offers/LiveCountdown";
import { setServerTime } from "@/lib/offers/live";

/**
 * Makes the page switch state by itself. The server decides the state from the campaign dates; this just
 * asks it to decide again at the right moment:
 *  - when the start countdown hits zero (with two retries, in case the server clock is a hair behind),
 *  - and every `pollMs` while the tab is visible, so an admin editing a campaign shows up without a reload.
 * `router.refresh()` re-renders the server component in place — no full reload, no lost scroll position.
 */
export default function StateWatcher({ serverTime, startsAt, endsAt, pollMs = 60_000 }: { serverTime: number; startsAt?: string; endsAt?: string; pollMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    setServerTime(serverTime);
  }, [serverTime]);

  const refreshSoon = () => {
    router.refresh();
    setTimeout(() => router.refresh(), 2500);
    setTimeout(() => router.refresh(), 7000);
  };
  // With no target date there is nothing to count down to — use a far-future date and no callback.
  const target = startsAt ?? endsAt;
  useRemaining(target ?? "2999-01-01T00:00:00Z", target ? refreshSoon : undefined);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [router, pollMs]);

  return null;
}
