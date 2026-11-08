import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProjectForm from "@/components/products/sprintos/ProjectForm";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects } from "@/lib/pms-roles";
import { getProject, serializeProject } from "@/lib/products/sprintos/projects";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { getPmsSettings } from "@/lib/products/sprintos/settings";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPmsUser();
  if (!user || !canManageProjects(user)) redirect(`/sprintos/projects/${id}`);

  const [project, clients, employees, settings] = await Promise.all([
    getProject(id),
    listClientOptions(),
    listEmployeeOptions(),
    getPmsSettings(),
  ]);
  if (!project) notFound();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SprintOS", href: "/sprintos" },
          { label: "Projects", href: "/sprintos/projects" },
          { label: project.name, href: `/sprintos/projects/${id}` },
          { label: "Edit" },
        ]}
        title={<>Edit Project</>}
        description={<>{project.projectCode}</>}
      />

      <ProjectForm
        project={serializeProject(project)}
        clients={clients.map((c) => ({ _id: c._id, label: c.companyName, sub: c.clientCode }))}
        employees={employees.map((e) => ({ _id: e._id, label: e.name, sub: e.employeeCode }))}
        categories={settings.categories}
        technologySuggestions={settings.technologySuggestions}
        defaultCurrency={settings.defaultCurrency}
      />
    </div>
  );
}
