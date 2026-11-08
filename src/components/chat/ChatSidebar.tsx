"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check, MessagesSquare, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat, type ChatSessionSummary } from "@/components/chat/ChatProvider";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function bucketFor(iso: string): string {
  const now = startOfDay(new Date());
  const day = startOfDay(new Date(iso));
  const diffDays = Math.round((now - day) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 Days";
  if (diffDays <= 30) return "Previous 30 Days";
  return "Older";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const BUCKET_ORDER = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"];

function groupSessions(sessions: ChatSessionSummary[]): { label: string; sessions: ChatSessionSummary[] }[] {
  const groups = new Map<string, ChatSessionSummary[]>();
  for (const s of sessions) {
    const label = bucketFor(s.lastActivityAt);
    (groups.get(label) ?? groups.set(label, []).get(label)!).push(s);
  }
  return BUCKET_ORDER.filter((l) => groups.has(l)).map((label) => ({ label, sessions: groups.get(label)! }));
}

function SessionRow({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  session: ChatSessionSummary;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const tx = useText();
  const [editing, setEditing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [draft, setDraft] = React.useState(session.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const next = draft.trim();
    if (next && next !== session.title) onRename(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded-xl border-2 border-primary/40 bg-background px-2.5 py-1.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={commit}
          maxLength={80}
          aria-label="Conversation title"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button onClick={commit} className="text-muted-foreground hover:text-primary" aria-label="Save title">
          <Check className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5">
        <p className="text-xs font-medium text-foreground">{tx("chat.chatSidebar.delete-this-conversation") || "Delete this conversation?"}</p>
        <div className="flex gap-1.5">
          <button
            onClick={onDelete}
            className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-white hover:bg-destructive/90"
          >
            {tx("chat.chatSidebar.delete") || "Delete"}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            {tx("chat.chatSidebar.cancel") || "Cancel"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/row relative flex items-center gap-2 rounded-xl py-2 pl-3 pr-1.5 text-sm transition-colors",
        active ? "bg-primary/10" : "hover:bg-muted"
      )}
    >
      {active && (
        <motion.span
          layoutId="active-session-bar"
          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
        />
      )}
      <button onClick={onSelect} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <span className={cn("w-full truncate font-medium", active ? "text-primary" : "text-foreground/90")}>
          {session.title}
        </span>
        <span className="text-[11px] text-muted-foreground/70">
          {timeAgo(session.lastActivityAt)}
          {session.messageCount > 0 && ` · ${session.messageCount} messages`}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          onClick={() => {
            setDraft(session.title);
            setEditing(true);
          }}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Rename conversation"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
          aria-label="Delete conversation"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function ChatSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const tx = useText();
  const { sessions, activeSessionId, newConversation, switchSession, renameSession, deleteSession } = useChat();
  const [query, setQuery] = React.useState("");

  const filtered = query.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))
    : sessions;
  const groups = groupSessions(filtered);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <button
        type="button"
        onClick={() => {
          void newConversation();
          onNavigate?.();
        }}
        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-brand-accent px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-all hover:shadow-md hover:shadow-primary/30 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40"
      >
        <Plus className="size-4" aria-hidden />
        {tx("chat.chatSidebar.new-chat") || "New chat"}
      </button>

      {sessions.length > 3 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tx("chat.chatSidebar.search-conversations") || "Search conversations"}
            aria-label="Search conversations"
            className="h-9 w-full rounded-xl border border-border/50 bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
      )}

      <div className="-mr-1 flex-1 space-y-4 overflow-y-auto pr-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MessagesSquare className="size-5" aria-hidden />
            </div>
            <p className="text-xs text-muted-foreground">
              {tx("chat.chatSidebar.your-conversations-from-this-browser-wil") || "Your conversations from this browser will appear here."}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {tx("chat.chatSidebar.no-conversations-match") || "No conversations match "}“{query}”.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {group.label}
              </p>
              {group.sessions.map((s) => (
                <SessionRow
                  key={s.sessionId}
                  session={s}
                  active={s.sessionId === activeSessionId}
                  onSelect={() => {
                    void switchSession(s.sessionId);
                    onNavigate?.();
                  }}
                  onRename={(title) => renameSession(s.sessionId, title)}
                  onDelete={() => deleteSession(s.sessionId)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <p className="px-2 text-[11px] leading-tight text-muted-foreground/60">
        {tx("chat.chatSidebar.history-is-stored-for-this-browser-only-") || "History is stored for this browser only."}
      </p>
    </div>
  );
}

/** Mobile slide-over wrapper, mirroring the pattern in Header.tsx.
 * Mounted only while open (wrap in <AnimatePresence>). */
export function ChatSidebarDrawer({ onClose }: { onClose: () => void }) {
  const tx = useText();
  return (
    <div className="lg:hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
        className="fixed inset-y-0 left-0 z-[71] flex w-[86%] max-w-xs flex-col border-r border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-bold text-foreground">{tx("chat.chatSidebar.chat-history") || "Chat history"}</span>
          <button
            onClick={onClose}
            aria-label="Close history"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ChatSidebar onNavigate={onClose} />
        </div>
      </motion.aside>
    </div>
  );
}
