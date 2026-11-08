import { ProviderError, mapHttpFailure, mapModeration, type FetchFn, type FetchedVideo, type ProviderCapabilities, type RemoteStatus, type VideoProvider, type VideoRequest } from "./types";
import { round4 } from "./gemini-omni";

/**
 * Google Veo through the Gemini API (`models/{model}:predictLongRunning`, long-running operation polled with GET).
 * Docs: ai.google.dev/gemini-api/docs/veo. Clips are 4, 6 or 8 s, 16:9 or 9:16, with native audio.
 *
 * RETIRED (checked 2026-11-01, ai.google.dev/gemini-api/docs/deprecations): Veo 3.1 previews shut down 2026-10-22, `veo-3.0-*-001` and
 * `veo-2.0-generate-001` on 2026-06-30 (Google calls these "earliest" dates); Google's replacement for all of them is
 * `gemini-omni-1.1-flash` (the default provider). The adapter is kept, unchanged and testable, for accounts where Google still serves a
 * Veo model: `getVideoProvider("veo")` only hands it out when the account's live model list contains a `veo-*` model. Generated files
 * are kept by Google for only 2 days: the engine downloads them as soon as a job succeeds.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const VEO_PRICE_PER_SEC_USD: Record<string, number> = { "veo-3.0-generate-001": 0.4, "veo-3.0-fast-generate-001": 0.15 };

export const VEO_CAPABILITIES: ProviderCapabilities = {
  id: "veo",
  label: "Google Veo 3 (retired by Google)",
  models: ["veo-3.0-fast-generate-001", "veo-3.0-generate-001"],
  defaultModel: "veo-3.0-fast-generate-001",
  allowedDurations: [4, 6, 8],
  durationControl: "param",
  maxReferenceImages: 0,
  supportsFirstFrame: true,
  nativeAudio: true,
  aspects: ["9:16", "16:9"],
};

interface Operation {
  name?: string;
  done?: boolean;
  error?: { message?: string; code?: number };
  response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }>; raiMediaFilteredCount?: number; raiMediaFilteredReasons?: string[] } };
}

export class VeoProvider implements VideoProvider {
  readonly capabilities = VEO_CAPABILITIES;
  constructor(private apiKey: string, private fetchFn: FetchFn = fetch, private priceOverride?: number) {}

  private async call(method: string, url: string, body?: unknown): Promise<Operation> {
    let res: Response;
    try {
      res = await this.fetchFn(url, { method, headers: { "x-goog-api-key": this.apiKey, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ProviderError({ code: "provider_error", retryable: true, message: "Could not reach the video provider. It will be retried automatically." });
    }
    const text = await res.text();
    if (!res.ok) throw new ProviderError(mapHttpFailure(res.status, text), res.status);
    try {
      return text ? (JSON.parse(text) as Operation) : {};
    } catch {
      throw new ProviderError({ code: "provider_error", retryable: true, message: "The video provider returned something unreadable. It will be retried automatically." });
    }
  }

  async submit(req: VideoRequest): Promise<{ providerJobId: string }> {
    if (!this.capabilities.allowedDurations.includes(req.durationSecs)) throw new ProviderError({ code: "invalid_request", retryable: false, message: `Veo renders 4, 6 or 8 second clips; ${req.durationSecs}s is not available.` });
    const instance: Record<string, unknown> = { prompt: req.prompt };
    if (req.firstFrame) instance.image = { bytesBase64Encoded: req.firstFrame.data.toString("base64"), mimeType: req.firstFrame.mimeType };
    const model = req.model || this.capabilities.defaultModel;
    const op = await this.call("POST", `${BASE}/models/${encodeURIComponent(model)}:predictLongRunning`, {
      instances: [instance],
      parameters: { aspectRatio: req.aspect, durationSeconds: req.durationSecs, resolution: req.resolution === "1080p" && req.durationSecs === 8 ? "1080p" : "720p", personGeneration: req.firstFrame ? "allow_adult" : "allow_all" },
    });
    if (!op.name) throw new ProviderError({ code: "provider_error", retryable: true, message: "The video provider did not return a job id. It will be retried automatically." });
    return { providerJobId: op.name };
  }

  async poll(name: string): Promise<RemoteStatus> {
    const op = await this.call("GET", `${BASE}/${name}`);
    if (!op.done) return { state: "running" };
    if (op.error) return { state: "failed", error: mapModeration(op.error.message ?? "") ?? { code: "provider_error", retryable: true, message: "The video provider could not render this scene. It will be retried automatically." } };
    const r = op.response?.generateVideoResponse;
    if (r?.generatedSamples?.[0]?.video?.uri) return { state: "succeeded" };
    const why = (r?.raiMediaFilteredReasons ?? []).join(" ");
    return { state: "failed", error: mapModeration(why) ?? { code: "moderation", retryable: false, message: "The video model's safety filter declined this scene. Rewrite it more neutrally and try again." } };
  }

  async fetchResult(name: string): Promise<FetchedVideo> {
    const op = await this.call("GET", `${BASE}/${name}`);
    const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) throw new ProviderError({ code: "provider_error", retryable: true, message: "The finished video could not be read from the provider." });
    const res = await this.fetchFn(uri, { headers: { "x-goog-api-key": this.apiKey } });
    if (!res.ok) throw new ProviderError(mapHttpFailure(res.status, ""), res.status);
    return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") || "video/mp4" };
  }

  async cancel(name: string): Promise<void> {
    try {
      await this.call("POST", `${BASE}/${name}:cancel`, {});
    } catch {
      /* best effort */
    }
  }

  estimateCost(req: Pick<VideoRequest, "durationSecs" | "resolution" | "model">): number {
    const per = this.priceOverride ?? VEO_PRICE_PER_SEC_USD[req.model] ?? 0.4;
    return round4(per * Math.max(0, req.durationSecs));
  }
}
