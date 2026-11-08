import "server-only";
import { unstable_rethrow } from "next/navigation";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, CMS_SITE_TAG, expireSiteCache, updateStamp } from "@/lib/products/sitecraft-ai/db";
import { EMPTY_TRACKING, parseTracking, type TrackingSettings } from "@/lib/products/sitecraft-ai/tracking-shared";

export * from "@/lib/products/sitecraft-ai/tracking-shared";

async function col() {
  return (await getDb()).collection<{ _id: string; tracking?: unknown }>(COLLECTIONS.settings);
}

export async function getTrackingForEdit(): Promise<TrackingSettings> {
  const doc = await (await col()).findOne({ _id: "default" }, { projection: { tracking: 1 } });
  return parseTracking(doc?.tracking);
}

export async function saveTracking(value: unknown, actorId: string): Promise<TrackingSettings> {
  const clean = parseTracking(value);
  await (await col()).updateOne({ _id: "default" }, { $set: { tracking: clean, ...updateStamp(actorId) } }, { upsert: true });
  expireSiteCache();
  return clean;
}

const cached = companyCache(getTrackingForEdit, ["cms-tracking-v2"], { tags: [CMS_SITE_TAG], revalidate: 300 });

/** Public read — fail-soft: if settings are unreachable the site renders without tracking rather than failing. */
export async function getTracking(): Promise<TrackingSettings> {
  try {
    // Always re-normalised: a value cached by an earlier version of this code may have the older shape.
    return parseTracking(await cached());
  } catch (err) {
    unstable_rethrow(err);
    return EMPTY_TRACKING;
  }
}
