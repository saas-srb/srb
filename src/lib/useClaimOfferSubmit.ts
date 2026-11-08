"use client";

import { useEffect, useState } from "react";
import { useUtmParams } from "@/lib/useUtmParams";
import { useReferralCode } from "@/lib/useReferralCode";
import type { Audience } from "@/lib/offers/constants";

type Status = "idle" | "submitting" | "success" | "error";

export const SUCCESS_AUTO_HIDE_MS = 30_000;

export interface ClaimOfferFields {
  name: string;
  email: string;
  phone: string;
  company?: string;
  budgetRange?: string;
  message?: string;
  college?: string;
  graduationYear?: string;
  program?: string;
  experienceLevel?: string;
  skills?: string;
  track?: string;
}

export interface ClaimOfferSubmitData {
  campaignId: string;
  offerId: string;
  audience: Audience;
  couponCode?: string;
  useWallet?: boolean;
  fields: ClaimOfferFields;
}

export interface ClaimPortalResult {
  redirect?: string;
  isNewAccount?: boolean;
  tempPassword?: string | null;
}

export interface ClaimPricingResult {
  originalPrice?: number;
  totalDiscountApplied?: number;
  finalPrice?: number;
  currency?: string;
  walletAmountApplied?: number;
}

export function useClaimOfferSubmit() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pricing, setPricing] = useState<ClaimPricingResult | null>(null);
  const [portal, setPortal] = useState<ClaimPortalResult | null>(null);
  const utm = useUtmParams();
  const referralCode = useReferralCode();

  async function submit(data: ClaimOfferSubmitData) {
    setStatus("submitting");
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/offers/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, utm, referralCode }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus("error");
        setFieldErrors(json?.fields ?? {});
        setError(json?.error ?? "Something went wrong. Please try again.");
        return false;
      }

      setStatus("success");
      setPricing(json?.pricing ?? null);
      const portalInfo = (json?.portal ?? null) as ClaimPortalResult | null;
      setPortal(portalInfo);
      if (portalInfo?.isNewAccount && portalInfo.tempPassword) {
        // same hand-off the other lead forms use, so the portal's one-time temp-password banner still shows
        try {
          sessionStorage.setItem("portalTempPassword", portalInfo.tempPassword);
        } catch {}
      }
      return true;
    } catch {
      setStatus("error");
      setError("Network error. Please check your connection and try again.");
      return false;
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setFieldErrors({});
    setPricing(null);
    setPortal(null);
  }

  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => reset(), SUCCESS_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  return { status, error, fieldErrors, pricing, portal, submit, reset };
}
