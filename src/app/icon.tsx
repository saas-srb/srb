import { renderCompanyIcon } from "@/lib/platform/branding/icon";
import { productIconResponse } from "@/lib/platform/saas/static-icon";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  return (await productIconResponse(SAAS_BRAND.assets.favicon, "image/png")) ?? renderCompanyIcon(64);
}
