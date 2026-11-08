"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FileText, Loader2, MonitorUp, Paperclip, RotateCcw, Send, Sparkles, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { usePanelMeta } from "@/components/platform/PanelsProvider";
import { Markdown } from "@/components/chat/Markdown";
import { FALLBACK, QUICK, STRINGS, UI_LANGS, initialUiLang, saveUiLang, type UiLang } from "@/components/platform/askai/i18n";
import ApprovalCard from "@/components/platform/askai/ApprovalCard";
import { captureScreen, MAX_FILES, MAX_TOTAL_BYTES, pickFile, totalBytes, type Picked } from "@/components/platform/askai/files";
import type { AgentResponse, Proposal } from "@/lib/ai/agent/types";

export interface AskAiDrawerProps {
  open: boolean;
  onClose: () => void;
  panelId: string;
  panelTitle: string;
  panelDescription: string;
  roles?: string[];
  permissionOverrides?: Record<string, boolean>;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Files sent with this message (data is only kept in memory, never saved to the tab's storage). */
  files?: Picked[];
  steps?: { label: string; ok: boolean }[];
  choices?: string[];
  proposal?: Proposal & { state?: "open" | "approved" | "rejected" };
  error?: boolean;
}

const KEY = (p: string) => `askai:agent:${p}`;
function readStored(panelId: string): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY(panelId));
    return raw ? (JSON.parse(raw) as ChatMsg[]).map((m) => ({ ...m, files: undefined })) : [];
  } catch {
    return [];
  }
}
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

/** Ask AI: a real agent for this product. Reads the company's data, understands screenshots and files, and changes things only after the person approves. */
export default function AskAiDrawer({ open, onClose, panelId, panelTitle, panelDescription }: AskAiDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const registry = usePanelMeta(panelId);
  const title = registry?.name ?? panelTitle;
  const description = registry?.description ?? panelDescription;

  // False while rendering on the server, true in the browser (the drawer is a portal, so it only exists there).
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [messages, setMessages] = useState<ChatMsg[]>(() => readStored(panelId));
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uiLang, setUiLang] = useState<UiLang>(initialUiLang);
  const T = STRINGS[uiLang];
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!mounted) return;
    try { sessionStorage.setItem(KEY(panelId), JSON.stringify(messages.slice(-30).map((m) => ({ ...m, files: m.files?.map((f) => ({ ...f, data: "", thumb: f.thumb })) })))); } catch { /* storage full or unavailable */ }
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy, mounted, panelId]);

  const addFiles = useCallback(async (list: File[] | Picked[]) => {
    for (const f of list) {
      try {
        const picked = "kind" in f ? (f as Picked) : await pickFile(f as File);
        setFiles((cur) => {
          if (cur.length >= MAX_FILES) { toast.error(`You can attach up to ${MAX_FILES} files at a time.`); return cur; }
          if (totalBytes([...cur, picked]) > MAX_TOTAL_BYTES) { toast.error("These files are too large together. Attach fewer or smaller ones."); return cur; }
          return [...cur, picked];
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That file couldn't be attached.");
      }
    }
  }, []);

  async function call(body: Record<string, unknown>): Promise<AgentResponse & { error?: string; attachmentErrors?: string[] }> {
    const res = await fetch("/api/ai/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ panel: panelId, page: pathname, autoApprove, ...body }) });
    const json = (await res.json().catch(() => null)) as (AgentResponse & { error?: string; attachmentErrors?: string[] }) | null;
    if (!res.ok || !json) throw new Error(json?.error ?? "Something went wrong. Please try again.");
    return json;
  }

  function land(base: ChatMsg[], out: AgentResponse & { attachmentErrors?: string[] }) {
    const reply: ChatMsg = { id: uid(), role: "assistant", content: out.reply + (out.attachmentErrors?.length ? `\n\n_Couldn't read: ${out.attachmentErrors.join("; ")}_` : ""), steps: out.steps, choices: out.choices, proposal: out.proposal?.calls.length ? { ...out.proposal, state: "open" } : undefined };
    setMessages([...base, reply]);
    if (out.changed) router.refresh();
  }

  async function send(raw?: string) {
    const content = (raw ?? text).trim();
    if ((!content && !files.length) || busy) return;
    const closedOld = messages.map((m) => (m.proposal?.state === "open" ? { ...m, proposal: { ...m.proposal, state: "rejected" as const } } : m));
    const mine: ChatMsg = { id: uid(), role: "user", content: content || "(see attached)", files: files.length ? files : undefined };
    const next = [...closedOld, mine];
    setMessages(next);
    setText("");
    setFiles([]);
    setBusy(true);
    try {
      const out = await call({ action: "chat", messages: next.map((m) => ({ role: m.role, content: m.content, attachments: m.files?.map((f) => ({ name: f.name, mime: f.mime, kind: f.kind, data: f.data })) })) });
      land(next, out);
    } catch (e) {
      setMessages([...next, { id: uid(), role: "assistant", content: e instanceof Error ? e.message : "I couldn't reach the server. Check your connection and try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  async function decide(msgId: string, proposalId: string, decision: "approve" | "reject", confirmed: boolean) {
    if (busy) return;
    const marked = messages.map((m) => (m.id === msgId && m.proposal ? { ...m, proposal: { ...m.proposal, state: decision === "approve" ? ("approved" as const) : ("rejected" as const) } } : m));
    setMessages(marked);
    setBusy(true);
    try {
      const out = await call({ action: "decide", proposalId, decision, confirmed });
      land(marked, out);
    } catch (e) {
      setMessages([...marked, { id: uid(), role: "assistant", content: e instanceof Error ? e.message : "That didn't go through. Please try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([]);
    setFiles([]);
    setText("");
    try { sessionStorage.removeItem(KEY(panelId)); } catch { /* ignore */ }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) { e.preventDefault(); void addFiles(imgs); }
  };

  if (!mounted) return null;
  const quick = (QUICK[panelId] ?? FALLBACK)[uiLang];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.aside
          key="ask-ai-drawer"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="fixed inset-y-0 right-0 z-[1000] flex h-full w-full flex-col border-l border-border/80 bg-background shadow-2xl sm:w-[480px]"
          aria-label="Ask AI"
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(Array.from(e.dataTransfer.files)); }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-accent text-white"><Sparkles className="size-4" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{title} · AI agent</p>
                <p className="truncate text-[11px] text-muted-foreground">{description || "Ask, attach a screenshot, or tell me what to do."}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div role="group" aria-label={T.languageLabel} className="mr-1 flex overflow-hidden rounded-lg border border-border/70 text-[11px] font-semibold">{UI_LANGS.map((l) => <button key={l.key} type="button" onClick={() => { setUiLang(l.key); saveUiLang(l.key); }} aria-pressed={uiLang === l.key} className={`px-2 py-1 ${uiLang === l.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{l.label}</button>)}</div>
              <button type="button" onClick={reset} title={T.newChat} aria-label={T.newChat} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><RotateCcw className="size-3.5" /></button>
              <button type="button" onClick={onClose} aria-label={T.close} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
            </div>
          </div>

          <div ref={scroller} className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {dragging && <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 text-sm font-semibold text-primary">{T.drop}</div>}
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{T.intro}</p>
                <div className="flex flex-col gap-2">
                  {quick.map((q) => <button key={q} type="button" onClick={() => void send(q)} className="rounded-xl border border-border/70 px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-primary/5">{q}</button>)}
                </div>
                <p className="text-xs text-muted-foreground">{T.tip}</p>
              </div>
            )}
            {messages.map((m, idx) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[92%] space-y-2 rounded-2xl px-3.5 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : m.error ? "border border-destructive/40 bg-destructive/5 text-foreground" : "bg-muted/60 text-foreground"}`}>
                  {m.error && <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive"><TriangleAlert className="size-3.5" />{T.couldntFinish}</p>}
                  {m.files && m.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.files.map((f, i) => f.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={f.thumb} alt={f.name} className="size-14 rounded-lg object-cover ring-1 ring-white/30" />
                      ) : <span key={i} className="inline-flex items-center gap-1 rounded-md bg-black/10 px-2 py-1 text-xs"><FileText className="size-3" />{f.name}</span>)}
                    </div>
                  )}
                  {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : <Markdown content={m.content} />}
                  {m.steps && m.steps.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5 pt-0.5">
                      {m.steps.map((s, i) => <li key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}>{s.ok ? <Check className="size-3" /> : <X className="size-3" />}{s.label}</li>)}
                    </ul>
                  )}
                  {m.proposal?.state === "open" && idx === messages.length - 1 && (
                    <ApprovalCard lang={uiLang} proposal={m.proposal} busy={busy} autoApprove={autoApprove} onAutoApprove={setAutoApprove} onDecide={(d, o) => void decide(m.id, m.proposal!.id, d, o.confirmed)} />
                  )}
                  {m.proposal && m.proposal.state !== "open" && <p className="text-xs text-muted-foreground">{m.proposal.state === "approved" ? T.approved : T.notApproved}</p>}
                  {m.choices && m.choices.length > 0 && idx === messages.length - 1 && !busy && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {m.choices.map((c) => <button key={c} type="button" onClick={() => void send(c)} className="rounded-full border border-primary/40 bg-background px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10">{c}</button>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{T.working}</div>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="shrink-0 space-y-2 border-t border-border/60 p-3">
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span key={i} className="group relative inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 py-1 pl-1 pr-2 text-xs">
                    {f.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.thumb} alt="" className="size-8 rounded object-cover" />
                    ) : <FileText className="ml-1 size-4 text-muted-foreground" />}
                    <span className="max-w-[8rem] truncate">{f.name}</span>
                    <button type="button" aria-label={`${T.remove} ${f.name}`} onClick={() => setFiles(files.filter((_, n) => n !== i))} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-background p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <input ref={fileInput} type="file" multiple hidden accept="image/*,.pdf,.xlsx,.docx,.txt,.csv,.json,.md,.tsv" onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              <button type="button" onClick={() => fileInput.current?.click()} title={T.attach} aria-label={T.attach} className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"><Paperclip className="size-4" /></button>
              <button type="button" onClick={() => void captureScreen().then((p) => addFiles([p])).catch((e) => { if (e instanceof Error && !/denied|abort|cancel/i.test(e.message)) toast.error(e.message); })} title={T.capture} aria-label={T.capture} className="hidden size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"><MonitorUp className="size-4" /></button>
              <textarea
                ref={textarea}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={onPaste}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                rows={1}
                placeholder={T.placeholder}
                aria-label={T.message}
                className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                style={{ outline: "none" }}
              />
              <button type="submit" disabled={busy || (!text.trim() && !files.length)} aria-label={T.send} className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><Send className="size-4" /></button>
            </div>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}
