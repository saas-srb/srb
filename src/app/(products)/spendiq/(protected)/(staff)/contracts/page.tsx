import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Pencil, ScrollText, Coins, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import ContractForm from "@/components/products/spendiq/ContractForm";
import DeleteRowButton from "@/components/products/spendiq/DeleteRowButton";
import { ResourceStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { RenewalHint } from "@/components/products/spendiq/RenewalHint";
import { deleteContractAction } from "./actions";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { searchContracts, countContracts } from "@/lib/products/spendiq/contracts";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { RESOURCE_STATUSES, CONTRACT_TYPES, isValidResourceStatus, formatMoney, daysUntil, type ResourceStatus } from "@/lib/products/spendiq/constants";

export default async function ContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidResourceStatus(sp.status) ? (sp.status as ResourceStatus) : undefined;
  const sortBy = sp.sortBy || "endDate";
  const sortDir = sp.sortDir === "desc" ? "desc" : "asc";

  const [result, vendors, total, active] = await Promise.all([
    searchContracts({
      search: sp.search,
      filters: { ...(status ? { status } : {}), ...(sp.contractType ? { contractType: sp.contractType } : {}) },
      page,
      pageSize: 20,
      sortBy,
      sortDir,
    }),
    listVendorOptions(),
    countContracts(),
    countContracts({ status: "active" }),
  ]);

  const expiringSoon = result.items.filter((c) => {
    const d = daysUntil(c.endDate);
    return d !== null && d >= 0 && d <= 60;
  }).length;
  const totalValue = result.items.reduce((s, c) => s + c.value, 0);
  const vOpts = vendors.map((v) => ({ _id: v._id, companyName: v.companyName }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Contracts & AMC" }]}
        title={<>Contracts &amp; AMC</>}
        description={<>{total} contract{total === 1 ? "" : "s"}, {active} active.</>}
        actions={<>{canManage && (
          <ContractForm
            vendors={vOpts}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Contract
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Contracts" value={total} accent icon={<ScrollText className="size-4" />} />
        <KpiCard label="Active" value={active} icon={<ScrollText className="size-4" />} />
        <KpiCard label="Expiring ≤60d (page)" value={expiringSoon} tone={expiringSoon > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Value (page)" value={<span>{formatMoney(totalValue)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "code", header: "Contract", sortable: true },
          { key: "type", header: "Type" },
          { key: "vendor", header: "Vendor" },
          { key: "value", header: "Value", align: "right" },
          { key: "end", header: "Ends" },
          { key: "status", header: "Status" },
          ...(canManage ? [{ key: "_actions", header: "", align: "right" as const }] : []),
        ]}
        rows={result.items.map((c) => ({
          id: c._id,
          cells: {
            code: `${c.contractCode} · ${c.title}`,
            type: c.contractType,
            vendor: c.vendorName ?? "—",
            value: formatMoney(c.value, c.currency),
            end: <RenewalHint date={c.endDate} autoRenew={c.autoRenew} />,
            status: <ResourceStatusBadge status={c.status} />,
            _actions: canManage ? (
              <span className="flex justify-end gap-1">
                <ContractForm row={c} vendors={vOpts} trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label="Edit"><Pencil className="size-3.5" /></Button>} />
                <DeleteRowButton id={c._id} label={c.contractCode} action={deleteContractAction} />
              </span>
            ) : null,
          },
        }))}
        filters={[
          { key: "status", label: "Status", value: sp.status ?? "", options: RESOURCE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
          { key: "contractType", label: "Type", value: sp.contractType ?? "", options: CONTRACT_TYPES.map((t) => ({ value: t, label: t })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Code, title, vendor"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No contracts match these filters."
      />
    </div>
  );
}
