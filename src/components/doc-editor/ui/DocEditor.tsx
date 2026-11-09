"use client";

import "@/components/doc-editor/ui/doc-editor.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { AlertTriangle, ArrowLeft, Check, Cloud, CloudOff, History, ListTree, Loader2, Sparkles } from "lucide-react";
import { tabItemClass } from "@/components/platform/panel/PanelTabs";
import DocsMenuBar, { type MenuGroup } from "@/components/doc-editor/ui/DocsMenuBar";
import AiTextDialog, { type AiTextRequest } from "@/components/doc-editor/ui/AiTextDialog";
import { TEXT_ACTION_LABEL, type TextAction } from "@/lib/products/playbook-ai/ai/edit-types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatShortcut } from "@/components/doc-editor/core/shortcuts";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const panelKey = `pb-panel:${documentId}`;
  const [panel, setPanelState] = useState<"ai" | "block" | "versions">(() => { try { const v = sessionStorage.getItem(panelKey); return v === "block" ? "block" : v === "versions" ? "versions" : "ai"; } catch { return "ai"; } });
  const [rightOpen, setRightOpenState] = useState<boolean>(() => { try { return sessionStorage.getItem(`${panelKey}:open`) === "1"; } catch { return false; } });
  const setPanel = (v: "ai" | "block" | "versions") => { setPanelState(v); setRightOpenState(true); try { sessionStorage.setItem(panelKey, v); sessionStorage.setItem(`${panelKey}:open`, "1"); } catch { /* storage may be blocked */ } };
  const setRightOpen = (o: boolean) => { setRightOpenState(o); try { sessionStorage.setItem(`${panelKey}:open`, o ? "1" : "0"); } catch { /* storage may be blocked */ } };
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [zoom, setZoom] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [structure, setStructure] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [aiText, setAiText] = useState<AiTextRequest | null>(null);
  const [aiRange, setAiRange] = useState<{ from: number; to: number } | null>(null);
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [info, setInfo] = useState<"words" | "page" | "about" | "details" | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [titleMsg, setTitleMsg] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"edit" | "pdf">("edit");
  const [pages, setPages] = useState(1);
  const hl = useRef<{ items: { id: string; kind: string }[]; keep: boolean; timer: ReturnType<typeof setTimeout> | null }>({ items: [], keep: false, timer: null });
  const narrow = useMediaQuery("(max-width: 767px)");
  const wide = useMediaQuery("(min-width: 1024px)");
  const hostReadOnly = Boolean(props.readOnly) || narrow;
  const readOnly = hostReadOnly || viewing;

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
      attributes: { class: "pb-editor", role: "textbox", "aria-multiline": "true", "aria-label": "Document body", spellcheck: "false", lang: "en" },
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
    editor.view.dispatch(editor.state.tr.setMeta(viewKey, { mode: resolved ? "preview" : "template", values: sampleValues, labels: Object.fromEntries(variables.map((d) => [d.key, d.label])), commented: comments?.commentedBlockIds ?? new Set<string>() }).setMeta("addToHistory", false));
  }, [editor, resolved, sampleValues, variables, comments?.commentedBlockIds]);

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
      else if (s.id === "print") printPdf();
      else if (s.id === "shortcuts") setDialog("shortcuts");
      else if (s.id === "aiWrite" && !readOnly && props.aiTools) { setAiRange(editor ? { from: editor.state.selection.from, to: editor.state.selection.to } : null); setAiText({ action: "write", selected: "" }); }
      return;
    }
  };

  // Highlights of what the AI changed: scroll to the first changed block and mark each one for a few seconds (or until dismissed).
  const clearHighlights = useCallback(() => {
    const dom = editor?.view?.dom as HTMLElement | undefined;
    dom?.querySelectorAll(".pb-hl-added,.pb-hl-changed,.pb-hl-removed,.pb-hl-moved").forEach((el) => el.classList.remove("pb-hl-added", "pb-hl-changed", "pb-hl-removed", "pb-hl-moved", "pb-hl-keep"));
    if (hl.current.timer) { clearTimeout(hl.current.timer); hl.current.timer = null; }
  }, [editor]);
  const applyHighlights = useCallback((items: { id: string; kind: string }[], keep: boolean, jump?: string) => {
    const dom = editor?.view?.dom as HTMLElement | undefined;
    if (!dom) return;
    clearHighlights();
    hl.current.items = items; hl.current.keep = keep;
    let first: HTMLElement | null = null;
    for (const it of items) {
      const el = dom.querySelector<HTMLElement>(`[data-id="${CSS.escape(it.id)}"]`);
      if (!el) continue;
      el.classList.add(it.kind === "added" ? "pb-hl-added" : it.kind === "removed" ? "pb-hl-removed" : it.kind === "moved" ? "pb-hl-moved" : "pb-hl-changed");
      if (keep) el.classList.add("pb-hl-keep");
      if (!first || it.id === jump) first = el;
      if (jump && it.id === jump) break;
    }
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (!keep) hl.current.timer = setTimeout(clearHighlights, 6000);
  }, [editor, clearHighlights]);
  useEffect(() => {
    if (!editor) return;
    const key = `pb-highlight:${documentId}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        sessionStorage.removeItem(key);
        const v = JSON.parse(raw) as { items?: { id: string; kind: string }[]; keep?: boolean };
        if (Array.isArray(v.items) && v.items.length) setTimeout(() => applyHighlights(v.items!, v.keep === true), 400);
      }
    } catch { /* storage may be blocked */ }
    const onHl = (e: Event) => {
      const d = (e as CustomEvent<{ documentId: string; items?: { id: string; kind: string }[]; keep?: boolean; clear?: boolean; jump?: string }>).detail;
      if (!d || d.documentId !== documentId) return;
      if (d.clear) { clearHighlights(); return; }
      applyHighlights(d.items && d.items.length ? d.items : hl.current.items, d.keep === true, d.jump);
    };
    const onFlush = (e: Event) => {
      const d = (e as CustomEvent<{ documentId: string; waits: Promise<unknown>[] }>).detail;
      if (d && d.documentId === documentId && Array.isArray(d.waits)) d.waits.push(controller.flush());
    };
    window.addEventListener("pb-highlight", onHl);
    window.addEventListener("pb-flush", onFlush);
    return () => { window.removeEventListener("pb-highlight", onHl); window.removeEventListener("pb-flush", onFlush); };
  }, [editor, documentId, controller, applyHighlights, clearHighlights]);


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

  // ── Docs-style helpers: print, rename, AI text tools, scope, selection bubble, context menu ─────────────────────
  const printPdf = () => {
    if (!editor || !props.renderPreview) { setNotice("Print is not available for this document."); return; }
    const snap = snapshotOf(editor);
    if (!snap.ok) { setNotice(`The PDF needs a valid document: ${snap.issues[0]?.message ?? "fix the problem shown at the bottom"}.`); return; }
    const w = window.open("", "_blank");
    props.renderPreview(snap.doc).then((url) => { if (w) w.location.href = url; else window.open(url, "_blank"); }, (e: unknown) => { w?.close(); setNotice(e instanceof Error && e.message ? e.message : "The PDF could not be made."); });
  };

  const commitTitle = async () => {
    const d = props.docs;
    if (!d || titleDraft === null) return;
    const next = titleDraft.trim();
    setTitleDraft(null);
    if (!next || next === d.title || !d.onRename) return;
    const r = await d.onRename(next);
    setTitleMsg(r.ok ? null : r.message);
    if (!r.ok) setNotice(r.message);
  };

  const openAiPanel = useCallback((mode?: "edit" | "ask" | "review", text?: string) => {
    setPanel("ai");
    window.dispatchEvent(new CustomEvent("pb-ai-open", { detail: { documentId, mode, text } }));
  }, [documentId]);

  const startAiText = (action: TextAction) => {
    if (!editor || !props.aiTools) return;
    const { from, to } = editor.state.selection;
    setAiRange({ from, to });
    setAiText({ action, selected: action === "write" ? "" : editor.state.doc.textBetween(from, to, "\n") });
  };
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const acceptAiText = (text: string) => {
    if (!editor || !aiRange) { setAiText(null); return; }
    const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const html = parts.map((p) => {
      const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.length > 0 && lines.every((l) => /^[-*\u2022]\s+/.test(l)) ? `<ul>${lines.map((l) => `<li><p>${esc(l.replace(/^[-*\u2022]\s+/, ""))}</p></li>`).join("")}</ul>` : `<p>${esc(lines.join(" "))}</p>`;
    }).join("");
    editor.chain().focus().insertContentAt({ from: aiRange.from, to: aiRange.to }, html).run();
    setAiText(null);
  };

  // The AI panel asks the editor which blocks the selection or the current section covers.
  useEffect(() => {
    if (!editor) return;
    const onScope = (e: Event) => {
      const d = (e as CustomEvent<{ documentId: string; mode: "selection" | "section"; out: { ids: string[]; text: string } }>).detail;
      if (!d || d.documentId !== documentId) return;
      const doc = editor.state.doc;
      const { from, to } = editor.state.selection;
      const entries: { pos: number; end: number; id: string; heading: number }[] = [];
      doc.descendants((n, pos) => { const id = n.attrs?.id; if (id) entries.push({ pos, end: pos + n.nodeSize, id: String(id), heading: n.type.name === "heading" ? Number(n.attrs.level ?? 1) : 0 }); return true; });
      if (d.mode === "selection") {
        d.out.ids.push(...entries.filter((x) => x.end > from && x.pos < to).map((x) => x.id));
        d.out.text = doc.textBetween(from, to, "\n").slice(0, 200);
      } else {
        const heads = entries.filter((x) => x.heading > 0);
        const cur = [...heads].reverse().find((x) => x.pos <= from);
        if (!cur) return;
        const next = heads.find((x) => x.pos > cur.pos && x.heading <= cur.heading);
        const endPos = next ? next.pos : doc.content.size;
        d.out.ids.push(...entries.filter((x) => x.pos >= cur.pos && x.pos < endPos).map((x) => x.id));
        d.out.text = doc.nodeAt(cur.pos)?.textContent.slice(0, 80) ?? "";
      }
    };
    window.addEventListener("pb-scope", onScope);
    return () => window.removeEventListener("pb-scope", onScope);
  }, [editor, documentId]);

  // The floating AI button appears next to a text selection.
  useEffect(() => {
    if (!editor || !props.aiTools) return;
    const update = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || readOnly || !editor.isFocused && !bubbleHover.current) { if (!bubbleHover.current) setBubble(null); return; }
      if (editor.state.doc.textBetween(from, to, " ").trim().length < 2) { setBubble(null); return; }
      const c = editor.view.coordsAtPos(to);
      setBubble({ x: Math.min(c.left, window.innerWidth - 120), y: c.bottom + 6 });
    };
    editor.on("selectionUpdate", update);
    editor.on("blur", () => setTimeout(update, 150));
    return () => { editor.off("selectionUpdate", update); };
  }, [editor, props.aiTools, readOnly]);
  const bubbleHover = useRef(false);

  const exec = (cmd: "cut" | "copy") => { editor?.view.focus(); document.execCommand(cmd); };
  const pastePlain = () => { void navigator.clipboard.readText().then((t) => { if (t) editor?.chain().focus().insertContent(esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, " ")}</p>`).join("")).run(); }).catch(() => setNotice("Your browser did not allow reading the clipboard. Use Ctrl+Shift+V instead.")); };
  const fullscreen = () => { const el = shellRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); };
  const clearMarks = () => editor?.chain().focus().unsetAllMarks().run();

  const sc = (id: string) => formatShortcut(SHORTCUTS.find((x) => x.id === id)?.keys ?? "");
  const can = !readOnly;
  const menus: MenuGroup[] = editor ? [
    { label: "File", entries: [
      ...(props.docs?.fileItems ?? []).map((f) => ({ label: f.label, onSelect: f.onSelect, disabled: f.disabled, separatorBefore: f.separatorBefore })),
      { label: "Download as plain text (.txt)", onSelect: () => { const blob = new Blob([editor.getText({ blockSeparator: "\n\n" })], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${(props.docs?.title ?? "document").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "document"}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } },
      ...(props.versionsPanel ? [{ label: "Version history", onSelect: () => setPanel("versions"), separatorBefore: true }] : []),
      { label: "Page setup", onSelect: () => setInfo("page"), separatorBefore: !props.versionsPanel },
      ...(props.renderPreview ? [{ label: "Print", shortcut: sc("print"), onSelect: printPdf }] : []),
      { label: "Details", onSelect: () => setInfo("details"), separatorBefore: true },
    ] },
    { label: "Edit", entries: [
      { label: "Undo", shortcut: sc("undo"), disabled: !can, onSelect: () => editor.chain().focus().undo().run() },
      { label: "Redo", shortcut: sc("redo"), disabled: !can, onSelect: () => editor.chain().focus().redo().run() },
      { label: "Cut", shortcut: "Ctrl+X", disabled: !can, onSelect: () => exec("cut"), separatorBefore: true },
      { label: "Copy", shortcut: "Ctrl+C", onSelect: () => exec("copy") },
      { label: "Paste without formatting", shortcut: "Ctrl+Shift+V", disabled: !can, onSelect: pastePlain },
      { label: "Select all", shortcut: "Ctrl+A", onSelect: () => editor.chain().focus().selectAll().run(), separatorBefore: true },
      { label: "Find and replace", shortcut: sc("replace"), onSelect: () => setFind({ replace: true }), separatorBefore: true },
    ] },
    { label: "View", entries: [
      { label: "Mode", heading: true },
      { label: "Editing", checked: !viewing, disabled: hostReadOnly, onSelect: () => setViewing(false) },
      { label: "Viewing", checked: viewing, disabled: hostReadOnly, onSelect: () => setViewing(true) },
      { label: "Show structure (sections, locks, conditions)", checked: structure, onSelect: () => setStructure((v) => !v) },
      { label: "Show outline", checked: outlineOpen, onSelect: () => setOutlineOpen((v) => !v), separatorBefore: true },
      ...(props.aiPanel ? [{ label: "Show AI panel", checked: rightOpen && panel === "ai", onSelect: () => (rightOpen && panel === "ai" ? setRightOpen(false) : setPanel("ai")) }] : []),
      { label: "Zoom", heading: true },
      ...[0, 50, 75, 100, 125, 150, 200].map((z) => ({ label: z === 0 ? "Fit width" : `${z}%`, checked: zoom === z, onSelect: () => setZoom(z) })),
      ...(props.renderPreview ? [{ label: tab === "pdf" ? "Back to editing" : "PDF preview", onSelect: () => openTab(tab === "pdf" ? "edit" : "pdf"), separatorBefore: true }] : []),
      { label: "Full screen", onSelect: fullscreen, separatorBefore: !props.renderPreview },
    ] },
    { label: "Insert", entries: [
      { label: "Table…", disabled: !can, onSelect: () => setDialog("table") },
      ...(props.uploadImage ? [{ label: "Image", disabled: !can, onSelect: () => imageInput.current?.click() }] : []),
      { label: "Horizontal line", disabled: !can, onSelect: () => onInsert("divider") },
      { label: "Page break", shortcut: sc("pageBreak"), disabled: !can, onSelect: () => onInsert("pageBreak") },
      { label: "Table of contents", disabled: !can, onSelect: () => onInsert("toc") },
      { label: "Variable or fill-in field…", shortcut: sc("variable"), disabled: !can, onSelect: () => setDialog("variable"), separatorBefore: true },
      { label: "Signature block…", disabled: !can, onSelect: () => setDialog("signature") },
      { label: "Callout: information", disabled: !can, onSelect: () => onInsert("callout:info"), separatorBefore: true },
      { label: "Callout: warning", disabled: !can, onSelect: () => onInsert("callout:warning") },
      { label: "Callout: important", disabled: !can, onSelect: () => onInsert("callout:important") },
      ...(props.aiTools ? [{ label: "Help me write (AI)", shortcut: sc("aiWrite"), disabled: !can, onSelect: () => startAiText("write"), separatorBefore: true }] : []),
    ] },
    { label: "Format", entries: [
      { label: "Text", heading: true },
      { label: "Bold", shortcut: sc("bold"), disabled: !can, checked: editor.isActive("bold"), onSelect: () => editor.chain().focus().toggleBold().run() },
      { label: "Italic", shortcut: sc("italic"), disabled: !can, checked: editor.isActive("italic"), onSelect: () => editor.chain().focus().toggleItalic().run() },
      { label: "Underline", shortcut: sc("underline"), disabled: !can, checked: editor.isActive("underline"), onSelect: () => editor.chain().focus().toggleUnderline().run() },
      { label: "Strikethrough", shortcut: sc("strike"), disabled: !can, checked: editor.isActive("strike"), onSelect: () => editor.chain().focus().toggleStrike().run() },
      { label: "Superscript", shortcut: sc("superscript"), disabled: !can, onSelect: () => editor.chain().focus().toggleMark("superscript").run() },
      { label: "Subscript", shortcut: sc("subscript"), disabled: !can, onSelect: () => editor.chain().focus().toggleMark("subscript").run() },
      { label: "Paragraph styles", heading: true, separatorBefore: true },
      { label: "Normal text", shortcut: sc("paragraph"), disabled: !can, onSelect: () => setBlockType(editor, "paragraph") },
      ...[1, 2, 3, 4].map((n) => ({ label: `Heading ${n}`, shortcut: sc(`heading${n}`), disabled: !can, onSelect: () => setBlockType(editor, `heading${n}`) })),
      { label: "Numbered clause (legal numbering)", shortcut: sc("clause"), disabled: !can, onSelect: () => setBlockType(editor, "clause") },
      { label: "Align", heading: true, separatorBefore: true },
      ...(["left", "center", "right", "justify"] as const).map((a) => ({ label: a === "left" ? "Left" : a === "center" ? "Centre" : a === "right" ? "Right" : "Justify", shortcut: sc(a === "left" ? "alignLeft" : a === "center" ? "alignCenter" : a === "right" ? "alignRight" : "alignJustify"), disabled: !can, onSelect: () => editor.chain().focus().command(({ tr, state }) => { state.doc.nodesBetween(state.selection.from, state.selection.to, (n, pos) => { if (n.type.name === "paragraph" || n.type.name === "heading") tr.setNodeMarkup(pos, undefined, { ...n.attrs, align: a === "left" ? null : a }); return true; }); return true; }).run() })),
      { label: "Lists", heading: true, separatorBefore: true },
      { label: "Bulleted list", shortcut: sc("bulletList"), disabled: !can, onSelect: () => onInsert("bulletList") },
      { label: "Numbered list", shortcut: sc("orderedList"), disabled: !can, onSelect: () => onInsert("orderedList") },
      { label: "Clear formatting", disabled: !can, onSelect: clearMarks, separatorBefore: true },
    ] },
    { label: "Tools", entries: [
      ...(props.aiPanel ? [{ label: "AI Edit", onSelect: () => openAiPanel("edit") }, { label: "Proofread with AI", onSelect: () => openAiPanel("review") }, { label: "Ask AI about this document", onSelect: () => openAiPanel("ask") }] : []),
      { label: "Word count", onSelect: () => setInfo("words"), separatorBefore: Boolean(props.aiPanel) },
    ] },
    { label: "Help", entries: [
      { label: "Keyboard shortcuts", shortcut: sc("shortcuts"), onSelect: () => setDialog("shortcuts") },
      { label: "About this editor", onSelect: () => setInfo("about") },
    ] },
  ] : [];
  const imageInput = useRef<HTMLInputElement>(null);

  if (!editor) return <div className={className} aria-busy="true"><p className="p-6 text-sm text-muted-foreground">Loading the editor…</p></div>;

  const rightShown = rightOpen && (Boolean(props.aiPanel) || Boolean(props.versionsPanel) || !hostReadOnly);
  const tabs: [("ai" | "block" | "versions"), string][] = [
    ...(props.aiPanel ? [["ai", "AI Edit"] as ["ai", string]] : []),
    ...(!hostReadOnly ? [["block", "Block"] as ["block", string]] : []),
    ...(props.versionsPanel ? [["versions", "Versions"] as ["versions", string]] : []),
  ];
  const shownPanel = tabs.some(([k]) => k === panel) ? panel : (tabs[0]?.[0] ?? "ai");
  const rightPanel = (
    <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm lg:w-[22rem]" aria-label="Side panel">
      <div role="tablist" aria-label="Panels" className="flex shrink-0 gap-1 border-b border-border/50 p-1.5">
        {tabs.map(([v, l]) => (
          <button key={v} type="button" role="tab" id={`pb-tab-${v}`} aria-selected={shownPanel === v} aria-controls={`pb-panel-${v}`} onClick={() => setPanel(v)} className={`${tabItemClass(shownPanel === v)} flex-1 px-2 py-1.5 text-xs`}>{v === "ai" && <Sparkles className="size-3.5" />}{l}</button>
        ))}
      </div>
      {shownPanel === "block" && <div role="tabpanel" id="pb-panel-block" aria-labelledby="pb-tab-block" className="min-h-0 flex-1 overflow-y-auto"><Inspector editor={editor} defs={variables} readOnly={readOnly} /></div>}
      {props.versionsPanel && <div role="tabpanel" id="pb-panel-versions" aria-labelledby="pb-tab-versions" className={shownPanel === "versions" ? "min-h-0 flex-1 overflow-y-auto p-2" : "hidden"}>{props.versionsPanel}</div>}
      {props.aiPanel && <div role="tabpanel" id="pb-panel-ai" aria-labelledby="pb-tab-ai" className={shownPanel === "ai" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>{props.aiPanel}</div>}
    </aside>
  );
  const outlineAside = (
    <aside className="flex min-h-0 w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm" aria-label="Document outline">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><ListTree className="size-3.5" /> Outline</div>
      <div className="min-h-0 flex-1 overflow-y-auto"><OutlinePanel editor={editor} /></div>
    </aside>
  );
  const d = props.docs;
  const wordsN = counts?.words ?? 0;
  const charsN = editor.state.doc.textContent.length;

  return (
    <div ref={shellRef} className={`pb-editor-shell flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm ${className ?? ""}`} onKeyDownCapture={onKeyDown} onContextMenu={(e) => { if (!readOnly && (e.target as HTMLElement).closest?.(".pb-editor")) { e.preventDefault(); setCtx({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 200) }); } }} onClick={() => ctx && setCtx(null)}>
      {d && (
        <div className="shrink-0 border-b border-border/50 bg-card px-3 pt-2 pb-1">
          <div className="flex items-center gap-2">
            <a href={d.backHref} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={d.backLabel} title={d.backLabel}><ArrowLeft className="size-4" /></a>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  aria-label="Document title" title={d.title} autoComplete="off" spellCheck={false} maxLength={200} disabled={!d.onRename || hostReadOnly}
                  value={titleDraft ?? d.title} onFocus={(e) => { setTitleDraft(d.title); e.currentTarget.select(); }} onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => void commitTitle()} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") { setTitleDraft(null); e.currentTarget.blur(); } }}
                  className="h-8 min-w-0 max-w-[28rem] flex-1 truncate rounded-md border border-transparent bg-transparent px-1.5 text-base font-semibold outline-none hover:border-border focus:border-primary focus:bg-background"
                />
                {d.chips && <span className="hidden shrink-0 items-center gap-1.5 sm:flex">{d.chips}</span>}
              </div>
              <DocsMenuBar groups={menus} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:inline-flex" role="status" aria-live="polite" title={st.text}>
                {st.icon === "busy" ? <Loader2 className="size-4 animate-spin" /> : st.icon === "ok" ? <Cloud className="size-4" /> : <CloudOff className="size-4 text-destructive" />}{st.text}
              </span>
              {props.versionsPanel && <Button type="button" size="icon-sm" variant="ghost" aria-label="Version history" title="Version history" onClick={() => setPanel("versions")}><History className="size-4" /></Button>}
              {props.aiPanel && <Button type="button" size="sm" variant="outline" onClick={() => openAiPanel("edit")} title="AI Edit"><Sparkles className="size-4 text-primary" /><span className="max-sm:hidden">AI Edit</span></Button>}
              {d.primary}
              {d.userLabel && <span className="ml-1 inline-flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground" title={d.userLabel} aria-label={d.userLabel}>{d.userLabel.trim().slice(0, 1).toUpperCase()}</span>}
            </div>
          </div>
        </div>
      )}
      <Toolbar
        editor={editor} readOnly={readOnly || tab === "pdf"} canUpload={Boolean(props.uploadImage)} canComment={Boolean(comments?.onRequestComment)}
        resolved={resolved} onResolved={setResolved} onDialog={setDialog} onInsert={onInsert} onFind={(r) => setFind({ replace: r })}
        onImageFiles={(fl) => { const bad = Array.from(fl).map((f) => validateImageFile(f, props.maxImageBytes)).find(Boolean); if (bad) setNotice(bad); else void addFiles(Array.from(fl)); }}
        onComment={requestComment} onAi={props.aiPanel ? () => openAiPanel("edit") : undefined} onPrint={props.renderPreview ? printPdf : undefined}
        zoom={zoom} onZoom={setZoom} viewing={viewing} modeLocked={hostReadOnly} onMode={setViewing}
      />
      <input ref={imageInput} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => { const fl = e.target.files; if (fl) { const bad = Array.from(fl).map((f) => validateImageFile(f, props.maxImageBytes)).find(Boolean); if (bad) setNotice(bad); else void addFiles(Array.from(fl)); } e.target.value = ""; }} />
      {find && <FindReplace editor={editor} readOnly={readOnly} showReplace={find.replace} onClose={() => { setFind(null); editor.commands.focus(); }} />}
      {props.readOnlyReason && <p role="status" className="shrink-0 border-b bg-amber-50 px-3 py-2 text-sm text-amber-900">{props.readOnlyReason}</p>}
      {tab === "pdf" && <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs"><span className="font-medium">PDF preview</span><Button type="button" size="sm" variant="outline" onClick={() => openTab("edit")}>Back to editing</Button></div>}
      {notice && (
        <div role="alert" className="flex shrink-0 items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{notice}</span>
          <button type="button" className="underline" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 gap-3 bg-muted/40 p-3 max-sm:p-0">
        {tab === "edit" && outlineOpen && wide && outlineAside}
        <div
          className={`min-w-0 flex-1 rounded-xl ${tab === "pdf" ? "overflow-hidden" : "overflow-y-auto"}`} id="pb-scroll"
          onWheel={(e) => { if ((e.ctrlKey || e.metaKey) && tab === "edit") { e.preventDefault(); const steps = [50, 75, 100, 125, 150, 200]; const cur = zoom || 100; const idx = steps.findIndex((z) => z >= cur); const next = e.deltaY < 0 ? steps[Math.min((idx < 0 ? steps.length - 1 : idx) + 1, steps.length - 1)] : steps[Math.max((idx < 0 ? steps.length - 1 : idx) - 1, 0)]; setZoom(next); } }}
        >
          {tab === "pdf" ? (
            <div className="h-full">
              {pdf.loading && <p role="status" className="p-4 text-sm text-muted-foreground">Making the PDF…</p>}
              {pdf.error && <p role="alert" className="p-4 text-sm text-destructive">{pdf.error}</p>}
              {pdf.url && <iframe title="PDF preview" src={pdf.url} className="h-full w-full rounded-xl border border-border/50 bg-white" />}
            </div>
          ) : (
            <PageView
              editor={editor} page={props.view?.page ?? base.page} header={props.view?.header ?? base.header} footer={props.view?.footer ?? base.footer} brand={brand} zone={zoneValues ?? {}}
              values={sampleValues} resolved={resolved} resolveImageUrl={props.resolveImageUrl} onPages={setPages} onCurrentPage={setCurrentPage} layout={props.view?.layout} brandHref={props.brandHref} logoUrl={props.logoUrl} structure={structure} zoom={zoom}
            >
              <EditorContent editor={editor} />
            </PageView>
          )}
        </div>
        {tab === "edit" && rightShown && (wide ? rightPanel : <div className="absolute inset-y-2 right-2 z-30 flex max-w-[90vw] shadow-xl">{rightPanel}</div>)}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/50 bg-card px-3 py-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
        <button type="button" className="rounded-full border border-border/60 px-2.5 py-0.5 font-medium text-foreground hover:bg-muted" onClick={() => setInfo("words")} title="Word count">{wordsN} words</button>
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <span aria-hidden className={`size-2 rounded-full ${st.icon === "ok" ? "bg-emerald-500" : st.icon === "busy" ? "animate-pulse bg-amber-500" : "bg-destructive"}`} />
          {st.text}
        </span>
        {(save.status === "error" || save.status === "invalid") && <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => void controller.flush()}>Try again</button>}
        <span title="Sheets are laid out from the real text heights, the same way as the PDF. Fonts in the PDF can differ by a line, so check the PDF preview before sending.">Page {Math.min(currentPage, pages)} of {pages} (A4)</span>
        {titleMsg && <span className="text-destructive">{titleMsg}</span>}
        {narrow && <span>Reading view. Open on a larger screen to edit.</span>}
        {save.status === "invalid" && save.issues && save.issues.length > 1 && <span>{save.issues.length} problems to fix</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {!hostReadOnly && !viewing && <Button type="button" size="sm" variant="outline" disabled={save.status === "saving"} onClick={() => void controller.flush()} title="Save now (Ctrl+S)">{save.status === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save</Button>}
          {!hostReadOnly && !viewing && props.versionHref && <Button type="button" size="sm" variant="secondary" onClick={() => { const href = props.versionHref as string; void controller.flush().then(() => window.location.assign(href)); }} title="Save the draft, then name a version">Save as version</Button>}
        </span>
      </div>

      {bubble && props.aiTools && !readOnly && (
        <div className="fixed z-50" style={{ left: bubble.x, top: bubble.y }} onMouseEnter={() => { bubbleHover.current = true; }} onMouseLeave={() => { bubbleHover.current = false; }}>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" size="sm" className="rounded-full shadow-lg" onMouseDown={(e) => e.preventDefault()} />}><Sparkles className="size-3.5" /> AI</DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {(["rewrite", "shorten", "expand", "simplify", "formal", "friendly", "fix", "bullets", "summarise", "custom"] as TextAction[]).map((a) => <DropdownMenuItem key={a} onClick={() => startAiText(a)}>{TEXT_ACTION_LABEL[a]}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {ctx && (
        <div className="fixed z-50 w-52 rounded-lg border bg-popover p-1 text-sm shadow-lg" style={{ left: ctx.x, top: ctx.y }} role="menu">
          {[
            { label: "Cut", on: () => exec("cut"), hint: "Ctrl+X" }, { label: "Copy", on: () => exec("copy"), hint: "Ctrl+C" }, { label: "Paste without formatting", on: pastePlain, hint: "Ctrl+Shift+V" },
            { label: "Insert link", on: () => setDialog("link"), hint: sc("link") },
            ...(props.aiTools ? [{ label: "Ask AI to rewrite", on: () => startAiText("rewrite"), hint: "" }] : []),
          ].map((m) => <button key={m.label} type="button" role="menuitem" onClick={() => { setCtx(null); m.on(); }} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted"><span>{m.label}</span><span className="text-xs text-muted-foreground">{m.hint}</span></button>)}
        </div>
      )}
      {props.aiTools && <AiTextDialog request={aiText} tools={props.aiTools} onAccept={acceptAiText} onClose={() => setAiText(null)} />}

      <Dialog open={info !== null} onOpenChange={(o) => { if (!o) setInfo(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{info === "words" ? "Word count" : info === "page" ? "Page setup" : info === "details" ? "Details" : "About this editor"}</DialogTitle></DialogHeader>
          {info === "words" && <dl className="grid grid-cols-2 gap-1 text-sm"><dt>Words</dt><dd>{wordsN}</dd><dt>Characters</dt><dd>{charsN}</dd><dt>Pages</dt><dd>{pages}</dd></dl>}
          {info === "page" && <div className="space-y-2 text-sm"><p>A4, portrait. Margins (mm): top {base.page.margins.top}, bottom {base.page.margins.bottom}, left {base.page.margins.left}, right {base.page.margins.right}.</p><p className="text-muted-foreground">Margins, header and footer are your company letterhead and are changed in Brand &amp; Letterhead, so every document stays consistent.</p></div>}
          {info === "details" && <ul className="space-y-1 text-sm">{(d?.details ?? []).map((x, i) => <li key={i}>{x}</li>)}{!d?.details?.length && <li className="text-muted-foreground">No details to show.</li>}</ul>}
          {info === "about" && <p className="text-sm text-muted-foreground">Works like Google Docs, with the formatting your PDF and Word files can show. Fonts and colours come from your brand.</p>}
        </DialogContent>
      </Dialog>
      <ActionDialogs kind={dialog} editor={editor} defs={variables} onClose={() => { setDialog(null); editor.commands.focus(); }} />
      <ConflictDialog open={save.status === "conflict"} localText={() => { const dd = controller.lastLocal ?? (() => { const sn = snapshotOf(editor); return sn.ok ? sn.doc : null; })(); return dd ? plainText(dd) : editor.getText(); }} onReload={reload} />
    </div>
  );
}
