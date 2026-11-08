import "server-only";
import { connectionValues } from "@/lib/platform/connections/resolve";
import type { ProviderId } from "../types";
import { GeminiOmniProvider, OMNI_CAPABILITIES } from "./gemini-omni";
import { VeoProvider, VEO_CAPABILITIES } from "./veo";
import { fetchGeminiModelIds, videoModelStatus, VIDEO_MODEL_REPLACEMENT } from "./gemini-models";
import { ProviderError, type ProviderCapabilities, type VideoProvider } from "./types";

export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = { omni: OMNI_CAPABILITIES, veo: VEO_CAPABILITIES };

export function isProviderId(v: unknown): v is ProviderId {
  return v === "omni" || v === "veo";
}

/**
 * The provider for the CURRENT company, from its own Gemini key (Settings -> Integrations). There is deliberately no SelfRun fallback key:
 * video is billed per second, so it is always the company's own account (see `PLATFORM_FALLBACK`).
 */
export async function getVideoProvider(id: ProviderId): Promise<VideoProvider> {
  const creds = await connectionValues("gemini");
  if (!creds?.apiKey) throw new ProviderError({ code: "auth", retryable: false, message: "Connect your Google Gemini API key in Settings -> Integrations to create AI videos." });
  if (id === "veo") {
    // Google retired every Veo model id (see veo.ts). Only continue when this account's live list still shows one; if the list cannot
    // be read, let the real call report the true error.
    const list = await fetchGeminiModelIds(creds.apiKey);
    if (list.ok && videoModelStatus(list.ids).veo.length === 0) throw new ProviderError({ code: "invalid_request", retryable: false, message: `Google has retired Veo for this Gemini account. Switch this video to Gemini Omni (${VIDEO_MODEL_REPLACEMENT}).` });
    return new VeoProvider(creds.apiKey);
  }
  return new GeminiOmniProvider(creds.apiKey);
}

export async function isVideoConfigured(): Promise<boolean> {
  return !!(await connectionValues("gemini"))?.apiKey;
}
