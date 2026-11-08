"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, Check, CircleStop, Copy, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnswerBlocks, HowCalculated } from "@/components/products/databrain-ai/AnswerBlocks";
import { useIntelligence } from "@/components/products/databrain-ai/IntelligenceProvider";
import type { IntelMessage } from "@/lib/products/databrain-ai/blocks";

type UiMessage = IntelMessage & { working?: boolean; status?: string };

const MAX_QUESTION = 1000;
const uid = () => Math.random().toString(36).slice(2);

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Copy answer"
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

function MessageRow({ m, ownerLabel }: { m: UiMessage; ownerLabel: string }) {
  const mine = m.role === "user";
  return (
    <div className={cn("group flex gap-3 px-4 py-2 sm:px-6", mine && "flex-row-reverse")} data-role={m.role}>
      {mine ? (
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{ownerLabel.slice(0, 1).toUpperCase()}</div>
      ) : (
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
      )}
      <div className={cn("min-w-0", mine ? "flex max-w-[85%] flex-col items-end sm:max-w-[75%]" : "flex-1")}>
        <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{mine ? ownerLabel : "AI Data Analyst"}</p>
        {mine ? (
          <div className="rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-primary-foreground">{m.text}</div>
        ) : (
          <div className="min-w-0 rounded-2xl rounded-tl-md border border-border/50 bg-background/80 px-4 py-3 dark:bg-card/60" data-testid="answer">
            {m.working && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="status">
                <LoaderCircle className="size-4 animate-spin" />
                {m.status ?? "Checking permissions…"}
              </p>
            )}
            {!m.working && m.error === "stopped" && <p className="text-[12px] text-muted-foreground italic">Generation stopped.</p>}
            {!m.working && m.error && m.error !== "stopped" && (
              <p className="text-sm text-destructive" role="alert">
                {m.error}
              </p>
            )}
            {!m.working && !m.error && <AnswerBlocks blocks={m.blocks} />}
            {!m.working && !m.error && <HowCalculated queries={m.queries} />}
          </div>
        )}
        {!mine && !m.working && !m.error && m.text && (
          <div className="mt-0.5 flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
            <CopyButton text={m.text} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatWorkspace({ conversationId, title, initialMessages, ownerEmail, openAIReady }: { conversationId: string | null; title: string | null; initialMessages: IntelMessage[]; ownerEmail: string; openAIReady: boolean }) {
  const ctx = useIntelligence();
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [activeChatId, setActiveChatId] = useState<string | null>(conversationId);
  const [heading, setHeading] = useState<string | null>(title);
  const [input, setInput] = useState(ctx.draft.text);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const activeRef = useRef(activeChatId);
  const { setActiveId, upsert, draft } = ctx;

  useEffect(() => {
    activeRef.current = activeChatId;
    setActiveId(activeChatId);
  }, [activeChatId, setActiveId]);

  // Abort an in-flight answer if the user navigates away.
  useEffect(() => () => abortRef.current?.abort(), []);

  // An example clicked in the sidebar lands in the composer (state adjusted during render, focus in an effect).
  const [seenDraft, setSeenDraft] = useState(draft.nonce);
  if (draft.nonce !== seenDraft) {
    setSeenDraft(draft.nonce);
    setInput(draft.text);
  }
  useEffect(() => {
    if (draft.nonce > 0) textRef.current?.focus();
  }, [draft.nonce]);

  // "New conversation" while this page holds a client-created conversation (its URL was replaced in place).
  useEffect(() => {
    const reset = () => {
      abortRef.current?.abort();
      setMessages([]);
      setActiveChatId(null);
      setHeading(null);
      setInput("");
      window.history.replaceState(null, "", "/databrain-ai");
      textRef.current?.focus();
    };
    window.addEventListener("intelligence:new", reset);
    return () => window.removeEventListener("intelligence:new", reset);
  }, []);

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

  function patchLast(fn: (m: UiMessage) => UiMessage) {
    setMessages((prev) => {
      const next = [...prev];
      const i = next.length - 1;
      if (i >= 0 && next[i].role === "assistant") next[i] = fn(next[i]);
      return next;
    });
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const userMsg: UiMessage = { id: uid(), role: "user", text: question, blocks: [], queries: [], error: null, createdAt: new Date().toISOString() };
    const botMsg: UiMessage = { id: uid(), role: "assistant", text: "", blocks: [], queries: [], error: null, createdAt: new Date().toISOString(), working: true, status: "Checking permissions…" };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
    ctx.setDraft("");
    stickToBottom.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    let finished = false;
    try {
      const res = await fetch("/api/databrain-ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, conversationId: activeRef.current }), signal: controller.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        // Nothing was asked: undo the optimistic turn and give the text back.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== botMsg.id));
        setInput(question);
        toast.error(data?.error ?? "The analyst couldn't reply. Please try again.");
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
            setActiveChatId(evt.conversationId);
            setHeading(evt.title);
            if (evt.isNew) {
              // Put the new conversation's id in the URL — no navigation, no refetch (a refresh would remount mid-answer).
              window.history.replaceState(null, "", `/databrain-ai/c/${evt.conversationId}`);
              upsert({ id: evt.conversationId, title: evt.title, updatedAt: new Date().toISOString() });
            } else upsert({ id: evt.conversationId, title: evt.title, updatedAt: new Date().toISOString() });
          } else if (evt.type === "status") {
            patchLast((m) => ({ ...m, status: evt.value }));
          } else if (evt.type === "done") {
            finished = true;
            patchLast(() => ({ ...(evt.message as IntelMessage) }));
          } else if (evt.type === "error") {
            finished = true;
            patchLast((m) => ({ ...m, working: false, error: evt.message }));
          }
        }
      }
      if (!finished) patchLast((m) => ({ ...m, working: false, error: "The answer was interrupted. Please try again." }));
    } catch {
      if (controller.signal.aborted) patchLast((m) => ({ ...m, working: false, error: "stopped" }));
      else patchLast((m) => ({ ...m, working: false, error: "The answer was interrupted. Please try again." }));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-full min-h-0">
      <section className="lms-surface flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/40 bg-background/95 dark:bg-card/85">
        <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">AI Data Analyst{heading && <span className="hidden font-normal text-muted-foreground sm:inline"> · {heading}</span>}</p>
            <p className="truncate text-[11px] text-muted-foreground">Answers come only from your company&apos;s data you&apos;re allowed to see · read-only</p>
          </div>
        </header>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-4"
          aria-live="polite"
        >
          {empty ? (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground">
                <Sparkles className="size-7" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Ask about your business</h2>
              <p className="text-sm text-muted-foreground">Ask in plain language and get numbers, tables and charts computed from your live company records — only the data your role allows.</p>
              {!openAIReady && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">The AI assistant isn&apos;t set up for this workspace yet, so questions can&apos;t be answered. Ask your platform administrator to add an OpenAI key.</p>}
              {ctx.examples.length > 0 ? (
                <div className="mt-2 grid w-full gap-2 sm:grid-cols-2">
                  {ctx.examples.slice(0, 6).map((q) => (
                    <button key={q} type="button" onClick={() => void send(q)} disabled={busy || !openAIReady} className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50">
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">No company data is available to your account yet, so there is nothing to ask about. Ask your administrator for access to the products you need.</p>
              )}
            </div>
          ) : (
            messages.map((m) => <MessageRow key={m.id} m={m} ownerLabel={m.role === "user" ? "You" : ownerEmail} />)
          )}
        </div>

        <form
          className="shrink-0 border-t border-border/60 bg-background/80 p-3 backdrop-blur-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textRef}
              rows={1}
              value={input}
              maxLength={MAX_QUESTION}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask a question about your business…"
              aria-label="Ask a question"
              disabled={!openAIReady}
              className="max-h-52 min-h-10 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
            />
            {busy ? (
              <Button type="button" size="icon" variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
                <CircleStop className="size-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim() || !openAIReady} aria-label="Send question">
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            <span className="font-medium">Enter</span> to send · <span className="font-medium">Shift+Enter</span> for a new line · Answers are computed from your data, but AI can misread a question — check important figures.
          </p>
        </form>
      </section>
    </div>
  );
}
