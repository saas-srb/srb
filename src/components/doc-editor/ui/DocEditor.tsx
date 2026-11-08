"use client";

import "@/components/doc-editor/ui/doc-editor.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { AlertTriangle, Check, CloudOff, Loader2, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plainText } from "@/lib/products/playbook-ai/doc/text";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { TiptapNode } from "@/lib/products/playbook-ai/doc/tiptap";
import { AutosaveController, type AutosaveState, type Snapshot } from "@/components/doc-editor/core/autosave";
import { docToEditorJson, editorBodyToDoc } from "@/components/doc-editor/core/convert";
import { cleanPastedHtml, isInternalPaste } from "@/components/doc-editor/core/paste-clean";
import { eventMatches, SHORTCUTS } from "@/components/doc-editor/core/shortcuts";
import { buildExtensions, viewKey } from "@/components/doc-editor/schema/extensions";
import PageView from "@/components/doc-editor/ui/PageView";
import Toolbar, { type DialogKind } from "@/components/doc-editor/ui/Toolbar";
import ActionDialogs from "@/components/doc-editor/ui/ActionDialogs";
import FindReplace from "@/components/doc-editor/ui/FindReplace";
import Inspector from "@/components/doc-editor/ui/Inspector";
import OutlinePanel from "@/components/doc-editor/ui/OutlinePanel";
import ConflictDialog from "@/components/doc-editor/ui/ConflictDialog";
import {
  insertCallout, insertField, insertImageFile, insertSimple, insertToc, setBlockType, toggleList, validateImageFile, type CommandResult,
} from "@/components/doc-editor/ui/commands";
import type { DocEditorProps } from "@/components/doc-editor/ui/types";

const IMG = /^image\/(png|jpeg)$/;

function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(q); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(q).matches,
    () => false,
  );
}

function statusText(s: AutosaveState): { icon: "ok" | "busy" | "warn" | "off"; text: string } {
  switch (s.status) {
    case "saving": return { icon: "busy", text: "Saving…" };
    case "dirty": return { icon: "busy", text: "Unsaved changes" };
    case "saved": return { icon: "ok", text: `Saved${s.savedAt ? ` at ${new Date(s.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}` };
    case "error": return { icon: "off", text: s.failures > 3 ? "Could not save. Check your connection and retry." : "Could not save, retrying…" };
    case "conflict": return { icon: "warn", text: "Someone else changed this document. Your edits are not saved." };
    case "invalid": return { icon: "warn", text: `Not saved: ${s.issues?.[0]?.message ?? "the document has a problem"}` };
    case "readonly": return { icon: "ok", text: "Read-only" };
    default: return { icon: "ok", text: "All changes saved" };
  }
}

export default function DocEditor(props: DocEditorProps) {
  const { documentId, store, initial, variables, brand, zoneValues, comments, className } = props;
  const propsRef = useRef(props);
  useEffect(() => { propsRef.current = props; });
  const baseRef = useRef<PBDoc>(initial.doc);
  const [base, setBaseState] = useState<PBDoc>(initial.doc);
  const setBase = (d: PBDoc) => { baseRef.current = d; setBaseState(d); };
  const [save, setSave] = useState<AutosaveState>({ status: "idle", version: initial.version, failures: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [find, setFind] = useState<{ replace: boolean } | null>(null);
  const [resolved, setResolved] = useState(false);
  const [panel, setPanel] = useState<"outline" | "block">("outline");
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<"edit" | "pdf">("edit");
  const [pages, setPages] = useState(1);
  const narrow = useMediaQuery("(max-width: 767px)");
  const wide = useMediaQuery("(min-width: 1024px)");
  const readOnly = Boolean(props.readOnly) || narrow;

  const [controller] = useState(() => new AutosaveController({
    store, documentId, baseVersion: initial.version, debounceMs: props.autosaveMs ?? 1500, onState: (s) => setSave(s),
  }));

  const addFiles = useCallback(async (files: File[], at?: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    for (const f of files) {
      const r = await insertImageFile(ed, f, propsRef.current.uploadImage, propsRef.current.maxImageBytes, at);
      if (!r.ok) { setNotice(r.message); return; }
    }
  }, []);
  const editorRef = useRef<Editor | null>(null);

  const snapshotOf = useCallback((ed: Editor): Snapshot => editorBodyToDoc(ed.getJSON() as TiptapNode, baseRef.current), []);

  // The resolver runs when an image is drawn, never during render.
  // eslint-disable-next-line react-hooks/refs
  const extensions = useMemo(() => buildExtensions({ resolveImageUrl: (id) => propsRef.current.resolveImageUrl?.(id) ?? null }), []);
  const editor = useEditor({
    extensions,
    content: docToEditorJson(initial.doc),
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "pb-editor", role: "textbox", "aria-multiline": "true", "aria-label": "Document body", spellcheck: "true", lang: "en" },
      transformPastedHTML: (html) => (isInternalPaste(html) ? html : cleanPastedHtml(html).html),
      handlePaste: (_v, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => IMG.test(f.type));
        if (!files.length) return false;
        event.preventDefault();
        void addFiles(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) => IMG.test(f.type));
        if (!files.length) return false;
        event.preventDefault();
        void addFiles(files, view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos);
        return true;
      },
      handleClickOn: (_v, _pos, node) => {
        const id = String(node.attrs.id ?? "");
        if (id && propsRef.current.comments?.commentedBlockIds?.has(id)) propsRef.current.comments.onCommentedBlockClick?.(id);
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => controller.change(() => snapshotOf(ed)),
  });
  // The paste and drop handlers are created before the editor exists, so they read it through this ref.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => { editorRef.current = editor; }, [editor]);


  // Lifecycle: revive after strict-mode cleanup, flush on unmount.
  useEffect(() => {
    controller.revive();
    return () => { void controller.flush(); controller.dispose(); };
  }, [controller]);

  useEffect(() => { editor?.setEditable(!readOnly); controller.setReadonly(readOnly); }, [editor, readOnly, controller]);

  // Resolved preview and comment markers go to the view plugin.
  const sampleValues = useMemo(() => {
    const v: Record<string, string> = {};
    for (const d of variables) if (d.sample) v[d.key] = d.sample;
    return { ...v, ...(props.previewValues ?? {}) };
  }, [variables, props.previewValues]);
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(viewKey, { mode: resolved ? "preview" : "template", values: sampleValues, commented: comments?.commentedBlockIds ?? new Set<string>() }).setMeta("addToHistory", false));
  }, [editor, resolved, sampleValues, comments?.commentedBlockIds]);

  // Unsaved-changes guard: closing the tab and following in-app links.
  const dirty = save.status === "dirty" || save.status === "saving" || save.status === "error" || save.status === "conflict" || save.status === "invalid";
  useEffect(() => { props.onDirtyChange?.(dirty); }, [dirty, props]);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.closest(".pb-editor") || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      if (!window.confirm("You have changes that are not saved yet. Leave this page anyway?")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", before); document.removeEventListener("click", click, true); };
  }, [dirty]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    for (const s of SHORTCUTS) {
      if (s.scope !== "app" || !eventMatches(e.nativeEvent, s.keys)) continue;
      e.preventDefault();
      if (s.id === "find") setFind({ replace: false });
      else if (s.id === "replace") setFind({ replace: true });
      else if (s.id === "save") void controller.flush();
      else if (s.id === "link" && !readOnly) setDialog("link");
      else if (s.id === "variable" && !readOnly) setDialog("variable");
      return;
    }
  };

  const run = (r: CommandResult) => setNotice(r.ok ? null : r.message);
  const onInsert = (what: string) => {
    if (!editor) return;
    if (what === "bulletList" || what === "orderedList") toggleList(editor, what);
    else if (what.startsWith("callout:")) run(insertCallout(editor, what.slice(8) as "info" | "warning" | "important"));
    else if (what === "clause") setBlockType(editor, "clause");
    else if (what === "pageBreak" || what === "divider" || what === "spacer") run(insertSimple(editor, what));
    else if (what === "toc") run(insertToc(editor));
    else if (what.startsWith("field:")) run(insertField(editor, what.slice(6)));
  };

  const requestComment = () => {
    if (!editor || !comments?.onRequestComment) return;
    const { $from, from, to } = editor.state.selection;
    for (let d = $from.depth; d >= 1; d--) {
      const id = $from.node(d).attrs.id;
      if (id) {
        const quote = (from !== to ? editor.state.doc.textBetween(from, to, " ") : $from.node(d).textContent).slice(0, 300);
        comments.onRequestComment({ blockId: String(id), quote });
        return;
      }
    }
  };

  const reload = async () => {
    const snap = await store.load(documentId);
    setBase(snap.doc);
    editor?.commands.setContent(docToEditorJson(snap.doc), { emitUpdate: false });
    controller.adoptServerVersion(snap.version);
  };

  // Real PDF preview: started when the user opens the tab.
  const [pdf, setPdf] = useState<{ url?: string; loading: boolean; error?: string }>({ loading: false });
  const pdfRun = useRef(0);
  const openTab = (v: "edit" | "pdf") => {
    setTab(v);
    if (v !== "pdf" || !editor || !props.renderPreview) return;
    const snap = snapshotOf(editor);
    const my = ++pdfRun.current;
    if (!snap.ok) { setPdf({ loading: false, error: `The preview needs a valid document: ${snap.issues[0]?.message ?? "fix the problem shown at the bottom"}.` }); return; }
    setPdf({ loading: true });
    props.renderPreview(snap.doc).then(
      (url) => { if (pdfRun.current === my) setPdf({ loading: false, url }); },
      (e: unknown) => { if (pdfRun.current === my) setPdf({ loading: false, error: e instanceof Error && e.message ? e.message : "The PDF preview could not be made." }); },
    );
  };
  useEffect(() => () => { if (pdf.url?.startsWith("blob:")) URL.revokeObjectURL(pdf.url); }, [pdf.url]);

  const counts = useEditorState({ editor, selector: ({ editor: e }) => (e ? { words: e.state.doc.textContent.split(/\s+/).filter(Boolean).length } : { words: 0 }) });
  const st = statusText(save);
  const canPreview = Boolean(props.renderPreview);

  if (!editor) return <div className={className} aria-busy="true"><p className="p-6 text-sm text-muted-foreground">Loading the editor…</p></div>;

  const sidebar = (
    <aside className="flex w-full shrink-0 flex-col border-l bg-background lg:w-80" aria-label="Document tools">
      <div role="tablist" aria-label="Panels" className="flex border-b text-sm">
        {([["outline", "Outline"], ["block", "Block"]] as const).map(([v, l]) => (
          <button key={v} type="button" role="tab" id={`pb-tab-${v}`} aria-selected={panel === v} aria-controls={`pb-panel-${v}`} onClick={() => setPanel(v)} className={`flex-1 px-3 py-2 ${panel === v ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      <div role="tabpanel" id={`pb-panel-${panel}`} aria-labelledby={`pb-tab-${panel}`} className="min-h-0 flex-1 overflow-y-auto">
        {panel === "outline" ? <OutlinePanel editor={editor} /> : <Inspector editor={editor} defs={variables} readOnly={readOnly} />}
      </div>
    </aside>
  );

  return (
    <div className={`flex h-full min-h-0 flex-col bg-muted/30 ${className ?? ""}`} onKeyDownCapture={onKeyDown}>
      {!readOnly && (
        <Toolbar
          editor={editor} readOnly={readOnly || tab === "pdf"} canUpload={Boolean(props.uploadImage)} canComment={Boolean(comments?.onRequestComment)}
          resolved={resolved} onResolved={setResolved} onDialog={setDialog} onInsert={onInsert} onFind={(r) => setFind({ replace: r })}
          onImageFiles={(fl) => { const bad = Array.from(fl).map((f) => validateImageFile(f, props.maxImageBytes)).find(Boolean); if (bad) setNotice(bad); else void addFiles(Array.from(fl)); }}
          onComment={requestComment}
        />
      )}
      {find && <FindReplace editor={editor} readOnly={readOnly} showReplace={find.replace} onClose={() => { setFind(null); editor.commands.focus(); }} />}
      {canPreview && (
        <div role="tablist" aria-label="View" className="flex gap-1 border-b bg-background px-3 pt-1 text-sm">
          {([["edit", readOnly ? "Document" : "Edit"], ["pdf", "PDF preview"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => openTab(v)} className={`rounded-t-md px-3 py-1.5 ${tab === v ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>{l}</button>
          ))}
          {!wide && tab === "edit" && !readOnly && (
            <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" aria-label="Outline and block settings" aria-pressed={panelOpen} onClick={() => setPanelOpen((v) => !v)}><PanelRight /></Button>
          )}
        </div>
      )}
      {props.readOnlyReason && <p role="status" className="border-b bg-amber-50 px-3 py-2 text-sm text-amber-900">{props.readOnlyReason}</p>}
      {notice && (
        <div role="alert" className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{notice}</span>
          <button type="button" className="underline" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto" id="pb-scroll">
          {tab === "pdf" ? (
            <div className="h-full min-h-[60vh] p-3">
              {pdf.loading && <p role="status" className="p-4 text-sm text-muted-foreground">Making the PDF…</p>}
              {pdf.error && <p role="alert" className="p-4 text-sm text-destructive">{pdf.error}</p>}
              {pdf.url && <iframe title="PDF preview" src={pdf.url} className="h-full min-h-[70vh] w-full rounded-md border bg-white" />}
            </div>
          ) : (
            <PageView
              editor={editor} page={props.view?.page ?? base.page} header={props.view?.header ?? base.header} footer={props.view?.footer ?? base.footer} brand={brand} zone={zoneValues ?? {}}
              values={sampleValues} resolved={resolved} resolveImageUrl={props.resolveImageUrl} onPages={setPages}
            >
              <EditorContent editor={editor} />
            </PageView>
          )}
        </div>
        {!readOnly && tab === "edit" && (wide || panelOpen) && (wide ? sidebar : <div className="absolute inset-y-0 right-0 z-30 max-w-[90vw] shadow-xl">{sidebar}</div>)}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-background px-3 py-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
        <span className="inline-flex items-center gap-1.5">
          {st.icon === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : st.icon === "ok" ? <Check className="size-3.5" /> : st.icon === "off" ? <CloudOff className="size-3.5" /> : <AlertTriangle className="size-3.5 text-destructive" />}
          {st.text}
        </span>
        {(save.status === "error" || save.status === "invalid") && <button type="button" className="underline" onClick={() => void controller.flush()}>Try again</button>}
        <span>{counts?.words ?? 0} words</span>
        <span title="Page boundaries are estimates. Use the PDF preview for the exact layout.">About {pages} {pages === 1 ? "page" : "pages"} (A4)</span>
        {narrow && <span>Reading view. Open on a larger screen to edit.</span>}
        {save.status === "invalid" && save.issues && save.issues.length > 1 && <span>{save.issues.length} problems to fix</span>}
      </div>
      <ActionDialogs kind={dialog} editor={editor} defs={variables} onClose={() => { setDialog(null); editor.commands.focus(); }} />
      <ConflictDialog open={save.status === "conflict"} localText={() => { const d = controller.lastLocal ?? (() => { const s = snapshotOf(editor); return s.ok ? s.doc : null; })(); return d ? plainText(d) : editor.getText(); }} onReload={reload} />
    </div>
  );
}
