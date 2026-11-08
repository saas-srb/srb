import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import RequisitionsDataTable from "@/components/products/spendiq/RequisitionsDataTable";
import RequisitionForm from "@/components/products/spendiq/RequisitionForm";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { searchRequisitions, serializeRequisition } from "@/lib/products/spendiq/requisitions";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import {
  isValidRequisitionStatus,
  isValidPriority,
  isValidExpenseCategory,
  type RequisitionStatus,
  type Priority,
} from "@/lib/products/spendiq/constants";

export default async function MyRequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  if (!user) return null;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidRequisitionStatus(sp.status) ? (sp.status as RequisitionStatus) : undefined;
  const priority = sp.priority && isValidPriority(sp.priority) ? (sp.priority as Priority) : undefined;
  const category = sp.category && isValidExpenseCategory(sp.category) ? sp.category : undefined;
  const sortBy = (sp.sortBy as "createdAt" | "prCode" | "estimatedCost" | "requiredDate" | "priority" | "status") || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, departments, projects, vendors, settings] = await Promise.all([
    searchRequisitions({
      requesterUserId: user.id,
      search: sp.search,
      status,
      priority,
      category,
      page,
      pageSize: 20,
      sortBy,
      sortDir,
    }),
    listDepartments(),
    listProjectOptions(),
    listVendorOptions({ activeOnly: true }),
    getPrmsSettings(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq/me" }, { label: "My Requisitions" }]}
        title={<>My Requisitions</>}
        description={<>{result.total} raised by you.</>}
        actions={<><RequisitionForm
          departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
          projects={projects.map((p) => ({ _id: p._id, name: p.name }))}
          vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
          itemSuggestions={settings.itemSuggestions}
          trigger={
            <Button type="button" size="sm">
              <Plus className="size-3.5" data-icon="inline-start" />
              New Requisition
            </Button>
          }
        /></>}
      />

      <RequisitionsDataTable
        items={result.items.map(serializeRequisition)}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        basePath="/spendiq/me/requisitions"
        initial={{
          search: sp.search ?? "",
          status: sp.status ?? "",
          priority: sp.priority ?? "",
          category: sp.category ?? "",
          departmentId: "",
          sortBy,
          sortDir,
        }}
      />
    </div>
  );
}
