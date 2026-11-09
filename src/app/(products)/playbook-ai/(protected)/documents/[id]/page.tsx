import { layoutInputFor } from "@/lib/products/playbook-ai/items-layout";
import { notFound, redirect } from "next/navigation";
import PlaybookDocEditor from "@/components/products/playbook-ai/editor/PlaybookDocEditor";
import { sendInfoFor } from "@/lib/products/playbook-ai/items";
import { type ItemKind } from "@/lib/products/playbook-ai/items-types";
import { playbookCan } from "@/lib/playbook-roles";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { acquireLock, getDocument } from "@/lib/products/playbook-ai/documents";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import { variableCatalogue } from "@/lib/products/playbook-ai/variables-registry";
import { listCustomVariables } from "@/lib/products/playbook-ai/variables-custom";
import { loadVariableValues } from "@/lib/products/playbook-ai/variables-adapters";
import { loadBrand, applyBrandToDoc, identityFor } from "@/lib/products/playbook-ai/brand/apply";
import type { VariableDef } from "@/components/doc-editor/core/variables";

export const dynamic = "force-dynamic";

const NS_LABEL: Record<string, string> = {
  company: "Company", employee: "Employee", candidate: "Candidate", client: "Client", vendor: "Vendor", party: "Other party", doc: "Document",
  input: "Fill-in fields", custom: "Company variables", date: "Date", author: "Author", project: "Project",
};

export default async function DocumentEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wizard?: string }> }) {
  const { id } = await params;
  const wizard = (await searchParams).wizard === "1";
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const actor: PbActor = { id: viewer.userId, email: viewer.email, name: viewer.name, roles: viewer.roles, permissionOverrides: viewer.overrides };

  const rec = await getDocument(actor, id);
  if (!rec.ok) {
    if (rec.error.code === "forbidden") redirect("/playbook-ai");
    notFound();
  }
  const { document: d, capabilities } = rec;

  // Only a draft is editable, and only by one person at a time. Everyone else gets the read view with the reason.
  let readOnly = !capabilities.edit || d.status !== "draft";
  let reason: string | undefined = d.status !== "draft" ? `This document is ${d.status.replace("_", " ")} and cannot be edited. Revise it first to make changes.` : !capabilities.edit ? "You can read this document but not edit it." : undefined;
  if (!readOnly) {
    const lock = await acquireLock(actor, id);
    if (!lock.ok) {
      readOnly = true;
      reason = lock.error.code === "locked" ? `${lock.error.lockedBy.name ?? lock.error.lockedBy.email ?? "Someone"} is editing this document right now. You can read it; try again when they finish.` : lock.error.message;
    }
  }

  const [custom, brand, loaded] = await Promise.all([
    listCustomVariables(),
    loadBrand(),
    loadVariableValues(actor, { doc: { title: d.title, docNumber: d.docNumber, version: d.versionSeq + 1, status: d.status, issuedAt: d.issuedAt, authorId: d.createdBy }, links: d.links, inputs: d.inputs }),
  ]);
  const variables: VariableDef[] = variableCatalogue(custom).map((v) => ({ key: v.key, label: v.label, group: NS_LABEL[v.namespace] ?? v.namespace, description: v.description, formats: [v.format] }));
  const previewValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(loaded.values)) if (v !== null && v !== undefined && String(v).trim()) previewValues[k] = String(v);
  const layout = layoutInputFor({ kind: d.kind, title: d.title, docTypeId: d.docTypeId, docNumber: d.docNumber, meta: d.meta, version: d.versionSeq + 1, authorName: d.lastEditor?.name ?? null });
  const branded = applyBrandToDoc(d.pbdoc, brand.settings, loaded.values, { docNumber: d.docNumber, layout });

  const sendInfo = (await sendInfoFor([d._id])).get(d._id) ?? null;
  const pctx = { roles: actor.roles, permissionOverrides: actor.permissionOverrides ?? undefined };
  const kind: ItemKind = (d.kind as ItemKind | undefined) ?? "document";

  return (
    <div className="flex h-full min-h-[30rem] flex-col gap-3">
      <PlaybookDocEditor
        key={d.rev}
        className="min-h-0 flex-1"
        documentId={d._id}
        initial={{ id: d._id, doc: d.pbdoc, version: String(d.rev) }}
        variables={variables}
        previewValues={previewValues}
        zoneValues={{ docNumber: d.docNumber ?? undefined, title: d.title }}
        brand={{ primaryColor: brand.settings.colors.primary, accentColor: brand.settings.colors.secondary }}
        view={{ page: branded.page, header: branded.header, footer: branded.footer, layout: { ...layout, identity: identityFor(brand.settings, loaded.values) } }}
        logoUrl={brand.logo ? `data:image/png;base64,${brand.logo.bytes.toString("base64")}` : undefined}
        brandHref="/playbook-ai/brand"
        readOnly={readOnly}
        readOnlyReason={reason}
        host={{ title: d.title, kind, canSend: playbookCan(pctx, "SEND_FOR_SIGNATURE"), canExport: playbookCan(pctx, "EXPORT"), canUseAi: playbookCan(pctx, "USE_AI"), canTrash: playbookCan(pctx, "EDIT"), send: sendInfo, wizard, version: d.latestVersion ?? d.versionSeq, status: d.status, userLabel: viewer.name || viewer.email }}
      />
    </div>
  );
}
