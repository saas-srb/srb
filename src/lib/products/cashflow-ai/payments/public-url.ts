import "server-only";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";

/**
 * Origin for public payment pages (`/pay/<token>`) and gateway callbacks.
 * `NEXT_PUBLIC_APP_URL` is one platform-wide env var, so it only ever applied
 * to the platform owner (whose links are unchanged: the env value, or a
 * relative link when unset). Every other company's links point at its own site.
 */
export async function paymentPublicBaseUrl(): Promise<string> {
  if (await isPlatformOwnerContext()) return process.env.NEXT_PUBLIC_APP_URL || "";
  return companySiteUrl();
}
