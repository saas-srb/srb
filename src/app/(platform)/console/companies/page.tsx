import type { Metadata } from "next";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { listCompanies } from "@/lib/platform/console/companies";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import CompaniesFilterBar from "./CompaniesFilterBar";
import Link from "next/link";
import { BellRing } from "lucide-react";
import CompaniesGrid from "./CompaniesGrid";

export const metadata: Metadata = { title: "Companies" };

export default async function PlatformCompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const user = await requirePlatformPermission("companies.read");
  const sp = await searchParams;
  const status = sp.status === "active" || sp.status === "suspended" || sp.status === "reactivation" ? sp.status : "all";
  const list = await listCompanies({ q: sp.q, status, page: Number(sp.page) || 1 });

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Companies" description="Every company on the platform — search, open, suspend or reactivate." />
      {list.waiting > 0 && status !== "reactivation" && (
        <Link href="/console/companies?status=reactivation" className="flex items-center gap-2.5 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium transition-colors hover:bg-primary/15">
          <BellRing className="size-4 text-primary" />
          {list.waiting} reactivation {list.waiting === 1 ? "request is" : "requests are"} waiting for a decision
          <span className="ml-auto text-primary">Review →</span>
        </Link>
      )}
      <CompaniesGrid
          canImpersonate={can(user, "companies.impersonate")}
          rows={list.rows}
          total={list.total}
          page={list.page}
          totalPages={list.totalPages}
          hasActiveFilters={Boolean(sp.q || status !== "all")}
          filters={<CompaniesFilterBar initialSearch={sp.q ?? ""} initialStatus={status} />}
      />
    </div>
  );
}
