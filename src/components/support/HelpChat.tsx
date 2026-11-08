"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Bot, Loader2, LifeBuoy, Send, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { askHelpAction, draftRequestAction, getRequestFormConfigAction } from "@/app/(products)/resolveiq/actions";
import RequestForm, { type RequestFormConfig, type RequestFormInitial } from "@/components/support/RequestForm";
import { currentContext } from "@/lib/support/client-context";
import { cn } from "@/lib/utils";
import type { ChatTurn, HelpSource } from "@/lib/support/types";

interface Turn extends ChatTurn {
  sources?: HelpSource[];
  needsRequest?: boolean;
  error?: boolean;
}

const STORE = "support:chat";
const GREETING = "Hi, I'm your workspace assistant. Ask me how to use this workspace. I answer from its help content and can help you send a support request if needed.";

/** The AI Help chatbot: used full-page on the Help Assistant screen and inside the drawer available from every product. */
export default function HelpChat({ compact = false, suggestions = [] }: { compact?: boolean; suggestions?: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const [drafting, startDraft] = useTransition();
  const [form, setForm] = useState<{ config: RequestFormConfig; initial: RequestFormInitial } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // The conversation survives page changes and product switches for the browser tab.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setTurns(JSON.parse(saved) as Turn[]);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-30)));
    } catch {
      /* ignore */
    }
    bottom.current?.scrollIntoView({ block: "end" });
  }, [turns, form]);

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const next: Turn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setInput("");
    start(async () => {
      const res = await askHelpAction(next.map(({ role, text }) => ({ role, text })), currentContext());
      setTurns((t) => [...t, res.ok ? { role: "assistant", text: res.answer, sources: res.sources, needsRequest: res.needsRequest } : { role: "assistant", text: res.error, error: true, needsRequest: true }]);
    });
  }

  function createRequest() {
    startDraft(async () => {
      const [cfg, drafted] = await Promise.all([getRequestFormConfigAction(), draftRequestAction(turns.map(({ role, text }) => ({ role, text })), currentContext())]);
      if (!cfg) { toast.error("Please sign in again."); return; }
      if (!drafted.ok) { toast.error(drafted.error); return; }
      setForm({ config: cfg, initial: drafted.draft });
    });
  }

  const hasConversation = turns.length > 0;
  const plain = turns.map(({ role, text }) => ({ role, text }));

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-full" : "h-[min(70vh,640px)] min-h-[26rem]")}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-2">
        <div className="flex gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-4" /></span>
          <p className="rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5 text-sm text-foreground">{GREETING}</p>
        </div>

        {!hasConversation && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-9">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                {s}
              </button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={cn("flex gap-2.5", t.role === "user" && "flex-row-reverse")}>
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", t.role === "user" ? "bg-foreground/10 text-foreground" : "bg-primary/10 text-primary")}>
              {t.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div className={cn("max-w-[85%] space-y-2", t.role === "user" && "text-right")}>
              <p className={cn("whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-left text-sm", t.role === "user" ? "rounded-tr-sm bg-primary text-primary-foreground" : t.error ? "rounded-tl-sm bg-destructive/10 text-destructive" : "rounded-tl-sm bg-muted/60 text-foreground")}>{t.text}</p>
              {t.sources && t.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.sources.map((s) => (
                    <Link key={s.slug} href={`/resolveiq/help/${s.slug}`} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/5">
                      <BookOpen className="size-3" /> {s.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Looking through the help content…
          </div>
        )}

        {hasConversation && !pending && !form && (
          <div className="flex items-center gap-2 pl-9">
            <button type="button" onClick={createRequest} disabled={drafting} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60">
              {drafting ? <Loader2 className="size-3.5 animate-spin" /> : <LifeBuoy className="size-3.5" />}
              {turns[turns.length - 1]?.needsRequest ? "Create a support request" : "Still need help? Create a request"}
            </button>
          </div>
        )}

        {form && (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="size-4 text-primary" /> Review your request
            </p>
            <p className="mb-3 text-xs text-muted-foreground">I prepared this from our conversation. Edit anything, then send your support request.</p>
            <RequestForm config={form.config} initial={form.initial} chat={plain} source="chat" compact />
            <button type="button" onClick={() => setForm(null)} className="mt-3 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-2 flex items-end gap-2 border-t border-border/50 pt-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          rows={1}
          maxLength={1000}
          placeholder="Ask how to do something…"
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-border/50 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button type="submit" disabled={pending || !input.trim()} aria-label="Send" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
