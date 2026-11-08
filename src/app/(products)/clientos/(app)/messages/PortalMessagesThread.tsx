"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Paperclip, SendHorizontal, Download, X, MessagesSquare, FileText, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sendPortalMessageAction } from "./actions";
import type { SerializedLeadMessage, LeadMessageAttachment } from "@/lib/lead-management/types";
import { BrandName } from "@/components/platform/BrandProvider";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

type TimelineItem = { kind: "divider"; label: string; key: string } | { kind: "message"; message: SerializedLeadMessage; showMeta: boolean };

function buildTimeline(messages: SerializedLeadMessage[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let lastDay: string | null = null;
  let lastAuthorType: string | null = null;
  for (const m of messages) {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) {
      items.push({ kind: "divider", label: dayLabel(m.createdAt), key: `div-${m._id}` });
      lastDay = day;
      lastAuthorType = null;
    }
    items.push({ kind: "message", message: m, showMeta: m.authorType !== lastAuthorType });
    lastAuthorType = m.authorType;
  }
  return items;
}

function AttachmentView({ a, mine }: { a: LeadMessageAttachment; mine: boolean }) {
  const url = `/api/lead-messages/files/${a.storageKey}`;
  if (a.kind === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 block w-52 max-w-full overflow-hidden rounded-xl border border-border/40 shadow-sm transition-transform hover:scale-[1.02]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={a.filename} className="h-36 w-full object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mt-1.5 flex max-w-[220px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs transition-colors",
        mine ? "border-white/25 bg-white/10 hover:bg-white/15" : "border-border/50 bg-background hover:border-primary/40"
      )}
    >
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg", mine ? "bg-white/15" : "bg-primary/10 text-primary")}>
        <FileText className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.filename}</span>
        <span className={cn("block text-[10px]", mine ? "text-white/70" : "text-muted-foreground")}>{(a.size / 1024).toFixed(0)} KB</span>
      </span>
      <Download className="size-3.5 shrink-0 opacity-70" />
    </a>
  );
}

export default function PortalMessagesThread({ initialMessages }: { initialMessages: SerializedLeadMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set(initialMessages.map((m) => m._id)));

  const timeline = useMemo(() => buildTimeline(messages), [messages]);

  useEffect(() => {
    const source = new EventSource("/api/clientos/messages/stream");
    source.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as { type: string; event?: { kind: string; payload: { message?: SerializedLeadMessage } } };
        if (data.type !== "event" || data.event?.kind !== "message") return;
        const message = data.event.payload.message;
        if (!message || seenIds.current.has(message._id)) return;
        seenIds.current.add(message._id);
        setMessages((prev) => [...prev, message]);
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    e.target.value = "";
  }

  async function submit() {
    if (!text.trim() && !file) return;
    setUploading(true);
    try {
      let attachments: LeadMessageAttachment[] = [];
      if (file) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/lead-messages/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Upload failed.");
        attachments = [json.attachment];
      }
      const body = text;
      startTransition(async () => {
        const res = await sendPortalMessageAction(body, attachments);
        if (res.error) return void toast.error(res.error);
        setText("");
        setFile(null);
        requestAnimationFrame(autoGrow);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that message.");
    } finally {
      setUploading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = !pending && !uploading && (text.trim().length > 0 || !!file);

  return (
    <div className="flex h-[min(70vh,640px)] min-h-[26rem] flex-col overflow-hidden rounded-3xl border border-border/40 bg-background/95 shadow-sm backdrop-blur-md dark:bg-card/70">
      {/* Contact header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-white shadow-sm">
          <MessagesSquare className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground"><BrandName /> Team</p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Usually replies within a day
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 sm:px-5">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-white">
              <Sparkles className="size-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">Say hello 👋</p>
            <p className="max-w-[15rem] text-xs text-muted-foreground">
              Send a message here and we&apos;ll reach out as things progress — or if you have a question, just ask.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {timeline.map((item) => {
            if (item.kind === "divider") {
              return (
                <div key={item.key} className="flex items-center gap-3 py-3">
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="text-[11px] font-medium text-muted-foreground">{item.label}</span>
                  <div className="h-px flex-1 bg-border/50" />
                </div>
              );
            }
            const m = item.message;
            const mine = m.authorType === "portal";
            return (
              <motion.div
                key={m._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={cn("flex gap-2", mine ? "flex-row-reverse" : "flex-row", item.showMeta ? "mt-3" : "mt-0.5")}
              >
                {!mine && (
                  <Avatar size="sm" className={cn("mb-0.5 self-end", !item.showMeta && "invisible")}>
                    <AvatarFallback className="bg-gradient-to-br from-primary to-brand-accent text-[10px] font-bold text-white">YO</AvatarFallback>
                  </Avatar>
                )}
                <div className={cn("flex max-w-[75%] flex-col", mine && "items-end")}>
                  {item.showMeta && (
                    <span className={cn("mb-1 px-1 text-[11px] font-medium text-muted-foreground", mine && "text-right")}>
                      {mine ? "You" : <BrandName />} · {timeLabel(m.createdAt)}
                    </span>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                      mine
                        ? "rounded-br-md bg-gradient-to-br from-primary to-primary/85 text-primary-foreground"
                        : "rounded-bl-md border border-border/40 bg-muted/40 text-foreground"
                    )}
                  >
                    {m.channel === "document_request" && (
                      <span className={cn("mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide", mine ? "text-white/80" : "text-primary")}>
                        <FileText className="size-3" /> Document request
                      </span>
                    )}
                    {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                    {m.attachments.map((a) => (
                      <AttachmentView key={a.storageKey} a={a} mine={mine} />
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Composer */}
      <div className="border-t border-border/40 bg-muted/10 p-3 sm:p-4">
        {file && (
          <div className="mb-2 flex w-fit max-w-full items-center gap-2 rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs shadow-sm">
            <Paperclip className="size-3.5 text-muted-foreground" />
            <span className="max-w-[12rem] truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment" className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-3xl border border-border/50 bg-background px-2 py-1.5 shadow-sm transition-colors focus-within:border-primary/50">
          <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />
          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={() => fileInputRef.current?.click()} aria-label="Attach a file">
            <Paperclip className="size-4" />
          </Button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow();
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Write a message…"
            className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <Button
            type="button"
            size="icon"
            className={cn("rounded-full transition-all", canSend ? "bg-gradient-to-br from-primary to-brand-accent" : "")}
            onClick={submit}
            disabled={!canSend}
            aria-label="Send"
          >
            <SendHorizontal className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
