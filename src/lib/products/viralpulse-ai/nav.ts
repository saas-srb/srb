/**
 * ViralPulse navigation, as data: what the sidebar shows, in what order, which URLs light each item up, and which old URLs
 * redirect where. Pure (no React, no server imports) so the same rules drive the desktop, collapsed and mobile sidebars and are
 * tested without a browser.
 */

/** Which sections this viewer may see — computed on the server from the real permission model. */
export interface SmmsNavFlags {
  campaigns: boolean;
  posts: boolean;
  media: boolean;
  ai: boolean;
  ugc?: boolean;
  analytics: boolean;
  audit: boolean;
  settings: boolean;
}

export type NavIcon = "dashboard" | "campaigns" | "posts" | "image" | "ugc" | "library" | "brand" | "generate" | "analytics" | "settings" | "brochure" | "vcard";
export type NavBadgeKey = "failedPosts" | "dueAds" | "generatingUgc" | "failingAccounts";
export type BadgeTone = "danger" | "warn" | "info";

export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: NavIcon;
  /** The item is active only on its own URL (the dashboard). */
  exact?: boolean;
  /** Extra URL prefixes that also light this item up. */
  also?: readonly string[];
  /** The permission flag(s) of which at least one must be true; absent = everyone who can open the product. */
  anyOf?: readonly (keyof SmmsNavFlags)[];
  badge?: NavBadgeKey;
  /** Sidebar section the item sits under (absent = the unlabelled top, i.e. the dashboard). */
  group?: NavGroupKey;
}

export type NavGroupKey = "studio" | "publish" | "insights" | "manage";
export const NAV_GROUPS: readonly { key: NavGroupKey; label: string }[] = [
  { key: "studio", label: "Content Studio" },
  { key: "publish", label: "Publish & Advertise" },
  { key: "insights", label: "Insights" },
  { key: "manage", label: "Manage" },
];

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/viralpulse-ai", label: "Dashboard", icon: "dashboard", exact: true },
  { key: "image-studio", href: "/viralpulse-ai/image-studio", label: "AI Image Studio", icon: "image", anyOf: ["media", "ai"], group: "studio" },
  { key: "generate-image", href: "/viralpulse-ai/generate-image", label: "Generate Image", icon: "generate", anyOf: ["ai"], group: "studio" },
  { key: "ugc", href: "/viralpulse-ai/ugc", label: "AI UGC Studio", icon: "ugc", anyOf: ["ugc"], badge: "generatingUgc", group: "studio" },
  { key: "brochure", href: "/viralpulse-ai/brochures", label: "Brochure Builder", icon: "brochure", anyOf: ["media", "ai", "posts"], group: "studio" },
  { key: "vcard", href: "/viralpulse-ai/vcards", label: "AI Visiting Cards", icon: "vcard", anyOf: ["media", "ai", "posts"], group: "studio" },
  { key: "library", href: "/viralpulse-ai/library", label: "Media Library", icon: "library", anyOf: ["media"], group: "studio" },
  { key: "brand-kit", href: "/viralpulse-ai/brand-kit", label: "Brand Kit", icon: "brand", anyOf: ["media", "ai"], group: "studio" },
  { key: "posts", href: "/viralpulse-ai/posts", label: "Social Media Reels/Posts", icon: "posts", anyOf: ["posts"], badge: "failedPosts", group: "publish" },
  { key: "campaigns", href: "/viralpulse-ai/campaigns", label: "Campaigns & Ads", icon: "campaigns", anyOf: ["campaigns"], badge: "dueAds", group: "publish" },
  { key: "analytics", href: "/viralpulse-ai/analytics", label: "Analytics", icon: "analytics", anyOf: ["analytics"], group: "insights" },
  { key: "settings", href: "/viralpulse-ai/settings", label: "Settings", icon: "settings", anyOf: ["settings"], group: "manage" },
];

/** Visible items split into sections in sidebar order; a section with no visible item is dropped. The dashboard has no label. */
export function groupedNav(flags: SmmsNavFlags): { key: NavGroupKey | "top"; label: string | null; items: NavItem[] }[] {
  const items = visibleNav(flags);
  const out: { key: NavGroupKey | "top"; label: string | null; items: NavItem[] }[] = [];
  const top = items.filter((i) => !i.group);
  if (top.length) out.push({ key: "top", label: null, items: top });
  for (const g of NAV_GROUPS) {
    const gi = items.filter((i) => i.group === g.key);
    if (gi.length) out.push({ key: g.key, label: g.label, items: gi });
  }
  return out;
}

/** The sidebar for one viewer: the same order for everyone, minus what their permissions hide. */
export function visibleNav(flags: SmmsNavFlags): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.anyOf || i.anyOf.some((f) => Boolean(flags[f])));
}

const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

export function isActive(item: NavItem, pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = trim(pathname.split("?")[0]);
  const href = trim(item.href);
  if (path === href) return true;
  if (item.exact) return false;
  return [href, ...(item.also ?? [])].some((p) => path === trim(p) || path.startsWith(`${trim(p)}/`));
}

/** The one item that is active for a URL (the longest matching prefix wins), or null on pages outside the sidebar (notifications). */
export function activeItem(items: readonly NavItem[], pathname: string | null | undefined): NavItem | null {
  let best: NavItem | null = null;
  for (const i of items) if (isActive(i, pathname) && (!best || i.href.length > best.href.length)) best = i;
  return best;
}

// ── Badges ───────────────────────────────────────────────────────────

export type NavBadges = Partial<Record<NavBadgeKey, number>>;

export interface BadgeView {
  count: number;
  tone: BadgeTone;
  /** Plain-language label for screen readers and tooltips. */
  label: string;
}

const BADGE_META: Record<NavBadgeKey, { tone: BadgeTone; label: (n: number) => string }> = {
  failedPosts: { tone: "danger", label: (n) => `${n} post${n === 1 ? "" : "s"} failed to publish` },
  dueAds: { tone: "warn", label: (n) => `${n} ad${n === 1 ? "" : "s"} due to be launched` },
  generatingUgc: { tone: "info", label: (n) => `${n} UGC video${n === 1 ? "" : "s"} generating` },
  failingAccounts: { tone: "danger", label: (n) => `${n} connected account${n === 1 ? "" : "s"} need attention` },
};

/** Badge for an item, or null when there is nothing to show (zero is never displayed). */
export function badgeFor(item: NavItem, badges: NavBadges | undefined): BadgeView | null {
  if (!item.badge) return null;
  const n = Math.floor(Number(badges?.[item.badge] ?? 0));
  if (!Number.isFinite(n) || n <= 0) return null;
  const m = BADGE_META[item.badge];
  return { count: n, tone: m.tone, label: m.label(n) };
}

export const badgeText = (n: number) => (n > 99 ? "99+" : String(n));

// ── Old URLs ──────────────────────────────────────────────────────────

/**
 * Old URL -> current URL. Served as HTTP 308 by route handlers at the old paths (`app/(products)/viralpulse-ai/<old>/route.ts`),
 * with the query string carried over. Campaigns and posts keep their URLs (their labels changed only); the Media Library and Brand Kit are their own
 * sidebar items (old Image Studio tabs redirect there) and the AI Content Generator became the copy generator of Social Media Reels/Posts.
 */
export const LEGACY_REDIRECTS: readonly { from: string; to: string }[] = [
  { from: "/viralpulse-ai/media", to: "/viralpulse-ai/library" },
  { from: "/viralpulse-ai/ai", to: "/viralpulse-ai/posts/generator" },
];

/** Where an old path goes, merging the visitor's own query on top of the target's. Null when the path is not an old URL. */
export function legacyTarget(pathname: string, search: string | URLSearchParams = ""): string | null {
  const hit = LEGACY_REDIRECTS.find((r) => r.from === trim(pathname));
  if (!hit) return null;
  const [path, fixed = ""] = hit.to.split("?");
  const q = new URLSearchParams(fixed);
  const mine = typeof search === "string" ? new URLSearchParams(search.replace(/^\?/, "")) : search;
  mine.forEach((v, k) => {
    if (k !== "tab" || !q.has("tab")) q.set(k, v);
  });
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

// ── Breadcrumbs ───────────────────────────────────────────────────────

/** Breadcrumb root for pages of each section, so labels match the sidebar. */
export const SECTION_CRUMB: Record<string, { label: string; href: string }> = {
  campaigns: { label: "Campaigns & Ads", href: "/viralpulse-ai/campaigns" },
  posts: { label: "Social Media Reels/Posts", href: "/viralpulse-ai/posts" },
  "image-studio": { label: "AI Image Studio", href: "/viralpulse-ai/image-studio" },
  ugc: { label: "AI UGC Studio", href: "/viralpulse-ai/ugc" },
  brochures: { label: "Brochure Builder", href: "/viralpulse-ai/brochures" },
  vcards: { label: "AI Visiting Cards", href: "/viralpulse-ai/vcards" },
  "generate-image": { label: "Generate Image", href: "/viralpulse-ai/generate-image" },
  library: { label: "Media Library", href: "/viralpulse-ai/library" },
  "brand-kit": { label: "Brand Kit", href: "/viralpulse-ai/brand-kit" },
  analytics: { label: "Analytics", href: "/viralpulse-ai/analytics" },
  settings: { label: "Settings", href: "/viralpulse-ai/settings" },
};

// ── Settings landing ──────────────────────────────────────────────────

export interface SettingsSection {
  key: string;
  title: string;
  description: string;
  href: string;
  /** Needs this flag (default: the Settings flag). */
  needs?: keyof SmmsNavFlags;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { key: "accounts", title: "Connected accounts", description: "Facebook, Instagram, YouTube, LinkedIn and Google Business logins, and where each one publishes.", href: "/viralpulse-ai/settings?tab=integrations" },
  { key: "publishing", title: "Publishing", description: "Time zone, AI disclosure note, how many posts go out per run and Google Business Profile posting.", href: "/viralpulse-ai/settings/publishing" },
  { key: "brand", title: "Brand voice", description: "The brand voice, services, audience and rules the AI writes from.", href: "/viralpulse-ai/settings?tab=brand" },
  { key: "image-kit", title: "Brand Kit (images)", description: "Logo, colours and rules the Image Studio applies to every picture.", href: "/viralpulse-ai/brand-kit" },
  { key: "ai", title: "AI & models", description: "OpenAI text and image models, quality and daily limits.", href: "/viralpulse-ai/settings?tab=ai" },
  { key: "limits", title: "Limits & approvals", description: "Spend caps and manager approval for AI video.", href: "/viralpulse-ai/ugc/settings", needs: "ugc" },
  { key: "health", title: "System health", description: "Checks that keys, AI models, connected logins and scheduled jobs are working.", href: "/viralpulse-ai/settings?tab=health" },
  { key: "team", title: "Team & roles", description: "What each role can do in ViralPulse.", href: "/viralpulse-ai/settings?tab=roles" },
  { key: "audit", title: "Audit log", description: "Who created, generated, approved and published what.", href: "/workspace/settings/audit-log?source=products&module=smms", needs: "audit" },
  { key: "notifications", title: "Notifications", description: "Publishing, approval and video alerts sent to you.", href: "/viralpulse-ai/notifications" },
];

export function visibleSettingsSections(flags: SmmsNavFlags): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => (s.needs ? Boolean(flags[s.needs]) : true));
}

export const SETTINGS_TABS = ["brand", "ai", "integrations", "health", "roles"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const parseSettingsTab = (v: string | undefined): SettingsTab | null => ((SETTINGS_TABS as readonly string[]).includes(v ?? "") ? (v as SettingsTab) : null);
