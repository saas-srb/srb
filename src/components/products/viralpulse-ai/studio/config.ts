import type { BrandKit, Brief } from "@/lib/products/viralpulse-ai/images/types";
import type { ImageSettings } from "@/lib/products/viralpulse-ai/images/limits";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";

/** What the studio screens need from the server, computed once per page load (no secrets). */
export interface StudioConfig {
  kit: BrandKit;
  logo: MediaCard | null;
  settings: Pick<ImageSettings, "maxVariants" | "badgeForPeopleDefault" | "dailySpendCapUsd" | "approvalThresholdUsd" | "perUserPerMinute">;
  providers: { openai: boolean; gemini: boolean };
  /** The model each provider will use, as resolved against the account's available models. */
  models: { openai: string; gemini: string };
  defaultProvider: Brief["provider"];
  defaultQuality: Brief["quality"];
  spentTodayUsd: number;
  canApprove: boolean;
  canPost: boolean;
  canAds: boolean;
  canUpload: boolean;
}
