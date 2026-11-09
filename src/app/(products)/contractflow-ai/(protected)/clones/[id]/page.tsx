import { notFound, redirect } from "next/navigation";
import CloneActions from "@/components/products/contractflow-ai/CloneActions";
import CloneEditor from "@/components/products/contractflow-ai/CloneEditor";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { getClone } from "@/lib/products/contractflow-ai/clones";
import { CLONE_STATUS_LABEL } from "@/lib/products/contractflow-ai/clone-types";
import { PARTY_TYPE_LABEL } from "@/lib/products/contractflow-ai/party-types";
import { cfSealed } from "@/lib/products/contractflow-ai/cf-db";
import SealButton from "@/components/products/contractflow-ai/SealButton";
import CloneSendButton from "@/components/products/contractflow-ai/CloneSendButton";
import { ITEM_KIND_INFO, type ItemKind } from "@/lib/products/playbook-ai/items-types";
import { layoutInputFor } from "@/lib/products/playbook-ai/items-layout";
import { variableCatalogue } from "@/lib/products/playbook-ai/variables-registry";
import { listCustomVariables } from "@/lib/products/playbook-ai/variables-custom";
import { applyBrandToDoc, identityFor, loadBrand } from "@/lib/products/playbook-ai/brand/apply";
import type { VariableDef } from "@/components/doc-editor/core/variables";

export const dynamic = "force-dynamic";

const NS_LABEL: Record<string, string> = {
  company: "Company", employee: "Employee", candidate: "Candidate", client: "Client", vendor: "Vendor", party: "Other party", doc: "Document",
  input: "Fill-in fields", custom: "Company variables", date: "Date", author: "Author", project: "Project",
};

export default async function CloneEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");
  const r = await getClone(viewer, id);
  if (!r.ok) {
    if (r.error.code === "forbidden") redirect("/contractflow-ai/documents");
    notFound();
  }
  const { clone: c, edited, capabilities: cap } = r;
  const sealed = c.status === "signed" ? await (await cfSealed()).findOne({ cloneId: c._id }) : null;
  const kindInfo = ITEM_KIND_INFO[(c.kind as ItemKind | undefined) ?? "document"];
  const planned = { type: c.party.type, partyId: c.party.partyId, displayName: c.party.displayName };
  const [custom, brand] = await Promise.all([listCustomVariables(), loadBrand()]);
  const variables: VariableDef[] = variableCatalogue(custom).map((v) => ({ key: v.key, label: v.label, group: NS_LABEL[v.namespace] ?? v.namespace, description: v.description, formats: [v.format] }));
  const values = c.variableSnapshot.values;
  const previewValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined && String(v).trim()) previewValues[k] = String(v);
  const layout = layoutInputFor({ kind: c.kind, title: c.title, docTypeId: c.source.docTypeId, docNumber: c.source.docNumber, meta: c.meta, version: c.rev });
  const branded = applyBrandToDoc(c.pbdoc, brand.settings, values, { docNumber: c.source.docNumber, layout });

  const reason = cap.locked
    ? "A signature has been applied, so this document is locked. To change it, void it and create a new one."
    : c.status === "voided" ? "This document was voided and cannot be edited."
    : !cap.edit ? (cap.view && c.status !== "clone_draft" && c.status !== "ready" && c.status !== "sent" ? `This document is ${CLONE_STATUS_LABEL[c.status].toLowerCase()} and cannot be edited.` : "You can read this document but not edit it.")
    : c.status === "ready" || c.status === "sent" ? "Editing this document will take it back to draft and switch off any links already sent." : undefined;

  return (
    <div className="flex h-full min-h-[30rem] flex-col gap-3">
      {(cap.void || cap.reclone || (c.status === "signed" && !sealed)) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card px-3 py-2 text-sm">
          {c.status === "signed" && !sealed && <SealButton id={c._id} />}
          <CloneActions id={c._id} canMarkReady={false} canSend={false} canVoid={cap.void} canReclone={cap.reclone} locked={cap.locked} />
        </div>
      )}
      {c.voidReason && <p className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">Voided: {c.voidReason}</p>}
      <CloneEditor
        key={c.rev}
        className="min-h-0 flex-1"
        documentId={c._id}
        initial={{ id: c._id, doc: c.pbdoc, version: String(c.rev) }}
        variables={variables}
        previewValues={previewValues}
        zoneValues={{ docNumber: c.source.docNumber ?? undefined, title: c.title }}
        brand={{ primaryColor: brand.settings.colors.primary, accentColor: brand.settings.colors.secondary }}
        view={{ page: branded.page, header: branded.header, footer: branded.footer, layout: { ...layout, identity: identityFor(brand.settings, values) } }}
        logoUrl={brand.logo ? `data:image/png;base64,${brand.logo.bytes.toString("base64")}` : undefined}
        readOnly={!cap.edit}
        readOnlyReason={reason}
        host={{
          title: c.title, kind: c.kind ?? "document", kindLabel: kindInfo.plural, kindHref: `/contractflow-ai/${kindInfo.segment}`, statusLabel: CLONE_STATUS_LABEL[c.status],
          partyLine: `${PARTY_TYPE_LABEL[c.party.type]}: ${c.party.displayName}`, version: c.rev, sourceVersion: c.source.versionNumber, edited, canRename: cap.edit, canDelete: !cap.locked, canAi: cap.edit, canRestore: cap.edit, userLabel: viewer.email,
          links: [
            ...(c.status === "signed" && sealed ? [{ label: "Signed PDF", href: `/api/contractflow-ai/clones/${c._id}/signed` }, { label: "Verification page", href: `/verify/${sealed.verifyCode}` }] : []),
            ...(cap.download ? [{ label: "Download as PDF", href: `/api/contractflow-ai/clones/${c._id}/file?format=pdf` }, { label: "Download as Word (.docx)", href: `/api/contractflow-ai/clones/${c._id}/file?format=docx` }] : []),
            { label: "Compare with the Playbook version", href: `/contractflow-ai/clones/${c._id}/redline` },
            ...(c.replaces ? [{ label: "Replaces an earlier document", href: `/contractflow-ai/clones/${c.replaces}` }] : []),
            ...(c.replacedBy ? [{ label: "Replaced by a newer document", href: `/contractflow-ai/clones/${c.replacedBy}` }] : []),
          ],
          primary: (c.status === "clone_draft" || c.status === "ready") && (cap.markReady || cap.send) ? <CloneSendButton id={c._id} /> : undefined,
        }}
      />
    </div>
  );
}
