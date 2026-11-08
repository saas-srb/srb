import type { BotSummary } from "@/lib/products/agentos/bots";
import type { AgentKind } from "@/lib/products/agentos/voice/types";

/** Pure, client-safe helpers for the Agent Hub gallery (no server-only imports). */

export interface HubAgent extends BotSummary {
  /** Voice agents: the ElevenLabs voice's display name. */
  voiceName: string | null;
  lastUsedAt: string | null;
  canEdit: boolean;
}

export interface HubFilters {
  kind: AgentKind | "all";
  q: string;
  category: string;
  status: "all" | "active" | "inactive";
}

export const DEFAULT_HUB_FILTERS: HubFilters = { kind: "all", q: "", category: "", status: "all" };

export function filterHubAgents<T extends Pick<HubAgent, "kind" | "name" | "description" | "category" | "status" | "model" | "voiceName">>(agents: T[], f: HubFilters): T[] {
  const q = f.q.trim().toLowerCase();
  return agents.filter((a) => {
    if (f.kind !== "all" && a.kind !== f.kind) return false;
    if (f.status !== "all" && a.status !== f.status) return false;
    if (f.category && a.category !== f.category) return false;
    if (q && !`${a.name} ${a.description} ${a.category} ${a.voiceName ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function hubCategories(agents: Pick<HubAgent, "category">[]): string[] {
  return Array.from(new Set(agents.map((a) => a.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function kindCounts(agents: Pick<HubAgent, "kind">[]): Record<AgentKind | "all", number> {
  return { all: agents.length, text: agents.filter((a) => a.kind === "text").length, voice: agents.filter((a) => a.kind === "voice").length };
}
