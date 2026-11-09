import "server-only";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { recordAiUsage } from "@/lib/platform/billing/ai-usage-log";
import { getObject, putObject } from "@/lib/storage/blob";
import { getOpenAI, isOpenAIConfigured } from "@/lib/openai";
import { getPrompt } from "@/lib/prompts/store";
import { getSettings } from "@/lib/products/viralpulse-ai/settings";
import { ModelUnavailableError, resolveForCall } from "@/lib/products/viralpulse-ai/models";
import { getMedia, readMediaBytes, saveStudioImage } from "@/lib/products/viralpulse-ai/media";
import { recordAudit, type AuditAction } from "@/lib/products/viralpulse-ai/audit";
import { notifySmmsUsers } from "@/lib/products/viralpulse-ai/notifications";
import { smmsUsersWith } from "@/lib/products/viralpulse-ai/publishing";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { fetchGeminiModelIds } from "@/lib/products/viralpulse-ai/ugc/providers/gemini-models";
import { OpenAiImageProvider } from "@/lib/products/viralpulse-ai/images/providers/openai";
import { GEMINI_IMAGE_FALLBACKS, GeminiImageProvider } from "@/lib/products/viralpulse-ai/images/providers/gemini";
import { GEMINI_TOKENS_PER_IMAGE } from "@/lib/products/viralpulse-ai/images/pricing";
import { getBrandKit, getImageSettings } from "@/lib/products/viralpulse-ai/images/store";
import type { ImageDeps } from "@/lib/products/viralpulse-ai/images/engine";

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function isGeminiImageConfigured(): Promise<boolean> {
  return !!(await connectionValues("gemini"))?.apiKey;
}

/** Production wiring: the company's OpenAI / Gemini keys, the shared Blob store, the media library, audit and notifications. */
export function defaultImageDeps(): ImageDeps {
  return {
    now: () => new Date(),
    prompt: (key, vars) => getPrompt(key, vars),
    settings: getImageSettings,
    async openAiPricing() {
      const { ai } = await getSettings();
      return { overrides: ai.imagePrices ?? null, flatUsd: ai.imageCostUsd };
    },
    async resolveProvider(id, settings) {
      if (id === "gemini") {
        const creds = await connectionValues("gemini");
        if (!creds?.apiKey) throw new SmmsInputError("Connect your Google Gemini API key in Settings > Integrations to use Gemini images.");
        let model = settings.geminiModel;
        let note: string | null = null;
        const list = await fetchGeminiModelIds(creds.apiKey);
        if (list.ok && !list.ids.includes(model)) {
          const alt = GEMINI_IMAGE_FALLBACKS.find((m) => list.ids.includes(m));
          if (!alt) throw new SmmsInputError(`The Gemini image model "${model}" is not available on your Google account and no replacement was found. Choose another in the Image Studio settings.`);
          note = `The Gemini model "${model}" is not available on your account, so "${alt}" was used.`;
          model = alt;
        }
        return {
          provider: new GeminiImageProvider(creds.apiKey),
          model,
          note,
          meter: async ({ model: m, images }) => {
            await recordAiUsage({ usage: { input_tokens: 0, output_tokens: GEMINI_TOKENS_PER_IMAGE["1K"] * images }, model: m, endpoint: "interactions", feature: "AI Image Studio (Gemini)" });
          },
        };
      }
      if (!(await isOpenAIConfigured())) throw new SmmsInputError("OpenAI isn't connected for this workspace (Settings > Integrations), so image generation is unavailable.");
      const { ai } = await getSettings();
      let choice;
      try {
        choice = await resolveForCall("image", ai.imageModel);
      } catch (e) {
        if (e instanceof ModelUnavailableError) throw new SmmsInputError(e.message);
        throw e;
      }
      // The OpenAI client is the app's metered one: each call is logged in the AI usage history with its reported tokens.
      return { provider: new OpenAiImageProvider(await getOpenAI({ timeoutMs: 240_000, maxRetries: 1 })), model: choice.model, note: choice.note };
    },
    async putBlob(key, data, contentType) {
      const i = key.lastIndexOf("/");
      return (await putObject(key.slice(0, i), key.slice(i + 1), data, contentType)).storageKey;
    },
    async getBlob(key) {
      const o = await getObject(key).catch(() => null);
      return o ? streamToBuffer(o.stream) : null;
    },
    async readMedia(id) {
      const m = await getMedia(id);
      if (!m || m.kind !== "image") return null;
      const data = await readMediaBytes(m);
      return data ? { data, mimeType: m.contentType, name: m.name } : null;
    },
    async saveExport(buf, meta, actorId) {
      return saveStudioImage(buf, meta, actorId);
    },
    async audit(e) {
      await recordAudit({ actorId: e.actorId, actorEmail: e.actorEmail, action: e.action as AuditAction, entity: "media", entityId: e.entityId, entityLabel: e.entityLabel, recordId: e.entityId, summary: e.summary, metadata: e.metadata ?? null });
    },
    async notify(ids, n) {
      await notifySmmsUsers(ids, { type: "smms_ugc_approval", title: n.title, body: n.body, link: n.link });
    },
    managerIds: () => smmsUsersWith("PUBLISH_CONTENT"),
    kit: getBrandKit,
    async storagePrefix() {
      return `smms/${(await currentCompanyIdOrNull()) ?? "shared"}/studio`;
    },
  };
}
