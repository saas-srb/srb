"use server";

import { headers } from "next/headers";
import { parseInquiry, saveInquiry, type InquiryKind } from "@/lib/platform/saas/inquiries";
import { rateLimit } from "@/lib/security/rate-limit";
import { isSaasHost, saasCanonicalHost } from "@/lib/platform/saas/hosts";

export type InquiryState = { ok: boolean; error?: string; field?: string; reference?: string };

export async function submitInquiry(kind: InquiryKind, _prev: InquiryState | null, fd: FormData): Promise<InquiryState> {
  const h = await headers();
  const host = h.get("host");
  if (!isSaasHost(host)) return { ok: false, error: "This form isn't available here." };
  // A hidden field real visitors never fill: bots that do are told it worked and ignored.
  if (typeof fd.get("website") === "string" && String(fd.get("website")).trim() !== "") return { ok: true };
  const limited = await rateLimit(new Request("http://internal", { headers: h }), `saas-${kind}`, 5, 600);
  if (!limited.ok) return { ok: false, error: "Too many requests. Please wait a few minutes and try again." };
  const parsed = parseInquiry(kind, fd);
  if (!parsed.ok) return { ok: false, error: parsed.error, field: parsed.field };
  try {
    const saved = await saveInquiry(parsed.value, saasCanonicalHost(host));
    return { ok: true, reference: saved.reference };
  } catch (err) {
    console.error("[saas] inquiry not saved", err);
    return { ok: false, error: "Something went wrong on our side. Please try again in a moment." };
  }
}
