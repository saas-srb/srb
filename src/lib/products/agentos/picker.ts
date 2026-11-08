import "server-only";
import { botsCollection, kindOf, normalizeBot, usableAgentsFilter } from "@/lib/products/agentos/bots";
import { avatarUrlFor } from "@/lib/products/agentos/avatar-shared";
import { getViewer, type AibotsViewer } from "@/lib/products/agentos/viewer";
import type { AgentKind } from "@/lib/products/agentos/voice/types";
import type { AgentOption } from "@/lib/products/agentos/picker-types";

/**
 * CROSS-PRODUCT AGENT PICKER CONTRACT
 * -----------------------------------
 * AgentOS is the single home of every agent on the platform (text and voice). Any other product that needs an agent
 * (to chat with, to call, to attach to a workflow) must NOT keep its own list: it
 *   1. calls `listAgentsFor({ kind? })` in a server component / server action and passes the result as props to
 *   2. `<AgentPicker agents={...} value={id} onChange={setId} />` (src/components/products/agentos/AgentPicker.tsx).
 * Rules:
 *  - Only ACTIVE, non-deleted agents the CURRENT viewer may use (the agent's access list: all / roles / users;
 *    AgentOS editors see every active agent). A viewer without AgentOS access gets an empty list.
 *  - `kind` narrows to "text" or "voice"; omit for both. Legacy rows without a kind are text.
 *  - The picker value is the agent id (`bots._id`); to open it, link to `/agentos/b/<id>`.
 *  - Re-check access on the server when the saved id is used (`getChatBot` / `canUseBot`); the list is a convenience, not a gate.
 */

export type { AgentOption } from "@/lib/products/agentos/picker-types";

/** Same as `listAgentsFor` for an explicit viewer (server actions, tests). */
export async function listAgentsForViewer(viewer: AibotsViewer, opts: { kind?: AgentKind } = {}): Promise<AgentOption[]> {
  const col = await botsCollection();
  const rows = await col.find(usableAgentsFilter(viewer, opts.kind)).sort({ name: 1 }).limit(500).toArray();
  return rows.map(normalizeBot).map((b) => ({
    id: b._id,
    name: b.name,
    icon: b.icon,
    color: b.color,
    avatarUrl: avatarUrlFor(b._id, b.avatarKey),
    kind: kindOf(b),
    category: b.category,
    description: b.description,
  }));
}

export async function listAgentsFor(opts: { kind?: AgentKind } = {}): Promise<AgentOption[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  return listAgentsForViewer(viewer, opts);
}
