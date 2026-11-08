import { toFile } from "openai";
import type OpenAI from "openai";
import { ImageProviderError, providerError, type ImageProvider, type ImageRequest, type ImageResult } from "@/lib/products/viralpulse-ai/images/providers/types";
import type { ImageUsage } from "@/lib/products/viralpulse-ai/models";

/**
 * OpenAI Images API (`images.generate`, `images.edit`) for the GPT-Image-2.5 models. The client is the app's metered one, so every call
 * lands in the company's AI usage history with its reported token usage. Docs: developers.openai.com/api/docs/guides/image-generation.
 */

type ImagesClient = Pick<OpenAI, "images">;

const MODERATION_CODES = new Set(["content_policy_violation", "moderation_blocked", "safety_violation", "image_generation_user_error"]);

export function mapOpenAiError(err: unknown): ImageProviderError {
  if (err instanceof ImageProviderError) return err;
  const e = err as { status?: number; code?: string | null; error?: { code?: string | null; message?: string }; message?: string; name?: string };
  const code = String(e?.code ?? e?.error?.code ?? "");
  const msg = String(e?.error?.message ?? e?.message ?? "");
  if (MODERATION_CODES.has(code) || /safety system|content[_ ]policy|moderation|rejected by the safety/i.test(msg)) return providerError("moderation");
  if (code === "insufficient_quota" || code === "billing_hard_limit_reached" || /exceeded your current quota|billing/i.test(msg)) return providerError("quota");
  if (e?.status === 401 || e?.status === 403) return providerError("auth");
  if (e?.status === 429) return providerError("rate", true);
  if (e?.status === 400 || e?.status === 404 || e?.status === 422) return providerError("bad_request");
  if (e?.name === "APIConnectionError" || e?.name === "APIConnectionTimeoutError" || /ECONN|ENOTFOUND|timed? ?out/i.test(msg)) return providerError("unreachable", true);
  return providerError("provider", true);
}

export class OpenAiImageProvider implements ImageProvider {
  readonly id = "openai" as const;
  constructor(private client: ImagesClient) {}

  private shape(res: OpenAI.Images.ImagesResponse, model: string): ImageResult {
    const images = (res.data ?? []).map((d) => d.b64_json).filter((b): b is string => typeof b === "string" && b.length > 0).map((b) => Buffer.from(b, "base64"));
    if (images.length === 0) throw providerError("moderation");
    return { images, usage: ((res as { usage?: ImageUsage }).usage ?? null) as ImageUsage | null, model };
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    try {
      const res = await this.client.images.generate({ model: req.model, prompt: req.prompt.slice(0, 32000), n: req.n, size: req.openAiSize, quality: req.quality as "high" /* the SDK types predate xhigh/max */ });
      return this.shape(res as OpenAI.Images.ImagesResponse, req.model);
    } catch (err) {
      throw mapOpenAiError(err);
    }
  }

  async edit(req: ImageRequest): Promise<ImageResult> {
    const refs = req.references ?? [];
    if (refs.length === 0) throw providerError("bad_request");
    try {
      const image = await Promise.all(refs.slice(0, 16).map((r, i) => toFile(r.data, `ref-${i}.${r.mimeType.split("/")[1]}`, { type: r.mimeType })));
      const mask = req.mask ? await toFile(req.mask, "mask.png", { type: "image/png" }) : undefined;
      const res = await this.client.images.edit({ model: req.model, image, prompt: req.prompt.slice(0, 32000), n: req.n, size: req.openAiSize, quality: req.quality as "high", ...(mask ? { mask } : {}) });
      return this.shape(res as OpenAI.Images.ImagesResponse, req.model);
    } catch (err) {
      throw mapOpenAiError(err);
    }
  }
}
