"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ClaimOfferModal from "@/components/offers/ClaimOfferModal";
import { setServerTime } from "@/lib/offers/live";
import type { SerializedOffer } from "@/lib/offers/offers";

/**
 * One claim sheet for the whole public site. The offers page cards, the top
 * strip, the popup, the sticky bars and the exit-intent sheet all open THIS
 * sheet via `openClaim`, so "Claim Offer" works identically everywhere:
 * it never navigates away, never depends on another overlay staying open,
 * and only one claim form can ever be on screen.
 */
interface ClaimApi {
  /** Open the claim form for an offer object, an offer id, or (no arg) the best live offer. */
  openClaim: (target?: SerializedOffer | { offerId?: string | null }) => void;
  /** True while the claim sheet is open — the popup checks this so it never opens on top of it. */
  isClaimOpen: () => boolean;
}

const NOOP: ClaimApi = { openClaim: () => {}, isClaimOpen: () => false };
const ClaimContext = createContext<ClaimApi>(NOOP);

export const useOfferClaim = () => useContext(ClaimContext);

interface PublicOffersPayload {
  active: boolean;
  serverTime?: number;
  offers: SerializedOffer[];
}

const CACHE_MS = 30_000;

function isOffer(v: unknown): v is SerializedOffer {
  return Boolean(v) && typeof v === "object" && "_id" in (v as object) && "campaignId" in (v as object);
}

export default function OfferClaimProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [offer, setOffer] = useState<SerializedOffer | null>(null);
  const openRef = useRef(false);
  const cache = useRef<{ at: number; offers: SerializedOffer[] } | null>(null);

  const loadOffers = useCallback(async (): Promise<SerializedOffer[]> => {
    if (cache.current && Date.now() - cache.current.at < CACHE_MS) return cache.current.offers;
    const res = await fetch("/api/offers/public", { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = (await res.json()) as PublicOffersPayload;
    if (typeof json.serverTime === "number") setServerTime(json.serverTime);
    const offers = json.active ? json.offers : [];
    cache.current = { at: Date.now(), offers };
    return offers;
  }, []);

  const openClaim = useCallback<ClaimApi["openClaim"]>(
    (target) => {
      if (isOffer(target)) {
        openRef.current = true;
        setOffer(target);
        return;
      }
      const wantedId = target && "offerId" in target ? target.offerId : null;
      void (async () => {
        try {
          const offers = await loadOffers();
          const pick = (wantedId && offers.find((o) => o._id === wantedId)) || offers.find((o) => o.isDealOfTheDay) || offers.find((o) => o.isFeatured) || offers[0];
          if (!pick) {
            router.push("/offers");
            return;
          }
          openRef.current = true;
          setOffer(pick);
        } catch {
          // Couldn't load the offer right now — the offers page is the safe fallback.
          router.push("/offers");
        }
      })();
    },
    [loadOffers, router]
  );

  const api = useMemo<ClaimApi>(() => ({ openClaim, isClaimOpen: () => openRef.current }), [openClaim]);

  return (
    <ClaimContext.Provider value={api}>
      {children}
      <ClaimOfferModal
        offer={offer}
        campaignId={offer?.campaignId ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            openRef.current = false;
            setOffer(null);
            cache.current = null; // refresh claim counts next time
          }
        }}
      />
    </ClaimContext.Provider>
  );
}
