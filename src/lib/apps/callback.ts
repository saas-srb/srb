import "server-only";
import { buildsCol, overallStatus, platformsOf } from "@/lib/apps/store";
import { APP_PLATFORMS, type AppPlatform, type BuildFile } from "@/lib/apps/types";

/** What the build service reports for ONE platform of a build. */
export interface BuildReport {
  buildId: string;
  platform: AppPlatform;
  status: "building" | "ready" | "failed";
  files?: { name?: unknown; url?: unknown; size?: unknown }[];
  runUrl?: unknown;
  error?: unknown;
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,150}$/;

/**
 * Installers are linked from the company's Apps page, so only HTTPS downloads from GitHub releases are accepted
 * (of the configured releases repository when `DESKTOP_RELEASES_REPO` is set).
 */
function cleanFiles(files: BuildReport["files"]): BuildFile[] {
  const repo = process.env.DESKTOP_RELEASES_REPO?.trim();
  const prefix = repo ? `https://github.com/${repo}/releases/download/` : "https://github.com/";
  const out: BuildFile[] = [];
  for (const f of files ?? []) {
    if (typeof f.name !== "string" || typeof f.url !== "string" || !NAME_RE.test(f.name) || f.url.length > 500 || !f.url.startsWith(prefix) || !/\/releases\/download\//.test(f.url)) continue;
    out.push({ name: f.name, url: f.url, size: typeof f.size === "number" && Number.isFinite(f.size) && f.size >= 0 ? Math.round(f.size) : null });
  }
  return out.slice(0, 6);
}

export async function applyBuildReport(r: BuildReport): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (typeof r.buildId !== "string" || !/^[0-9a-f-]{36}$/.test(r.buildId)) return { ok: false, error: "Unknown build.", status: 400 };
  if (!(APP_PLATFORMS as readonly string[]).includes(r.platform)) return { ok: false, error: "Unknown platform.", status: 400 };
  if (!["building", "ready", "failed"].includes(r.status)) return { ok: false, error: "Unknown status.", status: 400 };

  const col = await buildsCol();
  const doc = await col.findOne({ _id: r.buildId });
  if (!doc) return { ok: false, error: "Unknown build.", status: 404 };

  const now = new Date();
  const set: Record<string, unknown> = { [`platforms.${r.platform}.status`]: r.status };
  if (typeof r.runUrl === "string" && r.runUrl.startsWith("https://github.com/")) set.runUrl = r.runUrl.slice(0, 300);
  if (r.status === "ready") {
    const files = cleanFiles(r.files);
    if (files.length === 0) return { ok: false, error: "A finished build needs at least one valid download.", status: 422 };
    Object.assign(set, { [`platforms.${r.platform}.files`]: files, [`platforms.${r.platform}.error`]: null, [`platforms.${r.platform}.finishedAt`]: now });
  } else if (r.status === "failed") {
    Object.assign(set, { [`platforms.${r.platform}.error`]: typeof r.error === "string" ? r.error.slice(0, 300) : "The build failed.", [`platforms.${r.platform}.finishedAt`]: now });
  }
  await col.updateOne({ _id: r.buildId }, { $set: set });

  // Finished overall once no platform is still waiting or building.
  const after = await col.findOne({ _id: r.buildId });
  if (after && !after.finishedAt && APP_PLATFORMS.every((p) => ["ready", "failed", "skipped"].includes(platformsOf(after)[p].status))) {
    await col.updateOne({ _id: r.buildId }, { $set: { finishedAt: now, error: overallStatus(after) === "failed" ? "Some platforms failed to build." : null } });
  }
  return { ok: true };
}
