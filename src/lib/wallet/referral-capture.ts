import "server-only";
import { cookies } from "next/headers";
import { normalizeReferralCode } from "@/lib/referral";

export const REFERRAL_COOKIE = "yo_ref";

/** The referral code for the current visitor: an explicitly entered/posted value wins, else the first-touch cookie set by `proxy.ts`. */
export async function resolveReferralCode(explicit?: unknown): Promise<string | null> {
  const fromForm = normalizeReferralCode(explicit);
  if (fromForm) return fromForm;
  try {
    return normalizeReferralCode((await cookies()).get(REFERRAL_COOKIE)?.value) ?? null;
  } catch {
    return null;
  }
}

export async function clearReferralCookie(): Promise<void> {
  try {
    (await cookies()).delete(REFERRAL_COOKIE);
  } catch {
    /* not in a mutable request scope — harmless */
  }
}
