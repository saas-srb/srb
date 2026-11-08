import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProjectTabs from "@/components/products/sprintos/ProjectTabs";
import DocumentsManager from "@/components/products/sprintos/DocumentsManager";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects } from "@/lib/pms-roles";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { getProject } from "@/lib/products/sprintos/projects";
import { listCurrentDocuments, documentVersions, serializeDocument } from "@/lib/products/sprintos/documents";

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, project] = await Promise.all([getCurrentPmsUser(), getProject(id)]);
  if (!project) notFound();
  if (user && !(await checkProjectAccess(user, id)).allowed) notFound();
  const canManage = user ? canManageProjects(user) : false;

  const current = await listCurrentDocuments(id);
  const groups = await Promise.all(
    current.map(async (doc) => ({
      current: serializeDocument(doc),
      versions: (await documentVersions(doc.rootId)).map((v) => serializeDocument(v)),
    }))
  );

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SprintOS", href: "/sprintos" },
          { label: "Projects", href: "/sprintos/projects" },
          { label: project.name, href: `/sprintos/projects/${id}` },
          { label: "Files" },
        ]}
        title={<>{project.name} · Files</>}
      />
      <ProjectTabs projectId={id} />
      <DocumentsManager projectId={id} groups={groups} canManage={canManage} />
    </div>
  );
}
