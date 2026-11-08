import "server-only";
import { notifyAibotsUsers } from "@/lib/products/agentos/notifications";
import { audienceUserIds } from "@/lib/notify/audience";
import { short } from "@/lib/notify/triggers/format";

/** AI Bots notifications: bot lifecycle and knowledge processing go to the product's admins (not the person who did it). */
async function admins(except?: string | null) {
  return (await audienceUserIds("aibots", "admin")).filter((i) => i !== except);
}
export const aibotsEvents = {
  created: async (bot: { id: string; name: string }, actor: string) =>
    notifyAibotsUsers(await admins(actor), { type: "aibots_bot_created", title: `New bot: ${short(bot.name, 60)}`, body: "A new AI bot was created.", link: `/agentos/bots/${bot.id}`, dedupeKey: `aibots-new:${bot.id}` }),
  status: async (bot: { id: string; name: string }, status: string, actor: string) =>
    notifyAibotsUsers(await admins(actor), { type: "aibots_bot_status", title: `Bot ${status}: ${short(bot.name, 60)}`, body: status === "active" ? "People with access can use it again." : "People can no longer chat with it.", link: `/agentos/bots/${bot.id}`, dedupeKey: `aibots-status:${bot.id}:${status}:${new Date().toISOString().slice(0, 13)}` }),
  deleted: async (bot: { id: string; name: string }, actor: string) =>
    notifyAibotsUsers(await admins(actor), { type: "aibots_bot_deleted", title: `Bot deleted: ${short(bot.name, 60)}`, body: "Its knowledge files were removed.", link: "/agentos/bots", dedupeKey: `aibots-del:${bot.id}` }),
  fileProcessed: async (bot: { id: string; name: string }, file: { id: string; title: string }, ok: boolean, detail?: string | null) =>
    notifyAibotsUsers(await admins(), { type: ok ? "aibots_file_ready" : "aibots_file_failed", title: ok ? `Knowledge file ready: ${short(file.title, 50)}` : `Knowledge file failed: ${short(file.title, 50)}`, body: `${short(bot.name, 40)}${!ok && detail ? ` · ${short(detail, 100)}` : ""}`, link: `/agentos/bots/${bot.id}`, dedupeKey: `aibots-file:${file.id}:${ok ? 1 : 0}` }),
};
