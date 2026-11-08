import "server-only";
import { can, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { getMedia, toMediaCard } from "@/lib/products/viralpulse-ai/media";
import { getBrandKit, getImageSettings, spentToday } from "@/lib/products/viralpulse-ai/images/store";
import { isGeminiImageConfigured } from "@/lib/products/viralpulse-ai/images/deps-default";
import { isOpenAIConfigured } from "@/lib/openai";
import { getSettings } from "@/lib/products/viralpulse-ai/settings";
import { DEFAULT_IMAGE_MODEL } from "@/lib/products/viralpulse-ai/models";
import type { StudioConfig } from "@/components/products/viralpulse-ai/studio/config";

/** Image generation needs both permissions (the same rule the server actions use). */
export const canGenerateImages = (v: SmmsViewer) => can(v, "MANAGE_MEDIA") && can(v, "GENERATE_AI_CONTENT");

/** What the wizard, the quick generator and the project page all need from the server. */
export async function loadStudioConfig(viewer: SmmsViewer): Promise<StudioConfig> {
  const [openai, gemini, settings, kit, ai] = await Promise.all([isOpenAIConfigured(), isGeminiImageConfigured(), getImageSettings(), getBrandKit(), getSettings()]);
  const logo = kit.logoMediaId ? await getMedia(kit.logoMediaId) : null;
  return {
    kit,
    logo: logo ? toMediaCard(logo) : null,
    settings: { maxVariants: settings.maxVariants, badgeForPeopleDefault: settings.badgeForPeopleDefault, dailySpendCapUsd: settings.dailySpendCapUsd, approvalThresholdUsd: settings.approvalThresholdUsd, perUserPerMinute: settings.perUserPerMinute },
    providers: { openai, gemini },
    models: { openai: ai.ai.imageModel || DEFAULT_IMAGE_MODEL, gemini: settings.geminiModel },
    defaultProvider: settings.defaultProvider === "gemini" && gemini ? "gemini" : openai ? "openai" : gemini ? "gemini" : "openai",
    defaultQuality: settings.defaultQuality,
    spentTodayUsd: await spentToday(new Date()),
    canApprove: can(viewer, "PUBLISH_CONTENT"),
    canPost: can(viewer, "MANAGE_POSTS"),
    canAds: can(viewer, "CREATE_ADS"),
    canUpload: can(viewer, "MANAGE_MEDIA") || can(viewer, "MANAGE_POSTS"),
  };
}
