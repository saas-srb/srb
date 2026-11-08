import { renderCompanyIcon } from "@/lib/platform/branding/icon";
import { productIconResponse } from "@/lib/platform/saas/static-icon";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return (await productIconResponse(SAAS_BRAND.assets.appleTouch, "image/png")) ?? renderCompanyIcon(180);
}
