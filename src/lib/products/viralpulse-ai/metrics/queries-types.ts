import type { Rate, MetricMap } from "./compute";
import type { MetricPlatform, Target } from "./types";

/** Pure types shared by the server queries, the CSV export and the client components. */
export const CONTENT_TYPES = ["post", "reel", "video", "ad"] as const;
export const CREATIVE_SOURCES = ["image_studio", "ugc", "ai_other", "uploaded", "none"] as const;
export type ContentFilter = (typeof CONTENT_TYPES)[number];
export type CreativeSource = (typeof CREATIVE_SOURCES)[number];
export const CREATIVE_SOURCE_LABEL: Record<CreativeSource, string> = { image_studio: "Image Studio", ugc: "UGC video", ai_other: "Other AI media", uploaded: "Uploaded", none: "No media" };

export interface PostRow {
  postId: string;
  title: string;
  platform: MetricPlatform;
  externalId: string;
  accountId: string;
  accountName: string;
  publishedAt: string;
  format: Target["format"];
  contentType: ContentFilter;
  url: string | null;
  campaignId: string | null;
  mediaId: string | null;
  creativeSource: CreativeSource;
  metrics: MetricMap;
  engagements: number | null;
  rate: Rate | null;
  /** Latest time any of this post's numbers was read from the platform. */
  syncedAt: string | null;
  manual: { by: string; at: string; values: Record<string, number> } | null;
}

