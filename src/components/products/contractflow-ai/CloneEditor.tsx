"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { DocumentConflictError, type DocumentStore } from "@/components/doc-editor/core/store";
import type { DocEditorProps } from "@/components/doc-editor/ui/types";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import AiChatPanel from "@/components/products/contractflow-ai/AiChatPanel";
import CloneVersions from "@/components/products/contractflow-ai/CloneVersions";
import type { AiTextTools } from "@/lib/products/playbook-ai/ai/edit-types";
import { loadCloneForEditor, previewCloneFromEditor, saveCloneFromEditor } from "@/app/(products)/contractflow-ai/(protected)/clones/[id]/actions";
import { deleteCloneAction, renameCloneAction, transformCloneAction } from "@/app/(products)/contractflow-ai/(protected)/clones/list-actions";

// The editor is browser-only (ProseMirror reads the DOM), so it is loaded without server rendering.
const DocEditor = dynamic(() => import("@/components/doc-editor/ui/DocEditor"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground" role="status">Loading the editor…</p>,
});

/** What the page knows about the clone; the Docs-style header and File menu are built from it here. */
export interface CloneHost {
  title: string;
  kind: string;
  kindLabel: string;
  kindHref: string;
  statusLabel: string;
  partyLine: string;
  version: number;
  sourceVersion: number;
  edited: boolean;
  canRename: boolean;
  canDelete: boolean;
  canAi: boolean;
  canRestore: boolean;
  links: { label: string; href: string }[];
  primary?: ReactNode;
  userLabel: string;
}
type Props = Omit<DocEditorProps, "store" | "renderPreview" | "docs" | "aiPanel" | "versionsPanel" | "aiTools"> & { enablePdfPreview?: boolean; host: CloneHost };

function base64ToBlobUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

/** ContractFlow's wrapper around the shared document editor: the clone store plugs in as the `DocumentStore` and the PDF preview. */
export default function CloneEditor({ enablePdfPreview = true, host, ...props }: Props) {
  const router = useRouter();
  const id = props.documentId;
  const store = useMemo<DocumentStore>(() => ({
    async load(id) {
      const r = await loadCloneForEditor(id);
      if (!r.ok) throw new Error(r.message);
      return { id: r.id, doc: r.doc, version: r.version };
    },
    async save(req) {
      const r = await saveCloneFromEditor({ id: req.id, doc: req.doc, baseVersion: req.baseVersion });
      if (r.ok) return { version: r.version, savedAt: r.savedAt };
      if (r.code === "CONFLICT") throw new DocumentConflictError(r.message);
      throw new Error(r.message);
    },
  }), []);

  const renderPreview = useMemo(() => {
    if (!enablePdfPreview) return undefined;
    return async (doc: PBDoc) => {
      const r = await previewCloneFromEditor({ id: props.documentId, doc });
      if (!r.ok) throw new Error(r.message);
      return base64ToBlobUrl(r.pdfBase64);
    };
  }, [enablePdfPreview, props.documentId]);

  const aiTools = useMemo<AiTextTools | undefined>(() => (host.canAi ? { transform: (i) => transformCloneAction(id, i) } : undefined), [host.canAi, id]);
  const chip = "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground";
  const docs: NonNullable<DocEditorProps["docs"]> = {
    backHref: host.kindHref, backLabel: `Back to ${host.kindLabel}`, title: host.title, userLabel: host.userLabel,
    onRename: host.canRename ? async (t) => { const r = await renameCloneAction(id, t); if (r.ok) router.refresh(); return r.ok ? { ok: true } : { ok: false, message: r.message }; } : undefined,
    chips: <><span className={chip}>v{host.version}</span><span className={chip}>{host.statusLabel}</span></>,
    details: [`Version ${host.version} (copied from Playbook version ${host.sourceVersion})`, `Status: ${host.statusLabel}`, host.partyLine, host.edited ? "Edited after cloning" : "Same as the Playbook version"],
    fileItems: [
      ...host.links.map((l, i) => ({ label: l.label, separatorBefore: i === 0, onSelect: () => { if (l.href.startsWith("/api/")) window.location.assign(l.href); else router.push(l.href); } })),
      ...(host.canDelete ? [{ label: "Move to trash", separatorBefore: true, onSelect: () => { if (window.confirm("Delete this document? Any open signing links stop working. Playbook is not affected.")) void deleteCloneAction(id).then((r) => { if (r.ok) window.location.assign(host.kindHref); else window.alert(r.message); }); } }] : []),
    ],
    primary: host.primary,
  };

  return (
    <DocEditor
      {...props} store={store} renderPreview={renderPreview} docs={docs} aiTools={aiTools}
      aiPanel={host.canAi ? <AiChatPanel cloneId={id} kind={host.kind} /> : undefined}
      versionsPanel={<CloneVersions cloneId={id} canRestore={host.canRestore} onRestored={() => router.refresh()} />}
      className={props.className ?? "h-[calc(100dvh-14rem)]"}
    />
  );
}
