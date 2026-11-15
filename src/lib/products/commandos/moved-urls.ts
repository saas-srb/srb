/**
 * Where the Workspace addresses that moved now live. Every old address keeps working: its page redirects here (pure data, so a test can check each one).
 * Configuration opens in a right-hand panel on its list page, driven by `?open=` (and `?tab=`).
 */
export const INTEGRATIONS = "/commandos/settings/integrations";
export const PRODUCT_SETTINGS = "/commandos/settings/products";

export const MOVED_URLS: { from: string; to: string }[] = [
  { from: "/commandos/chatbot/conversations", to: `${INTEGRATIONS}?open=ai-chatbot&tab=conversations` },
  { from: "/commandos/chatbot/knowledge-base", to: `${INTEGRATIONS}?open=ai-chatbot&tab=knowledge` },
  { from: "/commandos/chatbot/config", to: `${INTEGRATIONS}?open=ai-chatbot&tab=config` },
  { from: "/commandos/chatbot/voice", to: "/commandos/analytics#ai-voice" },
  { from: "/commandos/chatbot/voice/config", to: `${INTEGRATIONS}?open=elevenlabs&tab=settings` },
  { from: "/commandos/chatbot/voice-conversations", to: `${INTEGRATIONS}?open=elevenlabs&tab=conversations` },
  { from: "/commandos/settings/email", to: "/commandos/settings/domains#sender-email" },
  ...["talentos", "sprintos", "cashflow-ai", "spendiq", "cohort-ai", "playbook-ai", "viralpulse-ai", "rankmax-ai", "sitecraft-ai", "agentos", "cybervault", "evaliq"].map((p) => ({
    from: `${PRODUCT_SETTINGS}/${p}`,
    to: `${PRODUCT_SETTINGS}?open=${p}`,
  })),
];

/** The new address for an old one, keeping any extra query (page, search ...). Null when the address did not move. */
export function movedTarget(from: string, extra: Record<string, string | string[] | undefined> = {}): string | null {
  const hit = MOVED_URLS.find((m) => m.from === from);
  if (!hit) return null;
  const [pathAndQuery, hash] = hit.to.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  for (const [k, v] of Object.entries(extra)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && !params.has(k)) params.set(k, val);
  }
  const q = params.toString();
  return `${path}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`;
}
