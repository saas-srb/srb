"use client";

import { useMemo } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { buildOutline } from "@/components/doc-editor/core/outline";

export default function OutlinePanel({ editor }: { editor: Editor }) {
  // The outline is rebuilt only when the document changes (not on every cursor move).
  const doc = useEditorState({ editor, selector: ({ editor: e }) => e.state.doc });
  const items = useMemo(() => (doc ? buildOutline(doc) : []), [doc]);
  const go = (pos: number) => {
    const { view } = editor;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size)))).scrollIntoView());
    view.focus();
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  if (!items.length) return <p className="p-3 text-sm text-muted-foreground">Headings, sections and numbered clauses appear here so you can jump to them.</p>;
  return (
    <nav aria-label="Document outline" className="p-2">
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.id || i.pos}>
            <button type="button" onClick={() => go(i.pos)} className="flex w-full items-baseline gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-muted focus-visible:bg-muted" style={{ paddingLeft: 8 + (i.kind === "section" ? 0 : Math.max(i.level - 1, 0)) * 12 + (i.kind === "section" ? 0 : 6) }}>
              {i.label && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{i.label}</span>}
              <span className={`truncate ${i.kind === "section" ? "font-semibold" : ""}`}>{i.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
