import { APP_PLATFORMS, SCOPE_PLATFORMS, type AppPlatform, type BuildFile, type GenerationScope, type PlatformStatus } from "@/lib/apps/types";

/** Pure helpers for a build's per-platform status (no database), shared by the store, the Apps page and the tests. */
export type BuildPlatforms = Record<AppPlatform, { status: PlatformStatus; files: BuildFile[]; error: string | null; finishedAt: Date | null }>;

/** Every platform of the scope waits to be built; the others are skipped. */
export function emptyPlatforms(scope: GenerationScope = "all"): BuildPlatforms {
  const mk = (status: PlatformStatus) => ({ status, files: [] as BuildFile[], error: null as string | null, finishedAt: null as Date | null });
  const inScope = new Set<AppPlatform>(SCOPE_PLATFORMS[scope]);
  return Object.fromEntries(APP_PLATFORMS.map((p) => [p, mk(inScope.has(p) ? "queued" : "skipped")])) as BuildPlatforms;
}

/** A row's platforms with defaults for any missing (rows written before a platform existed). */
export function platformsOf(b: { platforms?: Partial<BuildPlatforms> }): BuildPlatforms {
  const out = { ...emptyPlatforms("all") };
  for (const p of APP_PLATFORMS) if (b.platforms?.[p]) out[p] = b.platforms[p];
  return out;
}

/** queued → building → ready/failed, from the three platforms. */
export function overallStatus(b: { platforms?: Partial<BuildPlatforms>; dispatchedAt: Date | null }): "queued" | "building" | "ready" | "failed" {
  const all = platformsOf(b);
  const states = APP_PLATFORMS.map((p) => all[p].status).filter((s) => s !== "skipped");
  if (states.length === 0) return "ready";
  if (states.every((s) => s === "ready")) return "ready";
  if (states.some((s) => s === "building")) return "building";
  if (states.every((s) => s === "ready" || s === "failed")) return states.some((s) => s === "failed") ? "failed" : "ready";
  return b.dispatchedAt ? "building" : "queued";
}

