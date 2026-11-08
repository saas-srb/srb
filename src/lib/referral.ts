/**
 * Referral code capture — mirrors `src/lib/utm.ts`'s shape exactly. Plain
 * module (no `server-only`, no browser APIs) so it's safe to import from
 * both the client-side capture hook and server-side intake validation.
 */

import { isValidReferralCode } from "@/lib/wallet/constants";

const MAX_LEN = 20;

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toUpperCase().slice(0, MAX_LEN);
  return isValidReferralCode(trimmed) ? trimmed : undefined;
}

/** Parse `?ref=CODE` out of a URL query string (`location.search` or similar). */
export function parseReferralCodeFromSearch(search: string): string | undefined {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return undefined;
  }
  return clean(params.get("ref"));
}

/** Normalize a raw referral-code-ish value from anywhere (a form field, a stored value). */
export function normalizeReferralCode(raw: unknown): string | undefined {
  return clean(raw);
}
