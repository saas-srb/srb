import "server-only";
import { getPrompt } from "@/lib/prompts/store";
import { getOpenAI, isOpenAIConfigured, isUnsupportedParamError } from "@/lib/openai";
import { aiBlockReason } from "@/lib/platform/billing/enforce";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { getSettings, estimateCost } from "@/lib/products/viralpulse-ai/settings";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import type { LlmClient } from "./script";

/** The company's OpenAI as an `LlmClient`: Responses API, strict JSON schema, metered against the plan like every other AI call. */
export function openAiLlm(): LlmClient {
  return {
    prompt: getPrompt,
    async json({ system, user, schemaName, schema }) {
      if (!(await isOpenAIConfigured())) throw new SmmsInputError("OpenAI isn't connected for this workspace (Settings -> Integrations), so the script can't be written.");
      const block = await aiBlockReason();
      if (block) throw new SmmsInputError(block);
      const { ai } = await getSettings();
      setAiFeature("AI UGC Studio");
      const openai = await getOpenAI();
      const params = {
        model: ai.textModel,
        instructions: system,
        input: user,
        max_output_tokens: Math.max(ai.maxOutputTokens, 8000),
        text: { format: { type: "json_schema" as const, name: schemaName, schema, strict: true } },
        store: false,
      };
      let res;
      try {
        res = await openai.responses.create(ai.temperature === null ? params : { ...params, temperature: ai.temperature });
      } catch (err) {
        if (ai.temperature !== null && isUnsupportedParamError(err, "temperature")) res = await openai.responses.create(params);
        else throw err;
      }
      if (res.status === "incomplete") throw new SmmsInputError("The script was cut off (output limit). Try a shorter video or fewer scenes.");
      let data: unknown;
      try {
        data = JSON.parse(res.output_text);
      } catch {
        throw new SmmsInputError("The AI returned something that couldn't be read. Please try again.");
      }
      const inputTokens = res.usage?.input_tokens ?? 0;
      const outputTokens = res.usage?.output_tokens ?? 0;
      return { data, model: ai.textModel, inputTokens, outputTokens, costUsd: estimateCost(ai, ai.textModel, inputTokens, outputTokens) };
    },
  };
}
