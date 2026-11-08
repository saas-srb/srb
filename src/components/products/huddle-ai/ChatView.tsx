"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRealtime, useScopeEvents } from "@/components/products/huddle-ai/RealtimeProvider";
import MessageComposer from "@/components/products/huddle-ai/MessageComposer";
import MessageBubble, { type BubbleHandlers } from "@/components/products/huddle-ai/MessageBubble";
import ForwardDialog from "@/components/products/huddle-ai/ForwardDialog";
import type { ClientMessage, MemberLite, MessageScope } from "@/components/products/huddle-ai/types";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function ChatView({
  scope,
  scopeKey,
  currentUserId,
  canPost,
  members,
  initialMessages,
  otherReadSeq,
  emptyState,
}: {
  scope: MessageScope;
  scopeKey: string;
  currentUserId: string;
  canPost: boolean;
  members: MemberLite[];
  initialMessages: ClientMessage[];
  /** For DMs: the other participant's read cursor, for the ✓✓ receipt. */
  otherReadSeq?: number;
  emptyState?: string;
}) {
  const { connected } = useRealtime();
  const [messages, setMessages] = useState<ClientMessage[]>(initialMessages);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; at: number }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [threadRoot, setThreadRoot] = useState<ClientMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<ClientMessage[]>([]);
  const [forwarding, setForwarding] = useState<ClientMessage | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 40);
  const [peerReadSeq, setPeerReadSeq] = useState(otherReadSeq ?? 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const membersById = useMemo(() => new Map(members.map((m) => [m._id, m])), [members]);

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const markRead = useCallback(
    (seq: number) => {
      fetch("/api/huddle-ai/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, seq }),
      }).catch(() => {});
    },
    [scope]
  );

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last) markRead(last.seq);
  }, [messages, markRead]);

  // --- realtime -----------------------------------------------------------
  useScopeEvents(scopeKey, (event) => {
    if (event.kind === "message") {
      const m = (event.payload as { message: ClientMessage }).message;
      if (m.parentId) {
        setThreadMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m]));
        setMessages((prev) => prev.map((x) => (x._id === m.parentId ? { ...x, thread: { replyCount: (x.thread?.replyCount ?? 0) + 1, lastReplyAt: m.createdAt } } : x)));
        return;
      }
      setMessages((prev) => {
        if (prev.some((x) => x._id === m._id)) return prev;
        return [...prev, m];
      });
      if (atBottomRef.current) requestAnimationFrame(() => scrollToBottom(true));
    } else if (event.kind === "message_edit") {
      const m = (event.payload as { message: ClientMessage }).message;
      setMessages((prev) => prev.map((x) => (x._id === m._id ? { ...x, ...m } : x)));
      setThreadMessages((prev) => prev.map((x) => (x._id === m._id ? { ...x, ...m } : x)));
    } else if (event.kind === "message_delete") {
      const id = (event.payload as { messageId: string }).messageId;
      setMessages((prev) => prev.map((x) => (x._id === id ? { ...x, deleted: true, body: "", attachments: [] } : x)));
      setThreadMessages((prev) => prev.map((x) => (x._id === id ? { ...x, deleted: true, body: "", attachments: [] } : x)));
    } else if (event.kind === "reaction") {
      const { messageId, userId, emoji, added } = event.payload as { messageId: string; userId: string; emoji: string; added: boolean };
      const apply = (list: ClientMessage[]) =>
        list.map((x) => {
          if (x._id !== messageId) return x;
          const groups = x.reactions.filter((g) => g.emoji !== emoji);
          const current = x.reactions.find((g) => g.emoji === emoji);
          let users = current ? [...current.userIds] : [];
          if (added) users = Array.from(new Set([...users, userId]));
          else users = users.filter((u) => u !== userId);
          if (users.length > 0) groups.push({ emoji, count: users.length, userIds: users, mine: users.includes(currentUserId) });
          return { ...x, reactions: groups };
        });
      setMessages(apply);
      setThreadMessages(apply);
    } else if (event.kind === "typing") {
      const { userId, displayName } = event.payload as { userId: string; displayName: string };
      if (userId === currentUserId) return;
      setTypingUsers((prev) => ({ ...prev, [userId]: { name: displayName, at: Date.now() } }));
    } else if (event.kind === "read") {
      const { userId, seq } = event.payload as { userId: string; seq: number };
      if (userId !== currentUserId) setPeerReadSeq((s) => Math.max(s, seq));
    }
  });

  // expire typing indicators
  useEffect(() => {
    const id = setInterval(() => {
      setTypingUsers((prev) => {
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) if (Date.now() - v.at < 6000) next[k] = v;
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const loadOlder = async () => {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/huddle-ai/messages?scopeType=${scope.type}&scopeId=${scope.id}&beforeSeq=${messages[0].seq}&limit=40`
      );
      const json = await res.json();
      const older: ClientMessage[] = json.messages ?? [];
      setHasMore(older.length >= 40);
      const container = scrollRef.current;
      const prevHeight = container?.scrollHeight ?? 0;
      setMessages((prev) => [...older, ...prev]);
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const openThread = async (root: ClientMessage) => {
    setThreadRoot(root);
    setThreadMessages([]);
    const res = await fetch(`/api/huddle-ai/messages?scopeType=${scope.type}&scopeId=${scope.id}&threadRootId=${root._id}`);
    const json = await res.json();
    setThreadMessages(json.messages ?? []);
  };

  const react = (messageId: string, emoji: string) => {
    fetch(`/api/huddle-ai/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, emoji }),
    }).catch(() => {});
  };

  const remove = (messageId: string) => {
    if (!confirm("Delete this message?")) return;
    fetch("/api/huddle-ai/messages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, messageId }),
    }).catch(() => {});
  };

  const saveEdit = async (messageId: string, body: string) => {
    const res = await fetch("/api/huddle-ai/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, messageId, body }),
    });
    if (res.ok) setEditing(null);
  };

  const star = (messageId: string) => {
    fetch("/api/huddle-ai/star", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (typeof j.starred === "boolean") {
          setMessages((prev) => prev.map((x) => (x._id === messageId ? { ...x, starred: j.starred } : x)));
        }
      })
      .catch(() => {});
  };

  const pin = (messageId: string, pinned: boolean) => {
    fetch("/api/huddle-ai/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, messageId, pinned }),
    }).catch(() => {});
  };

  const rows: (ClientMessage | { divider: string })[] = [];
  let lastDay = "";
  for (const m of messages) {
    const d = dayLabel(m.createdAt);
    if (d !== lastDay) {
      rows.push({ divider: d });
      lastDay = d;
    }
    rows.push(m);
  }

  const typingNames = Object.values(typingUsers).map((t) => t.name);

  const handlers: BubbleHandlers = useMemo(
    () => ({
      onReact: react,
      onReplyInThread: openThread,
      onForward: (m) => setForwarding(m),
      onStar: star,
      onPin: pin,
      onDelete: remove,
      onStartEdit: (m) => {
        setEditing(m._id);
        setEditBody(m.body);
      },
      onSaveEdit: saveEdit,
      onCancelEdit: () => setEditing(null),
      onEditBodyChange: setEditBody,
    }),
    // these handlers only close over `scope`, which is stable for a mounted view
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const renderBubble = (m: ClientMessage, inThread = false) => (
    <MessageBubble
      key={m._id}
      m={m}
      currentUserId={currentUserId}
      authorNameFallback={membersById.get(m.authorId)?.displayName ?? "Unknown"}
      scopeType={scope.type}
      inThread={inThread}
      peerReadSeq={peerReadSeq}
      editingId={editing}
      editBody={editBody}
      handlers={handlers}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!connected && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-500/10 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <WifiOff className="size-3" /> Reconnecting…
        </div>
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto py-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        {hasMore && (
          <div className="flex justify-center py-2">
            <Button type="button" variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : null}
              Load earlier messages
            </Button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <Wifi className="size-6 opacity-40" />
            {emptyState ?? "No messages yet. Say hello 👋"}
          </div>
        )}

        {rows.map((row, i) =>
          "divider" in row ? (
            <div key={`d-${i}`} className="my-2 flex items-center gap-3 px-4">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] font-medium text-muted-foreground">{row.divider}</span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
          ) : (
            renderBubble(row)
          )
        )}

        <div ref={bottomRef} />
      </div>

      {typingNames.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-muted-foreground">
          {typingNames.slice(0, 3).join(", ")} {typingNames.length === 1 ? "is" : "are"} typing
          <span className="ml-0.5 inline-flex gap-0.5">
            <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
            <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
            <span className="size-1 animate-bounce rounded-full bg-muted-foreground" />
          </span>
        </div>
      )}

      <MessageComposer
        scope={scope}
        members={members}
        placeholder="Write a message…"
        disabled={!canPost}
        onSent={() => scrollToBottom(true)}
      />

      <ForwardDialog message={forwarding} fromScope={scope} onClose={() => setForwarding(null)} />

      <Sheet open={threadRoot !== null} onOpenChange={(o) => !o && setThreadRoot(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Thread</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {threadRoot && renderBubble(threadRoot, true)}
            <div className="my-2 flex items-center gap-3 px-4">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] text-muted-foreground">
                {threadMessages.filter((t) => t._id !== threadRoot?._id).length} replies
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            {threadMessages
              .filter((t) => t._id !== threadRoot?._id)
              .map((t) => renderBubble(t, true))}
          </div>
          {canPost && threadRoot && (
            <MessageComposer
              scope={scope}
              members={members}
              placeholder="Reply in thread…"
              parentId={threadRoot._id}
              compact
              autoFocus
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
