"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";
import { useReferralCode } from "@/lib/useReferralCode";
import { formatCredits } from "@/lib/wallet/constants";

import { useText } from "@/components/products/sitecraft-ai/TextContext";
import { BrandName } from "@/components/platform/BrandProvider";
interface Preview {
  valid: boolean;
  referrerFirstName?: string;
  welcomeBonus: number;
}

const DISMISS_KEY = "yo_referral_banner_dismissed";

/**
 * Shown when a visitor arrives via someone's referral link (`/?ref=CODE`):
 * confirms the invite is real and leads straight to the signup page with the
 * code already attached. Hidden for signed-in portal users, invalid codes and
 * once dismissed (per browser session).
 */
export default function ReferralWelcome() {
  const tx = useText();
  const code = useReferralCode();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1"); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/referral/validate?code=${encodeURIComponent(code)}`, { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/clientos/wallet-balance", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ signedIn: false })),
    ])
      .then(([p, w]) => {
        if (cancelled) return;
        setPreview(p);
        setSignedIn(Boolean(w?.signedIn));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!code || !preview?.valid || dismissed || signedIn) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div role="status" className="fixed bottom-4 left-4 right-4 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-primary/30 bg-background/95 p-4 shadow-xl backdrop-blur sm:left-auto sm:right-4 sm:mx-0">
      <Gift className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-foreground">{preview.referrerFirstName}{tx("offers.referralWelcome.invited-you-to")}<BrandName /></p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {tx("offers.referralWelcome.create-a-free-account")}{preview.welcomeBonus > 0 ? ` and earn up to ${formatCredits(preview.welcomeBonus)}` : ""}.
        </p>
        <Link href={`/register?ref=${encodeURIComponent(code)}`} className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          {tx("offers.referralWelcome.claim-my-bonus")}</Link>
      </div>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}
