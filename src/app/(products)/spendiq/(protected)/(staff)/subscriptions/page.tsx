import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Pencil, Cloud, Coins, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import SubscriptionForm from "@/components/products/spendiq/SubscriptionForm";
import DeleteRowButton from "@/components/products/spendiq/DeleteRowButton";
import { ResourceStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { RenewalHint } from "@/components/products/spendiq/RenewalHint";
import { deleteSubscriptionAction } from "./actions";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { searchSubscriptions, countSubscriptions, subscriptionMetrics } from "@/lib/products/spendiq/software-subscriptions";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listEmployeeOptions } from "@/lib/products/spendiq/pickers";
import { getDb } from "@/lib/mongodb";
import { RESOURCE_STATUSES, isValidResourceStatus, formatMoney, type ResourceStatus } from "@/lib/products/spendiq/constants";

import ItemPdfDownloadButtons from "@/components/products/spendiq/ItemPdfDownloadButtons";

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidResourceStatus(sp.status) ? (sp.status as ResourceStatus) : undefined;
  const sortBy = sp.sortBy || "renewalDate";
  const sortDir = sp.sortDir === "desc" ? "desc" : "asc";

  const db = await getDb();
  const headcount = await db.collection("hrms_employees").countDocuments({ deletedAt: null }).catch(() => 0);

  const [result, vendors, employees, total, metrics] = await Promise.all([
    searchSubscriptions({ search: sp.search, filters: status ? { status } : {}, page, pageSize: 20, sortBy, sortDir }),
    listVendorOptions(),
    listEmployeeOptions(),
    countSubscriptions(),
    subscriptionMetrics(headcount || 1),
  ]);

  const vOpts = vendors.map((v) => ({ _id: v._id, companyName: v.companyName }));
  const eOpts = employees.map((e) => ({ _id: e._id, name: e.name }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Software & SaaS Services" }]}
        title={<>Software &amp; SaaS Services</>}
        description={<>{total} subscription{total === 1 ? "" : "s"}.</>}
        actions={<>{canManage && (
          <SubscriptionForm
            vendors={vOpts}
            employees={eOpts}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Subscription
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Subscriptions" value={total} accent icon={<Cloud className="size-4" />} />
        <KpiCard label="Monthly Cost" value={<span>{formatMoney(metrics.monthly)}</span>} icon={<Coins className="size-4" />} />
        <KpiCard label="Annual Commitment" value={<span>{formatMoney(metrics.annual)}</span>} icon={<Coins className="size-4" />} />
        <KpiCard label="Cost / Employee" value={<span>{formatMoney(metrics.perEmployee)}</span>} icon={<Users className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "name", header: "Service", sortable: true },
          { key: "licenses", header: "Licenses", align: "right" },
          { key: "monthly", header: "Monthly", align: "right" },
          { key: "owner", header: "Owner" },
          { key: "renewal", header: "Renewal" },
          { key: "status", header: "Status" },
          { key: "pdfDownloads", header: "PDF Downloads", align: "right" },
          ...(canManage ? [{ key: "_actions", header: "", align: "right" as const }] : []),
        ]}
        rows={result.items.map((r) => ({
          id: r._id,
          cells: {
            name: r.serviceName,
            licenses: `${r.licenseCount}`,
            monthly: formatMoney(r.monthlyCost, r.currency),
            owner: r.ownerName ?? "—",
            renewal: <RenewalHint date={r.renewalDate} autoRenew={r.autoRenew} />,
            status: <ResourceStatusBadge status={r.status} />,
            pdfDownloads: <ItemPdfDownloadButtons itemId={r._id} code={r.serviceName} variant="compact" />,
            _actions: canManage ? (
              <span className="flex justify-end gap-1">
                <SubscriptionForm
                  row={r}
                  vendors={vOpts}
                  employees={eOpts}
                  trigger={
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Edit">
                      <Pencil className="size-3.5" />
                    </Button>
                  }
                />
                <DeleteRowButton id={r._id} label={r.serviceName} action={deleteSubscriptionAction} />
              </span>
            ) : null,
          },
        }))}
        filters={[{ key: "status", label: "Status", value: sp.status ?? "", options: RESOURCE_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="Service, provider, owner"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No subscriptions match these filters."
      />
    </div>
  );
}
