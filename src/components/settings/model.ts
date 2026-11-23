/**
 * The one model behind every settings grid (Integrations, Product settings and any later one): the card data, the ONE status vocabulary and the
 * search and filter rules. Pure and client-safe, so the pages, the dev harness and the tests all use the same code.
 */
export type SettingsStatus = "ready" | "using_srb" | "using_own" | "not_set_up" | "needs_attention" | "locked";

export const SETTINGS_STATUSES: SettingsStatus[] = ["ready", "using_srb", "using_own", "not_set_up", "needs_attention", "locked"];

/** The words on the badge. The same on every page. */
export const STATUS_WORDS: Record<SettingsStatus, string> = {
  ready: "Ready",
  using_srb: "Included default",
  using_own: "Using your own",
  not_set_up: "Not set up",
  needs_attention: "Needs attention",
  locked: "Locked",
};

/** The colour family and icon of each status (names are mapped to icons in `SettingsCard.tsx`). */
export const STATUS_LOOK: Record<SettingsStatus, { tone: "good" | "brand" | "muted" | "warn"; icon: "check" | "shield" | "dashed" | "alert" | "lock" }> = {
  ready: { tone: "good", icon: "check" },
  using_srb: { tone: "brand", icon: "shield" },
  using_own: { tone: "good", icon: "check" },
  not_set_up: { tone: "muted", icon: "dashed" },
  needs_attention: { tone: "warn", icon: "alert" },
  locked: { tone: "muted", icon: "lock" },
};

/** The label of the one primary button: Set up when nothing is configured, Manage when it works, Configure for a card with no state. */
export function primaryLabel(status: SettingsStatus | null): string {
  if (status === "not_set_up") return "Set up";
  if (status === null) return "Configure";
  return "Manage";
}

export interface SettingsCardData {
  key: string;
  name: string;
  /** One plain sentence, verb first. */
  description: string;
  category: string;
  status: SettingsStatus;
  /** An extra muted line under the sentence (why it needs attention, what SRB provides …). */
  note?: string | null;
  /** The muted line "Used by: X, Y" or "Connections: …". */
  meta?: { label: "Used by" | "Connections"; items: string[] } | null;
  /** The icon (a name from `ICON_NAMES` in the card, or a component for the product icons). */
  icon: string;
  /** Where the primary button goes (opens the right-hand panel, or a page). */
  href: string;
  /** Only for a locked card: where to ask for access. */
  lockedHref?: string;
}

export interface SettingsCategory { key: string; title: string; description?: string }

export interface SettingsFilter { q: string; status: SettingsStatus | ""; category: string }

/** Reads `?q=&status=&category=` safely. */
export function readFilter(sp: Record<string, string | string[] | undefined>): SettingsFilter {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const status = one(sp.status) as SettingsStatus;
  return { q: one(sp.q).trim().slice(0, 80), status: SETTINGS_STATUSES.includes(status) ? status : "", category: one(sp.category) };
}

/** Search by name (and the sentence) plus the status and category filters. */
export function filterCards(cards: SettingsCardData[], f: SettingsFilter): SettingsCardData[] {
  const q = f.q.toLowerCase();
  return cards.filter((c) => (!q || `${c.name} ${c.description}`.toLowerCase().includes(q)) && (!f.status || c.status === f.status) && (!f.category || c.category === f.category));
}

/** The cards grouped under their category headings, in the order of `categories`, with the count of each; empty groups are left out. */
export function groupCards(cards: SettingsCardData[], categories: SettingsCategory[]): { category: SettingsCategory; cards: SettingsCardData[] }[] {
  return categories.map((category) => ({ category, cards: cards.filter((c) => c.category === category.key) })).filter((g) => g.cards.length > 0);
}
