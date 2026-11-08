import { cmsEvents } from "@/lib/notify/triggers/cms";
import "server-only";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, CMS_SITE_TAG, expireSiteCache, updateStamp } from "@/lib/products/sitecraft-ai/db";
import { unstable_rethrow } from "next/navigation";

/**
 * Global CMS settings. Brand, contact details and social links live on the
 * same doc as `siteInfo` — see `site-info.ts` (CMS → Site Identity).
 */
export interface CmsSettings {
  maintenanceMode: { enabled: boolean; message: string; title: string; heading: string };
  defaultOgImage: string;
  companyLegalName: string;
}

const DEFAULT_SETTINGS: CmsSettings = {
  maintenanceMode: { enabled: false, message: "", title: "", heading: "" },
  defaultOgImage: "",
  companyLegalName: "",
};

interface CmsSettingsDoc extends CmsSettings {
  _id: "default";
  updatedAt: Date;
  updatedBy: string | null;
}

async function col() {
  const db = await getDb();
  return db.collection<CmsSettingsDoc>(COLLECTIONS.settings);
}

export async function getSettings(): Promise<CmsSettings> {
  const c = await col();
  const doc = await c.findOne({ _id: "default" });
  // Field-by-field defaults, not `doc ?? DEFAULT_SETTINGS`: the same doc also holds `activeThemeKey`
  // (theme.ts upserts it), so a doc can exist without any of these fields ever having been saved.
  return {
    maintenanceMode: { ...DEFAULT_SETTINGS.maintenanceMode, ...doc?.maintenanceMode },
    defaultOgImage: doc?.defaultOgImage ?? DEFAULT_SETTINGS.defaultOgImage,
    companyLegalName: doc?.companyLegalName ?? DEFAULT_SETTINGS.companyLegalName,
  };
}

export async function saveSettings(settings: CmsSettings, actorId: string): Promise<void> {
  const c = await col();
  const before = (await c.findOne({ _id: "default" }))?.maintenanceMode?.enabled === true;
  await c.updateOne({ _id: "default" }, { $set: { ...settings, ...updateStamp(actorId) } }, { upsert: true });
  expireSiteCache();
  if (before !== (settings.maintenanceMode?.enabled === true)) await cmsEvents.maintenance(settings.maintenanceMode?.enabled === true, actorId);
}

const cachedMaintenanceMode = companyCache(async () => (await getSettings()).maintenanceMode, ["cms-maintenance-v1"], { tags: [CMS_SITE_TAG], revalidate: 60 });

/** Fail-soft: if settings are unreachable, the site stays up rather than appearing to be down. */
export async function getMaintenanceMode(): Promise<CmsSettings["maintenanceMode"]> {
  try {
    return await cachedMaintenanceMode();
  } catch (err) {
    unstable_rethrow(err);
    return DEFAULT_SETTINGS.maintenanceMode;
  }
}
