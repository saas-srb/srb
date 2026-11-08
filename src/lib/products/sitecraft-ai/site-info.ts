import "server-only";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, CMS_SITE_TAG, expireSiteCache, updateStamp } from "@/lib/products/sitecraft-ai/db";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { defaultUiText } from "@/lib/products/sitecraft-ai/default-ui-text";
import { getCompanyBrand } from "@/lib/platform/branding";
import { OWNER_TEXT_DEFAULTS } from "@/lib/products/sitecraft-ai/owner-text-defaults";
import { parseSiteInfo, type SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";

export type { SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";

/** Lives on the `cms_settings` singleton as `siteInfo` (no new collection — Atlas collection limit). */
async function col() {
  const db = await getDb();
  return db.collection<{ _id: string; siteInfo?: unknown }>(COLLECTIONS.settings);
}

/** For the CMS editor: the stored value (missing fields empty). */
export async function getSiteInfoForEdit(): Promise<SiteInfo> {
  const doc = await (await col()).findOne({ _id: "default" }, { projection: { siteInfo: 1 } });
  return parseSiteInfo(doc?.siteInfo);
}

const cached = companyCache(getSiteInfoForEdit, ["cms-site-info-v1"], { tags: [CMS_SITE_TAG], revalidate: 300 });

/** Public read. If the CMS is unreachable this throws, and Next.js keeps serving the last good render. */
export async function getSiteInfo(): Promise<SiteInfo> {
  const info = await cached();
  const [owner, brand] = await Promise.all([isPlatformOwnerContext(), getCompanyBrand()]);
  // Layers, last wins: neutral wording for the chat widget, then the operator's own wording (operator only), then the company's CMS text.
  return { ...info, text: { ...defaultUiText(brand.name), ...(owner ? OWNER_TEXT_DEFAULTS : {}), ...info.text } };
}

export async function saveSiteInfo(info: unknown, actorId: string): Promise<SiteInfo> {
  const clean = parseSiteInfo(info);
  await (await col()).updateOne({ _id: "default" }, { $set: { siteInfo: clean, ...updateStamp(actorId) } }, { upsert: true });
  expireSiteCache();
  return clean;
}
