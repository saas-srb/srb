/**
 * ViralPulse Dashboard: the pure rules. What a viewer may see, the company-time-zone month boundaries, "change vs previous period" (only
 * when both periods have data), the setup checklist, how health findings are ranked and where each one is fixed, and how a launch is
 * bucketed. No server imports, so it is tested without a database.
 */
import type { SmmsPermission } from "@/lib/smms-roles";
import { addDays, dayKeyIn, shiftMonth } from "@/lib/products/viralpulse-ai/post-wizard/calendar";
import { zonedToUtc } from "@/lib/products/viralpulse-ai/publishers/schedule";

// ── Permissions ─────────────────────────────────────────────────────────────────────────────────────

/** What this viewer may use; mirrors the sidebar flags and the permission each create action needs. */
export interface DashPerms {
  newPost: boolean;
  newCampaign: boolean;
  createImage: boolean;
  createUgc: boolean;
  viewPosts: boolean;
  viewCampaigns: boolean;
  viewAnalytics: boolean;
  viewStudios: boolean;
  viewUgc: boolean;
  settings: boolean;
  audit: boolean;
  approveSpend: boolean;
  manageLimits: boolean;
  createAds: boolean;
  manageMedia: boolean;
}

export function dashPerms(can: (p: SmmsPermission) => boolean): DashPerms {
  return {
    newPost: can("MANAGE_POSTS"),
    newCampaign: can("CREATE_CAMPAIGNS"),
    createImage: can("GENERATE_AI_CONTENT"),
    createUgc: can("GENERATE_AI_CONTENT"),
    viewPosts: can("MANAGE_POSTS") || can("VIEW_CAMPAIGNS"),
    viewCampaigns: can("VIEW_CAMPAIGNS"),
    viewAnalytics: can("VIEW_ANALYTICS"),
    viewStudios: can("MANAGE_MEDIA") || can("MANAGE_POSTS") || can("CREATE_ADS") || can("GENERATE_AI_CONTENT"),
    viewUgc: can("GENERATE_AI_CONTENT"),
    settings: can("MANAGE_INTEGRATIONS"),
    audit: can("VIEW_AUDIT_LOG"),
    approveSpend: can("APPROVE_AD_SPEND"),
    manageLimits: can("MANAGE_AD_LIMITS"),
    createAds: can("CREATE_ADS"),
    manageMedia: can("MANAGE_MEDIA"),
  };
}

export interface HeaderAction {
  key: "post" | "campaign" | "image" | "ugc";
  label: string;
  href: string;
}

/** The create buttons in the page header: only those this person can use, in a fixed order. */
export function headerActions(p: DashPerms): HeaderAction[] {
  const all: [boolean, HeaderAction][] = [
    [p.newPost, { key: "post", label: "New post", href: "/viralpulse-ai/posts/new" }],
    [p.newCampaign, { key: "campaign", label: "New campaign", href: "/viralpulse-ai/campaigns/new" }],
    [p.createImage, { key: "image", label: "Create image", href: "/viralpulse-ai/image-studio?tab=create" }],
    [p.createUgc, { key: "ugc", label: "Create UGC video", href: "/viralpulse-ai/ugc/new" }],
  ];
  return all.filter(([ok]) => ok).map(([, a]) => a);
}

// ── Periods in the company time zone ────────────────────────────────────────────────────────────────────

export interface Periods {
  tz: string;
  today: string;
  month: string;
  /** Instants: this month so far = [start, end); the same number of days of last month = [prevStart, prevEnd). */
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  /** Day keys, inclusive, for day-keyed snapshots. */
  fromDay: string;
  toDay: string;
  prevFromDay: string;
  prevToDay: string;
  /** How many days of the month have been counted so far (1-based day of month). */
  daysElapsed: number;
}

/** This month so far against the same number of days of last month, both read on the wall clock of `tz`. */
export function periodsFor(now: Date, tz: string): Periods {
  const today = dayKeyIn(now, tz);
  const month = today.slice(0, 7);
  const dom = Number(today.slice(8, 10));
  const fromDay = `${month}-01`;
  const prevFromDay = `${shiftMonth(month, -1)}-01`;
  const lastOfPrev = addDays(fromDay, -1);
  const wanted = addDays(prevFromDay, dom - 1);
  const prevToDay = wanted > lastOfPrev ? lastOfPrev : wanted;
  return {
    tz, today, month, fromDay, toDay: today, prevFromDay, prevToDay, daysElapsed: dom,
    start: zonedToUtc(`${fromDay}T00:00`, tz),
    end: zonedToUtc(`${addDays(today, 1)}T00:00`, tz),
    prevStart: zonedToUtc(`${prevFromDay}T00:00`, tz),
    prevEnd: zonedToUtc(`${addDays(prevToDay, 1)}T00:00`, tz),
  };
}

/** The last `n` whole days up to and including today (company zone), as day keys. */
export function lastDays(now: Date, tz: string, n: number): { from: string; to: string } {
  const to = dayKeyIn(now, tz);
  return { from: addDays(to, -(n - 1)), to };
}

/**
 * Percent change, or null when it cannot be stated honestly: either side missing (null), or nothing to compare against (previous is 0).
 * "Has data" is the caller's word for a side: a synced period passes its value, an unsynced one passes null.
 */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Setup checklist ─────────────────────────────────────────────────────────────────────────────────────

export interface SetupFacts {
  /** Connected, enabled social accounts per platform label. */
  platforms: { label: string; count: number }[];
  brandKitSet: boolean;
  aiModels: { state: "ok" | "attention" | "unknown"; detail: string };
  publishingSaved: boolean;
  limitsSet: boolean;
  postCount: number;
  campaignCount: number;
}

export interface SetupItem {
  key: "accounts" | "brand" | "ai" | "publishing" | "limits" | "post" | "campaign";
  label: string;
  detail: string;
  done: boolean;
  href: string;
  cta: string;
}

/** The checklist, limited to the steps this person can act on. Hidden entirely (`allDone`) once every visible step is done. */
export function buildSetup(f: SetupFacts, p: DashPerms): { items: SetupItem[]; done: number; total: number; allDone: boolean } {
  const connected = f.platforms.filter((x) => x.count > 0).map((x) => x.label);
  const missing = f.platforms.filter((x) => x.count === 0).map((x) => x.label);
  const all: [boolean, SetupItem][] = [
    [p.settings, { key: "accounts", label: "Connect your social accounts", done: connected.length > 0, href: "/viralpulse-ai/settings?tab=integrations", cta: "Connect",
      detail: connected.length ? `${connected.join(", ")} connected${missing.length ? `; not yet: ${missing.join(", ")}` : ""}.` : "Nothing is connected yet, so posts cannot be published." }],
    [p.settings || p.createImage, { key: "brand", label: "Set your brand kit", done: f.brandKitSet, href: "/viralpulse-ai/image-studio?tab=brand", cta: "Open brand kit",
      detail: f.brandKitSet ? "Logo, colours or voice are saved." : "Add your logo, colours and voice so images match your brand." }],
    [p.settings, { key: "ai", label: "AI models available", done: f.aiModels.state === "ok", href: "/viralpulse-ai/settings?tab=ai", cta: f.aiModels.state === "unknown" ? "Check" : "Fix",
      detail: f.aiModels.detail }],
    [p.settings, { key: "publishing", label: "Review publishing settings", done: f.publishingSaved, href: "/viralpulse-ai/settings/publishing", cta: "Open",
      detail: f.publishingSaved ? "Time zone and publishing choices are saved." : "Confirm your time zone and AI disclosure note." }],
    [p.manageLimits, { key: "limits", label: "Set ad spending limits", done: f.limitsSet, href: "/viralpulse-ai/campaigns/limits", cta: "Set limits",
      detail: f.limitsSet ? "At least one spending cap is set." : "Without a cap, no ad can be launched." }],
    [p.newPost, { key: "post", label: "Create your first post", done: f.postCount > 0, href: "/viralpulse-ai/posts/new", cta: "New post",
      detail: f.postCount > 0 ? `${f.postCount} post${f.postCount === 1 ? "" : "s"} created.` : "Write one idea and adapt it for every platform." }],
    [p.newCampaign, { key: "campaign", label: "Create your first campaign", done: f.campaignCount > 0, href: "/viralpulse-ai/campaigns/new", cta: "New campaign",
      detail: f.campaignCount > 0 ? `${f.campaignCount} campaign${f.campaignCount === 1 ? "" : "s"} created.` : "Plan an ad campaign with AI-written copy." }],
  ];
  const items = all.filter(([ok]) => ok).map(([, i]) => i);
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, allDone: items.length === 0 || done === items.length };
}

// ── Needs attention ─────────────────────────────────────────────────────────────────────────────────────

export type Severity = "critical" | "warning";
export interface AttentionItem {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** What to do, in a few words. */
  fixLabel: string;
  /** Where to do it; null when this person cannot (the label then says who can). */
  href: string | null;
}

const CRITICAL = /expired|revoked|will fail|failed|missing permission|unavailable|isn't connected|can't be stored|no replacement/i;

/** Where each kind of health finding is fixed. */
export function healthHref(id: string): string {
  if (id.startsWith("account.") || id.startsWith("conn.") || id === "encryption") return "/viralpulse-ai/settings?tab=integrations";
  if (id.startsWith("openai.")) return "/viralpulse-ai/settings?tab=ai";
  return "/viralpulse-ai/settings?tab=health";
}

export function fromHealth(items: { id: string; label: string; status: string; detail: string; fix: string | null }[], canFix: boolean): AttentionItem[] {
  return items
    .filter((i) => i.status === "attention")
    .map((i) => ({
      id: i.id,
      severity: (CRITICAL.test(i.detail) ? "critical" : "warning") as Severity,
      title: i.label,
      detail: i.detail,
      fixLabel: canFix ? (i.fix ?? "Open health") : "Ask an admin to fix this",
      href: canFix ? healthHref(i.id) : null,
    }));
}

/** Critical first, then by a stable order of cause (publishing, ads, accounts, the rest), then by title: the same data always reads the same. */
export function rankAttention(items: AttentionItem[]): AttentionItem[] {
  const cause = (i: AttentionItem) => (i.id.startsWith("posts.") ? 0 : i.id.startsWith("ads.") ? 1 : i.id.startsWith("account.") || i.id.startsWith("conn.") ? 2 : 3);
  return [...items].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1) || cause(a) - cause(b) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

// ── Launch buckets ─────────────────────────────────────────────────────────────────────────────────────

export type LaunchBucket = "issue" | "failed" | "review" | "running" | "paused" | "archived";
const IN_REVIEW = new Set(["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"]);
const ISSUE = new Set(["DISAPPROVED", "WITH_ISSUES"]);

interface LaunchLike {
  state: string;
  delivery: string;
  review: Record<string, { effectiveStatus: string | null }>;
}

/** One bucket per launch, worst first: a launch with a rejected ad is "issue" even if the rest of it is running. */
export function launchBucket(l: LaunchLike): LaunchBucket {
  if (l.delivery === "archived") return "archived";
  if (l.state === "failed" || l.state === "partial") return "failed";
  const eff = Object.values(l.review).map((r) => r.effectiveStatus ?? "");
  if (eff.some((e) => ISSUE.has(e))) return "issue";
  if (eff.some((e) => IN_REVIEW.has(e))) return "review";
  return l.delivery === "active" ? "running" : "paused";
}

// ── Scheduled posts ─────────────────────────────────────────────────────────────────────────────────────

export type ScheduleState = "overdue" | "queued" | "approved" | "awaiting_approval";
export const SCHEDULE_STATE_LABEL: Record<ScheduleState, string> = { overdue: "Overdue", queued: "Publishing now", approved: "Approved", awaiting_approval: "Awaiting approval" };

/** A scheduled post is overdue when its time passed more than `graceMs` ago and it still has not published (the job runs every 5 minutes). */
export function scheduleState(p: { scheduledAt: Date; approvedBy: string | null; publishQueuedAt?: Date | null }, now: Date, graceMs = 15 * 60_000): ScheduleState {
  if (!p.approvedBy) return "awaiting_approval";
  if (p.publishQueuedAt) return "queued";
  return p.scheduledAt.getTime() < now.getTime() - graceMs ? "overdue" : "approved";
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────────────────────

/** "3 Nov, 4:30 pm" on the wall clock of `tz`. */
export function whenIn(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "am" : "pm"}`;
