"use client";

import { useRouter } from "next/navigation";
import {
  CornerUpLeft,
  Pencil,
  Trash2,
  Smile,
  Copy,
  Pin,
  Star,
  Check,
  CheckCheck,
  Download,
  Forward,
  Phone,
  Video,
  PhoneMissed,
  PhoneOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Markdown } from "@/components/chat/Markdown";
import { cn } from "@/lib/utils";
import type { Attachment, ClientMessage } from "@/components/products/huddle-ai/types";

const QUICK_EMOJI = ["👍", "❤️", "😄", "🎉", "🙏", "👀", "🔥", "✅"];

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function AttachmentView({ a }: { a: Attachment }) {
  const url = `/api/huddle-ai/files/${a.storageKey}`;
  if (a.kind === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 block max-w-xs overflow-hidden rounded-xl border border-border/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={a.filename} className="max-h-72 w-full object-cover" />
      </a>
    );
  }
  if (a.kind === "voice") {
    return (
      <audio controls src={url} className="mt-1.5 h-9 w-64 max-w-full">
        <track kind="captions" />
      </audio>
    );
  }
  if (a.kind === "video") {
    return <video controls src={url} className="mt-1.5 max-h-72 max-w-xs rounded-xl border border-border/60" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="lms-chip mt-1.5 max-w-xs hover:border-primary/40">
      <Download className="size-3" />
      <span className="truncate">{a.filename}</span>
      <span className="text-muted-foreground/70">{(a.size / 1024).toFixed(0)} KB</span>
    </a>
  );
}

export interface BubbleHandlers {
  onReact: (messageId: string, emoji: string) => void;
  onReplyInThread: (m: ClientMessage) => void;
  onForward: (m: ClientMessage) => void;
  onStar: (messageId: string) => void;
  onPin: (messageId: string, pinned: boolean) => void;
  onDelete: (messageId: string) => void;
  onStartEdit: (m: ClientMessage) => void;
  onSaveEdit: (messageId: string, body: string) => void;
  onCancelEdit: () => void;
  onEditBodyChange: (value: string) => void;
}

export default function MessageBubble({
  m,
  currentUserId,
  authorNameFallback,
  scopeType,
  inThread = false,
  peerReadSeq,
  editingId,
  editBody,
  handlers,
}: {
  m: ClientMessage;
  currentUserId: string;
  authorNameFallback: string;
  scopeType: "channel" | "dm";
  inThread?: boolean;
  peerReadSeq: number;
  editingId: string | null;
  editBody: string;
  handlers: BubbleHandlers;
}) {
  const mine = m.authorId === currentUserId;
  const authorName = m.author?.displayName ?? authorNameFallback;
  const isPinnable = scopeType === "channel" && !inThread;
  const editing = editingId === m._id;

  if (m.callMeta && !m.deleted) {
    return <CallCard meta={m.callMeta} createdAt={m.createdAt} scope={m.scope} />;
  }

  return (
    <div className={cn("group relative flex gap-2.5 px-4 py-1.5 hover:bg-muted/30", mine && "flex-row-reverse")}>
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {initials(authorName)}
      </div>
      <div className={cn("min-w-0 max-w-[78%]", mine && "flex flex-col items-end")}>
        <div className={cn("flex items-baseline gap-2", mine && "flex-row-reverse")}>
          <span className="text-sm font-semibold text-foreground">{mine ? "You" : authorName}</span>
          <span className="text-[11px] text-muted-foreground">{timeLabel(m.createdAt)}</span>
          {m.edited && !m.deleted && <span className="text-[11px] text-muted-foreground/70">(edited)</span>}
        </div>

        {m.forwardedFrom && !m.deleted && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground italic">
            <Forward className="size-3" />
            Forwarded from {m.forwardedFrom.authorName} in {m.forwardedFrom.scopeLabel}
          </p>
        )}

        {editing ? (
          <div className="mt-1 w-full">
            <textarea
              value={editBody}
              onChange={(e) => handlers.onEditBodyChange(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <div className="mt-1 flex gap-1.5">
              <Button size="xs" onClick={() => handlers.onSaveEdit(m._id, editBody)}>
                Save
              </Button>
              <Button size="xs" variant="ghost" onClick={handlers.onCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "mt-1 rounded-2xl border px-3 py-2 text-sm",
              m.deleted
                ? "border-dashed border-border/60 text-muted-foreground italic"
                : mine
                  ? "border-primary/20 bg-primary/10"
                  : "border-border/50 bg-card"
            )}
          >
            {m.deleted ? (
              "This message was deleted."
            ) : (
              <>
                {m.body && <Markdown content={m.body} />}
                {m.attachments.map((a) => (
                  <AttachmentView key={a.storageKey} a={a} />
                ))}
              </>
            )}
          </div>
        )}

        {m.reactions.length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}>
            {m.reactions.map((g) => (
              <button
                key={g.emoji}
                type="button"
                onClick={() => handlers.onReact(m._id, g.emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors",
                  g.mine ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 bg-muted/40 hover:bg-muted"
                )}
              >
                <span>{g.emoji}</span>
                <span className="tabular-nums">{g.count}</span>
              </button>
            ))}
          </div>
        )}

        {!inThread && m.thread && m.thread.replyCount > 0 && (
          <button
            type="button"
            onClick={() => handlers.onReplyInThread(m)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <CornerUpLeft className="size-3" />
            {m.thread.replyCount} {m.thread.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}

        {mine && scopeType === "dm" && !inThread && (
          <span className="mt-0.5 text-[11px] text-muted-foreground">
            {peerReadSeq >= m.seq ? (
              <CheckCheck className="inline size-3.5 text-primary" />
            ) : (
              <Check className="inline size-3.5" />
            )}
          </span>
        )}
      </div>

      {!m.deleted && !editing && (
        <div
          className={cn(
            "absolute top-0 z-10 flex items-center gap-0.5 rounded-lg border border-border/60 bg-popover p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
            mine ? "left-4" : "right-4"
          )}
        >
          <Popover>
            <PopoverTrigger
              render={
                <Button type="button" variant="ghost" size="icon-xs" aria-label="React">
                  <Smile className="size-3.5" />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-auto p-1">
              <div className="flex gap-0.5">
                {QUICK_EMOJI.map((e) => (
                  <button key={e} type="button" className="rounded-md p-1 text-base hover:bg-muted" onClick={() => handlers.onReact(m._id, e)}>
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {!inThread && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Reply in thread" onClick={() => handlers.onReplyInThread(m)}>
              <CornerUpLeft className="size-3.5" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Forward" onClick={() => handlers.onForward(m)}>
            <Forward className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={m.starred ? "Unstar" : "Star"}
            onClick={() => handlers.onStar(m._id)}
            className={cn(m.starred && "text-amber-500")}
          >
            <Star className="size-3.5" />
          </Button>
          {isPinnable && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Pin message" onClick={() => handlers.onPin(m._id, true)}>
              <Pin className="size-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Copy text"
            onClick={() => navigator.clipboard?.writeText(m.body)}
          >
            <Copy className="size-3.5" />
          </Button>
          {mine && (
            <>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Edit" onClick={() => handlers.onStartEdit(m)}>
                <Pencil className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Delete" onClick={() => handlers.onDelete(m._id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CallCard({
  meta,
  createdAt,
  scope,
}: {
  meta: NonNullable<ClientMessage["callMeta"]>;
  createdAt: string;
  scope: ClientMessage["scope"];
}) {
  const router = useRouter();
  const missed = meta.outcome === "missed" || meta.outcome === "no_answer";
  const declined = meta.outcome === "declined";
  const dur = meta.durationSec;
  const durLabel = dur > 0 ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}` : null;
  const Icon = missed ? PhoneMissed : declined ? PhoneOff : meta.mode === "video" ? Video : Phone;
  const label = missed
    ? `Missed ${meta.mode} call`
    : declined
      ? "Call declined"
      : `${meta.mode === "video" ? "Video" : "Audio"} call${durLabel ? ` · ${durLabel}` : ""}`;

  return (
    <div className="flex justify-center px-4 py-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs shadow-sm",
          missed
            ? "border-destructive/25 bg-destructive/5 text-destructive"
            : "border-border/50 bg-card text-muted-foreground"
        )}
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full",
            missed ? "bg-destructive/15" : "bg-primary/10 text-primary"
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground/60">{timeLabel(createdAt)}</span>
        {scope.type === "dm" && (
          <button
            type="button"
            onClick={async () => {
              const res = await fetch("/api/huddle-ai/calls", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, mode: meta.mode }),
              });
              const j = await res.json();
              if (res.ok) router.push(`/huddle-ai/call/${j.callId}`);
            }}
            className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            {meta.mode === "video" ? <Video className="size-3" /> : <Phone className="size-3" />}
            Call back
          </button>
        )}
      </div>
    </div>
  );
}
