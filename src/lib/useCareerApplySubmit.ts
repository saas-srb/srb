"use client";

import { useEffect, useState } from "react";
import { useReferralCode } from "@/lib/useReferralCode";
import { SUCCESS_AUTO_HIDE_MS } from "@/lib/useLeadSubmit";

export { SUCCESS_AUTO_HIDE_MS };

type Status = "idle" | "submitting" | "success" | "error";

export interface CareerApplyFormData {
  name: string;
  email: string;
  phone: string;
  coverNote?: string;
  positionSlug?: string;
  resume: File;
  source?: string;
}

export function useCareerApplySubmit() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const referralCode = useReferralCode();

  async function submit(data: CareerApplyFormData) {
    setStatus("submitting");
    setError(null);
    setFieldErrors({});

    const body = new FormData();
    body.set("name", data.name);
    body.set("email", data.email);
    body.set("phone", data.phone);
    if (data.coverNote) body.set("coverNote", data.coverNote);
    if (data.positionSlug) body.set("positionSlug", data.positionSlug);
    body.set("resume", data.resume);
    if (data.source) body.set("source", data.source);
    if (referralCode) body.set("referralCode", referralCode);

    try {
      const res = await fetch("/api/careers/apply", {
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
