import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { countSeatsUsed, storageUsedBytes } from "@/lib/platform/billing/enforce";
import { getUsage } from "@/lib/platform/billing/usage";
import { USAGE_SERVICES } from "@/lib/platform/billing/types";

export interface UsageRow {
  limitKey: string;
  label: string;
  provider: string | null;
  note: string;
  unit: string;
  used: number;
  /** null = unlimited. */
  limit: number | null;
  /** 0–100 (0 when unlimited). */
  percent: number;
  comingSoon: boolean;
}

/** This month's use of every paid service against the company's limits (plan + add-ons + top-ups). Runs inside the company's context. */
export async function getUsageSummary(): Promise<UsageRow[]> {
  const companyId = await currentCompanyId();
  const [e, seats, storageBytes, tokens, emails, voiceSeconds, domains] = await Promise.all([
    getEntitlements(),
    countSeatsUsed().catch(() => 0),
    storageUsedBytes().catch(() => 0),
    getUsage("ai_tokens").catch(() => 0),
    getUsage("emails").catch(() => 0),
    getUsage("voice_seconds").catch(() => 0),
    (await getPlatformDb()).collection("company_domains").countDocuments({ companyId, kind: "custom" }).catch(() => 0),
  ]);
  const used: Record<string, number> = {
    seats,
    storageMb: Math.round(storageBytes / 1_048_576),
    aiTokensPerMonth: tokens,
    emailsPerMonth: emails,
    voiceMinutesPerMonth: Math.round(voiceSeconds / 60),
    customDomains: domains,
  };
  return USAGE_SERVICES.map((u) => {
    const limit = e.limits[u.limitKey] ?? null;
    const value = used[u.limitKey] ?? 0;
    return {
      limitKey: u.limitKey,
      label: u.label,
      provider: u.provider,
      note: u.note,
      unit: u.unit,
      used: value,
      limit,
      percent: limit === null || limit === 0 ? (limit === 0 && value > 0 ? 100 : 0) : Math.min(100, Math.round((value / limit) * 100)),
      comingSoon: u.comingSoon === true,
    };
  });
}
