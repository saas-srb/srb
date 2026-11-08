import "server-only";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { getOpenAI } from "@/lib/openai";
import { getSettings } from "@/lib/products/viralpulse-ai/settings";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import type { ImageSize } from "@/lib/products/viralpulse-ai/constants";
import { resolveForCall, type ImageUsage } from "@/lib/products/viralpulse-ai/models";
import { openAiImageCost } from "@/lib/products/viralpulse-ai/images/pricing";
import { guard, type AiResult } from "@/lib/products/viralpulse-ai/ai";

/**
 * One image from OpenAI's image model. Returns PNG bytes. The model is checked against the company's live model list first (a retired
 * model falls back to a current one, or fails with a message naming what is available). The call goes through the metered client, so
 * it lands in the AI usage history (`images.generate`) with its reported token usage, exactly like text calls; the cost recorded on the
 * version comes from that usage x the documented rates, else the per-quality/size price table (see models.ts).
 */
export async function generateImage(opts: { userId: string; prompt: string; size: ImageSize }): Promise<AiResult<Buffer>> {
  const { ai } = await getSettings();
  await guard(opts.userId, ai);
  const prompt = opts.prompt.trim();
  if (prompt.length < 10) throw new SmmsInputError("Write (or generate) an image prompt first.");
  setAiFeature("Social media AI (image)");
  const openai = await getOpenAI();
  const choice = await resolveForCall("image", ai.imageModel);
  const started = Date.now();
  const res = await openai.images.generate({ model: choice.model, prompt: prompt.slice(0, 4000), size: opts.size, quality: ai.imageQuality as "high" /* the SDK types predate gpt-image-2.5's xhigh/max */, n: 1 });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new SmmsInputError("OpenAI didn't return an image. Try a different prompt.");
  const usage = (res as { usage?: ImageUsage }).usage ?? null;
  const cost = openAiImageCost({ model: choice.model, quality: ai.imageQuality, size: opts.size, usage, overrides: ai.imagePrices, flatUsd: ai.imageCostUsd });
  return { data: Buffer.from(b64, "base64"), model: choice.model, modelNote: choice.note, costBasis: cost.basis, inputTokens: usage?.input_tokens ?? 0, outputTokens: usage?.output_tokens ?? 0, costUsd: cost.usd, durationMs: Date.now() - started };
}

