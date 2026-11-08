"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { DocumentConflictError, type DocumentStore } from "@/components/doc-editor/core/store";
import type { DocEditorProps } from "@/components/doc-editor/ui/types";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { loadEditorDocument, renderEditorPreview, saveEditorDocument } from "@/app/(products)/playbook-ai/(protected)/documents/[id]/actions";

// The editor is browser-only (ProseMirror reads the DOM), so it is loaded without server rendering.
const DocEditor = dynamic(() => import("@/components/doc-editor/ui/DocEditor"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground" role="status">Loading the editor…</p>,
});

type Props = Omit<DocEditorProps, "store" | "renderPreview"> & { enablePdfPreview?: boolean };

function base64ToBlobUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

/**
 * Playbook's wrapper around the shared document editor: it plugs the Playbook server actions in as the `DocumentStore` and the PDF preview.
 * ContractFlow does the same with its own clone store. Everything else (schema, toolbar, autosave, conflict handling) is shared.
 */
export default function PlaybookDocEditor({ enablePdfPreview = true, ...props }: Props) {
  const store = useMemo<DocumentStore>(() => ({
    async load(id) {
      const r = await loadEditorDocument(id);
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
      const r = await renderEditorPreview({ id: props.documentId, doc });
      if (!r.ok) throw new Error(r.message);
      return base64ToBlobUrl(r.pdfBase64);
    };
  }, [enablePdfPreview, props.documentId]);

  return <DocEditor {...props} store={store} renderPreview={renderPreview} className={props.className ?? "h-[calc(100dvh-9rem)]"} />;
}
