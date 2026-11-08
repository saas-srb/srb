import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchSubscriptions } from "@/lib/products/spendiq/software-subscriptions";
import { isValidResourceStatus } from "@/lib/products/spendiq/constants";
import SubscriptionsFilterBar from "./SubscriptionsFilterBar";
import SubscriptionsGrid, { type AdminSubscriptionRow } from "./SubscriptionsGrid";

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.prms.subscriptions");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidResourceStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "serviceName" || sp.sortBy === "monthlyCost" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchSubscriptions({
    page,
    pageSize: 20,
    search: sp.search,
    filters: { status },
    sortBy,
    sortDir,
  });

  const rows: AdminSubscriptionRow[] = items.map((r) => ({
    _id: r._id,
    serviceName: r.serviceName,
    provider: r.provider,
    licenseCount: r.licenseCount,
    monthlyCost: r.monthlyCost,
    annualCost: r.annualCost,
    currency: r.currency,
    ownerName: r.ownerName,
    renewalDate: r.renewalDate,
    autoRenew: r.autoRenew,
    status: r.status,
  }));

  const hasActiveFilters = Boolean(sp.search || status);

  const exportParams = new URLSearchParams();
  if (sp.search) exportParams.set("search", sp.search);
  if (status) exportParams.set("status", status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Procurement", panel: "prms" }, { label: "SaaS Subscriptions" }]}
        title={<>SaaS Subscriptions</>}
        description={<>{total} subscription{total === 1 ? "" : "s"}.</>}
      />

      <SubscriptionsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        exportHref={`/api/commandos/prms/subscriptions/export?${exportParams.toString()}`}
        filters={<SubscriptionsFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
