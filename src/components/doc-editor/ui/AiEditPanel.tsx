"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, Send, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiEditApi, ChatChange, ChatTurn, ReviewIssue } from "@/lib/products/playbook-ai/ai/edit-types";

/**
 * The "Edit with AI" chat in the editor's right-hand panel (third tab). Product-neutral: the host passes an `AiEditApi` (server actions).
 *
 * Attachments: paperclip, paste (Ctrl+V of an image) and drag and drop; images (PNG, JPEG, WebP), PDF, DOCX, TXT, MD, CSV; at most five files,
 * 10 MB for images and PDFs, 5 MB for the others. The server checks the real content again.
 *
 * Live visibility: before a message is sent the editor is asked to save what the person typed (`pb-flush`). When a turn changes the document
 * the changed blocks are handed to the editor (`pb-highlight` and sessionStorage, because the editor reloads its content), which scrolls to
 * and highlights them. "Show changes" keeps the highlights until switched off; clicking a change jumps to its block.
 */
const MAX_FILES = 5;
const MAX_BIG = 10 * 1024 * 1024;
const MAX_SMALL = 5 * 1024 * 1024;
const MAX_TOTAL = 15 * 1024 * 1024;
const EXT_OK = /\.(png|jpe?g|webp|pdf|docx|txt|md|csv)$/i;
const isBig = (f: File) => /\.(png|jpe?g|webp|pdf)$/i.test(f.name) || /^image\//.test(f.type) || f.type === "application/pdf";
const PHASES = ["Reading the document…", "Reading the attachments…", "Working out the changes…", "Checking every value…", "Saving a new version…"];

function checkFile(f: File): string | null {
  if (!EXT_OK.test(f.name)) return `${f.name || "That file"} is not an accepted type. Use PNG, JPEG, WebP, PDF, DOCX, TXT, MD or CSV.`;
  if (f.size === 0) return `${f.name} is empty.`;
  if (f.size > (isBig(f) ? MAX_BIG : MAX_SMALL)) return `${f.name} is too large (10 MB for images and PDFs, 5 MB for other files).`;
  return null;
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const KIND_LABEL: Record<string, string> = { added: "Added", removed: "Removed", changed: "Changed", moved: "Moved" };

type Mode = "edit" | "ask" | "review";
type Scope = "document" | "section" | "selection";
const CHIPS: Record<string, string[]> = {
  sop: ["Add an exceptions section", "Add a RACI table", "Tighten the procedure steps"],
  kpi: ["Add a rating scale", "Balance the weightages to 100", "Add an improvement plan section"],
  document: ["Add a confidentiality clause as a placeholder for legal review", "Summarise the obligations", "Simplify the language"],
};
const CATEGORY_LABEL: Record<ReviewIssue["category"], string> = { grammar: "Grammar", clarity: "Clarity", terminology: "Terms", missing_section: "Missing section", placeholder: "Placeholder", legal_risk: "Risky wording" };
const localTurn = (role: "user" | "assistant", text: string): ChatTurn => ({ id: `local-${Math.random().toString(36).slice(2)}`, role, text, at: new Date().toISOString(), versionNumber: null, previousVersionNumber: null, changes: null, undone: false });

export default function AiEditPanel({ api, onApplied, documentId, kind = "document" }: { api: AiEditApi; onApplied: () => void; documentId: string; kind?: string }) {
  const [mode, setMode] = useState<Mode>("edit");
  const [applyMode, setApplyMode] = useState<"apply" | "suggest">("apply");
  const [scope, setScope] = useState<Scope>("document");
  const [scopeInfo, setScopeInfo] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, { blockId: string; quote: string }[]>>({});
  const [issues, setIssues] = useState<ReviewIssue[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [keep, setKeep] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; });

  useEffect(() => {
    let cancelled = false;
    void apiRef.current.load().then((r) => { if (cancelled) return; setLoading(false); if (r.ok) { setTurns(r.turns); setCanEdit(r.canEdit); setReason(r.reason); } else setError(r.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ documentId: string; mode?: Mode; text?: string }>).detail;
      if (!d || d.documentId !== documentId) return;
      if (d.mode) { if ((d.mode === "ask" && !apiRef.current.ask) || (d.mode === "review" && !apiRef.current.review)) return; setMode(d.mode); if (d.mode === "review") setTimeout(() => runReview(), 50); }
      if (d.text) setText(d.text);
    };
    window.addEventListener("pb-ai-open", onOpen);
    return () => window.removeEventListener("pb-ai-open", onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);
  useEffect(() => {
    if (scope === "document") { setScopeInfo(null); return; }
    const out = { ids: [] as string[], text: "" };
    window.dispatchEvent(new CustomEvent("pb-scope", { detail: { documentId, mode: scope, out } }));
    setScopeInfo(out.ids.length ? `Will only touch ${out.ids.length} block${out.ids.length === 1 ? "" : "s"}${out.text ? `: “${out.text.slice(0, 50)}”` : ""}` : scope === "selection" ? "Select some text in the document first." : "Put the cursor in a section first.");
  }, [scope, documentId, text]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns.length, phase]);
  // Thumbnails for image attachments (revoked when removed).
  useEffect(() => {
    const urls = files.map((f) => (/^image\//.test(f.type) ? URL.createObjectURL(f) : ""));
    setPreviews(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);
  // Phase messages while the server works (the server answers once, so these are the stages it goes through, shown in order).
  useEffect(() => {
    if (!busy) { setPhase(null); return; }
    let i = files.length ? 0 : 0;
    const list = files.length ? PHASES : PHASES.filter((_, k) => k !== 1);
    setPhase(list[0]);
    const t = setInterval(() => { i = Math.min(i + 1, list.length - 1); setPhase(list[i]); }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const next = [...files];
    for (const f of incoming) {
      const bad = checkFile(f);
      if (bad) { setError(bad); continue; }
      if (next.length >= MAX_FILES) { setError(`Attach at most ${MAX_FILES} files to one message.`); break; }
      if (next.reduce((a, x) => a + x.size, 0) + f.size > MAX_TOTAL) { setError("The attachments are too large together (15 MB at most)."); break; }
      next.push(f.name ? f : new File([f], `pasted-image-${Date.now()}.png`, { type: f.type || "image/png" }));
    }
    setFiles(next);
  }

  function highlight(items: { id: string; kind: string }[], keepOn: boolean, jump?: string) {
    window.dispatchEvent(new CustomEvent("pb-highlight", { detail: { documentId, items, keep: keepOn, jump } }));
  }

  function send() {
    const msg = text.trim();
    if (msg.length < 3 || busy) return;
    setError(null);
    start(async () => {
      // What the person typed in the editor is saved first, so the AI works on the current content and nothing is lost.
      const waits: Promise<unknown>[] = [];
      window.dispatchEvent(new CustomEvent("pb-flush", { detail: { documentId, waits } }));
      await Promise.allSettled(waits);
      const form = new FormData();
      form.set("message", msg);
      for (const f of files) form.append("files", f);
      if (mode === "ask" && api.ask) {
        const ar = await api.ask(form);
        if (!ar.ok) { setError(ar.message); return; }
        const u = localTurn("user", msg); const a = localTurn("assistant", ar.answer);
        setText(""); setFiles([]);
        setRefs((x) => ({ ...x, [a.id]: ar.references }));
        setTurns((t) => [...t, u, a]);
        return;
      }
      form.set("mode", applyMode);
      if (scope !== "document") {
        const out = { ids: [] as string[], text: "" };
        window.dispatchEvent(new CustomEvent("pb-scope", { detail: { documentId, mode: scope, out } }));
        if (!out.ids.length) { setError(scope === "selection" ? "Select some text in the document first, or widen the scope." : "Put the cursor in a section first, or widen the scope."); return; }
        form.set("scope", JSON.stringify(out.ids));
      }
      const r = await api.send(form);
      if (!r.ok) { setError(r.message); return; }
      setText(""); setFiles([]);
      setTurns((t) => [...t, r.user, r.reply]);
      if (r.reply.versionNumber !== null) {
        const items = (r.reply.changes ?? []).filter((c) => c.blockId).map((c) => ({ id: c.blockId as string, kind: c.kind }));
        try { sessionStorage.setItem(`pb-highlight:${documentId}`, JSON.stringify({ items, keep })); } catch { /* storage may be blocked */ }
        onApplied();
      }
    });
  }

  function undo(turn: ChatTurn) {
    setError(null);
    start(async () => {
      const waits: Promise<unknown>[] = [];
      window.dispatchEvent(new CustomEvent("pb-flush", { detail: { documentId, waits } }));
      await Promise.allSettled(waits);
      const r = await api.undo(turn.id);
      if (!r.ok) { setError(r.message); return; }
      setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, undone: true } : x)));
      const items = (turn.changes ?? []).filter((c) => c.blockId).map((c) => ({ id: c.blockId as string, kind: "changed" }));
      try { sessionStorage.setItem(`pb-highlight:${documentId}`, JSON.stringify({ items, keep })); } catch { /* storage may be blocked */ }
      onApplied();
    });
  }

  function runReview() {
    if (!apiRef.current.review) return;
    setError(null); setReviewing(true);
    void apiRef.current.review().then((r) => { setReviewing(false); if (r.ok) setIssues(r.issues); else setError(r.message); });
  }
  function jump(blockId: string | null) { if (blockId) highlight([{ id: blockId, kind: "changed" }], false, blockId); }
  function applyIssue(i: ReviewIssue) {
    if (!api.applyIssue) return;
    setError(null);
    start(async () => {
      const waits: Promise<unknown>[] = [];
      window.dispatchEvent(new CustomEvent("pb-flush", { detail: { documentId, waits } }));
      await Promise.allSettled(waits);
      const r = await api.applyIssue!({ blockId: i.blockId, replacement: i.replacement });
      if (!r.ok) { setError(r.message); return; }
      setIssues((x) => (x ? x.filter((y) => y.id !== i.id) : x));
      if (i.blockId) { try { sessionStorage.setItem(`pb-highlight:${documentId}`, JSON.stringify({ items: [{ id: i.blockId, kind: "changed" }], keep })); } catch { /* storage may be blocked */ } }
      onApplied();
    });
  }
  function applyAllIssues() {
    const list = (issues ?? []).filter((i) => i.blockId && i.replacement);
    if (!list.length || !api.applyIssue) return;
    setError(null);
    start(async () => {
      const waits: Promise<unknown>[] = [];
      window.dispatchEvent(new CustomEvent("pb-flush", { detail: { documentId, waits } }));
      await Promise.allSettled(waits);
      const done = new Set<string>();
      for (const i of list) { const r = await api.applyIssue!({ blockId: i.blockId, replacement: i.replacement }); if (!r.ok) { setError(r.message); break; } done.add(i.id); }
      setIssues((x) => (x ? x.filter((y) => !done.has(y.id)) : x));
      if (done.size) onApplied();
    });
  }
  function accept(turn: ChatTurn, indexes: number[]) {
    if (!api.accept) return;
    setError(null);
    start(async () => {
      const waits: Promise<unknown>[] = [];
      window.dispatchEvent(new CustomEvent("pb-flush", { detail: { documentId, waits } }));
      await Promise.allSettled(waits);
      const r = await api.accept!(turn.id, indexes);
      if (!r.ok) { setError(r.message); return; }
      setTurns((t) => t.map((x) => (x.id === turn.id ? r.reply : x)));
      const items = (r.reply.changes ?? []).filter((c) => c.blockId).map((c) => ({ id: c.blockId as string, kind: c.kind }));
      try { sessionStorage.setItem(`pb-highlight:${documentId}`, JSON.stringify({ items, keep })); } catch { /* storage may be blocked */ }
      onApplied();
    });
  }
  function reject(turn: ChatTurn) {
    if (!api.reject) return;
    start(async () => {
      const r = await api.reject!(turn.id);
      if (!r.ok) { setError(r.message); return; }
      setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, suggestions: x.suggestions?.map((s) => (s.state === "pending" ? { ...s, state: "rejected" as const } : s)) } : x)));
    });
  }

  const hasChanges = turns.some((t) => t.changes && t.changes.length > 0 && !t.undone);

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col ${drag ? "ring-2 ring-primary/50 ring-inset" : ""}`}
      onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { setDrag(false); if (canEdit && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}
    >
      <div className="shrink-0 space-y-1.5 border-b border-border/50 px-3 py-2">
        <div role="tablist" aria-label="AI mode" className="flex gap-1 text-xs">
          {([["edit", "Edit"], ...(api.ask ? [["ask", "Ask"]] : []), ...(api.review ? [["review", "Review"]] : [])] as [Mode, string][]).map(([m, l]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); if (m === "review" && issues === null) runReview(); }} className={`flex-1 rounded-md px-2 py-1 font-medium ${mode === m ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>{l}</button>
          ))}
        </div>
        {mode === "edit" && (
          <>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]" role="group" aria-label="Scope">
              {(["document", "section", "selection"] as Scope[]).map((sc) => (
                <button key={sc} type="button" onClick={() => setScope(sc)} aria-pressed={scope === sc} className={`rounded-full border px-2.5 py-0.5 font-medium ${scope === sc ? "border-primary/30 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted"}`}>{sc === "document" ? "Whole document" : sc === "section" ? "This section" : "Selection"}</button>
              ))}
              {api.accept && (
                <select aria-label="Apply changes" value={applyMode} onChange={(e) => setApplyMode(e.target.value as "apply" | "suggest")} className="ml-auto h-6 rounded-md border border-input bg-background px-1 text-[11px]">
                  <option value="apply">Apply automatically (undo)</option><option value="suggest">Suggest changes to review</option>
                </select>
              )}
            </div>
            {scopeInfo && <p className="text-[11px] text-muted-foreground">{scopeInfo}</p>}
          </>
        )}
      </div>
      {hasChanges && mode === "edit" && (
        <label className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
          <input type="checkbox" checked={keep} onChange={(e) => { setKeep(e.target.checked); window.dispatchEvent(new CustomEvent("pb-highlight", { detail: { documentId, keep: e.target.checked, clear: !e.target.checked } })); }} className="size-3.5 accent-[var(--primary)]" />
          Show changes in the document
        </label>
      )}
      <div className={mode === "review" ? "hidden" : "min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm"} role="log" aria-live="polite">
        {loading && <p className="text-muted-foreground" role="status">Loading…</p>}
        {!loading && turns.length === 0 && (
          <div className="space-y-3 py-2">
            <p className="text-muted-foreground">Tell the assistant what to change. You can attach screenshots, PDFs, Word and text files. Every change becomes a new version you can undo, and the changed blocks are highlighted in the document.</p>
            {canEdit && (
              <div className="flex flex-wrap gap-1.5">
                {(mode === "ask" ? ["What are the main obligations?", "Who is responsible for approval?", "What is missing from this document?"] : (CHIPS[kind] ?? CHIPS.document)).map((x) => (
                  <button key={x} type="button" onClick={() => setText(x)} className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary">{x}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} className={t.role === "user" ? "ml-8 rounded-2xl rounded-br-md bg-primary/10 px-3 py-2 text-foreground" : "mr-8 rounded-2xl rounded-bl-md border border-border/50 bg-muted/40 px-3 py-2"}>
            <p className="whitespace-pre-wrap">{t.text}</p>
            {t.attachments && t.attachments.length > 0 && <ul className="mt-1.5 flex flex-wrap gap-1">{t.attachments.map((a, i) => <li key={i} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px]"><FileText className="size-3" />{a.name} · {kb(a.size)}</li>)}</ul>}
            {t.steps && t.steps.length > 0 && <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">{t.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>}
            {refs[t.id] && refs[t.id].length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">{refs[t.id].map((r, i) => <li key={i}><button type="button" onClick={() => jump(r.blockId)} className="block w-full rounded-md border bg-background p-1.5 text-left hover:bg-muted/50" title="Show in the document">“{r.quote}”</button></li>)}</ul>
            )}
            {t.suggestions && t.suggestions.length > 0 && (
              <div className="mt-2 space-y-1.5 text-xs">
                {t.suggestions.map((sg) => (
                  <div key={sg.index} className="rounded-md border bg-background p-2">
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{sg.op === "insert" ? "Add" : sg.op === "delete" ? "Remove" : "Change"}{sg.state !== "pending" ? ` · ${sg.state}` : ""}</p>
                    {sg.before && <p className="text-red-700 line-through dark:text-red-300">{sg.before}</p>}
                    {sg.after && <p className="text-emerald-700 dark:text-emerald-300">{sg.after}</p>}
                    {sg.skipped && <p className="text-amber-700 dark:text-amber-400">{sg.skipped}</p>}
                    {sg.state === "pending" && !sg.skipped && <div className="mt-1.5 flex gap-1.5">{sg.blockId && <Button size="sm" variant="ghost" onClick={() => jump(sg.blockId)}>Show</Button>}<Button size="sm" disabled={busy} onClick={() => accept(t, [sg.index])}>Accept</Button></div>}
                  </div>
                ))}
                {t.suggestions.some((sg) => sg.state === "pending" && !sg.skipped) && (
                  <div className="flex gap-1.5"><Button size="sm" disabled={busy} onClick={() => accept(t, t.suggestions!.filter((sg) => sg.state === "pending" && !sg.skipped).map((sg) => sg.index))}>Accept all</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => reject(t)}>Reject all</Button></div>
                )}
              </div>
            )}
            {t.changes && t.changes.length > 0 && (
              <ul className="mt-2 space-y-1.5 text-xs">
                {t.changes.slice(0, 10).map((c: ChatChange, i) => (
                  <li key={i}>
                    <button type="button" disabled={!c.blockId || t.undone} onClick={() => c.blockId && highlight([{ id: c.blockId, kind: c.kind }], keep, c.blockId)} className="block w-full rounded-md border bg-background p-2 text-left hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-background" title={c.blockId ? "Show in the document" : undefined}>
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[c.kind] ?? c.kind}</span>
                      {c.before && <span className="block text-red-700 line-through dark:text-red-300">{c.before}</span>}
                      {c.after && <span className="block text-emerald-700 dark:text-emerald-300">{c.after}</span>}
                    </button>
                  </li>
                ))}
                {t.changes.length > 10 && <li className="text-muted-foreground">and {t.changes.length - 10} more changes (see the version history)</li>}
              </ul>
            )}
            {t.versionNumber !== null && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Version {t.versionNumber} · AI Edit · {new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                {t.undone ? <span>· undone</span> : canEdit && <Button size="sm" variant="outline" disabled={busy} onClick={() => undo(t)}><Undo2 className="size-3.5" /> Undo</Button>}
              </div>
            )}
          </div>
        ))}
        {phase && <p className="flex items-center gap-2 text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" /> {phase}</p>}
        <div ref={end} />
      </div>
      {mode === "review" && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={reviewing || busy} onClick={runReview}>{reviewing ? "Reviewing…" : issues ? "Review again" : "Proofread the document"}</Button>
            {issues && issues.some((i) => i.blockId && i.replacement) && canEdit && <Button size="sm" disabled={busy} onClick={applyAllIssues}>Apply all fixes</Button>}
          </div>
          {reviewing && <p className="flex items-center gap-2 text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" /> Reading the whole document…</p>}
          {issues && issues.length === 0 && <p className="text-muted-foreground">No problems found.</p>}
          {issues?.map((i) => (
            <div key={i.id} className="rounded-xl border bg-background p-2.5 text-xs">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{CATEGORY_LABEL[i.category]}</p>
              <p>{i.message}</p>
              {i.replacement && <p className="mt-1 rounded bg-emerald-500/10 p-1.5 text-emerald-800 dark:text-emerald-300">{i.replacement}</p>}
              <div className="mt-1.5 flex gap-1.5">
                {i.blockId && <Button size="sm" variant="ghost" onClick={() => jump(i.blockId)}>Show</Button>}
                {i.blockId && i.replacement && canEdit && <Button size="sm" disabled={busy} onClick={() => applyIssue(i)}>Apply</Button>}
                <Button size="sm" variant="outline" onClick={() => setIssues((x) => (x ? x.filter((y) => y.id !== i.id) : x))}>Dismiss</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mx-3 mb-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive" role="alert">{error}</p>}
      <div className={mode === "review" ? "hidden" : "shrink-0 border-t p-2"}>
        {!canEdit && !loading && mode !== "ask" ? <p className="text-xs text-muted-foreground">{reason ?? "AI edits are not available."}</p> : (
          <>
            {files.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-1.5 rounded-lg border bg-background py-1 pr-1 pl-1.5 text-[11px]">
                    {previews[i] ? <img src={previews[i]} alt="" className="size-7 rounded object-cover" /> : <FileText className="size-4 text-muted-foreground" />}
                    <span className="max-w-24 truncate">{f.name}</span><span className="text-muted-foreground">{kb(f.size)}</span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="rounded p-0.5 hover:bg-muted"><X className="size-3" /></button>
                  </li>
                ))}
              </ul>
            )}
            <form className="flex items-end gap-1 rounded-2xl border border-border/60 bg-background p-1.5 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.txt,.md,.csv" className="sr-only" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Attach files" title="Attach files (images, PDF, Word, text)" disabled={busy || files.length >= MAX_FILES} onClick={() => fileInput.current?.click()}><Paperclip className="size-4" /></Button>
              <textarea
                className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground" rows={2} placeholder={mode === "ask" ? "Ask about the document or an attached file…" : "What should change? Paste a screenshot or drop files here."} value={text} maxLength={1500} autoComplete="off"
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => { const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); addFiles(imgs); } }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Instruction"
              />
              <Button type="submit" size="icon-sm" aria-label="Send" title="Send (Enter)" disabled={busy || text.trim().length < 3}><Send className="size-4" /></Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
