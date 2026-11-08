import { ProviderError, mapHttpFailure, mapModeration, type FetchFn, type FetchedVideo, type ProviderCapabilities, type RemoteStatus, type VideoProvider, type VideoRequest } from "./types";

/**
 * Gemini Omni Flash (`gemini-omni-1.1-flash`) through the Gemini Interactions API, in background mode so a request never has to stay alive
 * while the video renders (POST returns an interaction id; GET /interactions/{id} is polled by the cron sweep).
 * Docs: ai.google.dev/gemini-api/docs/omni, /interactions, /background-execution. Native audio is on by default.
 *
 * Omni has no documented duration parameter: the length is steered in the prompt and read back from the file, so the capability is
 * "prompt" controlled. Pricing: about USD 0.10 per second of 720p output (5,792 output tokens/s at USD 17.50 per 1M).
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const OMNI_API_REVISION = "2026-05-20";
export const OMNI_PRICE_PER_SEC_USD: Record<string, number> = { "720p": 0.1, "1080p": 0.1 };

export const OMNI_CAPABILITIES: ProviderCapabilities = {
  id: "omni",
  label: "Gemini Omni Flash",
  models: ["gemini-omni-1.1-flash"],
  defaultModel: "gemini-omni-1.1-flash",
  allowedDurations: [],
  durationControl: "prompt",
  promptDurationRange: [3, 10],
  maxReferenceImages: 3,
  supportsFirstFrame: true,
  nativeAudio: true,
  aspects: ["9:16", "16:9"],
};

interface InteractionContent { type?: string; mime_type?: string; data?: string; uri?: string; text?: string }
interface Interaction {
  id?: string;
  status?: string;
  error?: { message?: string; code?: number | string };
  steps?: Array<{ type?: string; content?: InteractionContent[] }>;
}

export class GeminiOmniProvider implements VideoProvider {
  readonly capabilities = OMNI_CAPABILITIES;
  constructor(private apiKey: string, private fetchFn: FetchFn = fetch, private priceOverride?: number) {}

  private headers(json = true): Record<string, string> {
    return { "x-goog-api-key": this.apiKey, "Api-Revision": OMNI_API_REVISION, ...(json ? { "Content-Type": "application/json" } : {}) };
  }

  private async call(method: string, path: string, body?: unknown): Promise<Interaction> {
    let res: Response;
    try {
      res = await this.fetchFn(`${BASE}${path}`, { method, headers: this.headers(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ProviderError({ code: "provider_error", retryable: true, message: "Could not reach the video provider. It will be retried automatically." });
    }
    const text = await res.text();
    if (!res.ok) throw new ProviderError(mapHttpFailure(res.status, text), res.status);
    try {
      return JSON.parse(text) as Interaction;
    } catch {
      throw new ProviderError({ code: "provider_error", retryable: true, message: "The video provider returned something unreadable. It will be retried automatically." });
    }
  }

  async submit(req: VideoRequest): Promise<{ providerJobId: string }> {
    const input: Array<Record<string, unknown>> = [];
    if (req.firstFrame) input.push({ type: "image", data: req.firstFrame.data.toString("base64"), mime_type: req.firstFrame.mimeType });
    for (const r of (req.referenceImages ?? []).slice(0, this.capabilities.maxReferenceImages)) input.push({ type: "image", data: r.data.toString("base64"), mime_type: r.mimeType });
    const lengthHint = `Target length about ${req.durationSecs} seconds.`;
    input.push({ type: "text", text: `${req.prompt}\n${lengthHint}` });
    const task = req.firstFrame ? "image_to_video" : (req.referenceImages?.length ?? 0) > 0 ? "reference_to_video" : "text_to_video";
    const out = await this.call("POST", "/interactions", {
      model: req.model || this.capabilities.defaultModel,
      input: input.length === 1 ? (input[0] as { text: string }).text : input,
      background: true,
      store: true,
      generation_config: { video_config: { task } },
      response_format: { type: "video", aspect_ratio: req.aspect, resolution: req.resolution, delivery: "uri" },
    });
    if (!out.id) throw new ProviderError({ code: "provider_error", retryable: true, message: "The video provider did not return a job id. It will be retried automatically." });
    return { providerJobId: out.id };
  }

  async poll(id: string): Promise<RemoteStatus> {
    const it = await this.call("GET", `/interactions/${encodeURIComponent(id)}`);
    switch (it.status) {
      case "completed":
        return hasVideo(it) ? { state: "succeeded" } : { state: "failed", error: mapModeration(JSON.stringify(it.steps ?? [])) ?? { code: "moderation", retryable: false, message: "The video model returned no video for this scene (its safety filter may have declined it). Rewrite the scene and try again." } };
      case "failed": {
        const raw = it.error?.message ?? "";
        return { state: "failed", error: mapModeration(raw) ?? { code: "provider_error", retryable: true, message: "The video provider could not render this scene. It will be retried automatically." } };
      }
      case "cancelled":
        return { state: "cancelled" };
      default:
        return { state: "running" };
    }
  }

  async fetchResult(id: string): Promise<FetchedVideo> {
    const it = await this.call("GET", `/interactions/${encodeURIComponent(id)}`);
    const v = findVideo(it);
    if (!v) throw new ProviderError({ code: "provider_error", retryable: true, message: "The finished video could not be read from the provider." });
    if (v.data) return { data: Buffer.from(v.data, "base64"), contentType: v.mime_type || "video/mp4" };
    if (v.uri) {
      const res = await this.fetchFn(v.uri, { headers: { "x-goog-api-key": this.apiKey } });
      if (!res.ok) throw new ProviderError(mapHttpFailure(res.status, ""), res.status);
      return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") || v.mime_type || "video/mp4" };
    }
    throw new ProviderError({ code: "provider_error", retryable: true, message: "The finished video could not be read from the provider." });
  }

  async cancel(id: string): Promise<void> {
    try {
      await this.call("POST", `/interactions/${encodeURIComponent(id)}/cancel`, {});
    } catch {
      /* best effort: already finished or already gone */
    }
  }

  estimateCost(req: Pick<VideoRequest, "durationSecs" | "resolution" | "model">): number {
    const per = this.priceOverride ?? OMNI_PRICE_PER_SEC_USD[req.resolution] ?? 0.1;
    return round4(per * Math.max(0, req.durationSecs));
  }
}

function findVideo(it: Interaction): InteractionContent | null {
  for (const s of it.steps ?? []) {
    if (s.type !== "model_output") continue;
    for (const c of s.content ?? []) if (c.type === "video" && (c.data || c.uri)) return c;
  }
  return null;
}
const hasVideo = (it: Interaction) => findVideo(it) !== null;
export const round4 = (n: number) => Math.round(n * 10000) / 10000;
