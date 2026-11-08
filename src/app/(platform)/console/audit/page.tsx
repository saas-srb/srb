import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listActionPrefixes, listAuditActors, queryAuditLog, type AuditFilters } from "@/lib/platform/console/audit-log";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import AuditFilterBar from "./AuditFilterBar";
import AuditLogGrid from "./AuditLogGrid";

export const metadata: Metadata = { title: "Audit log" };

type SP = { actor?: string; action?: string; company?: string; from?: string; to?: string; q?: string; page?: string };

async function companyOptions(): Promise<{ id: string; name: string }[]> {
  const docs = await (await getPlatformDb()).collection<{ _id: string; name: string }>("companies").find({}, { projection: { name: 1 } }).sort({ name: 1 }).limit(500).toArray();
  return docs.map((d) => ({ id: String(d._id), name: d.name }));
}

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePlatformPermission("audit.read");
  const sp = await searchParams;
  const filters: AuditFilters = { actorId: sp.actor || undefined, actionPrefix: sp.action || undefined, companyId: sp.company || undefined, from: sp.from || undefined, to: sp.to || undefined, q: sp.q || undefined };
  const [list, actions, actors, companies] = await Promise.all([queryAuditLog({ ...filters, page: Number(sp.page) || 1 }), listActionPrefixes(), listAuditActors(), companyOptions()]);

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Audit log" description="Every change made in the Platform Console and every billing event that changed a company's access." crumbs={[{ label: "Administration" }]} />
      <AuditLogGrid
        rows={list.rows.map((r) => ({ ...r, at: r.at.toISOString() }))}
        total={list.total}
        page={list.page}
        totalPages={list.totalPages}
        filtersValue={filters}
        hasActiveFilters={Object.values(filters).some(Boolean)}
        filters={<AuditFilterBar initial={{ actor: sp.actor ?? "", action: sp.action ?? "", company: sp.company ?? "", from: sp.from ?? "", to: sp.to ?? "", q: sp.q ?? "" }} actors={actors} actions={actions} companies={companies} />}
      />
    </div>
  );
}
