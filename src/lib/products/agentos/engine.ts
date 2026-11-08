import { getPrompt } from "@/lib/prompts/store";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import "server-only";
import { languageBlock, languageOf, type Lang } from "@/lib/ai/policy";
import type OpenAI from "openai";
import { toFile } from "openai";
import { getOpenAI, isUnsupportedParamError } from "@/lib/openai";
import { COLLECTIONS, aibotsCollection, notDeleted } from "@/lib/products/agentos/db";
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_IMAGE_EXTENSIONS,
  ATTACHMENT_MARKER,
  ATTACHMENT_PDF_EXTENSIONS,
  LIMITS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_UPLOAD_BYTES,
} from "@/lib/products/agentos/constants";
import { AibotsInputError } from "@/lib/products/agentos/viewer";
import { fileExtension, sniffMatches, spreadsheetToText } from "@/lib/products/agentos/file-convert";
import { listConversationItems, parseAttachmentPart } from "@/lib/products/agentos/chats";
import type { BotDoc } from "@/lib/products/agentos/bots";
import type { KbFileDoc } from "@/lib/products/agentos/knowledge";

/**
 * Bot → instructions + model + its vector store → the chat's OpenAI
 * Conversation → one Responses API call. OpenAI keeps the conversation state
 * (every turn is appended to the Conversation), so nothing here replays
 * history — the Conversation IS the context.
 */

type InputContent = OpenAI.Responses.ResponseInputMessageContentList;
export type UserContent = InputContent;

/**
 * The two answer modes, decided per turn by whether the bot has an assigned
 * knowledge base (enabled files — see `botHasKnowledge`):
 *
 *  • KNOWLEDGE-BASE MODE — answers come ONLY from the bot's own files. The
 *    file_search tool is bound to this bot's vector store and forced on every
 *    turn (`tool_choice`), and the rules below forbid outside knowledge.
 *  • INSTRUCTIONS MODE — no files: no retrieval tool at all; the bot answers
 *    from its configured prompt and instructions.
 *
 * These rules are appended AFTER the bot's own instructions and say they take
 * precedence, so a bot's prompt can shape tone and format but can't loosen them.
 */
/** The platform rules appended after a bot's own instructions (the "Bot rules" prompts): knowledge-base mode or instructions-only mode, the date and privacy rules, and the language rules. */
export async function platformInstructions(hasKnowledge: boolean, lang: Lang | null): Promise<string> {
  return getPrompt("agentos.platform", {
    rules: await getPrompt(hasKnowledge ? "agentos.rules.knowledge" : "agentos.rules.instructions_only"),
    footer: await getPrompt("agentos.rules.footer", { today: new Date().toISOString().slice(0, 10) }),
    language_block: await languageBlock(lang),
  });
}

/**
 * Whether the bot has an assigned knowledge base: at least one enabled file
 * that is indexed or still indexing. Disabled, failed and deleted files don't
 * count — a bot whose files are all disabled answers in instructions mode.
 */
export async function botHasKnowledge(bot: Pick<BotDoc, "_id" | "vectorStoreId">): Promise<boolean> {
  if (!bot.vectorStoreId) return false;
  return (await countAssignedFiles(bot._id)) > 0;
}

export async function countAssignedFiles(botId: string): Promise<number> {
  const col = await aibotsCollection<KbFileDoc>(COLLECTIONS.files);
  return col.countDocuments({ botId, enabled: true, status: { $in: ["ready", "processing"] }, ...notDeleted });
}

/**
 * Turns the typed message + attachments into Responses input content:
 * PDFs → uploaded as `user_data` and sent as input_file; images → `vision`
 * input_image; text-like files → inlined. Every attachment is preceded by a
 * marker part so the transcript can show a chip instead of the raw content.
 */
export async function buildUserContent(text: string, files: File[]): Promise<UserContent> {
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) throw new AibotsInputError(`Attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) throw new AibotsInputError(`Attachments must total ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or less.`);
  const content: UserContent = [];
  setAiFeature("AI Bots");
  const openai = await getOpenAI();
  for (const file of files) {
    const ext = fileExtension(file.name);
    if (!ATTACHMENT_EXTENSIONS.includes(ext)) throw new AibotsInputError(`"${file.name}" isn't a supported attachment (${ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(", ")}).`);
    if (file.size === 0) throw new AibotsInputError(`"${file.name}" is empty.`);
    const buf = Buffer.from(await file.arrayBuffer());
    if (!sniffMatches(ext, buf)) throw new AibotsInputError(`"${file.name}" doesn't match its extension.`);
    const safeName = file.name.replace(/[\]\n\r]/g, "").slice(0, 120);
    if (ATTACHMENT_PDF_EXTENSIONS.includes(ext)) {
      const up = await openai.files.create({ file: await toFile(buf, safeName, { type: "application/pdf" }), purpose: "user_data" });
      content.push({ type: "input_text", text: `${ATTACHMENT_MARKER}${safeName}]]\n(The user attached this PDF — it follows.)` });
      content.push({ type: "input_file", file_id: up.id });
    } else if (ATTACHMENT_IMAGE_EXTENSIONS.includes(ext)) {
      const up = await openai.files.create({ file: await toFile(buf, safeName, { type: file.type || `image/${ext === "jpg" ? "jpeg" : ext}` }), purpose: "vision" });
      content.push({ type: "input_text", text: `${ATTACHMENT_MARKER}${safeName}]]\n(The user attached this image — it follows.)` });
      content.push({ type: "input_image", file_id: up.id, detail: "auto" });
    } else {
      const raw = ext === "xlsx" || ext === "csv" ? await spreadsheetToText(ext, buf, safeName) : buf.toString("utf-8");
      const clipped = raw.length > LIMITS.inlineAttachmentChars ? `${raw.slice(0, LIMITS.inlineAttachmentChars)}\n…[truncated]` : raw;
      content.push({ type: "input_text", text: `${ATTACHMENT_MARKER}${safeName}]]\nAttached file "${safeName}":\n\n${clipped}` });
    }
  }
  content.push({ type: "input_text", text });
  return content;
}

/**
 * Regenerate: removes the last user turn and everything after it from the
 * Conversation and returns that turn's content, so it can be sent again.
 */
export async function popLastTurn(conversationId: string): Promise<UserContent | null> {
  const items = await listConversationItems(conversationId);
  let idx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type === "message" && it.role === "user") {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const userItem = items[idx] as OpenAI.Conversations.Message;
  const content: UserContent = [];
  for (const part of userItem.content) {
    if (part.type === "input_text") content.push({ type: "input_text", text: part.text });
    else if (part.type === "input_file" && part.file_id) content.push({ type: "input_file", file_id: part.file_id });
    else if (part.type === "input_image" && (part.file_id || part.image_url)) {
      content.push({ type: "input_image", detail: part.detail ?? "auto", ...(part.file_id ? { file_id: part.file_id } : { image_url: part.image_url! }) });
    }
  }
  setAiFeature("AI Bots");
  const openai = await getOpenAI();
  for (const it of items.slice(idx)) {
    if (it.id) await openai.conversations.items.delete(it.id, { conversation_id: conversationId });
  }
  return content.length ? content : null;
}

/** The typed text of a user turn (last non-attachment input_text) — used for auto-titles. */
export function plainText(content: UserContent): string {
  for (let i = content.length - 1; i >= 0; i--) {
    const p = content[i];
    if (p.type === "input_text" && !parseAttachmentPart(p.text)) return p.text;
  }
  return "";
}

export async function startResponse(params: {
  bot: BotDoc;
  conversationId: string;
  content: UserContent;
  maxOutputTokens: number;
  hasKnowledge: boolean;
  signal: AbortSignal;
}) {
  setAiFeature("AI Bots");
  const openai = await getOpenAI();
  const { bot } = params;
  const base: OpenAI.Responses.ResponseCreateParamsStreaming = {
    model: bot.model,
    instructions: await getPrompt("agentos.instructions", { bot_instructions: bot.instructions, platform_rules: await platformInstructions(params.hasKnowledge && Boolean(bot.vectorStoreId), languageOf(plainText(params.content))) }),
    conversation: params.conversationId,
    input: [{ role: "user", content: params.content }],
    max_output_tokens: params.maxOutputTokens,
    stream: true,
    // Knowledge-base mode: search this bot's store (and only it) on every turn.
    ...(params.hasKnowledge && bot.vectorStoreId
      ? { tools: [{ type: "file_search" as const, vector_store_ids: [bot.vectorStoreId], max_num_results: 8 }], tool_choice: { type: "file_search" as const } }
      : {}),
  };
  try {
    return await openai.responses.create(bot.temperature === null ? base : { ...base, temperature: bot.temperature }, { signal: params.signal });
  } catch (err) {
    if (bot.temperature !== null && isUnsupportedParamError(err, "temperature")) return openai.responses.create(base, { signal: params.signal });
    throw err;
  }
}

/** Resolves cited OpenAI file ids to this bot's knowledge-file titles. */
export async function citationTitles(botId: string, fileIds: string[]): Promise<{ fileId: string; title: string }[]> {
  if (fileIds.length === 0) return [];
  const col = await aibotsCollection<KbFileDoc>(COLLECTIONS.files);
  const rows = await col.find({ botId, openaiFileId: { $in: fileIds } }, { projection: { openaiFileId: 1, title: 1 } }).toArray();
  const byId = new Map(rows.map((r) => [r.openaiFileId, r.title]));
  return fileIds.map((id) => ({ fileId: id, title: byId.get(id) ?? "Knowledge base document" }));
}

export function collectCitedFileIds(response: OpenAI.Responses.Response | null): string[] {
  const seen = new Set<string>();
  for (const item of response?.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      for (const a of part.annotations ?? []) if (a.type === "file_citation") seen.add(a.file_id);
    }
  }
  return [...seen];
}
