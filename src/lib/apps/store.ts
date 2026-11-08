import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { APP_PLATFORMS, type AppPlatform, type BuildFile, type BuildTrigger, type BuildView, type GenerationScope, type PlatformState, type PlatformStatus } from "@/lib/apps/types";

/**
 * The desktop-app build pipeline. Platform-level (a build service reports back without being signed in to any company), so rows
 * live in a global collection and EVERY company-facing read here is pinned to its companyId.
 */
export const APP_BUILDS_COLLECTION = "app_builds";

export interface BuildDoc {
  _id: string;
  companyId: string;
  version: string;
  trigger: BuildTrigger;
  scope: GenerationScope;
  /** Everything the build needs, decided when it was queued. */
  input: { origin: string; slug: string; rootDomain: string; hash: string };
  platforms: Record<AppPlatform, { status: PlatformStatus; files: BuildFile[]; error: string | null; finishedAt: Date | null }>;
  requestedAt: Date;
  /** When the build service was asked (null = still waiting for one to be connected). */
  dispatchedAt: Date | null;
  finishedAt: Date | null;
  runUrl: string | null;
  error: string | null;
  attempts: number;
}

let indexed = false;
export async function buildsCol() {
  const c = (await getPlatformDb()).collection<BuildDoc>(APP_BUILDS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ companyId: 1, requestedAt: -1 }), c.createIndex({ dispatchedAt: 1, finishedAt: 1 })]).catch(() => {});
  }
  return c;
}

export { emptyPlatforms, overallStatus, platformsOf } from "@/lib/apps/status";
import { overallStatus, platformsOf } from "@/lib/apps/status";

export function toView(b: BuildDoc): BuildView {
  const all = platformsOf(b);
  const platforms = Object.fromEntries(
    APP_PLATFORMS.map((p) => {
      const s = all[p];
      const v: PlatformState = { status: s.status, files: s.files, error: s.error, finishedAt: s.finishedAt ? s.finishedAt.toISOString() : null };
      return [p, v];
    }),
  ) as Record<AppPlatform, PlatformState>;
  return {
    id: b._id,
    version: b.version,
    trigger: b.trigger,
    scope: b.scope ?? "all",
    status: overallStatus(b),
    platforms,
    requestedAt: b.requestedAt.toISOString(),
    finishedAt: b.finishedAt ? b.finishedAt.toISOString() : null,
    runUrl: b.runUrl,
    error: b.error,
    attempts: b.attempts,
  };
}

/** The company's recent builds, newest first. */
export async function recentBuilds(companyId: string, limit = 8): Promise<BuildDoc[]> {
  return (await buildsCol()).find({ companyId }).sort({ requestedAt: -1 }).limit(limit).toArray();
}
