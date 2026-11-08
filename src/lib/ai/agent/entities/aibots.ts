import "server-only";
import * as A from "@/app/(products)/agentos/(protected)/actions";
import { aibotsCan, type AibotsPermission } from "@/lib/aibots-roles";
import { getBot } from "@/lib/products/agentos/bots";
import { getSettings } from "@/lib/products/agentos/settings";
import { viaAction, f, str, fail } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, FieldDef, Json } from "@/lib/ai/agent/types";

/**
 * AI Bots for the agent: create and tune the company's own assistants (instructions, model, who can use them), manage their knowledge files
 * and chats, and the product settings — through the product's own actions.
 */

const ctx = (u: AgentUser) => ({ roles: u.roles, permissionOverrides: u.permissionOverrides });
const can = (p: AibotsPermission) => (u: AgentUser) => aibotsCan(ctx(u), p);
const soft = { deletedAt: null };

export const AIBOTS_ENTITIES: EntityDef[] = [
  { key: "aibots.bot", panel: "aibots", label: "AI bot", description: "Assistants built here: name, category, model, instructions, status, who can use them.", collection: "aibots_bots", idType: "string", baseFilter: soft, titleField: "name", search: ["name", "category", "description"], read: "any", allowRead: can("USE_BOT") },
  { key: "aibots.file", panel: "aibots", label: "Knowledge file", description: "Files that teach a bot (title, category, enabled, processing status).", collection: "aibots_files", idType: "string", baseFilter: soft, titleField: "title", search: ["title", "category"], read: "staff", allowRead: can("MANAGE_KB") },
  { key: "aibots.chat", panel: "aibots", label: "Chat", description: "Conversations with bots. People see their own; auditors with permission see everyone's.", collection: "aibots_chats", idType: "string", baseFilter: soft, titleField: "title", search: ["title", "userEmail"], read: "staff", allowRead: can("VIEW_CHATS"), self: (u) => ({ userId: u.id }), hide: ["messages"] },
  { key: "aibots.run", panel: "aibots", label: "Usage run", description: "Each bot reply with model, tokens and estimated cost.", collection: "aibots_runs", idType: "string", read: "staff", allowRead: can("VIEW_CHATS") },
  { key: "aibots.activity", panel: "aibots", label: "Audit log", description: "Who changed what in AgentOS.", collection: "aibots_activity_logs", idType: "string", search: ["entityLabel", "summary", "actorEmail"], read: "admin", allowRead: can("VIEW_AUDIT") },
];

const act = (key: string, label: string, description: string, params: FieldDef[], perm: AibotsPermission, run: (v: Json) => Promise<unknown>, success: string, destructive = false): ActionDef => ({
  key, panel: "aibots", label, description, params, level: "any", allow: can(perm), destructive, run: (v) => viaAction(() => run(v), success),
});

const BOT: FieldDef[] = [f.str("name", "Name", true), f.text("instructions", "Instructions — how the bot behaves (its system prompt)", true), f.str("icon", "Icon name"), f.str("color", "Colour"), f.text("description", "What it is for"), f.str("category", "Category"), f.str("model", "Model id (see the settings' models)"), f.num("temperature", "Temperature 0–2 (blank = default)"), f.bool("allowAttachments", "Allow file attachments in chat"), f.list("starterPrompts", "Starter prompts"), f.enum("accessMode", "Who can use it", ["all", "roles", "users"]), f.list("accessRoles", "Roles allowed (when mode is roles)"), f.list("accessUserIds", "User ids allowed (when mode is users)"), f.enum("status", "Status", ["active", "inactive"])];

export const AIBOTS_ACTIONS: ActionDef[] = [
  act("aibots.create_bot", "Create an AI bot", "Build a new assistant with its instructions, model and audience.", BOT, "CREATE_BOT", (v) => A.saveBotAction(null, v as never), "Bot created."),
  act("aibots.update_bot", "Edit an AI bot", "Change a bot's instructions, model, audience etc. (others stay as they are).", [f.ref("botId", "Bot id", "aibots.bot", true), ...BOT.map((p) => ({ ...p, required: false }))], "EDIT_BOT", async (v) => {
    const { botId, ...changes } = v;
    const bot = (await getBot(String(botId))) as unknown as Json | null;
    if (!bot) return { ok: false, error: "Bot not found." };
    const access = (bot.access as Json) ?? {};
    const current: Json = { name: bot.name, icon: bot.icon, color: bot.color, description: bot.description, category: bot.category, instructions: bot.instructions, model: bot.model, temperature: bot.temperature, allowAttachments: bot.allowAttachments, starterPrompts: bot.starterPrompts, accessMode: access.mode, accessRoles: access.roles, accessUserIds: access.userIds, status: bot.status };
    return A.saveBotAction(String(botId), { ...current, ...changes } as never);
  }, "Bot updated."),
  act("aibots.set_bot_status", "Turn a bot on or off", "Activate or deactivate a bot.", [f.ref("botId", "Bot id", "aibots.bot", true), f.bool("active", "Active")], "EDIT_BOT", (v) => A.setBotStatusAction(String(v.botId), v.active !== false), "Bot status changed."),
  act("aibots.delete_bot", "Delete a bot", "Delete a bot and its knowledge base.", [f.ref("botId", "Bot id", "aibots.bot", true)], "DELETE_BOT", (v) => A.deleteBotAction(String(v.botId)), "Bot deleted.", true),
  act("aibots.update_file_details", "Edit a knowledge file's details", "Title, description and category of a file.", [f.ref("botId", "Bot id", "aibots.bot", true), f.ref("fileId", "File id", "aibots.file", true), f.str("title", "Title"), f.text("description", "Description"), f.str("category", "Category")], "MANAGE_KB", (v) => A.updateFileMetaAction(String(v.botId), String(v.fileId), { title: String(v.title ?? ""), description: String(v.description ?? ""), category: String(v.category ?? "") }), "File updated."),
  act("aibots.set_file_enabled", "Include or exclude a knowledge file", "Turn a file on or off for the bot's answers.", [f.ref("botId", "Bot id", "aibots.bot", true), f.ref("fileId", "File id", "aibots.file", true), f.bool("enabled", "Enabled")], "MANAGE_KB", (v) => A.setFileEnabledAction(String(v.botId), String(v.fileId), v.enabled !== false), "File updated."),
  act("aibots.delete_file", "Delete a knowledge file", "Remove a file from the bot's knowledge.", [f.ref("botId", "Bot id", "aibots.bot", true), f.ref("fileId", "File id", "aibots.file", true)], "DELETE_FILES", (v) => A.deleteFileAction(String(v.botId), String(v.fileId)), "File deleted.", true),
  act("aibots.rename_chat", "Rename a chat", "Give a chat a new title.", [f.ref("chatId", "Chat id", "aibots.chat", true), f.str("title", "Title", true)], "USE_BOT", (v) => A.renameChatAction(String(v.chatId), String(v.title ?? "")), "Chat renamed."),
  act("aibots.delete_chat", "Delete a chat", "Delete a conversation.", [f.ref("chatId", "Chat id", "aibots.chat", true)], "USE_BOT", (v) => A.deleteChatAction(String(v.chatId)), "Chat deleted.", true),
  act("aibots.save_settings", "Change AI Bots settings", "The default model, reply length cap, daily message limit per person and the general assistant's instructions (the model price list stays as it is).", [f.str("defaultModel", "Default model id"), f.num("maxOutputTokens", "Maximum reply tokens"), f.num("dailyMessageLimit", "Daily messages per person (0 = unlimited)"), f.text("generalInstructions", "General assistant instructions")], "MANAGE_SETTINGS", async (v) => {
    const cur = (await getSettings()) as unknown as Json;
    if (!Array.isArray(cur.models)) return fail("Settings could not be read.");
    return A.saveSettingsAction({ models: (cur.models as Json[]).map((m) => ({ id: m.id, label: m.label, input: m.input, output: m.output })), defaultModel: str(v.defaultModel) ?? cur.defaultModel, maxOutputTokens: v.maxOutputTokens ?? cur.maxOutputTokens, dailyMessageLimit: v.dailyMessageLimit ?? cur.dailyMessageLimit, generalInstructions: v.generalInstructions ?? cur.generalInstructions } as never);
  }, "Settings saved."),
  act("aibots.refresh_files", "Re-check a bot's file processing", "Refresh the processing status of a bot's knowledge files.", [f.ref("botId", "Bot id", "aibots.bot", true)], "EDIT_BOT", (v) => A.refreshFilesAction(String(v.botId)), "Refreshed."),
];
