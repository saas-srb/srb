"use client";

import { useCallback, useRef } from "react";
import { classifyDevice, type OfferEventType, type Audience } from "@/lib/offers/constants";
import type { CategorySlug } from "@/lib/categories";

const SESSION_ID_KEY = "offer_session_id";
const UTM_STORAGE_KEY = "yo_utm"; // same key useUtmParams.ts writes — read directly here, call-time, no hook dependency

function getSessionId(): string {
  try {
    let id = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

function getSource(): string {
  try {
    const raw = window.localStorage.getItem(UTM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { source?: string };
      if (parsed?.source) return parsed.source;
    }
  } catch {
    /* ignore */
  }
  try {
    if (document.referrer) return new URL(document.referrer).hostname;
  } catch {
    /* ignore */
  }
  return "direct";
}

interface TrackExtra {
  offerId?: string;
  category?: CategorySlug;
  audience?: Audience;
}

function sendBeaconOrFetch(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/offers/track", blob);
      if (ok) return;
    }
  } catch {
    /* fall through to fetch */
  }
  fetch("/api/offers/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/** Fire-and-forget analytics beacon for the offers funnel — never blocks or throws on the caller. */
export function useOfferTracking(campaignId: string) {
  // Dedup guard so the same (type, offerId) pair doesn't fire twice from a
  // single mount (e.g. a re-render triggered by unrelated state).
  const fired = useRef<Set<string>>(new Set());

  return useCallback(
    (type: OfferEventType, extra: TrackExtra = {}, opts: { once?: boolean } = {}) => {
      if (typeof window === "undefined") return;
      const dedupKey = `${type}:${extra.offerId ?? ""}`;
      if (opts.once) {
        if (fired.current.has(dedupKey)) return;
        fired.current.add(dedupKey);
      }
      sendBeaconOrFetch({
        type,
        campaignId,
        offerId: extra.offerId,
        category: extra.category,
        audience: extra.audience,
        device: classifyDevice(window.innerWidth),
        source: getSource(),
        sessionId: getSessionId(),
      });
    },
    [campaignId]
  );
}
