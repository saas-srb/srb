"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { DocumentStore } from "@/components/doc-editor/core/store";
import type { VariableDef } from "@/components/doc-editor/core/variables";
import type { DocEditorProps } from "@/components/doc-editor/ui/types";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";

const DocEditor = dynamic(() => import("@/components/doc-editor/ui/DocEditor"), { ssr: false });

export default function Harness({ doc, title, values, variables, view, primary, accent }: { doc: PBDoc; title: string; values: Record<string, string>; variables: VariableDef[]; view: DocEditorProps["view"]; primary: string; accent: string }) {
  const store = useMemo<DocumentStore>(() => ({ async load(id) { return { id, doc, version: "1" }; }, async save() { return { version: "1", savedAt: new Date().toISOString() }; } }), [doc]);
  return (
    <div style={{ height: "100vh" }}>
      <DocEditor documentId="harness" store={store} initial={{ id: "harness", doc, version: "1" }} variables={variables} previewValues={values} zoneValues={{ title }} brand={{ primaryColor: primary, accentColor: accent }} view={view} />
    </div>
  );
}
