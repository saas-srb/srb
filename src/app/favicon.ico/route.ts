import { renderCompanyIcon } from "@/lib/platform/branding/icon";
import { productIconResponse } from "@/lib/platform/saas/static-icon";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

/** Browsers still ask for /favicon.ico directly: the product's own logo on its hosts; otherwise the current company's icon (its logo, or its initials in the theme colour). */
export async function GET() {
  const own = await productIconResponse(SAAS_BRAND.assets.faviconIco, "image/x-icon");
  if (own) return own;
  const res = await renderCompanyIcon(48);
  res.headers.set("cache-control", "public, max-age=300");
  return res;
}
