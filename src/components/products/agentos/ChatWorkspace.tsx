"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUp,
  Check,
  CircleStop,
  Copy,
  FileText,
  History,
  LoaderCircle,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/chat/Markdown";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import ChatCallControls from "@/components/products/agentos/chat/ChatCallControls";
import ActionButton from "@/components/products/agentos/ActionButton";
import { AGENT_USED_EVENT } from "@/components/products/agentos/AibotsSidebar";
import { cn } from "@/lib/utils";
import { deleteChatAction, renameChatAction } from "@/app/(products)/agentos/(protected)/actions";
import { ATTACHMENT_EXTENSIONS, LIMITS, MAX_ATTACHMENTS_PER_MESSAGE, MAX_UPLOAD_BYTES } from "@/lib/products/agentos/constants";
import type { BotSummary } from "@/lib/products/agentos/bots";
import type { ChatListItem } from "@/lib/products/agentos/chats";

export interface WorkspaceMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments: string[];
  citations: string[];
  state?: "streaming" | "searching" | "stopped" | "error" | "incomplete";
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const uid = () => Math.random().toString(36).slice(2);

// ---------------------------------------------------------------------------
// Chat history (left column)
// ---------------------------------------------------------------------------

function ChatRow({ chat, href, active, canDelete }: { chat: ChatListItem; href: string; active: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const [pending, start] = useTransition();

  function save() {
    const next = title.trim();
    if (!next || next === chat.title) {
      setEditing(false);
      setTitle(chat.title);
      return;
    }
    start(async () => {
      const res = await renameChatAction(chat._id, next);
      if (!res.ok) toast.error(res.error);
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-primary/5 px-2 py-1.5">
        <input
          autoFocus
          value={title}
          maxLength={LIMITS.chatTitleMax}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setEditing(false);
              setTitle(chat.title);
            }
          }}
          aria-label="Chat title"
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <Button size="icon-xs" variant="ghost" onClick={save} disabled={pending} aria-label="Save title">
          {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("group relative flex items-center rounded-lg transition-colors", active ? "bg-gradient-to-r from-primary/15 to-secondary/10" : "hover:bg-primary/5")}>
      <Link href={href} className="min-w-0 flex-1 px-3 py-2" aria-current={active ? "page" : undefined}>
        <p className={cn("truncate text-sm", active ? "font-semibold text-primary" : "font-medium text-foreground")}>{chat.title}</p>
        <p className="text-[11px] text-muted-foreground">{relative(chat.lastMessageAt)}</p>
      </Link>
      <div className="absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button size="icon-xs" variant="ghost" onClick={() => setEditing(true)} aria-label={`Rename ${chat.title}`}>
          <Pencil className="size-3.5" />
        </Button>
        {canDelete && (
          <ActionButton
            variant="ghost"
            size="icon-xs"
            aria-label={`Delete ${chat.title}`}
            action={() => deleteChatAction(chat._id)}
            success="Chat deleted"
            redirectTo={active ? href.replace(/\/[^/]+$/, "") : undefined}
            confirm={{ title: "Delete this chat?", description: `“${chat.title}” and its OpenAI conversation will be permanently deleted.`, confirmLabel: "Delete" }}
          >
            <Trash2 className="size-3.5" />
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function ChatHistory({ botId, chats, activeId, onPick, onNewChat }: { botId: string; chats: ChatListItem[]; activeId: string | null; onPick?: () => void; onNewChat: (e: React.MouseEvent) => void }) {
  const [q, setQ] = useState("");
  const shown = q ? chats.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())) : chats;
  return (
    <div className="flex h-full min-h-0 flex-col" onClick={(e) => (e.target as HTMLElement).closest("a") && onPick?.()}>
      <div className="space-y-2 border-b border-border/60 p-3">
        <Button className="w-full" nativeButton={false} render={<Link href={`/agentos/b/${botId}`} onClick={onNewChat} />}>
          <MessageSquarePlus className="size-4" /> New chat
        </Button>
        <label className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground focus-within:border-primary/40">
          <Search className="size-3.5 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {!q && chats.length > 0 && <p className="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Recent chats</p>}
        {shown.map((c) => (
          <ChatRow key={`${c._id}:${c.title}`} chat={c} href={`/agentos/b/${botId}/${c._id}`} active={c._id === activeId} canDelete />
        ))}
        {chats.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No chats yet. Your conversations with this bot will appear here.</p>}
        {q && shown.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No chat matches “{q}”.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Copy response"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Couldn't copy to the clipboard.");
        }
      }}
    >
      {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function MessageRow({ m, bot, isLast, busy, onRegenerate, readOnly, ownerLabel }: { m: WorkspaceMessage; bot: BotSummary; isLast: boolean; busy: boolean; onRegenerate: () => void; readOnly: boolean; ownerLabel: string }) {
  const mine = m.role === "user";
  return (
    <div className={cn("group flex gap-3 px-4 py-2 sm:px-6", mine && "flex-row-reverse")}>
      {mine ? (
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{ownerLabel.slice(0, 1).toUpperCase()}</div>
      ) : (
        <BotAvatar icon={bot.icon} color={bot.color} imageUrl={bot.avatarUrl} className="mt-0.5 size-8 rounded-full" />
      )}
      <div className={cn("min-w-0", mine ? "flex max-w-[85%] flex-col items-end sm:max-w-[75%]" : "flex-1")}>
        <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{mine ? ownerLabel : bot.name}</p>
        {m.attachments.length > 0 && (
          <div className={cn("mb-1 flex flex-wrap gap-1.5", mine && "justify-end")}>
            {m.attachments.map((a, i) => (
              <span key={i} className="lms-chip max-w-[240px]">
                <FileText className="size-3" />
                <span className="truncate">{a}</span>
              </span>
            ))}
          </div>
        )}
        {mine ? (
          m.text && <div className="rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">{m.text}</div>
        ) : (
          <div className="rounded-2xl rounded-tl-md border border-border/50 bg-background/80 px-4 py-3 dark:bg-card/60">
            {m.state === "searching" && !m.text && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <BookOpen className="size-4 animate-pulse" /> Searching the knowledge base…
              </p>
            )}
            {m.state === "streaming" && !m.text && (
              <p className="flex items-center gap-1 py-1" aria-label="Thinking">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d}ms` }} />
                ))}
              </p>
            )}
            {m.text && <Markdown content={m.text} />}
            {m.state === "stopped" && <p className="mt-1 text-[11px] text-muted-foreground italic">Generation stopped.</p>}
            {m.state === "incomplete" && <p className="mt-1 text-[11px] text-amber-600 italic">The reply hit the length limit and was cut short.</p>}
            {m.state === "error" && <p className="mt-1 text-xs text-destructive">{m.text ? "The reply was interrupted." : "The bot couldn't generate a reply."} Try regenerating.</p>}
            {m.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
                <span className="text-[11px] text-muted-foreground">Sources:</span>
                {m.citations.map((c) => (
                  <span key={c} className="lms-chip">
                    <BookOpen className="size-3" />
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {!mine && m.state !== "streaming" && m.state !== "searching" && (
          <div className="mt-0.5 flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
            {m.text && <CopyButton text={m.text} />}
            {isLast && !readOnly && (
              <Button size="icon-xs" variant="ghost" onClick={onRegenerate} disabled={busy} aria-label="Regenerate response">
                <RefreshCw className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export default function ChatWorkspace({
  bot,
  chats,
  chatId,
  chatTitle,
  initialMessages,
  ownerEmail,
  readOnly = false,
  manageHref = null,
  openAIReady,
  historyError,
  knowledgeFiles = 0,
}: {
  bot: BotSummary;
  chats: ChatListItem[];
  chatId: string | null;
  chatTitle: string | null;
  initialMessages: WorkspaceMessage[];
  ownerEmail: string;
  readOnly?: boolean;
  /** Where "Configure" goes (the bot editor, or Settings for the general assistant); null hides it. */
  manageHref?: string | null;
  openAIReady: boolean;
  historyError?: string | null;
  /** Assigned knowledge files: > 0 → the bot answers only from its knowledge base; 0 → from its instructions. */
  knowledgeFiles?: number;
}) {
  const [messages, setMessages] = useState<WorkspaceMessage[]>(initialMessages);
  const [activeChatId, setActiveChatId] = useState<string | null>(chatId);
  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  const [title, setTitle] = useState<string | null>(chatTitle);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  const ownerLabel = readOnly ? ownerEmail : "You";
  const accept = useMemo(() => ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(","), []);

  // The history list is kept here rather than re-fetched after every reply: a
  // server refresh would re-render this page under the new chat's URL and
  // remount it, dropping a reply that is still streaming. Rename/delete still
  // refresh, and a fresh `chats` prop replaces the local copy.
  const [chatList, setChatList] = useState(chats);
  const [chatsProp, setChatsProp] = useState(chats);
  if (chats !== chatsProp) {
    setChatsProp(chats);
    setChatList(chats);
  }

  // Abort an in-flight reply if the user navigates away.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  function patchLast(fn: (m: WorkspaceMessage) => WorkspaceMessage) {
    setMessages((prev) => {
      const next = [...prev];
      const i = next.length - 1;
      if (i >= 0 && next[i].role === "assistant") next[i] = fn(next[i]);
      return next;
    });
  }

  async function stream(form: FormData, onHttpError: (msg: string) => void) {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    stickToBottom.current = true;
    let newChatId: string | null = null;
    let finished = false;
    try {
      const res = await fetch("/api/agentos/chat", { method: "POST", body: form, signal: controller.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        onHttpError(data?.error ?? "The bot couldn't reply. Please try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (!raw.startsWith("data:")) continue;
          const evt = JSON.parse(raw.slice(5));
          if (evt.type === "chat") {
            setActiveChatId(evt.chatId);
            setTitle(evt.title);
            if (evt.isNew) {
              window.dispatchEvent(new CustomEvent(AGENT_USED_EVENT, { detail: { _id: bot._id, name: bot.name, icon: bot.icon, color: bot.color, avatarUrl: bot.avatarUrl, kind: bot.kind } }));
              newChatId = evt.chatId;
              // Put the new chat's id in the URL — no navigation, no refetch.
              window.history.replaceState(null, "", `/agentos/b/${bot._id}/${evt.chatId}`);
              const item: ChatListItem = { _id: evt.chatId, botId: bot._id, title: evt.title, turns: 0, lastMessageAt: new Date().toISOString(), userEmail: ownerEmail };
              setChatList((l) => [item, ...l.filter((c) => c._id !== evt.chatId)]);
            }
          } else if (evt.type === "status") {
            patchLast((m) => (m.text ? m : { ...m, state: "searching" }));
          } else if (evt.type === "delta") {
            patchLast((m) => ({ ...m, text: m.text + evt.text, state: "streaming" }));
          } else if (evt.type === "done") {
            finished = true;
            patchLast((m) => ({ ...m, state: evt.incomplete ? "incomplete" : undefined, citations: (evt.citations ?? []).map((c: { title: string }) => c.title) }));
          } else if (evt.type === "error") {
            finished = true;
            patchLast((m) => ({ ...m, state: "error" }));
          }
        }
      }
      if (!finished) patchLast((m) => ({ ...m, state: "error" }));
    } catch (err) {
      if (controller.signal.aborted) patchLast((m) => ({ ...m, state: "stopped" }));
      else patchLast((m) => ({ ...m, state: "error" }));
      void err;
    } finally {
      abortRef.current = null;
      setBusy(false);
      // Most recent chat first, as the server orders it.
      const touched = newChatId ?? activeChatIdRef.current;
      if (touched) {
        setChatList((l) => {
          const hit = l.find((c) => c._id === touched);
          return hit ? [{ ...hit, lastMessageAt: new Date().toISOString() }, ...l.filter((c) => c._id !== touched)] : l;
        });
      }
    }
  }

  function send(text: string) {
    const message = text.trim();
    if (!message || busy || readOnly) return;
    const attached = files;
    const form = new FormData();
    form.set("botId", bot._id);
    if (activeChatId) form.set("chatId", activeChatId);
    form.set("message", message);
    for (const f of attached) form.append("files", f);
    const userMsg: WorkspaceMessage = { id: uid(), role: "user", text: message, attachments: attached.map((f) => f.name), citations: [] };
    const botMsg: WorkspaceMessage = { id: uid(), role: "assistant", text: "", attachments: [], citations: [], state: "streaming" };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
    setFiles([]);
    void stream(form, (msg) => {
      // Nothing reached OpenAI — undo the optimistic turn and give the text back.
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== botMsg.id));
      setInput(message);
      setFiles(attached);
      toast.error(msg);
    });
  }

  function regenerate() {
    if (busy || !activeChatId) return;
    const form = new FormData();
    form.set("botId", bot._id);
    form.set("chatId", activeChatId);
    form.set("regenerate", "1");
    const snapshot = messages;
    setMessages((prev) => {
      const next = [...prev];
      if (next[next.length - 1]?.role === "assistant") next.pop();
      return [...next, { id: uid(), role: "assistant", text: "", attachments: [], citations: [], state: "streaming" }];
    });
    void stream(form, (msg) => {
      setMessages(snapshot);
      toast.error(msg);
    });
  }

  /**
   * A chat started on this page got its id via `history.replaceState`, so the
   * router still believes it is on `/agentos/b/<bot>` and a link there would be
   * a no-op. Reset in place instead; a chat that was loaded from the server
   * (`chatId` prop set) navigates normally.
   */
  function newChat(e: React.MouseEvent) {
    if (chatId !== null) return;
    e.preventDefault();
    abortRef.current?.abort();
    setMessages([]);
    setActiveChatId(null);
    setTitle(null);
    setInput("");
    setFiles([]);
    setHistoryOpen(false);
    window.history.replaceState(null, "", `/agentos/b/${bot._id}`);
    textRef.current?.focus();
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
    const total = next.reduce((n, f) => n + f.size, 0);
    if (total > MAX_UPLOAD_BYTES) {
      toast.error(`Attachments must total ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or less.`);
      return;
    }
    const bad = next.find((f) => !ATTACHMENT_EXTENSIONS.includes(f.name.split(".").pop()?.toLowerCase() ?? ""));
    if (bad) {
      toast.error(`"${bad.name}" isn't a supported attachment.`);
      return;
    }
    setFiles(next);
  }

  const lastAssistant = messages.length - 1;

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* Chat history */}
      {!readOnly && (
        <aside className="lms-surface hidden w-72 shrink-0 overflow-hidden rounded-3xl border border-border/40 bg-background/95 lg:block dark:bg-card/85">
          <ChatHistory botId={bot._id} chats={chatList} activeId={activeChatId} onNewChat={newChat} />
        </aside>
      )}
      {!readOnly && historyOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-label="Chat history">
          <div className="absolute inset-0 bg-black/30" onClick={() => setHistoryOpen(false)} />
          <div className="relative flex h-full w-80 max-w-[85vw] flex-col bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <p className="text-sm font-semibold">Chat history</p>
              <Button size="icon-sm" variant="ghost" onClick={() => setHistoryOpen(false)} aria-label="Close chat history">
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatHistory botId={bot._id} chats={chatList} activeId={activeChatId} onPick={() => setHistoryOpen(false)} onNewChat={newChat} />
            </div>
          </div>
        </div>
      )}

      {/* Conversation */}
      <section className="lms-surface flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/40 bg-background/95 dark:bg-card/85">
        <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
          {!readOnly && (
            <Button size="icon-sm" variant="ghost" className="lg:hidden" onClick={() => setHistoryOpen(true)} aria-label="Show chat history">
              <History className="size-4" />
            </Button>
          )}
          <BotAvatar icon={bot.icon} color={bot.color} imageUrl={bot.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
              <span className="truncate">{bot.name}</span>
              {title && <span className="hidden truncate font-normal text-muted-foreground sm:inline">· {title}</span>}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {bot.category} · {bot.model} ·{" "}
              <span title={knowledgeFiles > 0 ? "Answers only from this bot's knowledge base — no outside knowledge." : "No knowledge base — answers from the bot's instructions."} className={cn("font-medium", knowledgeFiles > 0 ? "text-emerald-700 dark:text-emerald-400" : "")}>
                {knowledgeFiles > 0 ? `Knowledge base only (${knowledgeFiles} file${knowledgeFiles === 1 ? "" : "s"})` : "Instructions only"}
              </span>
              {readOnly && ` · chat of ${ownerEmail} (read-only)`}
            </p>
          </div>
          {manageHref && (
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={manageHref} />} aria-label="Bot settings">
              <Settings2 className="size-4" />
              <span className="hidden sm:inline">Configure</span>
            </Button>
          )}
          {!readOnly && bot.kind !== "voice" && (
            <ChatCallControls
              chatId={activeChatId}
              chatTitle={title}
              onNote={(text) => setMessages((m) => [...m, { id: `note-${Date.now()}`, role: "user", text, attachments: [], citations: [] }])}
            />
          )}
          {!readOnly && activeChatId && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/agentos/b/${bot._id}`} onClick={newChat} />}>
              <MessageSquarePlus className="size-4" />
              <span className="hidden sm:inline">New chat</span>
            </Button>
          )}
        </header>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto py-4"
          aria-live="polite"
        >
          {historyError && <p className="mx-6 mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">{historyError}</p>}
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-10 text-center">
              <BotAvatar icon={bot.icon} color={bot.color} imageUrl={bot.avatarUrl} size="lg" />
              <h2 className="text-xl font-bold text-foreground">{bot.name}</h2>
              <p className="text-sm text-muted-foreground">{bot.description || "Ask anything to get started."}</p>
              {knowledgeFiles > 0 && (
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-900 dark:text-emerald-200">
                  Answers come only from this bot&apos;s {knowledgeFiles} knowledge file{knowledgeFiles === 1 ? "" : "s"}. If something isn&apos;t in them, it will say so.
                </p>
              )}
              {!openAIReady && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">OpenAI isn&apos;t connected for this workspace (Settings → Integrations) yet, so this bot can&apos;t reply.</p>}
              {!readOnly && bot.starterPrompts.length > 0 && (
                <div className="mt-2 grid w-full gap-2 sm:grid-cols-2">
                  {bot.starterPrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      disabled={busy || !openAIReady}
                      className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((m, i) => <MessageRow key={m.id} m={m} bot={bot} isLast={i === lastAssistant} busy={busy} onRegenerate={regenerate} readOnly={readOnly} ownerLabel={ownerLabel} />)
          )}
        </div>

        {!readOnly && (
          <form
            className="shrink-0 border-t border-border/60 bg-background/80 p-3 backdrop-blur-sm"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="lms-chip max-w-[240px]">
                    <FileText className="size-3" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground/70">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              {bot.allowAttachments && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept={accept}
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy || files.length >= MAX_ATTACHMENTS_PER_MESSAGE} aria-label="Attach files">
                    <Paperclip className="size-4" />
                  </Button>
                </>
              )}
              <textarea
                ref={textRef}
                rows={1}
                value={input}
                maxLength={LIMITS.messageMax}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={`Message ${bot.name}…`}
                aria-label={`Message ${bot.name}`}
                disabled={!openAIReady}
                className="max-h-52 min-h-10 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
              />
              {busy ? (
                <Button type="button" size="icon" variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
                  <CircleStop className="size-4" />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim() || !openAIReady} aria-label="Send message">
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              <span className="font-medium">Enter</span> to send · <span className="font-medium">Shift+Enter</span> for a new line
              {bot.allowAttachments && " · attach PDF, images, text, CSV or Excel"} · AI can make mistakes — check important facts.
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
