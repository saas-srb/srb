"use client";

import { useEffect, useState } from "react";
import { parseUtmFromSearch, type Utm } from "@/lib/utm";

const STORAGE_KEY = "yo_utm";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day first-touch window

interface StoredUtm extends Utm {
  capturedAt: number;
  landingPath?: string;
}

function toUtm(stored: StoredUtm): Utm {
  const out: Utm = {};
  for (const key of ["source", "medium", "campaign", "content", "term"] as const) {
    if (stored[key]) out[key] = stored[key];
  }
  return out;
}

function read(): StoredUtm | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUtm;
    if (!parsed || typeof parsed.capturedAt !== "number") return null;
    if (Date.now() - parsed.capturedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * First-touch UTM capture for the public lead forms. On mount, if the current
 * URL carries `utm_*` params and nothing fresh is already stored, persist them.
 * Returns whatever is currently stored (possibly from an earlier page view in
 * the same session), so a form submitted several clicks after the ad landing
 * still attributes correctly.
 */
export function useUtmParams(): Utm | undefined {
  const [utm, setUtm] = useState<Utm | undefined>(undefined);

  useEffect(() => {
    // Reads browser-only APIs (localStorage, location) then reflects the result
    // into state — the canonical "sync external system into React" effect.
    const existing = read();
    const fromUrl = parseUtmFromSearch(window.location.search);

    if (fromUrl && !existing) {
      try {
        const toStore: StoredUtm = { ...fromUrl, capturedAt: Date.now(), landingPath: window.location.pathname };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } catch {
        /* private mode / storage disabled — fall back to in-memory only */
      }
    }

    const resolved = existing ? toUtm(existing) : fromUrl;
    if (resolved && Object.keys(resolved).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUtm(resolved);
    }
  }, []);

  return utm;
}
