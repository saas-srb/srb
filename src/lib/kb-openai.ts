import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import "server-only";
import { toFile } from "openai";
import { getOpenAI } from "@/lib/openai";

export interface VectorStoreUploadResult {
  fileId: string;
  vectorStoreFileId: string;
  status: "in_progress" | "completed" | "cancelled" | "failed";
  usageBytes: number;
  chunkCount: number | null;
  lastError: string | null;
}

type Attributes = Record<string, string | number | boolean>;

/** OpenAI caps vector-store file attributes at 16 keys / 512-char values. */
function trimAttributes(attributes: Attributes): Attributes {
  const out: Attributes = {};
  for (const [key, value] of Object.entries(attributes).slice(0, 16)) {
    out[key.slice(0, 64)] = typeof value === "string" ? value.slice(0, 512) : value;
  }
  return out;
}

async function attachAndPoll(
  vectorStoreId: string,
  fileId: string,
  attributes: Attributes
): Promise<VectorStoreUploadResult> {
  setAiFeature("Chatbot knowledge base");
  const openai = await getOpenAI();
  const vsFile = await openai.vectorStores.files.createAndPoll(vectorStoreId, {
    file_id: fileId,
    attributes: trimAttributes(attributes),
  });

  return {
    fileId,
    vectorStoreFileId: vsFile.id,
    status: vsFile.status,
    usageBytes: vsFile.usage_bytes ?? 0,
    chunkCount: await countChunks(vectorStoreId, vsFile.id),
    lastError: vsFile.last_error ? vsFile.last_error.message : null,
  };
}

/** Uploads a UTF-8 text/markdown document and attaches it to the vector store. */
export async function uploadTextToVectorStore(params: {
  vectorStoreId: string;
  filename: string;
  text: string;
  attributes: Attributes;
}): Promise<VectorStoreUploadResult> {
  setAiFeature("Chatbot knowledge base");
  const openai = await getOpenAI();
  const file = await toFile(Buffer.from(params.text, "utf-8"), params.filename, {
    type: "text/markdown",
  });
  const uploaded = await openai.files.create({ file, purpose: "assistants" });
  return attachAndPoll(params.vectorStoreId, uploaded.id, params.attributes);
}

/** Uploads a binary document (PDF, DOCX, …) and attaches it to the vector store. */
export async function uploadBinaryToVectorStore(params: {
  vectorStoreId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
  attributes: Attributes;
}): Promise<VectorStoreUploadResult> {
  setAiFeature("Chatbot knowledge base");
  const openai = await getOpenAI();
  const file = await toFile(params.buffer, params.filename, { type: params.contentType });
  const uploaded = await openai.files.create({ file, purpose: "assistants" });
  return attachAndPoll(params.vectorStoreId, uploaded.id, params.attributes);
}

/** Detaches a file from the vector store and deletes the underlying File. Best-effort. */
export async function removeFromVectorStore(params: {
  vectorStoreId: string;
  vectorStoreFileId?: string | null;
  fileId?: string | null;
}): Promise<void> {
  setAiFeature("Chatbot knowledge base");
  const openai = await getOpenAI();
  if (params.vectorStoreFileId) {
    await openai.vectorStores.files
      .delete(params.vectorStoreFileId, { vector_store_id: params.vectorStoreId })
      .catch(() => {});
  }
  if (params.fileId) {
    await openai.files.delete(params.fileId).catch(() => {});
  }
}

/** Best-effort count of the chunks OpenAI produced for a file (for the KB UI). */
export async function countChunks(
  vectorStoreId: string,
  vectorStoreFileId: string
): Promise<number | null> {
  try {
    setAiFeature("Chatbot knowledge base");
    const openai = await getOpenAI();
    let count = 0;
    const page = await openai.vectorStores.files.content(vectorStoreFileId, {
      vector_store_id: vectorStoreId,
    });
    for await (const _chunk of page) {
      void _chunk;
      count += 1;
      if (count > 5000) break;
    }
    return count;
  } catch {
    return null;
  }
}
