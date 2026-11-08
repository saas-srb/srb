import { ImageProviderError, providerError, type ImageProvider, type ImageRequest, type ImageResult } from "@/lib/products/viralpulse-ai/images/providers/types";

/**
 * Gemini image models ("Nano Banana") through the Interactions API: POST /v1beta/interactions with `response_format` of type
 * `image`. Docs read 2026-11-01: ai.google.dev/gemini-api/docs/image-generation. Reference pictures go in `input` as `image` blocks
 * (up to 14 in total); the image comes back as a base64 `image` content block of the model's output. Every picture carries a SynthID
 * watermark. Pricing: ai.google.dev/gemini-api/docs/pricing. One call returns one picture, so N variants are N calls.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_IMAGE_FALLBACKS = ["gemini-nano-banana-2.1", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"] as const;
export const MAX_GEMINI_REFERENCES = 10;

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

interface Block {
  type?: string;
  data?: string;
  mime_type?: string;
  text?: string;
  [k: string]: unknown;
}

/** The first base64 image anywhere in an interaction (depth-limited, tolerant of the exact nesting). */
export function findImage(node: unknown, depth = 0): string | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const f = findImage(x, depth + 1);
      if (f) return f;
    }
    return null;
  }
  const o = node as Block;
  if (o.type === "image" && typeof o.data === "string" && o.data.length > 100) return o.data;
  for (const v of Object.values(o)) {
    const f = findImage(v, depth + 1);
    if (f) return f;
  }
  return null;
}

export function mapGeminiFailure(status: number, body: string): ImageProviderError {
  const t = body.toLowerCase();
  if (/(safety|blocked|prohibited|violat|policy|moderat|sensitive|harmful|recitation|image_other|filtered|not allowed|unsafe|person generation|minor|celebrity|public figure)/.test(t) && status !== 429 && status !== 401 && status !== 403) return providerError("moderation");
  if (status === 401 || status === 403) return providerError("auth");
  if (status === 429) return providerError(/quota|billing|exhausted|credit/.test(t) ? "quota" : "rate", true);
  if (status === 400 || status === 404 || status === 422) return providerError("bad_request");
  return providerError("provider", true);
}

export class GeminiImageProvider implements ImageProvider {
  readonly id = "gemini" as const;
  constructor(private apiKey: string, private fetchFn: FetchFn = fetch) {}

  private async one(req: ImageRequest, refs: ImageRequest["references"]): Promise<Buffer> {
    const input: Block[] = [];
    for (const r of (refs ?? []).slice(0, MAX_GEMINI_REFERENCES)) input.push({ type: "image", mime_type: r.mimeType, data: r.data.toString("base64") });
    input.push({ type: "text", text: req.prompt.slice(0, 30000) });
    let res: Response;
    try {
      res = await this.fetchFn(`${BASE}/interactions`, {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: req.model, input: input.length === 1 ? input[0].text : input, response_format: { type: "image", aspect_ratio: req.geminiRatio, image_size: "1K" } }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw providerError("unreachable", true);
    }
    const text = await res.text();
    if (!res.ok) throw mapGeminiFailure(res.status, text);
    let json: { status?: string; error?: { message?: string } };
    try {
      json = JSON.parse(text);
    } catch {
      throw providerError("provider", true);
    }
    if (json.status === "failed") throw mapGeminiFailure(400, json.error?.message ?? text);
    const b64 = findImage(json);
    if (!b64) throw providerError("moderation");
    return Buffer.from(b64, "base64");
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    const out = await Promise.all(Array.from({ length: req.n }, () => this.one(req, req.references)));
    return { images: out, usage: null, model: req.model };
  }

  async edit(req: ImageRequest): Promise<ImageResult> {
    if (!req.references?.length) throw providerError("bad_request");
    const out = await Promise.all(Array.from({ length: req.n }, () => this.one(req, req.references)));
    return { images: out, usage: null, model: req.model };
  }
}
