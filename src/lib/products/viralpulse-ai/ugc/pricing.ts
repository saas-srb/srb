import { OMNI_CAPABILITIES, OMNI_PRICE_PER_SEC_USD } from "./providers/gemini-omni";
import { VEO_CAPABILITIES, VEO_PRICE_PER_SEC_USD } from "./providers/veo";
import type { ProviderCapabilities, Resolution } from "./providers/types";
import type { ProviderId, ScenePlan } from "./types";
import type { Estimate } from "./store";

/** Cost estimate before any spend (pure). The figure is per second of requested video; the booked cost uses the clip's real length. */

export function capabilitiesFor(id: ProviderId): ProviderCapabilities {
  return id === "veo" ? VEO_CAPABILITIES : OMNI_CAPABILITIES;
}

export const DEFAULT_RESOLUTION: Resolution = "720p";

export function pricePerSec(id: ProviderId, model: string, resolution: Resolution, override: number | null): number {
  if (override !== null && override > 0) return override;
  if (id === "veo") return VEO_PRICE_PER_SEC_USD[model] ?? 0.4;
  return OMNI_PRICE_PER_SEC_USD[resolution] ?? 0.1;
}

export const costUsd = (id: ProviderId, model: string, secs: number, override: number | null, resolution: Resolution = DEFAULT_RESOLUTION) =>
  Math.round(pricePerSec(id, model, resolution, override) * Math.max(0, secs) * 10000) / 10000;

export function estimatePlan(plan: ScenePlan, provider: ProviderId, model: string, override: number | null, planVersion: number, only?: number[]): Estimate {
  const perScene = plan.scenes
    .filter((s) => !only || only.includes(s.index))
    .map((s) => ({ index: s.index, secs: s.durationSecs, usd: costUsd(provider, model, s.durationSecs, override) }));
  return {
    usd: Math.round(perScene.reduce((a, b) => a + b.usd, 0) * 10000) / 10000,
    totalSecs: perScene.reduce((a, b) => a + b.secs, 0),
    perScene,
    provider,
    model,
    planVersion,
    at: new Date(),
  };
}
