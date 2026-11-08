import type { CallTarget } from "@/lib/products/agentos/calls/types";

/**
 * Where a call's target record lives, so the call page can link back to it. Pure routing table: a product that starts placing calls
 * adds its record types here. A target with no entry is shown as plain text (never a guessed link).
 */
const LINKS: Record<string, (id: string) => string> = {
  "dealflow-ai:lead": (id) => `/dealflow-ai/leads/${encodeURIComponent(id)}`,
  "talentos:applicant": (id) => `/talentos/recruitment/${encodeURIComponent(id)}`,
  "sprintos:project": (id) => `/sprintos/projects/${encodeURIComponent(id)}`,
  "sprintos:client": (id) => `/sprintos/clients/${encodeURIComponent(id)}`,
  // A call placed from inside an AgentOS text chat: back to that chat (the page resolves the agent from the chat).
  "agentos:chat": (id) => `/agentos/chats/${encodeURIComponent(id)}`,
  "dealflow-ai:applicant": (id) => `/dealflow-ai/careers/applicants/${encodeURIComponent(id)}`,
  // A website form submission: the id is "<category>:<id>" (the page needs both).
  "dealflow-ai:submission": (id) => {
    const i = id.indexOf(":");
    return i > 0 ? `/dealflow-ai/submissions/${encodeURIComponent(id.slice(0, i))}/${encodeURIComponent(id.slice(i + 1))}` : "/dealflow-ai/leads";
  },
};

export function targetHref(target: Pick<CallTarget, "product" | "entityType" | "entityId"> | null): string | null {
  if (!target) return null;
  const make = LINKS[`${target.product}:${target.entityType}`];
  return make ? make(target.entityId) : null;
}
