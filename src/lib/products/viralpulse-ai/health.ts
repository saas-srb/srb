import "server-only";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { listJobStatus, type JobView } from "@/lib/cron/status";
import { isEncryptionConfigured } from "@/lib/products/viralpulse-ai/crypto";
import { listIntegrationViews, type IntegrationView } from "@/lib/products/viralpulse-ai/integrations";
import { listAccounts } from "@/lib/products/viralpulse-ai/accounts/service";
import { accountHealthItems } from "@/lib/products/viralpulse-ai/accounts/health";
import { getSettings } from "@/lib/products/viralpulse-ai/settings";
import { checkLinkedinVersion, effectiveLinkedinVersion } from "@/lib/products/viralpulse-ai/linkedin-version";
import { listAvailableModels, resolveModel, ModelUnavailableError, type ModelList } from "@/lib/products/viralpulse-ai/models";
import { locateFfmpeg, probeFfmpeg, type FfmpegFeatures, type FfmpegLocation } from "@/lib/products/viralpulse-ai/ugc/assemble";
import { fetchGeminiModelIds, videoModelStatus, VIDEO_MODEL_REPLACEMENT, type GeminiModelList } from "@/lib/products/viralpulse-ai/ugc/providers/gemini-models";

/**
 * ViralPulse "System health": one plain reading per dependency, so a missing key, an expired token or a retired model shows up on a
 * page instead of as a failed publish. Rendered under Settings > System health. Every item is `ok` or `attention` (never silent), and
 * every `attention` item carries a `fix` the admin can act on. Nothing here changes data; it only reads and probes.
 */

export type HealthStatus = "ok" | "attention";

export interface HealthItem {
  id: string;
  label: string;
  status: HealthStatus;
  /** One plain sentence on what was found. */
  detail: string;
  /** What to do when status is "attention". */
  fix: string | null;
  /** The last error text recorded for this item, if any. */
  lastError?: string | null;
}

export interface HealthGroup {
  id: "ai" | "connections" | "video" | "scheduler" | "system";
  title: string;
  status: HealthStatus;
  items: HealthItem[];
}

export interface ViralPulseHealth {
  checkedAt: string;
  status: HealthStatus;
  attentionCount: number;
  groups: HealthGroup[];
}

/** Everything the checks read; injectable so tests never touch a network, database or binary. */
export interface HealthDeps {
  now: Date;
  openaiConfigured: boolean;
  openaiModels: ModelList;
  ai: { textModel: string; imageModel: string };
  linkedinSaved: string | undefined;
  linkedinEnv: string | undefined;
  integrations: IntegrationView[];
  /** One item per enabled connected account that is expiring, expired, revoked, missing a permission or failing (accounts/health.ts). */
  accountItems?: HealthItem[];
  geminiConfigured: boolean;
  geminiModels: GeminiModelList | null;
  ffmpeg: FfmpegLocation;
  ffmpegFeatures: FfmpegFeatures | null;
  ffmpegProbeError: string | null;
  jobs: Pick<JobView, "key" | "name" | "health" | "healthNote" | "enabled" | "last" | "lastOkAt" | "effectiveSchedule" | "when">[];
  encryptionReady: boolean;
}

const TOKEN_WARN_DAYS = 14;
const ok = (id: string, label: string, detail: string): HealthItem => ({ id, label, status: "ok", detail, fix: null });
const bad = (id: string, label: string, detail: string, fix: string, lastError?: string | null): HealthItem => ({ id, label, status: "attention", detail, fix, ...(lastError ? { lastError } : {}) });

const group = (id: HealthGroup["id"], title: string, items: HealthItem[]): HealthGroup => ({ id, title, items, status: items.some((i) => i.status === "attention") ? "attention" : "ok" });

function aiItems(d: HealthDeps): HealthItem[] {
  if (!d.openaiConfigured) return [bad("openai.key", "OpenAI key", "OpenAI isn't connected, so text and image generation are unavailable.", "Add your OpenAI API key in Workspace > Settings > Integrations.")];
  const items: HealthItem[] = [ok("openai.key", "OpenAI key", "An OpenAI key is connected.")];
  if (!d.openaiModels.ok) {
    items.push(bad("openai.models", "Model availability", `Couldn't verify the models: ${d.openaiModels.error}`, "Check the key and its permissions (it needs to read the model list); generation still tries the configured models.", d.openaiModels.error));
    return items;
  }
  const available = new Set(d.openaiModels.ids);
  for (const [kind, label, id] of [["text", "Text model", d.ai.textModel], ["image", "Image model", d.ai.imageModel]] as const) {
    try {
      const c = resolveModel(kind, id, available);
      items.push(c.fellBack ? bad(`openai.${kind}`, label, `"${id}" isn't available on your OpenAI account; "${c.model}" is being used instead.`, `Choose "${c.model}" (or another current model) in Settings > AI.`) : ok(`openai.${kind}`, label, `"${id}" is available.`));
    } catch (e) {
      items.push(bad(`openai.${kind}`, label, `"${id}" isn't available and no replacement was found, so ${kind === "image" ? "image" : "text"} generation will fail.`, e instanceof ModelUnavailableError ? e.message : "Choose an available model in Settings > AI."));
    }
  }
  return items;
}

function connectionItems(d: HealthDeps): HealthItem[] {
  const items: HealthItem[] = [];
  if (!d.encryptionReady) items.push(bad("encryption", "Token encryption", "PLATFORM_ENCRYPTION_KEY isn't set, so account tokens can't be stored.", "Set PLATFORM_ENCRYPTION_KEY on the server and redeploy."));
  for (const it of d.integrations) {
    const id = `conn.${it.provider}`;
    if (!it.configured) {
      items.push(bad(id, it.label, "The app credentials aren't set up yet.", "Add the app ID/secret in Workspace > Settings > Integrations, then connect the account here."));
      continue;
    }
    if (!it.connected) {
      items.push(bad(id, it.label, "App credentials are saved but no account is connected.", "Press Connect on the Integrations tab."));
      continue;
    }
    const expires = it.expiresAt ? new Date(it.expiresAt) : null;
    const days = expires ? Math.floor((expires.getTime() - d.now.getTime()) / 86_400_000) : null;
    const noTarget = it.platforms.filter((p) => !it.selected[p] && (it.targets[p]?.length ?? 0) === 0);
    if (it.status === "error" || it.lastError) {
      items.push(bad(id, it.label, `The last call failed${it.lastError ? `: ${it.lastError}` : "."}`, "Reconnect the account; if it fails again check the app's permissions in the provider's developer console.", it.lastError));
    } else if (expires && days !== null && days < 0 && it.provider !== "google") {
      items.push(bad(id, it.label, `The token expired on ${expires.toISOString().slice(0, 10)}; publishing will fail.`, "Press Reconnect on the Integrations tab."));
    } else if (days !== null && days <= TOKEN_WARN_DAYS && it.provider !== "google") {
      items.push(bad(id, it.label, `The token expires in ${days} day${days === 1 ? "" : "s"} (${expires!.toISOString().slice(0, 10)}).`, "Press Reconnect before it expires."));
    } else if (noTarget.length === it.platforms.length) {
      items.push(bad(id, it.label, `Connected as ${it.accountName ?? "this account"}, but no page/channel/profile was found to publish to.`, "Check the account has a Page / channel / profile with the required role and that the needed API access is approved, then reconnect."));
    } else {
      const unsel = it.platforms.filter((p) => (it.targets[p]?.length ?? 0) > 0 && !it.selected[p]);
      items.push(unsel.length
        ? bad(id, it.label, `Connected as ${it.accountName ?? "this account"}; no target chosen for ${unsel.join(", ")}.`, "Choose the page / channel / profile on the Integrations tab.")
        : ok(id, it.label, `Connected as ${it.accountName ?? "this account"}${expires && it.provider !== "google" ? `; token valid until ${expires.toISOString().slice(0, 10)}` : ""}.`));
    }
  }
  items.push(...(d.accountItems ?? []));
  const li = linkedinItem(d);
  if (li) items.push(li);
  return items;
}

function linkedinItem(d: HealthDeps): HealthItem | null {
  const { version, source } = effectiveLinkedinVersion(d.linkedinSaved, d.linkedinEnv);
  const c = checkLinkedinVersion(version, d.now);
  const label = "LinkedIn API version";
  const where = source === "settings" ? "set in Settings" : source === "env" ? "set by LINKEDIN_API_VERSION" : "the built-in default";
  if (c.state === "ok") return ok("linkedin.version", label, `${c.message} (${where}).`);
  return bad("linkedin.version", label, c.message, source === "settings" ? "Change the LinkedIn version in Settings." : source === "env" ? "Update or remove LINKEDIN_API_VERSION on the server." : "Update the app (the default is behind LinkedIn's supported versions).");
}

function videoItems(d: HealthDeps): HealthItem[] {
  const items: HealthItem[] = [];
  if (!d.geminiConfigured) items.push(bad("gemini.key", "Gemini key (video)", "No Gemini API key, so AI UGC videos can't be rendered.", "Add your Gemini API key in Workspace > Settings > Integrations."));
  else {
    items.push(ok("gemini.key", "Gemini key (video)", "A Gemini API key is connected."));
    if (!d.geminiModels) items.push(bad("gemini.models", "Video model", "Model availability wasn't checked.", "Reload the page."));
    else if (!d.geminiModels.ok) items.push(bad("gemini.models", "Video model", `Couldn't verify the video model: ${d.geminiModels.error}`, "Check the Gemini key.", d.geminiModels.error));
    else {
      const s = videoModelStatus(d.geminiModels.ids);
      items.push(s.omni ? ok("gemini.models", "Video model", `${VIDEO_MODEL_REPLACEMENT} is available.`) : bad("gemini.models", "Video model", `${VIDEO_MODEL_REPLACEMENT} isn't available to this Gemini key, so video generation will fail.`, "Enable the Gemini API for the key's project / check its billing and region."));
    }
  }
  if (!d.ffmpeg.path) items.push(bad("ffmpeg", "ffmpeg (final video assembly)", `ffmpeg wasn't found (${d.ffmpeg.tried.join("; ")}). Multi-scene videos would be left as separate clips.`, "Reinstall dependencies (npm install ffmpeg-static) and redeploy, or set FFMPEG_PATH to an ffmpeg binary."));
  else if (d.ffmpegProbeError || !d.ffmpegFeatures) items.push(bad("ffmpeg", "ffmpeg (final video assembly)", `ffmpeg was found (${d.ffmpeg.source}) but couldn't be run: ${d.ffmpegProbeError ?? "no answer"}.`, "Set FFMPEG_PATH to a working ffmpeg binary for this server's platform.", d.ffmpegProbeError));
  else if (!d.ffmpegFeatures.subtitles) items.push(bad("ffmpeg", "ffmpeg (final video assembly)", `ffmpeg ${d.ffmpegFeatures.version ?? ""} (${d.ffmpeg.source}) has no "subtitles" filter (libass), so captions and the AI label can't be burned in.`, "Use an ffmpeg build with libass (set FFMPEG_PATH), e.g. the bundled ffmpeg-static or a full distro build."));
  else items.push(ok("ffmpeg", "ffmpeg (final video assembly)", `ffmpeg ${d.ffmpegFeatures.version ?? ""} from ${d.ffmpeg.source === "env" ? "FFMPEG_PATH" : d.ffmpeg.source === "ffmpeg-static" ? "the bundled package" : "the system PATH"}; captions (libass) ${d.ffmpegFeatures.subtitles ? "available" : "missing"}${d.ffmpegFeatures.drawtext ? ", drawtext available" : ", drawtext not built in (not used)"}.`));
  return items;
}

function schedulerItems(d: HealthDeps): HealthItem[] {
  const wanted: [string, string][] = [["viralpulse-publisher", "Scheduled posts"], ["viralpulse-accounts", "Connected account checks"], ["viralpulse-ugc", "AI UGC videos"], ["viralpulse-metrics", "Social post and account results"]];
  return wanted.map(([key, label]) => {
    const j = d.jobs.find((x) => x.key === key);
    const id = `cron.${key}`;
    if (!j) return bad(id, label, "This job isn't registered.", "Add it to the cron registry and vercel.json.");
    const when = `${j.when}${j.last ? `; last run ${new Date(j.last.startedAt).toISOString().replace("T", " ").slice(0, 16)} UTC (${j.last.status})` : "; has not run yet"}`;
    if (!j.enabled) return bad(id, label, `Paused. ${when}.`, "Resume it in Platform Console > Scheduled jobs.");
    if (j.health === "failing") return bad(id, label, `The last run failed. ${when}.`, "Open Platform Console > Scheduled jobs for the error.", j.last?.error || j.healthNote);
    if (j.health === "overdue") return bad(id, label, `${j.healthNote} ${when}.`, "Check the scheduler (Vercel Cron / RUN_SCHEDULER) and the CRON_SECRET.");
    if (j.health === "waiting") return bad(id, label, `It has not run yet. ${j.when}.`, "Check the scheduler is running; the first run happens at the next scheduled time.");
    return ok(id, label, `${when}.`);
  });
}

/** Pure aggregation of the already-gathered readings. */
export function buildHealth(d: HealthDeps): ViralPulseHealth {
  const groups = [group("ai", "AI text and images", aiItems(d)), group("connections", "Connected accounts", connectionItems(d)), group("video", "AI video (UGC Studio)", videoItems(d)), group("scheduler", "Scheduled jobs", schedulerItems(d))];
  const attentionCount = groups.reduce((n, g) => n + g.items.filter((i) => i.status === "attention").length, 0);
  return { checkedAt: d.now.toISOString(), status: attentionCount ? "attention" : "ok", attentionCount, groups };
}

/** Gathers the live readings for the current company. Each probe is isolated: one failing never hides the rest. */
export async function getViralPulseHealth(origin: string | null = null): Promise<ViralPulseHealth> {
  const settled = async <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
  const [accountViews, settings, integrations, openaiList, openaiConn, gemini, ffmpeg, jobs] = await Promise.all([
    settled(listAccounts(), [] as Awaited<ReturnType<typeof listAccounts>>),
    getSettings(),
    settled(listIntegrationViews(origin), [] as IntegrationView[]),
    settled(listAvailableModels(), { ok: false, error: "OpenAI isn't connected for this workspace." } as ModelList),
    settled(connectionValues("openai"), null),
    settled(connectionValues("gemini"), null),
    settled(locateFfmpeg(), { path: null, source: null, tried: ["the check failed"] } as FfmpegLocation),
    settled(listJobStatus(), [] as JobView[]),
  ]);
  let features: FfmpegFeatures | null = null;
  let probeError: string | null = null;
  if (ffmpeg.path) {
    try {
      features = await probeFfmpeg(ffmpeg.path);
    } catch (e) {
      probeError = e instanceof Error ? e.message : "could not run";
    }
  }
  const geminiModels = gemini?.apiKey ? await fetchGeminiModelIds(gemini.apiKey) : null;
  return buildHealth({
    now: new Date(),
    openaiConfigured: Boolean(openaiConn?.apiKey),
    openaiModels: openaiList,
    ai: { textModel: settings.ai.textModel, imageModel: settings.ai.imageModel },
    linkedinSaved: settings.linkedinVersion,
    linkedinEnv: process.env.LINKEDIN_API_VERSION,
    integrations,
    accountItems: accountHealthItems(accountViews),
    geminiConfigured: Boolean(gemini?.apiKey),
    geminiModels,
    ffmpeg,
    ffmpegFeatures: features,
    ffmpegProbeError: probeError,
    jobs,
    encryptionReady: isEncryptionConfigured(),
  });
}
