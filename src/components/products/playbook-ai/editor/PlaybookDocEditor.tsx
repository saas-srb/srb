"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentConflictError, type DocumentStore } from "@/components/doc-editor/core/store";
import type { DocEditorProps } from "@/components/doc-editor/ui/types";
import { SendChip } from "@/components/products/playbook-ai/items/shared";
import PlaybookAiPanel from "@/components/products/playbook-ai/editor/PlaybookAiPanel";
import PlaybookVersions from "@/components/products/playbook-ai/editor/PlaybookVersions";
import { ITEM_KIND_INFO, type ItemKind, type ItemSendInfo } from "@/lib/products/playbook-ai/items-types";
import type { AiTextTools } from "@/lib/products/playbook-ai/ai/edit-types";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { loadEditorDocument, renderEditorPreview, saveEditorDocument } from "@/app/(products)/playbook-ai/(protected)/documents/[id]/actions";
import { copyItemAction, deleteItemAction, pbTransformAction, updateItemDetailsAction } from "@/app/(products)/playbook-ai/(protected)/items-actions";

// The editor is browser-only (ProseMirror reads the DOM), so it is loaded without server rendering.
const DocEditor = dynamic(() => import("@/components/doc-editor/ui/DocEditor"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground" role="status">Loading the editor…</p>,
});

/** What the page knows about the item; the Docs-style header and File menu are built from it here. */
export interface PlaybookHost {
  title: string;
  kind: ItemKind;
  canSend: boolean;
  canExport: boolean;
  canUseAi: boolean;
  canTrash: boolean;
  send: ItemSendInfo | null;
  wizard: boolean;
  version: number;
  status: string;
  userLabel: string;
}
type Props = Omit<DocEditorProps, "store" | "renderPreview" | "docs" | "aiPanel" | "versionsPanel" | "aiTools"> & { enablePdfPreview?: boolean; host: PlaybookHost };

function base64ToBlobUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}
const exportUrl = (id: string, format: "pdf" | "docx") => `/api/playbook-ai/documents/${encodeURIComponent(id)}/export?format=${format}&version=draft`;
const chip = "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground";

/** Playbook's wrapper around the shared editor: plugs the Playbook server actions in as the store, preview, AI, versions and File menu. */
export default function PlaybookDocEditor({ enablePdfPreview = true, host, ...props }: Props) {
  const router = useRouter();
  const info = ITEM_KIND_INFO[host.kind];
  const id = props.documentId;
  const store = useMemo<DocumentStore>(() => ({
    async load(docId) {
      const r = await loadEditorDocument(docId);
      if (!r.ok) throw new Error(r.message);
      return { id: r.id, doc: r.doc, version: r.version };
    },
    async save(req) {
      const r = await saveEditorDocument({ id: req.id, doc: req.doc, baseVersion: req.baseVersion });
      if (r.ok) return { version: r.version, savedAt: r.savedAt };
      if (r.code === "CONFLICT") throw new DocumentConflictError(r.message);
      throw new Error(r.message);
    },
  }), []);

  const renderPreview = useMemo(() => {
    if (!enablePdfPreview) return undefined;
    return async (doc: PBDoc) => {
      const r = await renderEditorPreview({ id, doc });
      if (!r.ok) throw new Error(r.message);
      return base64ToBlobUrl(r.pdfBase64);
    };
  }, [enablePdfPreview, id]);

  const aiTools = useMemo<AiTextTools | undefined>(() => (host.canUseAi ? { transform: (i) => pbTransformAction(id, i) } : undefined), [host.canUseAi, id]);
  const go = (href: string) => () => { window.location.assign(href); };

  const docs: NonNullable<DocEditorProps["docs"]> = {
    backHref: `/playbook-ai/${info.segment}`, backLabel: `Back to ${info.mine}`, title: host.title, userLabel: host.userLabel,
    onRename: async (t) => { const r = await updateItemDetailsAction(id, { title: t }); if (r.ok) router.refresh(); return r.ok ? { ok: true } : { ok: false, message: r.message }; },
    chips: <><span className={chip}>v{Math.max(host.version, 1)}</span><SendChip state={host.send?.state ?? null} /></>,
    details: [`Type: ${info.singular}`, `Version ${Math.max(host.version, 1)}`, `Status: ${host.status === "draft" ? "Draft" : host.status.replace("_", " ")}`, host.send ? `In ContractFlow: ${host.send.partyName}` : "Not sent to ContractFlow"],
    fileItems: [
      { label: "Make a copy", onSelect: () => { void copyItemAction(id).then((r) => { if (r.ok) window.location.assign(`/playbook-ai/documents/${r.documentId}`); }); } },
      ...(host.canExport ? [{ label: "Download as PDF", onSelect: go(exportUrl(id, "pdf")), separatorBefore: true }, { label: "Download as Word (.docx)", onSelect: go(exportUrl(id, "docx")) }] : []),
      ...(host.send ? [{ label: "Open the copy in ContractFlow", onSelect: go(`/contractflow-ai/clones/${host.send.cloneId}`), separatorBefore: true }] : []),
      ...(host.canSend ? [{ label: "Send to ContractFlow", onSelect: go(`/playbook-ai/documents/${id}/send`) }] : []),
      ...(host.canTrash ? [{ label: "Move to trash", separatorBefore: true, onSelect: () => { if (window.confirm("Move this item to the trash? Copies already in ContractFlow are not affected.")) void deleteItemAction(id).then((r) => { if (r.ok) window.location.assign(`/playbook-ai/${info.segment}`); else window.alert(r.message); }); } }] : []),
    ],
    primary: host.wizard
      ? <Button size="sm" onClick={() => router.push(`/playbook-ai/${info.segment}`)}>Done</Button>
      : host.canSend ? <Button size="sm" className="rounded-full px-4" nativeButton={false} render={<a href={`/playbook-ai/documents/${id}/send`} />}>Send to ContractFlow</Button> : undefined,
  };

  return (
    <>
      <DocEditor
        {...props} store={store} renderPreview={renderPreview} versionHref={`/playbook-ai/documents/${id}/version`} docs={docs} aiTools={aiTools}
        aiPanel={host.canUseAi ? <PlaybookAiPanel documentId={id} kind={host.kind} /> : undefined}
        versionsPanel={<PlaybookVersions documentId={id} canRestore={!props.readOnly} />}
        className={props.className ?? "h-[calc(100dvh-9rem)]"}
      />
    </>
  );
}
