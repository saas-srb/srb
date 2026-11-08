import "server-only";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { listAibotsStaff, type BotDoc } from "@/lib/products/agentos/bots";
import { getSettings } from "@/lib/products/agentos/settings";
import type { AgentKind } from "@/lib/products/agentos/voice/types";
import type { BotFormValues } from "@/components/products/agentos/BotForm";

/** Everything the bot form's pickers need, read live from the role catalog, staff list and settings. */
export async function botFormOptions() {
  const [settings, staff] = await Promise.all([getSettings(), listAibotsStaff()]);
  return {
    settings,
    models: settings.models.map((m) => ({ value: m.id, label: m.label === m.id ? m.id : `${m.label} (${m.id})` })),
    roleOptions: ROLE_GROUPS.flatMap((g) => g.roles.map((r) => ({ id: r.value, label: r.label, sub: g.module }))),
    userOptions: staff.map((s) => ({ id: s.value, label: s.label })),
  };
}

export function formValuesFor(bot: BotDoc | null, defaultModel: string, kind: AgentKind = "text"): BotFormValues {
  if (!bot) {
    return {
      kind,
      voice: null,
      name: "",
      icon: "bot",
      color: "indigo",
      description: "",
      category: "General",
      instructions: "",
      model: defaultModel,
      temperature: "",
      allowAttachments: true,
      starterPrompts: [],
      accessMode: "all",
      accessRoles: [],
      accessUserIds: [],
      status: "active",
    };
  }
  return {
    kind: bot.kind === "voice" ? "voice" : "text",
    voice: bot.voice ?? null,
    name: bot.name,
    icon: bot.icon,
    color: bot.color,
    description: bot.description,
    category: bot.category,
    instructions: bot.instructions,
    model: bot.model,
    temperature: bot.temperature === null ? "" : String(bot.temperature),
    allowAttachments: bot.allowAttachments,
    starterPrompts: bot.starterPrompts ?? [],
    accessMode: bot.access.mode,
    accessRoles: bot.access.roles,
    accessUserIds: bot.access.userIds,
    status: bot.status,
  };
}
