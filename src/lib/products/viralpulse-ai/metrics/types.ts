import type { AccountProvider } from "@/lib/products/viralpulse-ai/accounts/types";

/**
 * Vocabulary of the organic-metrics layer (WP7). Pure: no server-only imports, so the UI and the tests can use it.
 * Endpoint and metric sources: SPEC.md in this folder.
 */

export const METRIC_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "x"] as const;
export type MetricPlatform = (typeof METRIC_PLATFORMS)[number];
export const isMetricPlatform = (v: unknown): v is MetricPlatform => (METRIC_PLATFORMS as readonly unknown[]).includes(v);

export const PROVIDER_PLATFORM: Partial<Record<AccountProvider, MetricPlatform>> = {
  instagram_business: "instagram",
  facebook_page: "facebook",
  youtube_channel: "youtube",
  linkedin_organization: "linkedin",
  x_account: "x",
};

export const PLATFORM_LABEL: Record<MetricPlatform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", linkedin: "LinkedIn", x: "X" };

/** `source` stored on every organic snapshot. Paid insights keep WP6a's `meta_ads_insights`. */
export const metricSource = (p: MetricPlatform): string => `${p}_insights`;
export const ORGANIC_SOURCES: string[] = METRIC_PLATFORMS.map(metricSource);

/**
 * Platform-neutral metric names. Post-level rows are LIFETIME totals as of `date` (the day they were read); account-level rows are the
 * value for that day (reach, views ...) or the level on that day (followers).
 */
export const M = {
  reach: "reach",
  views: "views", // plays / media views / video views: whatever the platform now calls a view
  impressions: "impressions", // LinkedIn, X, and Instagram media created before 2024-07-02
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
  reposts: "reposts",
  quotes: "quotes",
  bookmarks: "bookmarks",
  clicks: "clicks",
  interactions: "interactions", // platform's own total (Instagram total_interactions, Facebook post engagements)
  profileVisits: "profile_visits",
  follows: "follows",
  unfollows: "unfollows",
  followerGain: "follower_gain",
  followers: "followers",
  watchTimeSec: "watch_time_sec",
  avgWatchTimeSec: "avg_watch_time_sec",
  engagementRatePlatform: "engagement_rate_platform", // LinkedIn reports it itself
  subscribersGained: "subscribers_gained",
  subscribersLost: "subscribers_lost",
  videos: "videos",
} as const;

export type Level = "account" | "post";

/** A row to store. `accountId` and `postId` are additive fields on the shared `smms_metric_snapshots` collection. */
export interface MetricRow {
  platform: MetricPlatform;
  externalId: string;
  level: Level;
  metric: string;
  value: number;
  /** YYYY-MM-DD. */
  date: string;
  accountId: string;
  postId?: string;
}

/** A published post (platform version) that we can look up on the platform by its own id. */
export interface Target {
  platform: MetricPlatform;
  externalId: string;
  postId: string;
  accountId: string;
  publishedAt: Date;
  /** What the publisher created: decides which metrics exist (Reels have watch time, feed posts have profile visits ...). */
  format: "feed" | "reel" | "story" | "video" | "short" | "text";
}

export interface MetricsSettings {
  /** Snapshots older than this are deleted by the daily housekeeping. */
  retentionDays: number;
  /** Posts published within this many days are re-read on every run. */
  recentPostDays: number;
  /** Older posts (up to `olderPostDays`) are re-read once a day. */
  olderPostDays: number;
  /** YouTube Data API units we allow ourselves per day (the project default is 10,000 shared by everything). */
  youtubeDailyUnitCap: number;
  /** X charges per post read: off until the company switches it on. */
  x: { enabled: boolean; maxPostsPerRun: number; minHoursBetween: number };
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_SETTINGS: MetricsSettings = {
  retentionDays: 730,
  recentPostDays: 14,
  olderPostDays: 180,
  youtubeDailyUnitCap: 3000,
  x: { enabled: false, maxPostsPerRun: 25, minHoursBetween: 24 },
  updatedAt: null,
  updatedBy: null,
};

export type ErrorKind = "auth" | "scope" | "rate_limit" | "quota" | "not_found" | "bad_request" | "transient" | "platform_limit";

/** Sync cadence per platform (minutes between runs of one account). Chosen from the quotas in SPEC.md. */
export const SYNC_INTERVAL_MIN: Record<MetricPlatform, number> = { instagram: 180, facebook: 180, youtube: 180, linkedin: 360, x: 1440 };
export const MANUAL_COOLDOWN_MIN = 10;
/** Failures in a row before the admins are told. */
export const NOTIFY_AFTER_FAILURES = 3;

export interface AccountSyncState {
  _id: string; // account id
  accountId: string;
  platform: MetricPlatform;
  accountName: string;
  status: "never" | "ok" | "error" | "deferred" | "skipped";
  lastAttemptAt: Date | null;
  lastOkAt: Date | null;
  nextSyncAt: Date | null;
  /** Plain-language reason for the last failure or skip. */
  error: string | null;
  errorKind: ErrorKind | null;
  consecutiveFailures: number;
  lastNotifiedAt: Date | null;
  /** Things that were not available but did not stop the sync ("Instagram insights need instagram_manage_insights"). */
  warnings: string[];
  rowsWritten: number;
  cursor: { accountThrough?: string; accountReadOn?: string; backfilledAt?: string; olderAt?: string; followerStatsThrough?: string };
  quota: { day: string; youtubeUnits: number; youtubeAnalyticsCalls: number };
  manualAt: Date | null;
  updatedAt: Date;
}
