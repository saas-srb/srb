/** Website push (to a company's own visitors). Client-safe: topics, settings shape and validation. */

export const WEB_PUSH_TOPICS = ["offers", "rewards", "updates", "announcements"] as const;
export type WebPushTopic = (typeof WEB_PUSH_TOPICS)[number];

export const WEB_PUSH_TOPIC_META: Record<WebPushTopic, { label: string; description: string }> = {
  offers: { label: "Offers and deals", description: "New festival offers, coupons and limited-time deals." },
  rewards: { label: "Credits and rewards", description: "Ways to earn credits, referral bonuses and reward campaigns." },
  updates: { label: "News and updates", description: "New blog posts, launches and product news." },
  announcements: { label: "Announcements", description: "Important messages from the business." },
};

export interface WebPushSettings {
  /** Master switch: off = the website shows no prompt and nothing is sent. */
  enabled: boolean;
  /** Topics visitors can choose from. */
  topics: Record<WebPushTopic, boolean>;
  /** Send automatically when something happens: an offer goes live, a reward campaign starts, a post is published. */
  automations: { offers: boolean; rewards: boolean; updates: boolean };
  /** Most broadcasts (manual and automatic together) sent in one UTC day. */
  dailyCap: number;
  /** Seconds after a page opens before the permission card appears. */
  promptDelaySeconds: number;
  promptTitle: string;
  promptText: string;
}

export const DEFAULT_WEB_PUSH_SETTINGS: WebPushSettings = {
  enabled: false,
  topics: { offers: true, rewards: true, updates: true, announcements: true },
  automations: { offers: true, rewards: true, updates: true },
  dailyCap: 3,
  promptDelaySeconds: 15,
  promptTitle: "Get our latest offers",
  promptText: "Allow notifications and we'll tell you about new offers, rewards and updates. You can turn them off any time.",
};

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const clampInt = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
const text = (v: unknown, max: number, d: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : d);

export function normalizeWebPushSettings(input: unknown): WebPushSettings {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const topics = { ...DEFAULT_WEB_PUSH_SETTINGS.topics };
  const rt = (r.topics ?? {}) as Record<string, unknown>;
  for (const t of WEB_PUSH_TOPICS) topics[t] = bool(rt[t], topics[t]);
  const ra = (r.automations ?? {}) as Record<string, unknown>;
  const d = DEFAULT_WEB_PUSH_SETTINGS;
  return {
    enabled: bool(r.enabled, d.enabled),
    topics,
    automations: { offers: bool(ra.offers, d.automations.offers), rewards: bool(ra.rewards, d.automations.rewards), updates: bool(ra.updates, d.automations.updates) },
    dailyCap: clampInt(r.dailyCap, 1, 20, d.dailyCap),
    promptDelaySeconds: clampInt(r.promptDelaySeconds, 0, 300, d.promptDelaySeconds),
    promptTitle: text(r.promptTitle, 60, d.promptTitle),
    promptText: text(r.promptText, 200, d.promptText),
  };
}

export function isTopic(v: unknown): v is WebPushTopic {
  return typeof v === "string" && (WEB_PUSH_TOPICS as readonly string[]).includes(v);
}

/** Same-site path only; anything else becomes the home page. */
export function safeSitePath(url: unknown): string {
  const u = typeof url === "string" ? url.trim() : "";
  return u.startsWith("/") && !u.startsWith("//") && !u.includes("\\") && u.length <= 300 ? u : "/";
}
