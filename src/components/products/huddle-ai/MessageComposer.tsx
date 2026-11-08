"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, SendHorizontal, Smile, X, FileText, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Attachment, MemberLite, MessageScope } from "@/components/products/huddle-ai/types";

const EMOJI = ["👍", "🎉", "❤️", "😄", "🙏", "🔥", "👀", "✅", "🚀", "💯", "😂", "🤔", "👏", "😅", "🙌", "💡", "⚡", "✨", "😍", "🥳", "😎", "🤝", "📌", "⏰"];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function MessageComposer({
  scope,
  members,
  placeholder,
  autoFocus,
  onSent,
  parentId,
  disabled,
  compact,
}: {
  scope: MessageScope;
  members: MemberLite[];
  placeholder: string;
  autoFocus?: boolean;
  onSent?: () => void;
  parentId?: string | null;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingSentAt = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef(0);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [body]);

  const pingTyping = useCallback(() => {
    const now = Date.now();
    if (now - typingSentAt.current < 3000) return;
    typingSentAt.current = now;
    fetch("/api/huddle-ai/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id }),
    }).catch(() => {});
  }, [scope]);

  const detectMention = (value: string, caret: number) => {
    const upto = value.slice(0, caret);
    const match = /(?:^|\s)@([\w.-]*)$/.exec(upto);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const applyMention = (name: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([\w.-]*)$/, `@${name} `);
    const after = body.slice(caret);
    setBody(before + after);
    setMentionQuery(null);
    requestAnimationFrame(() => el.focus());
  };

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("scopeType", scope.type);
        form.append("scopeId", scope.id);
        const res = await fetch("/api/huddle-ai/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed.");
        setAttachments((a) => [...a, json.attachment as Attachment]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const resolveMentionIds = (): string[] => {
    const ids: string[] = [];
    if (/(^|\s)@channel\b/.test(body)) ids.push("@channel");
    if (/(^|\s)@here\b/.test(body)) ids.push("@here");
    for (const m of members) {
      const handle = m.displayName.split(/\s+/)[0].toLowerCase();
      if (new RegExp(`(^|\\s)@(${handle}|${m.displayName.replace(/\s+/g, "").toLowerCase()})\\b`, "i").test(body)) {
        ids.push(m._id);
      }
    }
    return Array.from(new Set(ids));
  };

  const send = async () => {
    const trimmed = body.trim();
    if ((!trimmed && attachments.length === 0) || sending || uploading > 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/huddle-ai/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: scope.type,
          scopeId: scope.id,
          body: trimmed,
          attachments,
          mentions: resolveMentionIds(),
          parentId: parentId ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not send.");
      setBody("");
      setAttachments([]);
      setMentionQuery(null);
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const streamMedia = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(streamMedia);
      chunksRef.current = [];
      recordStartRef.current = Date.now();
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        streamMedia.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const durationMs = Date.now() - recordStartRef.current;
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: "audio/webm" });
        const form = new FormData();
        form.append("file", file);
        form.append("scopeType", scope.type);
        form.append("scopeId", scope.id);
        form.append("durationMs", String(durationMs));
        setUploading((n) => n + 1);
        try {
          const res = await fetch("/api/huddle-ai/upload", { method: "POST", body: form });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Upload failed.");
          setAttachments((a) => [...a, json.attachment as Attachment]);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Upload failed.");
        } finally {
          setUploading((n) => n - 1);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const mentionMatches =
    mentionQuery === null
      ? []
      : members
          .filter((m) => m.displayName.toLowerCase().includes(mentionQuery) || mentionQuery === "")
          .slice(0, 6);

  return (
    <div
      className={cn("relative border-t border-border/60 bg-background/80 p-3 backdrop-blur-sm", compact && "p-2")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
      }}
    >
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <span key={a.storageKey} className="lms-chip max-w-[220px]">
              {a.kind === "image" ? "🖼️" : a.kind === "voice" ? "🎤" : <FileText className="size-3" />}
              <span className="truncate">{a.filename}</span>
              <span className="text-muted-foreground/70">{formatBytes(a.size)}</span>
              <button
                type="button"
                onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                aria-label={`Remove ${a.filename}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {mentionMatches.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-56 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-lg">
          {mentionMatches.map((m) => (
            <button
              key={m._id}
              type="button"
              onClick={() => applyMention(m.displayName.split(/\s+/)[0])}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {m.displayName.slice(0, 1).toUpperCase()}
              </span>
              {m.displayName}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach file"
          >
            <Paperclip className="size-4" />
          </Button>
          <Popover>
            <PopoverTrigger
              render={
                <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label="Add emoji">
                  <Smile className="size-4" />
                </Button>
              }
            />
            <PopoverContent align="start" className="w-auto p-2">
              <div className="grid grid-cols-8 gap-1">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="rounded-md p-1 text-lg hover:bg-muted"
                    onClick={() => setBody((b) => b + e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? "Stop recording" : "Record voice note"}
            className={cn(recording && "text-destructive")}
          >
            {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
          </Button>
        </div>

        <textarea
          ref={textareaRef}
          value={body}
          autoFocus={autoFocus}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? "You can't post here" : placeholder}
          className="max-h-44 min-h-9 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
          onChange={(e) => {
            setBody(e.target.value);
            detectMention(e.target.value, e.target.selectionStart ?? 0);
            if (e.target.value) pingTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
            if (e.key === "Escape") setMentionQuery(null);
          }}
        />

        <Button
          type="button"
          size="icon"
          disabled={disabled || sending || uploading > 0 || (!body.trim() && attachments.length === 0)}
          onClick={() => void send()}
          aria-label="Send message"
          className="shrink-0"
        >
          {sending || uploading > 0 ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
        </Button>
      </div>

      {recording && <p className="mt-1 text-xs text-destructive">● Recording — tap the square to stop and attach.</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {!compact && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          <span className="font-medium">Enter</span> to send · <span className="font-medium">Shift+Enter</span> for a new line · Markdown &amp; @mentions supported
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
