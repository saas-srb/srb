"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useOfferTracking } from "@/lib/useOfferTracking";
import { formatOfferBadge } from "@/lib/offers/constants";
import type { SerializedOffer } from "@/lib/offers/offers";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

const SESSION_FLAG = "offer_exit_intent_shown";

/**
 * Desktop-only "wait, don't leave" prompt — mouse-leaves-toward-the-tab-bar
 * detection, shown at most once per browser session. Never fires on touch
 * devices (no reliable mouseleave-to-top signal there).
 */
export default function ExitIntentModal({
  campaignId,
  offer,
  onClaim,
}: {
  campaignId: string;
  offer: SerializedOffer | null;
  onClaim: (offer: SerializedOffer) => void;
}) {
  const tx = useText();
  const [open, setOpen] = useState(false);
  const track = useOfferTracking(campaignId);

  useEffect(() => {
    if (!offer) return;
    const currentOffer = offer; // narrow once, for the nested closure below
    if (window.matchMedia?.("(pointer: coarse)").matches) return; // touch device — skip
    try {
      if (window.sessionStorage.getItem(SESSION_FLAG)) return;
    } catch {
      /* ignore */
    }

    function handleMouseLeave(e: MouseEvent) {
      if (e.clientY > 0) return;
      try {
        window.sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        /* ignore */
      }
      setOpen(true);
      track("exit_intent_shown", { offerId: currentOffer._id, category: currentOffer.category });
      document.removeEventListener("mouseleave", handleMouseLeave);
    }

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?._id]);

  if (!offer) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="top" className="mx-auto max-w-md rounded-b-2xl border-x border-b">
        <SheetHeader>
          <SheetTitle>{tx("offers.exitIntentModal.wait-your-festival-offer-is-still-availa")}</SheetTitle>
          <SheetDescription>
            {tx("offers.exitIntentModal.get")}{offer.badgeText || formatOfferBadge(offer.pricing)}{tx("offers.exitIntentModal.on")}{offer.title}{tx("offers.exitIntentModal.before-the-campaign-ends")}</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button
            onClick={() => {
              setOpen(false);
              onClaim(offer);
            }}
          >
            {tx("offers.exitIntentModal.get-my-exclusive-offer")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
