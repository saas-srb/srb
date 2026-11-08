"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getCurrentAibotsUser } from "@/lib/aibots-auth";
import { signOutThisDevice } from "@/lib/security/sessions";
import { isOpenAIConfigured } from "@/lib/openai";
import type { AibotsPermission } from "@/lib/aibots-roles";
import { requireViewer, can, AibotsInputError, ForbiddenError, NotFoundError, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { recordAudit, diffSummary } from "@/lib/products/agentos/audit";
import { markAibotsNotificationsRead, notifyAibotsUsers } from "@/lib/products/agentos/notifications";
import { createBot, deleteBot, getBot, setBotStatus, updateBot, type BotInput } from "@/lib/products/agentos/bots";
import { deleteBotFile, getBotFileText, refreshProcessing, setBotFileEnabled, updateBotFileMeta, friendlyError } from "@/lib/products/agentos/knowledge";
import { deleteChat, renameChat } from "@/lib/products/agentos/chats";
import { saveSettings } from "@/lib/products/agentos/settings";
import { isBillingLimitError, writeBlockReason } from "@/lib/platform/billing/enforce";

/**
 * Every AI Bots mutation except uploads and chat turns (those are route
 * handlers — bodies over 1 MB / streaming). Each action resolves the viewer
 * from the SESSION COOKIE, never from arguments, and re-checks the specific
 * permission here. Expected failures return `{ ok:false, error }`.
 */

type Fail = { ok: false; error: string };
type Ok<T = object> = { ok: true } & T;
const SESSION_EXPIRED: Fail = { ok: false, error: "Your session has expired — please sign in again." };
const DENIED: Fail = { ok: false, error: "You don't have permission to do that." };

async function run<T extends object>(permission: AibotsPermission | null, fn: (v: AibotsViewer) => Promise<T>, opts: { revalidate?: boolean; readOnlySafe?: boolean } = {}): Promise<Ok<T> | Fail> {
  let v: AibotsViewer;
  try {
    v = await requireViewer();
  } catch {
    return SESSION_EXPIRED;
  }
  if (permission && !can(v, permission)) return DENIED;
  if (!opts.readOnlySafe) {
    const readOnly = await writeBlockReason();
    if (readOnly) return { ok: false, error: readOnly };
  }
  try {
    const out = await fn(v);
    // The sidebar lists bots and chats, so every mutation refreshes the whole product.
    if (opts.revalidate !== false) revalidatePath("/agentos", "layout");
    return { ok: true, ...out };
  } catch (err) {
    if (err instanceof AibotsInputError || isBillingLimitError(err)) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return DENIED;
    if (err instanceof NotFoundError) return { ok: false, error: "That item no longer exists." };
    console.error("[aibots action]", friendlyError(err));
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function aibotsLogoutAction(): Promise<void> {
  const user = await getCurrentAibotsUser();
  if (user && ObjectId.isValid(user.id)) await signOutThisDevice(new ObjectId(user.id));
  redirect("/commandos/login");
}

export async function markNotificationsReadAction(ids?: string[]) {
  const v = await requireViewer().catch(() => null);
  if (!v) return;
  await markAibotsNotificationsRead(v.userId, ids?.filter((i) => typeof i === "string"));
  revalidatePath("/agentos", "layout");
}

// ── Bots ───────────────────────────────────────────────────────────────────

const AUDITED_FIELDS = ["name", "category", "model", "temperature", "status", "allowAttachments", "icon"];

async function notifyNewlyGranted(v: AibotsViewer, bot: { _id: string; name: string }, before: string[], after: string[]) {
  const added = after.filter((id) => !before.includes(id) && id !== v.userId);
  await notifyAibotsUsers(added, { type: "aibots_bot_access", title: `You can now use ${bot.name}`, body: "A new AI bot was shared with you.", link: `/agentos/b/${bot._id}` });
}

export async function saveBotAction(botId: string | null, input: BotInput) {
  return run(botId ? "EDIT_BOT" : "CREATE_BOT", async (v) => {
    if (botId) {
      const { before, after } = await updateBot(botId, input, v.userId);
      const flat = (b: typeof before) => ({ ...b, temperature: b.temperature ?? "default" });
      const changes = [
        diffSummary(flat(before), flat(after), AUDITED_FIELDS),
        before.instructions !== after.instructions ? "instructions changed" : null,
        JSON.stringify(before.access) !== JSON.stringify(after.access) ? "access changed" : null,
      ].filter(Boolean);
      await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "bot", entityId: botId, entityLabel: after.name, botId, summary: changes.join("; ") || "No changes" });
      await notifyNewlyGranted(v, after, before.access.userIds, after.access.userIds);
      return { botId };
    }
    const bot = await createBot(input, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "bot", entityId: bot._id, entityLabel: bot.name, botId: bot._id, summary: `${bot.model} · ${bot.access.mode === "all" ? "all users" : "restricted"}` });
    await notifyNewlyGranted(v, bot, [], bot.access.userIds);
    return { botId: bot._id, vectorStoreReady: Boolean(bot.vectorStoreId) || !(await isOpenAIConfigured()) };
  });
}

export async function setBotStatusAction(botId: string, active: boolean) {
  return run("EDIT_BOT", async (v) => {
    const bot = await setBotStatus(botId, active ? "active" : "inactive", v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: active ? "activate" : "deactivate", entity: "bot", entityId: botId, entityLabel: bot.name, botId });
    return {};
  });
}

export async function deleteBotAction(botId: string) {
  return run("DELETE_BOT", async (v) => {
    const bot = await deleteBot(botId, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "bot", entityId: botId, entityLabel: bot.name, botId, summary: "Bot and its OpenAI knowledge base removed" });
    return {};
  });
}

// ── Knowledge files (uploads live in /api/agentos/bots/[botId]/files) ─────────

async function loadBot(botId: string) {
  const bot = await getBot(botId);
  if (!bot) throw new NotFoundError();
  return bot;
}

export async function updateFileMetaAction(botId: string, fileId: string, meta: { title: string; description: string; category: string }) {
  return run("MANAGE_KB", async (v) => {
    const bot = await loadBot(botId);
    const before = await updateBotFileMeta(bot._id, fileId, meta, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "file", entityId: fileId, entityLabel: meta.title || before.title, botId, summary: `${bot.name}: details edited` });
    return {};
  });
}

export async function setFileEnabledAction(botId: string, fileId: string, enabled: boolean) {
  return run("MANAGE_KB", async (v) => {
    const bot = await loadBot(botId);
    const f = await setBotFileEnabled(bot, fileId, enabled, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: enabled ? "enable" : "disable", entity: "file", entityId: fileId, entityLabel: f.title, botId, summary: bot.name });
    return {};
  });
}

export async function deleteFileAction(botId: string, fileId: string) {
  return run("DELETE_FILES", async (v) => {
    const bot = await loadBot(botId);
    const f = await deleteBotFile(bot, fileId, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "file", entityId: fileId, entityLabel: f.title, botId, summary: `${bot.name}: removed from OpenAI` });
    return {};
  });
}

/** Read a knowledge file's indexed text. Anyone who can open the knowledge base may view it. */
export async function viewFileAction(botId: string, fileId: string) {
  return run(null, async (v) => {
    if (!can(v, "EDIT_BOT") && !can(v, "MANAGE_KB") && !can(v, "UPLOAD_FILES") && !can(v, "DELETE_FILES")) throw new ForbiddenError();
    return getBotFileText(await loadBot(botId), fileId);
  }, { revalidate: false, readOnlySafe: true });
}

export async function refreshFilesAction(botId: string) {
  return run(null, async (v) => {
    if (!can(v, "EDIT_BOT") && !can(v, "MANAGE_KB") && !can(v, "UPLOAD_FILES")) throw new ForbiddenError();
    await refreshProcessing(await loadBot(botId));
    return {};
  }, { readOnlySafe: true });
}

// ── Chats ──────────────────────────────────────────────────────────────────

export async function renameChatAction(chatId: string, title: string) {
  return run(null, async (v) => {
    const chat = await renameChat(v, chatId, title);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "rename", entity: "chat", entityId: chatId, entityLabel: title, botId: chat.botId });
    return {};
  });
}

export async function deleteChatAction(chatId: string) {
  return run(null, async (v) => {
    const chat = await deleteChat(v, chatId);
    await recordAudit({
      actorId: v.userId,
      actorEmail: v.email,
      action: "delete",
      entity: "chat",
      entityId: chatId,
      entityLabel: chat.title,
      botId: chat.botId,
      summary: chat.userId === v.userId ? "Own chat" : `Chat of ${chat.userEmail}`,
    });
    return {};
  });
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function saveSettingsAction(input: Parameters<typeof saveSettings>[0]) {
  return run("MANAGE_SETTINGS", async (v) => {
    await saveSettings(input, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "settings", entity: "settings", entityId: "main", entityLabel: "AI Bots settings", summary: `${input.models.length} models` });
    return {};
  });
}
