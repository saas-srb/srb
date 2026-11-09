import { notFound, redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { playbookCan } from "@/lib/playbook-roles";
import { getTemplate, listTemplateVersions } from "@/lib/products/playbook-ai/tpl/store";
import { requireActor } from "@/lib/products/playbook-ai/tpl/actor";
import { variableCatalogue } from "@/lib/products/playbook-ai/variables-registry";
import { listCustomVariables } from "@/lib/products/playbook-ai/variables-custom";
import TemplateEditor, { type TemplateView } from "@/components/products/playbook-ai/templates/TemplateEditor";
import type { VariableDef } from "@/components/doc-editor/core/variables";

export const dynamic = "force-dynamic";

const NS_LABEL: Record<string, string> = {
  company: "Company", employee: "Employee", candidate: "Candidate", client: "Client", vendor: "Vendor", party: "Other party", doc: "Document",
  input: "Fill-in fields", custom: "Company variables", date: "Date", author: "Author", project: "Project",
};

export default async function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const actor = await requireActor();
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) redirect("/playbook-ai/catalogue");
  const r = await getTemplate(actor, id);
  if (!r.ok) notFound();
  const { template: t, starterUpdate } = r;
  const [versions, custom] = await Promise.all([listTemplateVersions(actor, id), listCustomVariables()]);
  const variables: VariableDef[] = variableCatalogue(custom).filter((v) => v.namespace !== "input").map((v) => ({ key: v.key, label: v.label, group: NS_LABEL[v.namespace] ?? v.namespace, description: v.description, formats: [v.format] }));

  const view: TemplateView = {
    id: t._id, typeId: t.typeId, name: t.name, status: t.status, rev: t.rev, def: t.def, publishedVersion: t.publishedVersion,
    originKind: t.origin.kind, starterVersion: t.origin.kind === "starter" ? t.origin.baseVersion : null,
    numberingPrefix: t.numberingPrefix, approval: t.approval,
    review: t.review ? { by: t.review.by.name ?? t.review.by.id, on: t.review.on.toISOString() } : null,
    draftReviewed: r.draftReviewed, publishedReviewed: r.publishedReviewed,
    canReview: playbookCan(actor, "REVIEW_TEMPLATES"),
    versions: versions.ok ? versions.versions.map((v) => ({ number: v.number, publishedAt: v.publishedAt.toISOString(), note: v.note, reviewed: !!v.review && v.review.contentSha256 === v.contentSha256 })) : [],
    starterUpdate: starterUpdate ? { fromVersion: starterUpdate.fromVersion, toVersion: starterUpdate.toVersion, stillShipped: starterUpdate.stillShipped, starter: starterUpdate.diff.starterChanges, yours: starterUpdate.diff.yourChanges, conflicts: starterUpdate.diff.conflicts } : null,
  };

  return (
    <div className="space-y-3">
      <PanelPageHeader
        breadcrumbs={[{ label: "Playbook", href: "/playbook-ai" }, { label: "My templates", href: "/playbook-ai/my-templates" }, { label: t.name }]}
        title={<>{t.name}</>}
      />
      <TemplateEditor key={`${t._id}:${t.rev}`} initial={view} variables={variables} />
    </div>
  );
}
