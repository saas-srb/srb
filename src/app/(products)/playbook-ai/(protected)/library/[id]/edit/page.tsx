import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import SopEditor from "@/components/products/playbook-ai/SopEditor";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { getReadableSop, relatedSopOptions } from "@/lib/products/playbook-ai/sops";
import { canEditSop, canGrantAccess, canPublishSop, creatableDepartmentIds, toAccessDoc } from "@/lib/products/playbook-ai/access";
import { todayIso } from "@/lib/products/playbook-ai/db";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { getSettings } from "@/lib/products/playbook-ai/settings";
import { listSopFiles } from "@/lib/products/playbook-ai/files";
import { listHrmsDepartments, listHrmsDesignations, listUserOptions } from "@/lib/products/playbook-ai/people";
import { countAssignments } from "@/lib/products/playbook-ai/assignments";

export default async function EditSopPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const { id } = await params;
  const found = await getReadableSop(viewer, id);
  if (!found) notFound();
  const { doc } = found;
  const acc = toAccessDoc(doc, todayIso());
  if (!canEditSop(viewer, acc)) redirect(`/playbook-ai/library/${id}`);

  const [tax, files, users, designations, hrmsDepts, related, settings, assignedCount] = await Promise.all([
    getTaxonomy(),
    listSopFiles(id),
    listUserOptions(),
    listHrmsDesignations(),
    listHrmsDepartments(),
    relatedSopOptions(viewer, id),
    getSettings(),
    countAssignments(id),
  ]);
  const hrmsName = new Map(hrmsDepts.map((d) => [d._id, d.name]));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "SOP Library", href: "/playbook-ai/library" }, { label: doc.code, href: `/playbook-ai/library/${id}` }, { label: "Edit" }]}
        title={<>Edit {doc.code}</>}
        description={<>Update the document, then save it as a draft or submit it for review.</>}
      />
      <SopEditor
        sopId={id}
        code={doc.code}
        version={doc.version}
        updatedAt={doc.updatedAt.toISOString()}
        initialMeta={{
          departmentId: doc.departmentId,
          functionId: doc.functionId,
          processId: doc.processId,
          subProcessId: doc.subProcessId,
          categoryId: doc.categoryId,
          ownerId: doc.ownerId,
          applicableRoleIds: doc.applicableRoleIds,
          effectiveDate: doc.effectiveDate,
          reviewDate: doc.reviewDate,
          expiryDate: doc.expiryDate,
          priority: doc.priority,
          confidentiality: doc.confidentiality,
          mandatory: doc.mandatory,
          allowDownload: doc.allowDownload,
          tags: doc.tags,
          accessUserIds: doc.accessUserIds,
        }}
        initialContent={doc.draft}
        initialFiles={files.map((f) => ({ id: f._id, filename: f.filename, size: f.size, kind: f.kind }))}
        taxonomy={{
          departments: tax.departments.map((d) => ({ id: d._id, name: d.name, active: d.active })),
          functions: tax.functions.map((f) => ({ id: f._id, departmentId: f.departmentId, name: f.name })),
          processes: tax.processes.map((p) => ({ id: p._id, functionId: p.functionId, parentId: p.parentId, name: p.name })),
          categories: tax.categories.filter((c) => c.active || c._id === doc.categoryId).map((c) => ({ id: c._id, name: c.name })),
        }}
        creatableDepartmentIds={creatableDepartmentIds(viewer)}
        users={users}
        designations={designations.map((d) => ({ id: d._id, title: d.title, department: hrmsName.get(d.departmentId) ?? "" }))}
        relatedOptions={related}
        canPublish={canPublishSop(viewer, acc)}
        canGrantAccess={canGrantAccess(viewer, acc)}
        reackDefault={settings.reackOnNewVersion}
        assignedCount={assignedCount}
      />
    </div>
  );
}
