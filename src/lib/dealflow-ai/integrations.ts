import "server-only";
import { getDb } from "@/lib/mongodb";
import { LEAD_RECORDS_COLLECTION } from "@/lib/lead-management/records";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { LEAD_SOURCE_META, type LeadManagementSource } from "@/lib/lead-management/types";
import type { IntegrationConnectionStatus, IntegrationStatus } from "./types";

async function connection(key: string, name: string, providers: string[]): Promise<IntegrationConnectionStatus> {
  for (const p of providers) {
    const c = await resolveConnection(p);
    if (c) return { key: p, name, connected: true, source: c.source };
  }
  return { key: providers[0], name, connected: false, source: null };
}

async function leadSources(): Promise<IntegrationStatus["leadSources"]> {
  const rows = await (await getDb())
    .collection(LEAD_RECORDS_COLLECTION)
    .aggregate<{ _id: string; count: number }>([{ $match: { deletedAt: null } }, { $group: { _id: "$source", count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .toArray();
  return rows.map((r) => ({ source: r._id, label: LEAD_SOURCE_META[r._id as LeadManagementSource]?.label ?? String(r._id), count: r.count }));
}

/** The company's real integration state: connection status from the platform connections system and counts from its own records. Nothing is simulated. */
export async function getIntegrationsStatus(): Promise<IntegrationStatus> {
  const db = await getDb();
  const apps = db.collection("career_applications");
  const [meta, whatsapp, sources, openJobPositions, totalApplications, lastApp, siteUrl] = await Promise.all([
    connection("meta", "Facebook & Instagram (Meta app)", ["meta"]),
    connection("whatsapp-cloud", "WhatsApp Business", ["whatsapp-cloud", "twilio"]),
    leadSources(),
    db.collection("job_positions").countDocuments({ isOpen: true }),
    apps.countDocuments({}),
    apps.find({}).sort({ createdAt: -1 }).limit(1).project({ createdAt: 1 }).toArray(),
    companySiteUrl(),
  ]);
  const at = lastApp[0]?.createdAt;
  return {
    connections: { meta, whatsapp },
    leadSources: sources,
    website: {
      portalUrl: `${siteUrl.replace(/\/$/, "")}/careers`,
      openJobPositions,
      totalApplications,
      lastApplicationReceivedAt: at ? new Date(at as string | Date).toISOString() : null,
    },
  };
}
