"use client";

import { useEffect, useState } from "react";
import { parseReferralCodeFromSearch } from "@/lib/referral";

const STORAGE_KEY = "yo_referral";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day first-touch window, same as useUtmParams

interface StoredReferral {
  code: string;
  capturedAt: number;
}

function read(): StoredReferral | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReferral;
    if (!parsed || typeof parsed.capturedAt !== "number") return null;
    if (Date.now() - parsed.capturedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * First-touch `?ref=CODE` capture for the public intake forms — mirrors
 * `useUtmParams()` exactly. Returns whatever is currently stored (possibly
 * from an earlier page view in the same 30-day window), so a form submitted
 * several clicks after following a referral link still attributes correctly.
 */
export function useReferralCode(): string | undefined {
  const [code, setCode] = useState<string | undefined>(undefined);

  useEffect(() => {
    const existing = read();
    const fromUrl = parseReferralCodeFromSearch(window.location.search);

    if (fromUrl && !existing) {
      try {
        const toStore: StoredReferral = { code: fromUrl, capturedAt: Date.now() };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } catch {
        /* private mode / storage disabled — fall back to in-memory only */
      }
    }

    const resolved = existing?.code ?? fromUrl;
    if (resolved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only capture, avoids an SSR/hydration mismatch (same pattern as useUtmParams)
      setCode(resolved);
    }
  }, []);

  return code;
}
