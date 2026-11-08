"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, Briefcase, Building2, GraduationCap, Loader2, Mail, MessageSquare, Radio, Search, Send, Sparkles, Wrench, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sendLeadMessageAction } from "@/app/(products)/dealflow-ai/(protected)/leads/actions";
import type { ChannelLead, ChannelStatus } from "@/lib/dealflow-ai/channels";
import CallWithAI from "@/components/products/agentos/calls/CallWithAI";
import { DealflowCallUnavailable } from "@/components/products/dealflow-ai/DealflowCallButton";
import { buildThreadSummary, threadContextLine } from "@/lib/products/agentos/chat-call";

export type InboxMode = "chat" | "email" | "whatsapp";

const TABS = [
  { id: "job_applicant", label: "Job Applications", icon: Briefcase, category: "jobs" },
  { id: "intern", label: "Internship", icon: GraduationCap, category: "interns" },
  { id: "trainee", label: "Industrial Training", icon: Wrench, category: "trainees" },
  { id: "client", label: "Clients", icon: Building2, category: "clients" },
] as const;

const COPY: Record<InboxMode, { icon: typeof Mail; empty: string; placeholder: string; note: string }> = {
  chat: { icon: MessageSquare, empty: "No messages with this person yet.", placeholder: "Write a message. It appears in their portal.", note: "Seen by the person in their portal; their replies appear here." },
  email: { icon: Mail, empty: "No emails sent to this person from DealFlow yet.", placeholder: "Write the email.", note: "Replies arrive in your own mailbox, not here." },
  whatsapp: { icon: Radio, empty: "No WhatsApp messages sent to this person from DealFlow yet.", placeholder: "Write the WhatsApp message.", note: "Replies arrive in your WhatsApp Business inbox, not here." },
};

interface Line {
  id: string;
  mine: boolean;
  body: string;
  subject?: string;
  at: string;
  failed?: string;
}

async function fetchThread(mode: InboxMode, leadId: string): Promise<Line[]> {
  if (mode === "chat") {
    const res = await fetch(`/api/dealflow-ai/leads/${encodeURIComponent(leadId)}/messages`);
    if (!res.ok) throw new Error("Could not load this conversation.");
    const data = (await res.json()) as { messages: { _id: string; authorType: string; body: string; createdAt: string }[] };
    return data.messages.map((m) => ({ id: m._id, mine: m.authorType === "staff", body: m.body, at: m.createdAt }));
  }
  const res = await fetch(`/api/dealflow-ai/channels/${mode}?leadId=${encodeURIComponent(leadId)}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Could not load this thread.");
  return (data.messages as { id: string; body: string; subject: string; createdAt: string; status: string; error: string }[]).map((m) => ({ id: m.id, mine: true, body: m.body, subject: m.subject, at: m.createdAt, failed: m.status === "failed" ? m.error || "Not delivered" : undefined }));
}

/**
 * One two-pane inbox for Live Chat (the lead's portal thread), Dedicated Email and WhatsApp Hub. Leads come from Lead Management;
 * chat threads are the real portal messages, email/WhatsApp sends go through the company's own connected accounts and the
 * thread shows exactly what was attempted. When the channel's account isn't connected, the page says so and links to the settings.
 */
export default function ChannelInbox({
  mode,
  leads,
  status,
  settingsHref,
  canSend,
  initialLeadId,
}: {
  mode: InboxMode;
  leads: ChannelLead[];
  status: ChannelStatus;
  settingsHref: string;
  canSend: boolean;
  initialLeadId?: string;
}) {
  const copy = COPY[mode];
  const Icon = copy.icon;
  const initial = leads.find((l) => l.id === initialLeadId);
  const [tab, setTab] = useState<string>(initial?.type ?? "client");
  const [selectedId, setSelectedId] = useState<string>(initial?.id ?? "");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(Boolean(initial) && !(mode !== "chat" && !status.connected));
  const [loadError, setLoadError] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => l.type === tab && (!q || [l.name, l.email, l.phone, l.code].some((v) => v.toLowerCase().includes(q))));
  }, [leads, tab, search]);
  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const blocked = mode !== "chat" && !status.connected;

  // The thread is loaded by a plain async function; callers set state from its promise (never synchronously in an effect).
  const load = useCallback((leadId: string) => fetchThread(mode, leadId).then(
    (l) => { setLines(l); setLoadError(""); },
    (e) => { setLines([]); setLoadError(e instanceof Error ? e.message : "Could not load messages."); },
  ).finally(() => setLoading(false)), [mode]);

  // Opening a conversation (click or ?lead=): reset, then load. The first one comes from the URL, so it loads once on mount.
  function open(id: string) {
    setSelectedId(id);
    setLines([]);
    setLoadError("");
    setLoading(true);
    void load(id);
  }
  useEffect(() => {
    if (initial && !blocked) void load(initial.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines]);

  async function send() {
    if (!selected || !text.trim()) return;
    setSending(true);
    try {
      if (mode === "chat") {
        const r = await sendLeadMessageAction(selected.id, text, "message");
        if (r.error) throw new Error(r.error);
      } else {
        const res = await fetch(`/api/dealflow-ai/channels/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: selected.id, subject, body: text }) });
        const data = await res.json();
        if (!data.ok) {
          if (data.message) await load(selected.id);
          throw new Error(data.error || "Could not send.");
        }
      }
      setText("");
      setSubject("");
      toast.success(mode === "chat" ? "Message sent" : mode === "email" ? "Email sent" : "WhatsApp message sent");
      await load(selected.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  async function draft() {
    if (!selected) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/dealflow-ai/ai/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: mode,
          category: TABS.find((t) => t.id === selected.type)?.category ?? "clients",
          contactName: selected.name,
          contactIdentifier: selected.email || selected.phone,
          clientSource: selected.sourceLabel,
          previousMessages: lines.map((l) => ({ sender: l.mine ? "Staff" : selected.name, text: l.body })),
        }),
      });
      const data = await res.json();
      if (!data.ok || !data.draft) throw new Error(data.error || "Could not write a draft.");
      setText(data.draft);
      toast.success("Draft added. Review it before sending.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not write a draft.");
    } finally {
      setDrafting(false);
    }
  }

  if (blocked) {
    const what = mode === "email" ? "an email account (SMTP, Resend or SendGrid)" : "a WhatsApp account (Twilio or WhatsApp Business Cloud API)";
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-6" /></span>
          <h2 className="mt-4 text-lg font-black text-foreground">{mode === "email" ? "Email isn't connected" : "WhatsApp isn't connected"}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Connect {what} to message leads from here. Nothing is sent until you do.</p>
          <Link href={settingsHref} className="mt-5 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Open Settings → Integrations</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-115px)] min-h-[600px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-2">
        <div className="flex rounded-xl border border-border/60 bg-muted/30 p-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setSelectedId(""); setLines([]); }} className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-bold transition-all", tab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="size-3.5" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {mode !== "chat" && <span className="text-[11px] text-muted-foreground">Sending through {status.via}</span>}
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone or code" className="rounded-xl pl-9 text-xs" aria-label="Search leads" />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-4">
        <div className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm md:col-span-4">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">People ({visible.length})</div>
          <div className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">{search ? "No one matches your search." : "No leads in this pipeline yet."}</div>
            ) : (
              visible.map((l) => (
                <button key={l.id} onClick={() => open(l.id)} className={cn("flex w-full flex-col items-start gap-1 p-3.5 text-left transition-colors", l.id === selectedId ? "border-l-4 border-l-primary bg-primary/10" : "hover:bg-muted/40")}>
                  <div className="flex w-full items-center justify-between gap-2 text-xs">
                    <span className="truncate font-black text-foreground">{l.name}</span>
                    {mode === "chat" && l.hasUnreadPortalReply && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">New reply</span>}
                  </div>
                  <span className="truncate text-[11px] font-semibold text-primary">{l.sourceLabel}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{mode === "whatsapp" ? l.phone || "No phone number" : l.email || "No email"}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm md:col-span-8">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"><Icon className="size-8 opacity-30" />Select a person to open the conversation.</div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 p-4">
                <div>
                  <h3 className="text-base font-black text-foreground">{selected.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{[selected.email, selected.phone, selected.code].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.callSpec.unavailable ? (
                    <><DealflowCallUnavailable reason={selected.callSpec.unavailable} /><span className="max-w-56 text-[11px] text-muted-foreground">{selected.callSpec.unavailable}</span></>
                  ) : (
                    <CallWithAI
                      key={selected.id}
                      target={selected.callSpec.target}
                      phone={selected.callSpec.phone}
                      context={selected.callSpec.context}
                      defaultPurpose={selected.callSpec.defaultPurpose}
                      variant="outline"
                      size="sm"
                      initialNotes={threadContextLine(mode, selected.name)}
                      contextSummaryLabel={`Share a short summary of the last few ${mode === "chat" ? "chat" : mode === "email" ? "email" : "WhatsApp"} messages with the agent`}
                      contextSummaryLoader={async () => {
                        const summary = buildThreadSummary(mode, selected.name, lines.map((l) => ({ mine: l.mine, text: l.body })));
                        return summary ? { ok: true as const, summary } : { ok: false as const, error: "There are no messages in this conversation to share." };
                      }}
                    />
                  )}
                  <Link href={`/dealflow-ai/leads/${selected.id}`} className="inline-flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20"><ExternalLink className="size-3" /> Open lead</Link>
                </div>
              </div>

              <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/5 p-4">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Loading…</div>
                ) : loadError ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-destructive"><AlertCircle className="size-6" />{loadError}<Button size="sm" variant="outline" onClick={() => open(selected.id)}>Try again</Button></div>
                ) : lines.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground"><Icon className="size-8 opacity-30" />{copy.empty}</div>
                ) : (
                  lines.map((m) => (
                    <div key={m.id} className={cn("flex max-w-[80%] flex-col", m.mine ? "ml-auto items-end" : "mr-auto items-start")}>
                      <div className={cn("rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm", m.mine ? "rounded-tr-none bg-primary text-primary-foreground" : "rounded-tl-none border border-border/60 bg-card text-foreground")}>
                        {m.subject && <p className="mb-1 font-bold">{m.subject}</p>}
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <div className={cn("mt-1 text-right text-[10px]", m.mine ? "text-primary-foreground/75" : "text-muted-foreground")}>{new Date(m.at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      {m.failed && <span className="mt-1 flex items-center gap-1 text-[10px] text-destructive"><AlertCircle className="size-3" />Not delivered: {m.failed}</span>}
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2.5 border-t border-border/60 bg-muted/20 p-3.5">
                {!canSend ? (
                  <p className="text-xs text-muted-foreground">You can read this conversation but don&apos;t have permission to message leads.</p>
                ) : mode === "whatsapp" && !selected.phone ? (
                  <p className="text-xs text-muted-foreground">This lead has no phone number, so WhatsApp can&apos;t be used.</p>
                ) : mode === "email" && !selected.email ? (
                  <p className="text-xs text-muted-foreground">This lead has no email address.</p>
                ) : (
                  <>
                    {mode === "email" && <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="rounded-xl text-xs" aria-label="Subject" />}
                    <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={copy.placeholder} rows={3} className="rounded-xl text-xs leading-relaxed" aria-label="Message" />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">{copy.note}</span>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={draft} disabled={drafting} className="gap-1.5 rounded-xl border-primary/30 text-xs text-primary hover:bg-primary/10"><Sparkles className="size-3" />{drafting ? "Writing…" : "AI draft"}</Button>
                        <Button type="button" onClick={send} disabled={sending || !text.trim() || (mode === "email" && !subject.trim())} className="gap-2 rounded-xl text-xs font-bold"><Send className="size-3.5" />{sending ? "Sending…" : "Send"}</Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
