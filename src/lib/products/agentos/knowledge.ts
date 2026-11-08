import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { aibotsEvents } from "@/lib/notify/triggers/aibots";
import "server-only";
import { toFile } from "openai";
import { getOpenAI } from "@/lib/openai";
import { removeFromVectorStore } from "@/lib/kb-openai";
import { COLLECTIONS, aibotsCollection, createStamp, newId, notDeleted, str, strOrNull, updateStamp, type Stamps } from "@/lib/products/agentos/db";
import { KB_CONVERTED_EXTENSIONS, KB_EXTENSIONS, MAX_UPLOAD_BYTES, type KbFileStatus } from "@/lib/products/agentos/constants";
import { AibotsInputError, NotFoundError } from "@/lib/products/agentos/viewer";
import { ensureBotVectorStore, type BotDoc } from "@/lib/products/agentos/bots";
import { fileExtension, sniffMatches, spreadsheetToText } from "@/lib/products/agentos/file-convert";

/**
 * A bot's knowledge base = its OWN OpenAI vector store. This collection keeps
 * only the metadata the UI needs (title, category, status, OpenAI ids). The
 * file bytes, chunks and embeddings live in OpenAI and nowhere else.
 *
 * Upload is non-blocking: the file is attached and marked "processing";
 * `refreshProcessing` polls OpenAI for the real status whenever the knowledge
 * base page (or chat route) loads.
 */

export interface KbFileDoc extends Stamps {
  _id: string;
  botId: string;
  title: string;
  description: string;
  category: string;
  /** Name the user uploaded. */
  filename: string;
  extension: string;
  size: number;
  /** CSV/XLSX are converted to Markdown before upload — flagged so the UI can say so. */
  converted: boolean;
  status: KbFileStatus;
  enabled: boolean;
  openaiFileId: string | null;
  vectorStoreFileId: string | null;
  usageBytes: number | null;
  lastError: string | null;
  version: number;
}

export interface KbFileView {
  _id: string;
  title: string;
  description: string;
  category: string;
  filename: string;
  extension: string;
  size: number;
  converted: boolean;
  status: KbFileStatus;
  enabled: boolean;
  usageBytes: number | null;
  lastError: string | null;
  version: number;
  updatedAt: string;
}

export function toView(f: KbFileDoc): KbFileView {
  return {
    _id: f._id,
    title: f.title,
    description: f.description,
    category: f.category,
    filename: f.filename,
    extension: f.extension,
    size: f.size,
    converted: f.converted,
    status: f.status,
    enabled: f.enabled,
    usageBytes: f.usageBytes,
    lastError: f.lastError,
    version: f.version,
    updatedAt: f.updatedAt.toISOString(),
  };
}

let indexesEnsured = false;
async function filesCollection() {
  const col = await aibotsCollection<KbFileDoc>(COLLECTIONS.files);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await col.createIndex({ botId: 1, deletedAt: 1, createdAt: -1 }).catch(() => {});
  }
  return col;
}

export async function listBotFiles(botId: string): Promise<KbFileDoc[]> {
  const col = await filesCollection();
  return col.find({ botId, ...notDeleted }).sort({ createdAt: -1 }).toArray();
}

export async function countFilesByBot(): Promise<Map<string, number>> {
  const col = await filesCollection();
  const rows = await col.aggregate<{ _id: string; n: number }>([{ $match: notDeleted }, { $group: { _id: "$botId", n: { $sum: 1 } } }]).toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

async function getFile(botId: string, fileId: string): Promise<KbFileDoc> {
  const col = await filesCollection();
  const f = await col.findOne({ _id: fileId, botId, ...notDeleted });
  if (!f) throw new NotFoundError();
  return f;
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Upload failed";
  return msg.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 300);
}

/** Validates the upload and turns it into what OpenAI will index. */
async function prepare(file: File): Promise<{ upload: Awaited<ReturnType<typeof toFile>>; extension: string; converted: boolean }> {
  if (file.size === 0) throw new AibotsInputError("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new AibotsInputError(`Files must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller.`);
  const extension = fileExtension(file.name);
  if (!KB_EXTENSIONS.includes(extension)) {
    throw new AibotsInputError(`Unsupported file type. Upload one of: ${KB_EXTENSIONS.map((e) => `.${e}`).join(", ")}.`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!sniffMatches(extension, buffer)) throw new AibotsInputError("The file's contents don't match its extension.");

  if (KB_CONVERTED_EXTENSIONS.includes(extension)) {
    const text = await spreadsheetToText(extension, buffer, file.name);
    if (!text.trim()) throw new AibotsInputError("That spreadsheet has no readable content.");
    return { upload: await toFile(Buffer.from(text, "utf-8"), `${file.name}.md`, { type: "text/markdown" }), extension, converted: true };
  }
  return { upload: await toFile(buffer, file.name, { type: file.type || "application/octet-stream" }), extension, converted: false };
}

/** Uploads to OpenAI Files and attaches to the bot's vector store WITHOUT waiting for indexing. */
async function pushToOpenAI(bot: BotDoc, upload: Awaited<ReturnType<typeof toFile>>, meta: { fileDocId: string; title: string; category: string }) {
  setAiFeature("AI Bots knowledge");
  const openai = await getOpenAI();
  const vectorStoreId = await ensureBotVectorStore(bot);
  const uploaded = await openai.files.create({ file: upload, purpose: "assistants" });
  try {
    const vsFile = await openai.vectorStores.files.create(vectorStoreId, {
      file_id: uploaded.id,
      attributes: { source: "aibots", bot_id: bot._id, doc_id: meta.fileDocId, title: meta.title.slice(0, 200), category: meta.category.slice(0, 100) },
    });
    return { vectorStoreId, openaiFileId: uploaded.id, vectorStoreFileId: vsFile.id, status: vsFile.status };
  } catch (err) {
    await openai.files.delete(uploaded.id).catch(() => {});
    throw err;
  }
}

/** Voice agents carry their knowledge on ElevenLabs: re-sync after it changes (no-op for text agents; never throws). */
async function knowledgeChanged(bot: Pick<BotDoc, "_id" | "kind">): Promise<void> {
  if (bot.kind !== "voice") return;
  await (await import("@/lib/products/agentos/voice/sync")).resyncAfterKnowledgeChange(bot._id);
}

const statusFrom = (s: string): KbFileStatus => (s === "completed" ? "ready" : s === "in_progress" ? "processing" : "failed");

export async function uploadBotFile(bot: BotDoc, file: File, meta: { title: unknown; description: unknown; category: unknown }, actorId: string): Promise<KbFileDoc> {
  const { upload, extension, converted } = await prepare(file);
  const col = await filesCollection();
  const doc: KbFileDoc = {
    _id: newId(),
    botId: bot._id,
    title: str(meta.title, 120) || file.name.replace(/\.[^.]+$/, "").slice(0, 120),
    description: str(meta.description, 500),
    category: str(meta.category, 60) || "Other",
    filename: file.name.slice(0, 200),
    extension,
    size: file.size,
    converted,
    status: "processing",
    enabled: true,
    openaiFileId: null,
    vectorStoreFileId: null,
    usageBytes: null,
    lastError: null,
    version: 1,
    ...createStamp(actorId),
  };
  const pushed = await pushToOpenAI(bot, upload, { fileDocId: doc._id, title: doc.title, category: doc.category });
  Object.assign(doc, { openaiFileId: pushed.openaiFileId, vectorStoreFileId: pushed.vectorStoreFileId, status: statusFrom(pushed.status) });
  await col.insertOne(doc);
  return doc;
}

/** New version of an existing file: the new upload is attached first, then the old one is removed from OpenAI. */
export async function replaceBotFile(bot: BotDoc, fileId: string, file: File, actorId: string): Promise<{ before: KbFileDoc; after: KbFileDoc }> {
  const before = await getFile(bot._id, fileId);
  const { upload, extension, converted } = await prepare(file);
  const pushed = await pushToOpenAI(bot, upload, { fileDocId: before._id, title: before.title, category: before.category });
  await removeFromVectorStore({ vectorStoreId: pushed.vectorStoreId, vectorStoreFileId: before.vectorStoreFileId, fileId: before.openaiFileId });
  const set = {
    filename: file.name.slice(0, 200),
    extension,
    size: file.size,
    converted,
    status: statusFrom(pushed.status),
    enabled: true,
    openaiFileId: pushed.openaiFileId,
    vectorStoreFileId: pushed.vectorStoreFileId,
    usageBytes: null,
    lastError: null,
    version: before.version + 1,
    ...updateStamp(actorId),
  };
  const col = await filesCollection();
  await col.updateOne({ _id: before._id }, { $set: set });
  return { before, after: { ...before, ...set } };
}

export async function updateBotFileMeta(botId: string, fileId: string, meta: { title: unknown; description: unknown; category: unknown }, actorId: string): Promise<KbFileDoc> {
  const before = await getFile(botId, fileId);
  const title = str(meta.title, 120);
  if (!title) throw new AibotsInputError("Give the file a title.");
  const col = await filesCollection();
  await col.updateOne({ _id: fileId }, { $set: { title, description: str(meta.description, 500), category: strOrNull(meta.category, 60) ?? "Other", ...updateStamp(actorId) } });
  return before;
}

/**
 * Disabling detaches the file from the bot's vector store (so file_search can't
 * see it) but keeps the OpenAI File, so enabling re-attaches without a re-upload.
 */
export async function setBotFileEnabled(bot: BotDoc, fileId: string, enabled: boolean, actorId: string): Promise<KbFileDoc> {
  const f = await getFile(bot._id, fileId);
  if (f.enabled === enabled) return f;
  if (!f.openaiFileId) throw new AibotsInputError("This file never reached OpenAI — replace it with a new upload.");
  setAiFeature("AI Bots knowledge");
  const openai = await getOpenAI();
  const col = await filesCollection();
  if (!enabled) {
    if (bot.vectorStoreId && f.vectorStoreFileId) {
      await openai.vectorStores.files.delete(f.vectorStoreFileId, { vector_store_id: bot.vectorStoreId }).catch((err) => {
        if ((err as { status?: number }).status !== 404) throw err;
      });
    }
    await col.updateOne({ _id: f._id }, { $set: { enabled: false, status: "disabled", vectorStoreFileId: null, ...updateStamp(actorId) } });
  } else {
    const vectorStoreId = await ensureBotVectorStore(bot);
    const vsFile = await openai.vectorStores.files.create(vectorStoreId, {
      file_id: f.openaiFileId,
      attributes: { source: "aibots", bot_id: bot._id, doc_id: f._id, title: f.title.slice(0, 200), category: f.category.slice(0, 100) },
    });
    await col.updateOne({ _id: f._id }, { $set: { enabled: true, status: statusFrom(vsFile.status), vectorStoreFileId: vsFile.id, lastError: null, ...updateStamp(actorId) } });
  }
  await knowledgeChanged(bot);
  return f;
}

export async function deleteBotFile(bot: BotDoc, fileId: string, actorId: string): Promise<KbFileDoc> {
  const f = await getFile(bot._id, fileId);
  if (bot.vectorStoreId || f.openaiFileId) {
    await removeFromVectorStore({ vectorStoreId: bot.vectorStoreId ?? "", vectorStoreFileId: bot.vectorStoreId ? f.vectorStoreFileId : null, fileId: f.openaiFileId });
  }
  const col = await filesCollection();
  await col.updateOne({ _id: f._id }, { $set: { deletedAt: new Date(), status: "disabled", enabled: false, ...updateStamp(actorId) } });
  await knowledgeChanged(bot);
  return f;
}

/** Asks OpenAI for the real indexing status of every still-processing file of a bot. */
export async function refreshProcessing(bot: BotDoc): Promise<void> {
  if (!bot.vectorStoreId) return;
  const col = await filesCollection();
  const pending = await col.find({ botId: bot._id, status: "processing", ...notDeleted }).limit(50).toArray();
  if (pending.length === 0) return;
  setAiFeature("AI Bots knowledge");
  const openai = await getOpenAI();
  let nowReady = false;
  await Promise.all(
    pending.map(async (f) => {
      if (!f.vectorStoreFileId) return;
      try {
        const vs = await openai.vectorStores.files.retrieve(f.vectorStoreFileId, { vector_store_id: bot.vectorStoreId! });
        const status = statusFrom(vs.status);
        if (status !== "processing") {
          await col.updateOne({ _id: f._id }, { $set: { status, usageBytes: vs.usage_bytes ?? null, lastError: vs.last_error ? friendlyError(new Error(vs.last_error.message)) : null } });
          if (status === "ready") nowReady = true;
          await aibotsEvents.fileProcessed({ id: bot._id, name: bot.name }, { id: f._id, title: f.title }, status === "ready", vs.last_error?.message ?? null);
        }
      } catch (err) {
        if ((err as { status?: number }).status === 404) await col.updateOne({ _id: f._id }, { $set: { status: "failed", lastError: "No longer found in OpenAI — replace the file." } });
      }
    })
  );
  if (nowReady) await knowledgeChanged(bot);
}

const VIEW_MAX_CHARS = 60000;

/**
 * "Read" for a knowledge file: the text OpenAI extracted and indexed for it,
 * read back from the bot's vector store (OpenAI doesn't allow downloading the
 * original bytes of an `assistants` file, and we don't keep a copy).
 */
export async function getBotFileText(bot: BotDoc, fileId: string): Promise<{ text: string; truncated: boolean }> {
  const f = await getFile(bot._id, fileId);
  if (!bot.vectorStoreId || !f.vectorStoreFileId || !f.enabled) throw new AibotsInputError("Enable the file to view its indexed content.");
  if (f.status !== "ready") throw new AibotsInputError(f.status === "processing" ? "OpenAI is still indexing this file — try again in a moment." : "This file wasn't indexed — replace it with a new upload.");
  let text = "";
  for await (const chunk of (await getOpenAI()).vectorStores.files.content(f.vectorStoreFileId, { vector_store_id: bot.vectorStoreId })) {
    if (chunk.text) text += (text ? "\n\n" : "") + chunk.text;
    if (text.length > VIEW_MAX_CHARS) return { text: text.slice(0, VIEW_MAX_CHARS), truncated: true };
  }
  return { text, truncated: false };
}

/** Bot deletion: every OpenAI File, then the vector store. Best-effort. */
export async function purgeBotFiles(bot: BotDoc): Promise<void> {
  const col = await filesCollection();
  const files = await col.find({ botId: bot._id, ...notDeleted }).toArray();
  setAiFeature("AI Bots knowledge");
  const openai = await getOpenAI();
  await Promise.all(files.map((f) => (f.openaiFileId ? openai.files.delete(f.openaiFileId).catch(() => {}) : null)));
  if (bot.vectorStoreId) await openai.vectorStores.delete(bot.vectorStoreId).catch(() => {});
  await col.updateMany({ botId: bot._id, ...notDeleted }, { $set: { deletedAt: new Date(), enabled: false, status: "disabled" } });
}

export { friendlyError };
