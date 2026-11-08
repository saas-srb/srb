import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Server, Coins, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { Pencil } from "lucide-react";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import InfrastructureForm from "@/components/products/spendiq/InfrastructureForm";
import DeleteRowButton from "@/components/products/spendiq/DeleteRowButton";
import { ResourceStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { RenewalHint } from "@/components/products/spendiq/RenewalHint";
import { deleteInfrastructureAction } from "./actions";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { searchInfrastructure, countInfrastructure, infrastructureMonthlyTotal } from "@/lib/products/spendiq/infrastructure";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { RESOURCE_STATUSES, isValidResourceStatus, formatMoney, type ResourceStatus } from "@/lib/products/spendiq/constants";

export default async function InfrastructurePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidResourceStatus(sp.status) ? (sp.status as ResourceStatus) : undefined;
  const sortBy = sp.sortBy || "renewalDate";
  const sortDir = sp.sortDir === "desc" ? "desc" : "asc";

  const [result, vendors, total, monthly] = await Promise.all([
    searchInfrastructure({ search: sp.search, filters: status ? { status } : {}, page, pageSize: 20, sortBy, sortDir }),
    listVendorOptions(),
    countInfrastructure(),
    infrastructureMonthlyTotal(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Infrastructure & Servers" }]}
        title={<>Infrastructure &amp; Servers</>}
        description={<>{total} resource{total === 1 ? "" : "s"} tracked.</>}
        actions={<>{canManage && (
          <InfrastructureForm
            vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Resource
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Resources" value={total} accent icon={<Server className="size-4" />} />
        <KpiCard label="Monthly Cost" value={<span>{formatMoney(monthly)}</span>} icon={<Coins className="size-4" />} />
        <KpiCard label="Annual Run-rate" value={<span>{formatMoney(monthly * 12)}</span>} icon={<CalendarClock className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "name", header: "Resource", sortable: true },
          { key: "type", header: "Type" },
          { key: "provider", header: "Provider" },
          { key: "monthly", header: "Monthly", align: "right" },
          { key: "renewal", header: "Renewal" },
          { key: "status", header: "Status" },
          ...(canManage ? [{ key: "_actions", header: "", align: "right" as const }] : []),
        ]}
        rows={result.items.map((r) => ({
          id: r._id,
          cells: {
            name: r.name,
            type: r.resourceType,
            provider: r.provider,
            monthly: formatMoney(r.monthlyCost, r.currency),
            renewal: <RenewalHint date={r.renewalDate} autoRenew={r.autoRenew} />,
            status: <ResourceStatusBadge status={r.status} />,
            _actions: canManage ? (
              <span className="flex justify-end gap-1">
                <InfrastructureForm
                  row={r}
                  vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
                  trigger={
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Edit">
                      <Pencil className="size-3.5" />
                    </Button>
                  }
                />
                <DeleteRowButton id={r._id} label={r.name} action={deleteInfrastructureAction} />
              </span>
            ) : null,
          },
        }))}
        filters={[{ key: "status", label: "Status", value: sp.status ?? "", options: RESOURCE_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="Name, provider, type"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No resources match these filters."
      />
    </div>
  );
}
