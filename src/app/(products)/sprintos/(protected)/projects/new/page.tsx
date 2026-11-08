import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProjectForm from "@/components/products/sprintos/ProjectForm";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects } from "@/lib/pms-roles";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { getPmsSettings } from "@/lib/products/sprintos/settings";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const user = await getCurrentPmsUser();
  if (!user || !canManageProjects(user)) redirect("/sprintos/projects");

  const sp = await searchParams;
  const [clients, employees, settings] = await Promise.all([
    listClientOptions(),
    listEmployeeOptions({ activeOnly: true }),
    getPmsSettings(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos" }, { label: "Projects", href: "/sprintos/projects" }, { label: "New" }]}
        title={<>New Project</>}
        description={<>The project ID is generated automatically on save.</>}
      />

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You need at least one client before creating a project. Add one from the Clients page.
        </p>
      ) : (
        <ProjectForm
          clients={clients.map((c) => ({ _id: c._id, label: c.companyName, sub: c.clientCode }))}
          employees={employees.map((e) => ({ _id: e._id, label: e.name, sub: e.employeeCode }))}
          categories={settings.categories}
          technologySuggestions={settings.technologySuggestions}
          defaultCurrency={settings.defaultCurrency}
          defaultClientId={sp.clientId}
        />
      )}
    </div>
  );
}
