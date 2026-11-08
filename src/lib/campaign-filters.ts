import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import { isValidCampaignStatus, isValidPlatform, type CampaignDeliveryStatus, type CampaignPlatform } from "@/lib/campaign-platforms";
import { campaignKeyFor } from "@/lib/utm";
import type { DashboardGranularity } from "@/lib/granularity";

const GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

export interface CampaignSearchParams {
  platform?: string;
  source?: string;
  campaign?: string;
  status?: string;
  range?: string;
  dateFrom?: string;
  dateTo?: string;
  granularity?: string;
}

export interface ResolvedCampaignFilters {
  platform?: CampaignPlatform;
  source?: string;
  campaignKey?: string;
  status?: CampaignDeliveryStatus;
  dateFrom: Date;
  dateTo: Date;
  range: DateRangePreset;
  granularity: DashboardGranularity;
}

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Shared by the Campaign Analytics page and its CSV export route. */
export function resolveCampaignFilters(sp: CampaignSearchParams): ResolvedCampaignFilters {
  const platform = sp.platform && isValidPlatform(sp.platform) ? sp.platform : undefined;
  const source = sp.source && isValidPlatform(sp.source) ? sp.source : undefined;
  const campaignKey = sp.campaign ? campaignKeyFor(sp.campaign) : undefined;
  const status = sp.status && isValidCampaignStatus(sp.status) ? sp.status : undefined;
  const granularity = GRANULARITIES.includes(sp.granularity as DashboardGranularity)
    ? (sp.granularity as DashboardGranularity)
    : "day";

  const range: DateRangePreset =
    sp.range && isValidDateRangePreset(sp.range)
      ? sp.range
      : sp.dateFrom || sp.dateTo
        ? "custom"
        : "last30";

  let dateFrom: Date;
  let dateTo: Date;
  if (range === "custom") {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    dateFrom = parseDateParam(sp.dateFrom) ?? from;
    dateTo = parseDateParam(sp.dateTo, true) ?? to;
  } else {
    const resolved = resolveDateRangePreset(range)!;
    dateFrom = resolved.from;
    dateTo = resolved.to;
  }

  return { platform, source, campaignKey, status, dateFrom, dateTo, range, granularity };
}
