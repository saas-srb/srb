import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, FileText, Clock, CheckCircle2, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import RequisitionsDataTable from "@/components/products/spendiq/RequisitionsDataTable";
import RequisitionForm from "@/components/products/spendiq/RequisitionForm";
import {
  searchRequisitions,
  countRequisitions,
  serializeRequisition,
  pendingRequisitionValue,
} from "@/lib/products/spendiq/requisitions";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import {
  isValidRequisitionStatus,
  isValidPriority,
  isValidExpenseCategory,
  formatMoney,
  type RequisitionStatus,
  type Priority,
} from "@/lib/products/spendiq/constants";

export default async function RequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidRequisitionStatus(sp.status) ? (sp.status as RequisitionStatus) : undefined;
  const priority = sp.priority && isValidPriority(sp.priority) ? (sp.priority as Priority) : undefined;
  const category = sp.category && isValidExpenseCategory(sp.category) ? sp.category : undefined;
  const departmentId = sp.departmentId || undefined;
  const sortBy = (sp.sortBy as "createdAt" | "prCode" | "estimatedCost" | "requiredDate" | "priority" | "status") || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, departments, projects, vendors, settings, total, pendingCount, approved, pendingValue] =
    await Promise.all([
      searchRequisitions({ search: sp.search, status, priority, category, departmentId, page, pageSize: 20, sortBy, sortDir }),
      listDepartments(),
      listProjectOptions(),
      listVendorOptions({ activeOnly: true }),
      getPrmsSettings(),
      countRequisitions(),
      countRequisitions({ pendingOnly: true }),
      countRequisitions({ status: "approved" }),
      pendingRequisitionValue(),
    ]);

  const deptOptions = departments.map((d) => ({ _id: d._id, name: d.name }));
  const projOptions = projects.map((p) => ({ _id: p._id, name: p.name }));
  const vendorOptions = vendors.map((v) => ({ _id: v._id, companyName: v.companyName }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Purchase Requisition" }]}
        title={<>Purchase Requisition</>}
        description={<>{total} requisition{total === 1 ? "" : "s"} raised.</>}
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

      <KpiGrid>
        <KpiCard label="Total Requisitions" value={total} accent icon={<FileText className="size-4" />} />
        <KpiCard label="Pending Approval" value={pendingCount} tone={pendingCount > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
        <KpiCard label="Approved" value={approved} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Pending Value" value={<span>{formatMoney(pendingValue)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <RequisitionsDataTable
        items={result.items.map(serializeRequisition)}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        basePath="/spendiq/requisitions"
        showExport
        showRequester
        departments={deptOptions}
        initial={{
          search: sp.search ?? "",
          status: sp.status ?? "",
          priority: sp.priority ?? "",
          category: sp.category ?? "",
          departmentId: sp.departmentId ?? "",
          sortBy,
          sortDir,
        }}
      />
    </div>
  );
}
