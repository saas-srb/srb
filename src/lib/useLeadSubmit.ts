"use client";

import { useEffect, useState } from "react";
import type { CategorySlug } from "@/lib/categories";
import { useUtmParams } from "@/lib/useUtmParams";
import { useReferralCode } from "@/lib/useReferralCode";

type Status = "idle" | "submitting" | "success" | "error";

export const SUCCESS_AUTO_HIDE_MS = 30_000;

export interface LeadFormData {
  name: string;
  email: string;
  phone: string;
  message?: string;
  subService?: string;
  resume?: File | null;
  source?: string;
}

export function useLeadSubmit() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const utm = useUtmParams();
  const referralCode = useReferralCode();

  async function submit(category: CategorySlug | (string & {}), data: LeadFormData) {
    setStatus("submitting");
    setError(null);
    setFieldErrors({});

    const body = new FormData();
    body.set("name", data.name);
    body.set("email", data.email);
    body.set("phone", data.phone);
    if (data.message) body.set("message", data.message);
    if (data.subService) body.set("subService", data.subService);
    if (data.resume) body.set("resume", data.resume);
    if (data.source) body.set("source", data.source);
    if (utm?.source) body.set("utmSource", utm.source);
    if (utm?.medium) body.set("utmMedium", utm.medium);
    if (utm?.campaign) body.set("utmCampaign", utm.campaign);
    if (utm?.content) body.set("utmContent", utm.content);
    if (utm?.term) body.set("utmTerm", utm.term);
    if (referralCode) body.set("referralCode", referralCode);

    try {
      const res = await fetch(`/api/leads/${category}`, {
        method: "POST",
        body,
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus("error");
        setFieldErrors(json?.fields ?? {});
        setError(json?.error ?? "Something went wrong. Please try again.");
        return false;
      }

      setStatus("success");
      // Lead-driven portal: the API signed this visitor in — hand them off to
      // their portal dashboard. A brief pause lets the success state render
      // (and, for a brand-new account, the one-time temp password).
      const portal = json?.portal as { redirect?: string; isNewAccount?: boolean; tempPassword?: string | null } | undefined;
      if (portal?.redirect) {
        if (portal.isNewAccount && portal.tempPassword) {
          try {
            sessionStorage.setItem("portalTempPassword", portal.tempPassword);
          } catch {}
        }
        setTimeout(() => window.location.assign(portal.redirect as string), portal.isNewAccount ? 2600 : 1200);
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
  }

  // Auto-dismiss the success state after a while so the form is ready for another submission.
  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => {
      setStatus("idle");
      setError(null);
      setFieldErrors({});
    }, SUCCESS_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  return { status, error, fieldErrors, submit, reset };
}
