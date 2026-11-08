"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { StickyNote, Send, FileQuestion, Paperclip, Download, X } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addLeadNoteAction, sendLeadMessageAction, clearLeadUnreadAction } from "../actions";
import type { SerializedLeadMessage, LeadMessageAttachment } from "@/lib/lead-management/types";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function AttachmentView({ a }: { a: LeadMessageAttachment }) {
  const url = `/api/lead-messages/files/${a.storageKey}`;
  if (a.kind === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 block max-w-[200px] overflow-hidden rounded-xl border border-border/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={a.filename} className="max-h-48 w-full object-cover" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="lms-chip mt-1.5 max-w-[200px] hover:border-primary/40">
      <Download className="size-3" />
      <span className="truncate">{a.filename}</span>
      <span className="text-muted-foreground/70">{(a.size / 1024).toFixed(0)} KB</span>
    </a>
  );
}

export default function LeadComms({
  leadId,
  internal,
  portal,
}: {
  leadId: string;
  internal: SerializedLeadMessage[];
  portal: SerializedLeadMessage[];
}) {
  const [tab, setTab] = useState<"internal" | "portal">("portal");
  const [text, setText] = useState("");
  const [docReq, setDocReq] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [internalMsgs, setInternalMsgs] = useState(internal);
  const [portalMsgs, setPortalMsgs] = useState(portal);
  const [pending, start] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set([...internal, ...portal].map((m) => m._id)));

  const list = tab === "internal" ? internalMsgs : portalMsgs;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [list.length, tab]);

  // Staff opened the Communication Center — clear the "new portal reply" flag on the leads list.
  useEffect(() => {
    void clearLeadUnreadAction(leadId);
  }, [leadId]);

  useEffect(() => {
    const source = new EventSource(`/api/dealflow-ai/leads/${leadId}/messages/stream`);
    source.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as { type: string; event?: { kind: string; payload: { message?: SerializedLeadMessage } } };
        if (data.type !== "event" || data.event?.kind !== "message") return;
        const message = data.event.payload.message;
        if (!message || seenIds.current.has(message._id)) return;
        seenIds.current.add(message._id);
        if (message.visibility === "internal") setInternalMsgs((prev) => [...prev, message]);
        else setPortalMsgs((prev) => [...prev, message]);
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => source.close();
  }, [leadId]);

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
        form.append("leadId", leadId);
        const res = await fetch("/api/lead-messages/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Upload failed.");
        attachments = [json.attachment];
      }
      const body = text;
      start(async () => {
        const res =
          tab === "internal"
            ? await addLeadNoteAction(leadId, body)
            : await sendLeadMessageAction(leadId, body, docReq ? "document_request" : "message", attachments);
        if (res.error) return void toast.error(res.error);
        toast.success(tab === "internal" ? "Note added." : "Message sent to the portal.");
        setText("");
        setDocReq(false);
        setFile(null);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that message.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <GlassCard>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Communication</CardTitle>
        <PanelTabs label="Conversation" active={tab} onSelect={(k) => setTab(k as typeof tab)} tabs={[{ key: "portal", label: "Portal messages" }, { key: "internal", label: "Internal notes" }]} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={listRef} className="max-h-64 space-y-2 overflow-y-auto">
          {list.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {tab === "internal" ? "No internal notes yet." : "No messages sent to the portal yet."}
            </p>
          )}
          {list.map((m) => {
            const mine = tab === "portal" && m.authorType === "staff";
            return (
              <div
                key={m._id}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  tab === "internal" ? "border-amber-500/30 bg-amber-500/[0.06]" : mine ? "border-primary/20 bg-primary/10" : "border-border/50"
                )}
              >
                <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {tab === "internal" ? <StickyNote className="size-3" /> : <Send className="size-3" />}
                  {m.channel === "document_request" ? "Document request" : tab === "internal" ? "Internal note" : mine ? "Sent to portal" : "Reply from portal"}
                  <span className="ml-auto">{when(m.createdAt)}</span>
                </div>
                {m.body && <p className="whitespace-pre-wrap text-foreground">{m.body}</p>}
                {m.attachments.map((a) => (
                  <AttachmentView key={a.storageKey} a={a} />
                ))}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-border/50 pt-3">
          {file && (
            <div className="lms-chip max-w-full">
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment">
                <X className="size-3" />
              </button>
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={tab === "internal" ? "Add an internal note (never shown to the lead)…" : "Write a message the lead sees in their portal…"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={submit} disabled={pending || uploading || (!text.trim() && !file)}>
              {tab === "internal" ? "Add note" : "Send to portal"}
            </Button>
            {tab === "portal" && (
              <>
                <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />
                <Button type="button" variant="outline" size="icon-sm" onClick={() => fileInputRef.current?.click()} aria-label="Attach a file">
                  <Paperclip className="size-3.5" />
                </Button>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={docReq} onChange={(e) => setDocReq(e.target.checked)} />
                  <FileQuestion className="size-3.5" /> This is a document request
                </label>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </GlassCard>
  );
}
