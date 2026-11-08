import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Plus, Download, Building2, CheckCircle2, Sparkles, FolderKanban } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import ClientsDataTable from "@/components/products/sprintos/ClientsDataTable";
import ClientForm from "@/components/products/sprintos/ClientForm";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageClients } from "@/lib/pms-roles";
import { searchClients, listIndustries, countClients } from "@/lib/products/sprintos/clients";
import { countProjects } from "@/lib/products/sprintos/projects";
import { serializeClient } from "@/lib/products/sprintos/clients";
import { isValidClientStatus, type ClientStatus } from "@/lib/products/sprintos/constants";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentPmsUser();
  const canManage = user ? canManageClients(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidClientStatus(sp.status) ? (sp.status as ClientStatus) : undefined;
  const sortBy = (sp.sortBy as "createdAt" | "companyName" | "clientCode" | "status") || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, industries, totalClients, activeClients, prospects, totalProjects] = await Promise.all([
    searchClients({ search: sp.search, status, industry: sp.industry, page, pageSize: 20, sortBy, sortDir }),
    listIndustries(),
    countClients(),
    countClients({ status: "active" }),
    countClients({ status: "prospect" }),
    countProjects(),
  ]);

  const exportParams = new URLSearchParams();
  for (const k of ["search", "status", "industry"]) if (sp[k]) exportParams.set(k, sp[k]!);
  const exportHref = `/api/sprintos/clients/export${exportParams.toString() ? `?${exportParams}` : ""}`;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos" }, { label: "Clients" }]}
        title={<>Clients</>}
        description={<>{totalClients} client{totalClients === 1 ? "" : "s"} in the directory.</>}
        actions={<><div className="flex items-center gap-2">
          <a href={exportHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" />
            Export CSV
          </a>
          {canManage && (
            <ClientForm
              trigger={
                <Button type="button" size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  New Client
                </Button>
              }
            />
          )}
        </div></>}
      />

      <KpiGrid>
        <KpiCard label="Total Clients" value={totalClients} accent icon={<Building2 className="size-4" />} />
        <KpiCard label="Active" value={activeClients} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Prospects" value={prospects} icon={<Sparkles className="size-4" />} />
        <KpiCard label="Total Projects" value={totalProjects} icon={<FolderKanban className="size-4" />} />
      </KpiGrid>

      <ClientsDataTable
        items={result.items.map((c) => ({ ...serializeClient(c), projectCount: c.projectCount }))}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        industries={industries}
        initial={{
          search: sp.search ?? "",
          status: sp.status ?? "",
          industry: sp.industry ?? "",
          sortBy,
          sortDir,
        }}
      />

      {result.total === 0 && !sp.search && !sp.status && !sp.industry && (
        <p className="text-center text-sm text-muted-foreground">
          No clients yet.{" "}
          {canManage ? "Use “New Client” to add the first one." : "Ask a SprintOS admin to add one."}
        </p>
      )}

      {!canManage && (
        <p className="text-xs text-muted-foreground">
          You have read-only access.{" "}
          <Link href="/sprintos" className="text-primary hover:underline">Back to dashboard</Link>
        </p>
      )}
    </div>
  );
}
