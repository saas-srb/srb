"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findInDoc, nextMatchIndex, previousMatchIndex, type DocMatch } from "@/components/doc-editor/core/find-replace";
import { viewKey } from "@/components/doc-editor/schema/extensions";

interface Props { editor: Editor; readOnly: boolean; showReplace: boolean; onClose: () => void }

export default function FindReplace({ editor, readOnly, showReplace, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCase] = useState(false);
  const [wholeWord, setWhole] = useState(false);
  const [active, setActive] = useState(-1);
  const [matches, setMatches] = useState<DocMatch[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const push = useCallback((ms: DocMatch[], act: number) => {
    editor.view.dispatch(editor.state.tr.setMeta(viewKey, { find: ms.map((m) => ({ from: m.from, to: m.to })), findActive: act }).setMeta("addToHistory", false));
  }, [editor]);

  const recompute = useCallback((keepNear?: number, o: { q: string; c: boolean; w: boolean } = { q: query, c: caseSensitive, w: wholeWord }) => {
    const ms = findInDoc(editor.state.doc, o.q, { caseSensitive: o.c, wholeWord: o.w });
    const act = ms.length ? (keepNear === undefined ? 0 : Math.max(nextMatchIndex(ms, keepNear), 0)) : -1;
    setMatches(ms); setActive(act); push(ms, act);
    return { ms, act };
  }, [editor, query, caseSensitive, wholeWord, push]);

  useEffect(() => { const h = () => { const ms = findInDoc(editor.state.doc, query, { caseSensitive, wholeWord }); setMatches(ms); setActive((a) => Math.min(a, ms.length - 1)); }; editor.on("update", h); return () => { editor.off("update", h); }; }, [editor, query, caseSensitive, wholeWord]);
  useEffect(() => () => { if (!editor.isDestroyed) push([], -1); }, [editor, push]);

  const goTo = (i: number, ms = matches) => {
    const m = ms[i];
    if (!m) return;
    setActive(i); push(ms, i);
    const view = editor.view;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)).scrollIntoView().setMeta("addToHistory", false));
  };
  const next = () => goTo(matches.length ? nextMatchIndex(matches, active >= 0 ? matches[active].to : editor.state.selection.to) : -1);
  const prev = () => goTo(matches.length ? previousMatchIndex(matches, active >= 0 ? matches[active].from : editor.state.selection.from) : -1);

  const replaceOne = () => {
    if (readOnly || active < 0) return;
    const m = matches[active];
    editor.chain().focus().insertContentAt({ from: m.from, to: m.to }, replacement).run();
    const { ms } = recompute(m.from + replacement.length);
    if (ms.length) goTo(Math.max(nextMatchIndex(ms, m.from + replacement.length), 0), ms);
  };
  const replaceAll = () => {
    if (readOnly || !matches.length) return;
    const tr = editor.state.tr;
    for (const m of [...matches].reverse()) {
      if (replacement) tr.insertText(replacement, m.from, m.to); else tr.delete(m.from, m.to);
    }
    editor.view.dispatch(tr);
    recompute(0);
  };

  return (
    <div role="search" aria-label="Find and replace" className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
      <input ref={input} aria-label="Find" placeholder="Find" value={query} onChange={(e) => { setQuery(e.target.value); recompute(editor.state.selection.from, { q: e.target.value, c: caseSensitive, w: wholeWord }); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) prev(); else next(); } if (e.key === "Escape") onClose(); }}
        className="h-8 w-44 rounded-lg border border-input bg-background px-2" />
      <span className="min-w-16 text-xs text-muted-foreground" aria-live="polite">{query ? (matches.length ? `${active + 1} of ${matches.length}` : "No matches") : ""}</span>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Previous match" onClick={prev} disabled={!matches.length}><ChevronUp /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Next match" onClick={next} disabled={!matches.length}><ChevronDown /></Button>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={caseSensitive} onChange={(e) => { setCase(e.target.checked); recompute(editor.state.selection.from, { q: query, c: e.target.checked, w: wholeWord }); }} /> Match case</label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={wholeWord} onChange={(e) => { setWhole(e.target.checked); recompute(editor.state.selection.from, { q: query, c: caseSensitive, w: e.target.checked }); }} /> Whole word</label>
      {showReplace && !readOnly && (
        <>
          <input aria-label="Replace with" placeholder="Replace with" value={replacement} onChange={(e) => setReplacement(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} className="h-8 w-44 rounded-lg border border-input bg-background px-2" />
          <Button type="button" size="sm" variant="outline" onClick={replaceOne} disabled={active < 0}>Replace</Button>
          <Button type="button" size="sm" variant="outline" onClick={replaceAll} disabled={!matches.length}>Replace all</Button>
        </>
      )}
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Close find" className="ml-auto" onClick={onClose}><X /></Button>
    </div>
  );
}
