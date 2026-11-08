import "server-only";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { buildCompanyIdentity } from "@/lib/pwa/identity";
import { resolvedRootDomain } from "@/lib/platform/integrations/store";
import { saasAppOrigin } from "@/lib/platform/saas/hosts";
import { buildsCol, emptyPlatforms, overallStatus, platformsOf, recentBuilds, type BuildDoc } from "@/lib/apps/store";
import { APP_PLATFORMS, SCOPE_PLATFORMS, type BuildTrigger, type GenerationScope } from "@/lib/apps/types";

/**
 * Creates and starts a company's app build, ONLY when a person presses a Generate button (one per platform) on Settings → Apps:
 * nothing is built automatically, not at onboarding, not after a rename, not by the daily job. The build itself runs on a build service (a GitHub Actions workflow, see
 * `.github/workflows/desktop.yml`) that this hands the work to and that reports back to `/api/apps/builds/callback`.
 * Needs three settings on the platform: GITHUB_DISPATCH_TOKEN (can start workflows), GITHUB_REPOSITORY (`owner/repo`) and
 * DESKTOP_BUILD_SECRET (shared with the workflow). Until they exist builds wait in the queue and start the moment they do.
 */
export function buildsConfigured(): boolean {
  return Boolean(process.env.GITHUB_DISPATCH_TOKEN?.trim() && process.env.GITHUB_REPOSITORY?.trim() && process.env.DESKTOP_BUILD_SECRET?.trim());
}

/** A build handed over longer ago than this without finishing is treated as lost. */
export const BUILD_TIMEOUT_MS = 90 * 60_000;

export interface BuildInput {
  origin: string;
  slug: string;
  rootDomain: string;
  hash: string;
}

/** What an installer for this company would bake in right now (its app address, name and icon), inside the company's scope. */
export async function currentBuildInput(companyId: string): Promise<BuildInput> {
  return runAsCompany(companyId, async () => {
    const [identity, origin, company] = await Promise.all([
      buildCompanyIdentity(),
      appUrlForCompany(companyId),
      getPlatformDb().then((db) => db.collection<Company>(COMPANIES_COLLECTION).findOne({ _id: companyId }, { projection: { slug: 1 } })),
    ]);
    return { origin, slug: company?.slug ?? "workspace", rootDomain: resolvedRootDomain(), hash: `${identity.buildHash}:${origin}` };
  });
}

/** localhost, *.localhost, loopback and private-network addresses: places only this computer can open. */
export function isLocalAddress(origin: string): boolean {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === "localhost" || h.endsWith(".localhost") || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "::1" || h === "[::1]";
  } catch {
    return false;
  }
}

export type EnqueueResult = { ok: true; id: string; created: boolean } | { ok: false; reason: "up-to-date" | "in-progress" | "error"; message: string };

export async function enqueueBuild(companyId: string, trigger: BuildTrigger, opts: { force?: boolean; scope?: GenerationScope } = {}): Promise<EnqueueResult> {
  const scope = opts.scope ?? "all";
  if (!buildsConfigured()) {
    return { ok: false, reason: "error", message: "The platform's build service isn't connected yet, so nothing can be generated. The platform owner must set GITHUB_REPOSITORY, GITHUB_DISPATCH_TOKEN and DESKTOP_BUILD_SECRET." };
  }
  try {
    const col = await buildsCol();
    const recent = await recentBuilds(companyId, 20);
    const wanted = new Set<string>(SCOPE_PLATFORMS[scope]);
    // Only a build that covers one of the same platforms blocks this one: Android can be generated while Windows is building.
    const covering = (b: BuildDoc) => SCOPE_PLATFORMS.all.some((p) => wanted.has(p) && platformsOf(b)[p].status !== "skipped" && !["ready", "failed"].includes(platformsOf(b)[p].status));
    const active = recent.find((b) => ["queued", "building"].includes(overallStatus(b)) && Date.now() - b.requestedAt.getTime() < BUILD_TIMEOUT_MS && covering(b));
    if (active) {
      // A row that was never handed to the build service (an earlier press that could not reach it) must not block a new press:
      // try once more, and if the build service still refuses, close it as failed and start fresh below.
      if (!active.dispatchedAt && !(await dispatchBuild(active))) await failStale(active, (await col.findOne({ _id: active._id }))?.error ?? "The build service did not accept the build.");
      else return { ok: false, reason: "in-progress", message: "A build of this app is already in progress." };
    }
    const input = await currentBuildInput(companyId);
    // GitHub's build machines build the app from the company's live address and report back to the platform: neither can reach a local one.
    if (isLocalAddress(input.origin) && process.env.ALLOW_LOCAL_APP_BUILDS !== "1") {
      return { ok: false, reason: "error", message: `The build runs on GitHub's computers, which cannot reach ${input.origin.replace(/^https?:\/\//, "")} on your computer. Generate the app from your deployed site (such as https://app.yourdomain.com).` };
    }
    const lastReady = recent.find((b) => overallStatus(b) === "ready" && SCOPE_PLATFORMS[scope].every((p) => platformsOf(b)[p].status === "ready"));
    if (!opts.force && lastReady && lastReady.input.hash === input.hash) return { ok: false, reason: "up-to-date", message: "The apps are up to date." };

    const doc: BuildDoc = {
      _id: randomUUID(),
      companyId,
      version: `1.0.${(await col.countDocuments({ companyId, ...(SCOPE_PLATFORMS[scope].length === 1 ? { [`platforms.${SCOPE_PLATFORMS[scope][0]}.status`]: { $nin: ["skipped"] } } : {}) })) + 1}`,
      trigger,
      scope,
      input,
      platforms: emptyPlatforms(scope),
      requestedAt: new Date(),
      dispatchedAt: null,
      finishedAt: null,
      runUrl: null,
      error: null,
      attempts: 0,
    };
    await col.insertOne(doc);
    // The build service must accept the build now. If it refuses (wrong token, wrong repository, the workflow missing on that branch),
    // the app shows the reason at once instead of waiting for a build that will never start.
    if (!(await dispatchBuild(doc))) {
      const reason = (await col.findOne({ _id: doc._id }))?.error ?? "The build service did not accept the build.";
      await failStale(doc, reason);
      return { ok: false, reason: "error", message: reason };
    }
    return { ok: true, id: doc._id, created: true };
  } catch (err) {
    console.error("[apps] could not queue a build", err);
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : "Could not queue the build." };
  }
}

/** Asks the build service (GitHub Actions) to build this row. Records the outcome on the row; never throws. */
export async function dispatchBuild(build: BuildDoc): Promise<boolean> {
  const col = await buildsCol();
  const repo = process.env.GITHUB_REPOSITORY!.trim();
  const workflow = process.env.GITHUB_WORKFLOW_FILE?.trim() || "desktop.yml";
  const ref = process.env.GITHUB_WORKFLOW_REF?.trim() || "main";
  try {
    const api = (process.env.GITHUB_API_URL?.trim() || "https://api.github.com").replace(/\/+$/, "");
    const res = await fetch(`${api}/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN!.trim()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({
        ref,
        inputs: {
          build_id: build._id,
          origin: build.input.origin,
          version: build.version,
          root_domain: build.input.rootDomain,
          platforms: SCOPE_PLATFORMS[build.scope ?? "all"].join(","),
          callback_url: `${saasAppOrigin()}/api/apps/builds/callback`,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status !== 204) throw new Error(`GitHub answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await col.updateOne({ _id: build._id }, { $set: { dispatchedAt: new Date(), error: null }, $inc: { attempts: 1 } });
    return true;
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${(err.cause as NodeJS.ErrnoException).code ?? err.cause.message})` : "";
    const base = err instanceof Error ? err.message : String(err);
    // A bare "fetch failed" means GitHub could not be reached at all (no internet, DNS, a proxy or firewall), not that it said no.
    const message = base === "fetch failed" ? `Could not reach GitHub${cause || ""}. Check the server's internet access, proxy or firewall, and GITHUB_API_URL if you set it.` : `${base}${cause}`;
    console.error("[apps] could not start the build service", message);
    await col.updateOne({ _id: build._id }, { $set: { error: `Could not start the build: ${message}` }, $inc: { attempts: 1 } });
    return false;
  }
}

/** Every platform that hasn't finished successfully is marked failed (the build service timed out or vanished). */
export async function failStale(b: BuildDoc, message = "The build did not finish in time."): Promise<void> {
  const set: Record<string, unknown> = { finishedAt: new Date(), error: message };
  const all = platformsOf(b);
  for (const p of APP_PLATFORMS) if (!["ready", "skipped"].includes(all[p].status)) Object.assign(set, { [`platforms.${p}.status`]: "failed", [`platforms.${p}.error`]: message.slice(0, 300), [`platforms.${p}.finishedAt`]: new Date() });
  await (await buildsCol()).updateOne({ _id: b._id }, { $set: set });
}

export interface CronReport {
  dispatched: number;
  timedOut: number;
}

/**
 * Daily housekeeping for builds a person already asked for. It NEVER starts a build by itself:
 *  1. builds that were requested while no build service was connected are handed over once one is;
 *  2. builds that never finished are marked failed, so the Generate button comes back.
 */
export async function runBuildCron(): Promise<CronReport> {
  const report: CronReport = { dispatched: 0, timedOut: 0 };
  const col = await buildsCol();

  const stale = await col.find({ dispatchedAt: { $lt: new Date(Date.now() - BUILD_TIMEOUT_MS) }, finishedAt: null }).limit(200).toArray();
  for (const b of stale) {
    if (["ready", "failed"].includes(overallStatus(b))) continue;
    await failStale(b);
    report.timedOut++;
  }

  if (buildsConfigured()) {
    for (const b of await col.find({ dispatchedAt: null, finishedAt: null }).limit(100).toArray()) if (await dispatchBuild(b)) report.dispatched++;
  }
  return report;
}
