import "server-only";
import { getServiceAccountToken } from "@/lib/google-service-account";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import { getSettings, integrationEnv, markIntegrationSync } from "@/lib/products/rankmax-ai/settings";

/**
 * Google Analytics 4 adapter (Data API, service account). Reads ONLY organic
 * search sessions/users per day — the SEO product does not duplicate general
 * analytics (the site's gtag setup stays the source of truth for that). The
 * service account needs Viewer access on the GA4 property.
 */

export interface TrafficDaily {
  _id: string;
  date: string;
  sessions: number;
  users: number;
  engagedSessions: number;
  fetchedAt: Date;
}

async function runReport(propertyId: string, body: Record<string, unknown>) {
  const env = await integrationEnv();
  if (!env.google) throw new Error("Google service-account credentials are not configured.");
  if (!/^\d+$/.test(propertyId)) throw new Error("Set the numeric GA4 property id in Settings → Integrations.");
  const token = await getServiceAccountToken(env.google, ["https://www.googleapis.com/auth/analytics.readonly"]);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json()) as { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`Analytics ${res.status}: ${data.error?.message ?? "request failed"}${res.status === 403 ? " — give the service account Viewer access on the property." : ""}`);
  return data.rows ?? [];
}

const ORGANIC = { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } } };

export async function testAnalytics(): Promise<{ ok: boolean; message: string }> {
  try {
    const s = await getSettings();
    await runReport(s.integrations.ga4.propertyId, { dateRanges: [{ startDate: "7daysAgo", endDate: "today" }], metrics: [{ name: "sessions" }], limit: 1 });
    return { ok: true, message: `Connected to GA4 property ${s.integrations.ga4.propertyId}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function syncAnalytics(): Promise<{ days: number }> {
  const s = await getSettings();
  try {
    const rows = await runReport(s.integrations.ga4.propertyId, {
      dateRanges: [{ startDate: "180daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "engagedSessions" }],
      dimensionFilter: ORGANIC,
      limit: 500,
    });
    const col = await seoCollection<TrafficDaily>(COLLECTIONS.trafficDaily);
    for (const r of rows) {
      const raw = r.dimensionValues[0].value; // YYYYMMDD
      const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      await col.replaceOne(
        { _id: date },
        { date, sessions: Number(r.metricValues[0].value), users: Number(r.metricValues[1].value), engagedSessions: Number(r.metricValues[2].value), fetchedAt: new Date() },
        { upsert: true }
      );
    }
    await markIntegrationSync("ga4", null);
    return { days: rows.length };
  } catch (err) {
    await markIntegrationSync("ga4", err instanceof Error ? err.message : "Sync failed");
    throw err;
  }
}

export async function trafficDaily(sinceIso: string): Promise<TrafficDaily[]> {
  const col = await seoCollection<TrafficDaily>(COLLECTIONS.trafficDaily);
  return col.find({ date: { $gte: sinceIso } }).sort({ date: 1 }).toArray();
}
