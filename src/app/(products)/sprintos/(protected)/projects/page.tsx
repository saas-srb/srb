import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Plus, Download, FolderKanban, Rocket, AlarmClock, Gauge } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import ProjectsDataTable from "@/components/products/sprintos/ProjectsDataTable";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects, canViewAllProjects } from "@/lib/pms-roles";
import { searchProjects, serializeProject, listCategories, countProjects } from "@/lib/products/sprintos/projects";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { isValidProjectStatus, isValidPriority, ACTIVE_PROJECT_STATUSES, type ProjectStatus, type Priority } from "@/lib/products/sprintos/constants";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentPmsUser();
  const canManage = user ? canManageProjects(user) : false;
  const restrictToEmployeeId =
    user && !canViewAllProjects(user) ? user.employeeId ?? "__none__" : undefined;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidProjectStatus(sp.status) ? (sp.status as ProjectStatus) : undefined;
  const priority = sp.priority && isValidPriority(sp.priority) ? (sp.priority as Priority) : undefined;
  const sortBy = (sp.sortBy as "createdAt" | "name" | "projectCode" | "endDate" | "priority" | "progressPercent") || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, clients, employees, categories, totalProjects, portfolio] = await Promise.all([
    searchProjects({
      search: sp.search,
      status,
      priority,
      clientId: sp.clientId,
      projectManagerId: sp.manager,
      category: sp.category,
      page,
      pageSize: 20,
      sortBy,
      sortDir,
      restrictToEmployeeId,
    }),
    listClientOptions(),
    listEmployeeOptions(),
    listCategories(),
    countProjects({ restrictToEmployeeId }),
    searchProjects({ pageSize: 1000, restrictToEmployeeId }),
  ]);

  const portfolioItems = portfolio.items.map((p) => serializeProject(p));
  const activeProjects = portfolioItems.filter((p) => (ACTIVE_PROJECT_STATUSES as string[]).includes(p.status)).length;
  const overdueCount = portfolioItems.filter((p) => p.health === "overdue").length;
  const avgCompletion =
    portfolioItems.length > 0
      ? Math.round(
          portfolioItems.reduce((s, p) => s + (p.status === "completed" ? 100 : p.progressPercent), 0) /
            portfolioItems.length
        )
      : 0;

  const exportParams = new URLSearchParams();
  for (const k of ["search", "status", "priority", "clientId", "manager", "category"]) if (sp[k]) exportParams.set(k, sp[k]!);
  const exportHref = `/api/sprintos/projects/export${exportParams.toString() ? `?${exportParams}` : ""}`;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos" }, { label: "Projects" }]}
        title={<>Projects</>}
        description={<>{restrictToEmployeeId ? "Projects you manage or contribute to." : `${totalProjects} project${totalProjects === 1 ? "" : "s"} across the portfolio.`}</>}
        actions={<><div className="flex items-center gap-2">
          <a href={exportHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" />
            Export CSV
          </a>
          {canManage && (
            <Link href="/sprintos/projects/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-3.5" data-icon="inline-start" />
              New Project
            </Link>
          )}
        </div></>}
      />

      <KpiGrid>
        <KpiCard label="Total Projects" value={totalProjects} accent icon={<FolderKanban className="size-4" />} />
        <KpiCard label="Active" value={activeProjects} icon={<Rocket className="size-4" />} />
        <KpiCard label="Overdue" value={overdueCount} tone={overdueCount > 0 ? "down" : undefined} icon={<AlarmClock className="size-4" />} />
        <KpiCard label="Avg Completion" value={avgCompletion} suffix="%" icon={<Gauge className="size-4" />} />
      </KpiGrid>

      <ProjectsDataTable
        items={result.items.map((p) => serializeProject(p))}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        clients={clients.map((c) => ({ _id: c._id, companyName: c.companyName }))}
        managers={employees.map((e) => ({ _id: e._id, name: e.name }))}
        categories={categories}
        initial={{
          search: sp.search ?? "",
          status: sp.status ?? "",
          priority: sp.priority ?? "",
          clientId: sp.clientId ?? "",
          manager: sp.manager ?? "",
          category: sp.category ?? "",
          sortBy,
          sortDir,
        }}
      />

      {result.total === 0 && clients.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Add a client first, then create your first project.{" "}
          <Link href="/sprintos/clients" className="text-primary hover:underline">Go to Clients</Link>
        </p>
      )}
    </div>
  );
}
