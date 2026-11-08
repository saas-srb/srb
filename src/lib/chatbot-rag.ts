import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { getPrompt } from "@/lib/prompts/store";
import "server-only";
import { detectLanguage, languageBlock, scopeBlock, type Lang } from "@/lib/ai/policy";
import type OpenAI from "openai";
import { getOpenAI, isUnsupportedParamError } from "@/lib/openai";
import { getChatbotConfig, ensureVectorStore, type ChatbotConfig } from "@/lib/chatbot-config";
import type { ChatCitation, ChatMessageDoc } from "@/lib/chatbot-sessions";
import { findWebsitePageByFileId } from "@/lib/kb-website";
import { findPdfByFileId } from "@/lib/kb-pdf";

type ResponseInputItem = OpenAI.Responses.ResponseInputItem;

/** Turns stored history + the new question into a Responses API `input` array. */
export function buildResponsesInput(
  history: ChatMessageDoc[],
  newUserText: string
): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];
  for (const msg of history) {
    if (msg.role === "user") {
      items.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant" && msg.content) {
      items.push({ role: "assistant", content: msg.content });
    }
  }
  items.push({ role: "user", content: newUserText });
  return items;
}

export interface PreparedAnswer {
  config: ChatbotConfig;
  vectorStoreId: string;
  input: ResponseInputItem[];
  lang: Lang;
}

export async function prepareAnswer(
  history: ChatMessageDoc[],
  newUserText: string
): Promise<PreparedAnswer> {
  const lang = detectLanguage([...history.filter((m) => m.role === "user").map((m) => m.content), newUserText]);
  const config = await getChatbotConfig();
  const vectorStoreId = await ensureVectorStore();
  const limit = Math.max(0, config.contextMessageLimit);
  const trimmed = limit > 0 ? history.slice(-limit) : [];
  return { config, vectorStoreId, input: buildResponsesInput(trimmed, newUserText), lang };
}

/**
 * Opens a streaming Responses API call with the file_search tool bound to the
 * knowledge-base vector store. Retries without `temperature` for models (some
 * reasoning models) that reject it.
 */
export async function streamAnswer(
  prepared: PreparedAnswer
): Promise<AsyncIterable<OpenAI.Responses.ResponseStreamEvent>> {
  setAiFeature("Website chatbot");
  const openai = await getOpenAI();
  const { config, vectorStoreId, input, lang } = prepared;

  const base: OpenAI.Responses.ResponseCreateParamsStreaming = {
    model: config.model,
    instructions: await getPrompt("chatbot.rag", { persona: config.systemPrompt, scope_block: await scopeBlock("website"), language_block: await languageBlock(lang) }),
    input,
    max_output_tokens: config.maxOutputTokens,
    store: false,
    stream: true,
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId],
        max_num_results: config.retrieval.maxNumResults,
      },
    ],
  };

  try {
    return await openai.responses.create({ ...base, temperature: config.temperature });
  } catch (err) {
    if (isUnsupportedParamError(err, "temperature")) {
      return openai.responses.create(base);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

interface RawFileCitation {
  fileId: string;
  filename?: string;
}

function collectFileCitations(response: OpenAI.Responses.Response): RawFileCitation[] {
  const seen = new Map<string, RawFileCitation>();
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      for (const ann of part.annotations ?? []) {
        if (ann.type === "file_citation" && "file_id" in ann && ann.file_id) {
          if (!seen.has(ann.file_id)) {
            seen.set(ann.file_id, {
              fileId: ann.file_id,
              filename: "filename" in ann && typeof ann.filename === "string" ? ann.filename : undefined,
            });
          }
        }
      }
    }
  }
  return [...seen.values()];
}

/** Resolves OpenAI file ids back to public site pages / KB documents. */
export async function resolveCitations(
  response: OpenAI.Responses.Response
): Promise<ChatCitation[]> {
  const raw = collectFileCitations(response);
  const resolved = await Promise.all(
    raw.map(async (r): Promise<ChatCitation> => {
      const page = await findWebsitePageByFileId(r.fileId);
      if (page) {
        const isSynthetic = page.url.startsWith("synthetic://");
        return {
          fileId: r.fileId,
          docId: String(page._id),
          kind: "website",
          title: page.title,
          url: isSynthetic ? undefined : page.url,
        };
      }
      const pdf = await findPdfByFileId(r.fileId);
      if (pdf) {
        return { fileId: r.fileId, docId: String(pdf._id), kind: "pdf", title: pdf.title };
      }
      return { fileId: r.fileId, kind: "unknown", title: r.filename || "Knowledge base document" };
    })
  );

  // De-dup by resolved title/url so the UI doesn't show the same page twice.
  const byKey = new Map<string, ChatCitation>();
  for (const c of resolved) {
    const key = c.url || `${c.kind}:${c.title}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  return [...byKey.values()];
}
