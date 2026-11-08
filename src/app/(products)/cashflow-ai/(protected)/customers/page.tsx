import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Users, Receipt, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { listCustomers, totalReceivables } from "@/lib/products/cashflow-ai/customers";
import { getClientStatusMeta, isValidClientStatus, CLIENT_STATUSES } from "@/lib/products/sprintos/constants";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidClientStatus(sp.status) ? sp.status : undefined;
  const sortBy = (sp.sortBy as "createdAt" | "companyName" | "clientCode" | "status") || "companyName";
  const sortDir = sp.sortDir === "desc" ? "desc" : "asc";

  const [result, receivables] = await Promise.all([
    listCustomers({ search: sp.search, status, page, pageSize: 20, sortBy, sortDir }),
    totalReceivables(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Customers" }]}
        title={<>Customers</>}
        description={<>Financial view over SprintOS&apos;s client records — {result.total} customer{result.total === 1 ? "" : "s"}.</>}
      />

      <KpiGrid>
        <KpiCard label="Total Customers" value={result.total} accent icon={<Users className="size-4" />} />
        <KpiCard label="Total Receivables (Outstanding)" value={<span>{formatMoney(receivables)}</span>} tone={receivables > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "company", header: "Company", sortable: true },
          { key: "code", header: "Code" },
          { key: "projects", header: "Projects", align: "right" },
          { key: "received", header: "Received", align: "right" },
          { key: "outstanding", header: "Outstanding", align: "right" },
          { key: "status", header: "Status" },
        ]}
        rows={result.items.map((c) => ({
          id: c._id,
          href: `/cashflow-ai/customers/${c._id}`,
          cells: {
            company: c.companyName,
            code: c.clientCode,
            projects: c.projectCount,
            received: formatMoney(c.financials.totalReceived, c.billing.currency),
            outstanding: formatMoney(c.financials.totalOutstanding, c.billing.currency),
            status: (
              <Badge className={getClientStatusMeta(c.status).badgeClass}>{getClientStatusMeta(c.status).label}</Badge>
            ),
          },
        }))}
        filters={[
          { key: "status", label: "Status", value: sp.status ?? "", options: CLIENT_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Company, code, contact"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No customers found — client records are created in SprintOS."
      />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Receipt className="size-3.5" />
        Customer records are owned by SprintOS. Create or edit a client at{" "}
        <Link href="/sprintos/clients" className="text-primary hover:underline">/sprintos/clients</Link>.
      </p>
    </div>
  );
}
