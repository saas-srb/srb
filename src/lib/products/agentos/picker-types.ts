import type { AgentKind } from "@/lib/products/agentos/voice/types";

/** One selectable agent, as the cross-product picker receives it (client-safe). */
export interface AgentOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Authenticated photo URL, or null (render icon + colour). */
  avatarUrl: string | null;
  kind: AgentKind;
  category: string;
  description: string;
}
