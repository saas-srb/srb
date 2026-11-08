import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchVendors } from "@/lib/products/spendiq/vendors";
import { isValidVendorStatus, isValidVendorCategory } from "@/lib/products/spendiq/constants";
import VendorsFilterBar from "./VendorsFilterBar";
import VendorsGrid, { type AdminVendorRow } from "./VendorsGrid";

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    category?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireWorkspaceAccess("manage.prms.vendors");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidVendorStatus(sp.status) ? sp.status : undefined;
  const category = sp.category && isValidVendorCategory(sp.category) ? sp.category : undefined;
  const sortBy = sp.sortBy === "companyName" || sp.sortBy === "rating" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchVendors({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    category,
    sortBy,
    sortDir,
  });

  const rows: AdminVendorRow[] = items.map((v) => ({
    _id: v._id,
    vendorCode: v.vendorCode,
    companyName: v.companyName,
    category: v.category,
    status: v.status,
    contactPerson: v.contactPerson,
    email: v.email,
    rating: v.rating,
    createdAt: new Date(v.createdAt).toISOString(),
  }));

  const hasActiveFilters = Boolean(sp.search || sp.status || sp.category);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Procurement", panel: "prms" }, { label: "Vendors" }]}
        title={<>Vendors</>}
        description={<>{total} vendor{total === 1 ? "" : "s"}.</>}
      />

      <VendorsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={
          <VendorsFilterBar
            initialSearch={sp.search ?? ""}
            initialStatus={status ?? ""}
            initialCategory={category ?? ""}
          />
        }
      />
    </div>
  );
}
