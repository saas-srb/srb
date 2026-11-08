import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { FileText, Clock, CheckCircle2, FilePen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import RequisitionForm from "@/components/products/spendiq/RequisitionForm";
import { RequisitionStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { searchRequisitions, countRequisitions, serializeRequisition } from "@/lib/products/spendiq/requisitions";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

export default async function EmployeePortalHome() {
  const user = await getCurrentPrmsUser();
  if (!user) return null;

  const [recent, departments, projects, vendors, settings, total, drafts, pending, approved] = await Promise.all([
    searchRequisitions({ requesterUserId: user.id, page: 1, pageSize: 8, sortBy: "createdAt", sortDir: "desc" }),
    listDepartments(),
    listProjectOptions(),
    listVendorOptions({ activeOnly: true }),
    getPrmsSettings(),
    countRequisitions({ requesterUserId: user.id }),
    countRequisitions({ requesterUserId: user.id, status: "draft" }),
    countRequisitions({ requesterUserId: user.id, pendingOnly: true }),
    countRequisitions({ requesterUserId: user.id, status: "approved" }),
  ]);

  const deptOptions = departments.map((d) => ({ _id: d._id, name: d.name }));
  const projOptions = projects.map((p) => ({ _id: p._id, name: p.name }));
  const vendorOptions = vendors.map((v) => ({ _id: v._id, companyName: v.companyName }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "My Dashboard" }]}
        title={<>Welcome, {user.email.split("@")[0]}</>}
        description={<>Raise purchase requisitions and track your approvals.</>}
        actions={<><RequisitionForm
          departments={deptOptions}
          projects={projOptions}
          vendors={vendorOptions}
          itemSuggestions={settings.itemSuggestions}
          trigger={
            <Button type="button" size="sm">
              <Plus className="size-3.5" data-icon="inline-start" />
              New Requisition
            </Button>
          }
        /></>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="My Requisitions" value={total} accent icon={<FileText className="size-4" />} />
        <KpiCard label="Drafts" value={drafts} icon={<FilePen className="size-4" />} />
        <KpiCard label="Pending Approval" value={pending} icon={<Clock className="size-4" />} />
        <KpiCard label="Approved" value={approved} icon={<CheckCircle2 className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Recent requisitions</p>
            <Link href="/spendiq/me/requisitions" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-border/60">
            {recent.items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                You haven&apos;t raised any requisitions yet.
              </p>
            )}
            {recent.items.map(serializeRequisition).map((r) => (
              <Link
                key={r._id}
                href={`/spendiq/me/requisitions/${r._id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
              >
                <span className="font-mono text-xs text-muted-foreground">{r.prCode}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{r.itemName}</span>
                <span className="tabular-nums text-muted-foreground">{formatMoney(r.estimatedCost, r.currency)}</span>
                <RequisitionStatusBadge status={r.status} />
                <span className="hidden text-xs text-muted-foreground sm:inline">{formatDate(r.createdAt)}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
