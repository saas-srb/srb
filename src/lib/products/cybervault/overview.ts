import "server-only";
import { RECORD_TYPES, type RecordType } from "@/lib/products/cybervault/constants";
import { countRecords, feedItems, type FeedItem, type RecordQuery } from "@/lib/products/cybervault/records";
import { recentActivity, type AuditLog } from "@/lib/products/cybervault/audit";
import { can, type DlmsViewer } from "@/lib/products/cybervault/viewer";

/** Dashboard + Expiry board aggregations. Every number goes through the same scope filter as the lists. */

export interface OverviewFilters {
  scope?: string;
  clientId?: string;
  type?: string;
  category?: string;
  expiry?: string;
  status?: string;
}

function typesFor(f: OverviewFilters): RecordType[] {
  return (RECORD_TYPES as readonly string[]).includes(f.type ?? "") ? [f.type as RecordType] : [...RECORD_TYPES];
}

function queryOf(f: OverviewFilters): RecordQuery {
  return { scope: f.scope, clientId: f.clientId, category: f.category, expiry: f.expiry, status: f.status };
}

export interface DashboardData {
  totals: { company: number; client: number; credentials: number; documents: number; links: number; notes: number };
  recentAdded: FeedItem[];
  recentUpdated: FeedItem[];
  expiring: FeedItem[];
  expiredCount: number;
  expiringCount: number;
  activity: AuditLog[];
  activityIsOwn: boolean;
}

export async function getDashboard(viewer: DlmsViewer, f: OverviewFilters): Promise<DashboardData> {
  const types = typesFor(f);
  const q = queryOf(f);
  // Totals respect every filter; the two ownership tiles are simply the company / client halves.
  const wantCompany = f.scope !== "client" && !f.clientId;
  const wantClient = f.scope !== "company";
  const perType = await Promise.all(
    types.map((t) =>
      Promise.all([
        wantCompany ? countRecords(viewer, t, { ...q, scope: "company" }) : 0,
        wantClient ? countRecords(viewer, t, { ...q, scope: "client" }) : 0,
      ])
    )
  );
  const byType = (t: RecordType) => {
    const i = types.indexOf(t);
    return i < 0 ? 0 : perType[i][0] + perType[i][1];
  };
  const company = perType.reduce((s, x) => s + x[0], 0);
  const client = perType.reduce((s, x) => s + x[1], 0);

  const added = (await Promise.all(types.map((t) => feedItems(viewer, t, { ...q, limit: 8, sort: "created" })))).flat();
  const updated = (await Promise.all(types.map((t) => feedItems(viewer, t, { ...q, limit: 8, sort: "updated" })))).flat();
  const withExpiry = types.filter((t) => t !== "note");
  const expQ = { ...q, expiry: f.expiry && f.expiry !== "none" && f.expiry !== "valid" ? f.expiry : "set", limit: 200, sort: "expiry" as const };
  const exp = (await Promise.all(withExpiry.map((t) => feedItems(viewer, t, expQ)))).flat().filter((i) => i.expiry === "expired" || i.expiry === "expiring");
  exp.sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));

  const auditor = can(viewer, "VIEW_AUDIT");
  const activity = await recentActivity({ limit: 8, ...(auditor ? {} : { actorId: viewer.userId }), ...(f.scope ? { scope: f.scope } : {}), ...(f.clientId ? { clientId: f.clientId } : {}) });

  return {
    totals: { company, client, credentials: byType("credential"), documents: byType("document"), links: byType("link"), notes: byType("note") },
    recentAdded: added.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    recentUpdated: updated.filter((i) => i.updatedAt !== i.createdAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
    expiring: exp.slice(0, 8),
    expiredCount: exp.filter((i) => i.expiry === "expired").length,
    expiringCount: exp.filter((i) => i.expiry === "expiring").length,
    activity,
    activityIsOwn: !auditor,
  };
}

export interface ExpiryBoard {
  expired: FeedItem[];
  expiring: FeedItem[];
  later: FeedItem[];
}

/** Everything with an expiry date (credentials, documents, URLs/accounts), grouped by urgency. */
export async function getExpiryBoard(viewer: DlmsViewer, f: OverviewFilters): Promise<ExpiryBoard> {
  const types = typesFor(f).filter((t) => t !== "note");
  const items = (await Promise.all(types.map((t) => feedItems(viewer, t, { ...queryOf(f), expiry: f.expiry || "set", limit: 200, sort: "expiry" })))).flat();
  items.sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));
  return {
    expired: items.filter((i) => i.expiry === "expired"),
    expiring: items.filter((i) => i.expiry === "expiring"),
    later: items.filter((i) => i.expiry === "valid"),
  };
}
