import "server-only";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { BUILD_TIMEOUT_MS, buildsConfigured, currentBuildInput } from "@/lib/apps/enqueue";
import { overallStatus, platformsOf, recentBuilds, toView, type BuildDoc } from "@/lib/apps/store";
import { APP_PLATFORMS, type AppPlatform, type AppsOverview, type PlatformAction } from "@/lib/apps/types";

/** Everything the Apps page needs, for the company in scope. */
export async function getAppsOverview(companyId: string): Promise<AppsOverview> {
  const [builds, input, appUrl] = await Promise.all([
    recentBuilds(companyId, 12),
    currentBuildInput(companyId),
    appUrlForCompany(companyId),
  ]);
  const configured = buildsConfigured();
  // A build counts as running only once the build service has accepted it; one that never reached it is not "generating".
  const live = (b: BuildDoc) => ["queued", "building"].includes(overallStatus(b)) && Boolean(b.dispatchedAt) && Date.now() - b.requestedAt.getTime() < BUILD_TIMEOUT_MS;
  const active = builds.find(live) ?? null;

  const downloads = {} as AppsOverview["downloads"];
  for (const p of APP_PLATFORMS) {
    const b = builds.find((x) => platformsOf(x)[p].status === "ready");
    downloads[p] = b ? { version: b.version, builtAt: (platformsOf(b)[p].finishedAt ?? b.requestedAt).toISOString(), files: platformsOf(b)[p].files } : null;
  }

  // One Generate button per platform: running while a build of that platform is in flight, otherwise available.
  const actionFor = (p: AppPlatform): PlatformAction => {
    const running = builds.find((b) => live(b) && ["queued", "building"].includes(platformsOf(b)[p].status));
    if (running) return { kind: "running", since: running.requestedAt.toISOString() };
    if (!configured) return { kind: "unavailable", reason: "The platform's build service isn't connected yet, so apps can't be generated here. You can still download the generated assets." };
    return { kind: "ready" };
  };
  const actions = Object.fromEntries(APP_PLATFORMS.map((p) => [p, actionFor(p)])) as Record<AppPlatform, PlatformAction>;

  const lastReady = builds.find((b) => overallStatus(b) === "ready");
  const lastFailed = builds[0] && overallStatus(builds[0]) === "failed" ? builds[0] : null;

  return {
    configured,
    outdated: Boolean(lastReady && lastReady.input.hash !== input.hash),
    active: active ? toView(active) : null,
    latest: builds[0] ? toView(builds[0]) : null,
    downloads,
    actions,
    appAddress: appUrl.replace(/^https?:\/\//, ""),
    lastError: lastFailed?.error ?? builds[0]?.error ?? null,
  };
}

export const overviewInScope = (companyId: string) => runAsCompany(companyId, () => getAppsOverview(companyId));
