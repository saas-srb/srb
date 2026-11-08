import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Plus, Building2, CheckCircle2, Ban, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import VendorsDataTable from "@/components/products/spendiq/VendorsDataTable";
import VendorForm from "@/components/products/spendiq/VendorForm";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { searchVendors, countVendors, serializeVendor } from "@/lib/products/spendiq/vendors";
import {
  isValidVendorCategory,
  isValidVendorStatus,
  type VendorCategory,
  type VendorStatus,
} from "@/lib/products/spendiq/constants";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const category = sp.category && isValidVendorCategory(sp.category) ? (sp.category as VendorCategory) : undefined;
  const status = sp.status && isValidVendorStatus(sp.status) ? (sp.status as VendorStatus) : undefined;
  const sortBy = (sp.sortBy as "createdAt" | "companyName" | "vendorCode" | "rating" | "status") || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, totalVendors, activeVendors, blacklisted, rated] = await Promise.all([
    searchVendors({ search: sp.search, category, status, page, pageSize: 20, sortBy, sortDir }),
    countVendors(),
    countVendors({ status: "active" }),
    countVendors({ status: "blacklisted" }),
    countVendors({ minRating: 4 }),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Vendors" }]}
        title={<>Vendors</>}
        description={<>{totalVendors} supplier{totalVendors === 1 ? "" : "s"} in the CRM.</>}
        actions={<>{canManage && (
          <VendorForm
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Vendor
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Vendors" value={totalVendors} accent icon={<Building2 className="size-4" />} />
        <KpiCard label="Active" value={activeVendors} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Blacklisted" value={blacklisted} tone={blacklisted > 0 ? "down" : undefined} icon={<Ban className="size-4" />} />
        <KpiCard label="Rated 4★ and above" value={rated} icon={<Star className="size-4" />} />
      </KpiGrid>

      <VendorsDataTable
        items={result.items.map(serializeVendor)}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        canManage={canManage}
        initial={{
          search: sp.search ?? "",
          category: sp.category ?? "",
          status: sp.status ?? "",
          sortBy,
          sortDir,
        }}
      />

      {result.total === 0 && !sp.search && !sp.category && !sp.status && (
        <p className="text-center text-sm text-muted-foreground">
          No vendors yet.{" "}
          {canManage ? "Use “New Vendor” to add the first one." : "Ask a procurement manager to add one."}
        </p>
      )}

      {!canManage && (
        <p className="text-xs text-muted-foreground">
          You have read-only access.{" "}
          <Link href="/spendiq" className="text-primary hover:underline">Back to dashboard</Link>
        </p>
      )}
    </div>
  );
}
