"use client";

import { useEffect, useRef, useState } from "react";
import { X, Hand, MicOff, MonitorUp, Crown } from "lucide-react";
import MessageComposer from "@/components/products/huddle-ai/MessageComposer";
import { useScopeEvents } from "@/components/products/huddle-ai/RealtimeProvider";
import { scopeKey } from "@/lib/products/huddle-ai/event-key";
import { cn } from "@/lib/utils";
import type { SerializedCallParticipant } from "@/lib/products/huddle-ai/call-types";
import type { MessageScope } from "@/components/products/huddle-ai/types";

type Tab = "people" | "chat";

interface ChatMsg {
  _id: string;
  authorId: string;
  author: { displayName: string } | null;
  body: string;
  createdAt: string;
}

function hue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 42%)`;
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function CallSidebar({
  tab,
  onTab,
  onClose,
  participants,
  speakingIds,
  presenterId,
  hostId,
  currentUserId,
  mutedIds,
  scope,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onClose: () => void;
  participants: SerializedCallParticipant[];
  speakingIds: Set<string>;
  presenterId: string | null;
  hostId: string;
  currentUserId: string;
  mutedIds: Set<string>;
  scope: MessageScope;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab !== "chat") return;
    fetch(`/api/huddle-ai/messages?scopeType=${scope.type}&scopeId=${scope.id}&limit=30`)
      .then((r) => r.json())
      .then((j) => setMessages((j.messages ?? []).filter((m: { callMeta?: unknown }) => !m.callMeta)))
      .catch(() => {});
  }, [tab, scope]);

  useScopeEvents(scopeKey(scope), (event) => {
    if (event.kind === "message") {
      const m = (event.payload as { message: ChatMsg & { callMeta?: unknown; parentId?: string | null } }).message;
      if (m.parentId || m.callMeta) return;
      setMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m]));
    }
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, tab]);

  const joined = participants.filter((p) => p.state === "joined");
  const others = participants.filter((p) => p.state !== "joined" && p.state !== "left");

  return (
    <aside className="flex w-[19rem] shrink-0 flex-col border-l border-white/[0.06] bg-[#101218] text-white">
      <div className="flex items-center gap-1 border-b border-white/[0.06] p-2">
        <button
          type="button"
          onClick={() => onTab("people")}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
            tab === "people" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
          )}
        >
          People · {joined.length}
        </button>
        <button
          type="button"
          onClick={() => onTab("chat")}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
            tab === "chat" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
          )}
        >
          Chat
        </button>
        <button type="button" onClick={onClose} aria-label="Close product" className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white">
          <X className="size-4" />
        </button>
      </div>

      {tab === "people" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {joined.map((p) => (
            <div
              key={p.userId}
              className={cn(
                "mb-0.5 flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors",
                speakingIds.has(p.userId) ? "bg-green-500/10 ring-1 ring-green-500/30" : "hover:bg-white/[0.04]"
              )}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: hue(p.user?.displayName ?? "?") }}
              >
                {(p.user?.displayName ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {p.user?.displayName ?? "Unknown"}
                  {p.userId === currentUserId && <span className="text-white/40"> (you)</span>}
                </span>
                {(p.userId === hostId || presenterId === p.userId) && (
                  <span className="block truncate text-[11px] text-white/40">
                    {p.userId === hostId ? "Host" : ""}
                    {p.userId === hostId && presenterId === p.userId ? " · " : ""}
                    {presenterId === p.userId ? "Presenting" : ""}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-white/45">
                {p.userId === hostId && <Crown className="size-3.5 text-amber-400" />}
                {presenterId === p.userId && <MonitorUp className="size-3.5 text-primary" />}
                {p.handRaised && <Hand className="size-3.5 text-amber-400" />}
                {mutedIds.has(p.userId) && <MicOff className="size-3.5" />}
              </span>
            </div>
          ))}
          {others.length > 0 && (
            <>
              <p className="mb-1 mt-3 px-2 text-[11px] font-semibold uppercase tracking-wide text-white/25">Invited</p>
              {others.map((p) => (
                <div key={p.userId} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-white/40">
                  <span className="flex size-8 items-center justify-center rounded-full bg-white/5 text-xs font-semibold">
                    {(p.user?.displayName ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{p.user?.displayName ?? "Unknown"}</span>
                  <span className="text-[11px] capitalize">{p.state === "ringing" ? "ringing…" : p.state}</span>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <>
          <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="pt-6 text-center text-xs text-white/35">
                Messages you send here stay in the conversation.
              </p>
            )}
            {messages.map((m) => {
              const mine = m.authorId === currentUserId;
              return (
                <div key={m._id} className={cn("flex flex-col", mine && "items-end")}>
                  <span className="text-[11px] text-white/40">
                    {mine ? "You" : m.author?.displayName ?? "Unknown"} · {time(m.createdAt)}
                  </span>
                  <p
                    className={cn(
                      "mt-0.5 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm",
                      mine ? "bg-primary/25 text-white" : "bg-white/10 text-white/90"
                    )}
                  >
                    {m.body}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="border-t border-white/[0.06] [&_[data-slot=input]]:bg-white/5 [&_textarea]:border-white/10 [&_textarea]:bg-white/5 [&_textarea]:text-white [&_textarea]:placeholder:text-white/30">
            <MessageComposer scope={scope} members={[]} placeholder="Message the call…" compact />
          </div>
        </>
      )}
    </aside>
  );
}
