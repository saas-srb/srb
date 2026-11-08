"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AudioLines, Bot, Check, Copy, ExternalLink, FileText, Square, User, Volume2 } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { Markdown } from "@/components/chat/Markdown";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import type { ChatMessage as ChatMessageType } from "@/components/chat/ChatProvider";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

function StreamingCursor() {
  return (
    <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 rounded-full bg-primary motion-safe:animate-pulse align-middle" />
  );
}

function Citations({ citations }: { citations: ChatMessageType["citations"] }) {
  const tx = useText();
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
      <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {tx("chat.chatMessage.sources")}</span>
      {citations.map((c, i) => {
        const inner = (
          <>
            {c.kind === "pdf" ? (
              <FileText className="size-3 shrink-0" aria-hidden />
            ) : (
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            )}
            <span className="max-w-[220px] truncate">{c.title}</span>
          </>
        );
        const className =
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
        return c.url ? (
          <Link key={`${c.fileId}-${i}`} href={c.url} className={className}>
            {inner}
          </Link>
        ) : (
          <span key={`${c.fileId}-${i}`} className={className}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active && "bg-primary/10 text-primary"
      )}
    >
      {children}
    </button>
  );
}

function AssistantActions({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate so the speak button matches SSR
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  React.useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const toggleSpeak = () => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const plain = text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`>#]/g, "");
    const utter = new SpeechSynthesisUtterance(plain);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utter);
  };

  const canSpeak = mounted && typeof window !== "undefined" && "speechSynthesis" in window;

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 [@media(hover:none)]:opacity-100">
      <ActionButton label={copied ? "Copied" : "Copy message"} onClick={copy} active={copied}>
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </ActionButton>
      {canSpeak && (
        <ActionButton
          label={speaking ? "Stop reading" : "Read aloud"}
          onClick={toggleSpeak}
          active={speaking}
        >
          {speaking ? (
            <Square className="size-3" fill="currentColor" aria-hidden />
          ) : (
            <Volume2 className="size-3.5" aria-hidden />
          )}
        </ActionButton>
      )}
    </div>
  );
}

export function ChatMessage({ message, wide = false }: { message: ChatMessageType; wide?: boolean }) {
  const isUser = message.role === "user";
  const showTyping = message.streaming && !message.content;
  const done = !message.streaming;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("group/msg flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div
        className={cn(
          "flex size-8 flex-none items-center justify-center rounded-full shadow-sm",
          isUser
            ? "border border-border bg-muted text-muted-foreground"
            : "bg-gradient-to-br from-primary to-brand-accent text-white"
        )}
      >
        {isUser ? <User className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-col gap-1",
          isUser ? "max-w-[85%] items-end" : wide ? "max-w-full flex-1 items-start" : "max-w-[88%] items-start"
        )}
      >
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-primary/10 px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ) : (
          <div
            className={cn(
              "min-w-0 text-[15px] leading-relaxed",
              !wide && "rounded-2xl rounded-tl-sm border border-border bg-background px-4 py-2.5 shadow-sm",
              message.error && "rounded-2xl rounded-tl-sm border border-destructive/40 bg-destructive/5 px-4 py-2.5"
            )}
          >
            {showTyping ? (
              <TypingIndicator />
            ) : (
              <div className="relative">
                <Markdown content={message.content} />
                {message.streaming && <StreamingCursor />}
              </div>
            )}
            {done && <Citations citations={message.citations} />}
          </div>
        )}

        {done && (
          <div className={cn("flex items-center gap-2 px-1", isUser && "flex-row-reverse")}>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
              {message.voice && <AudioLines className="size-2.5 text-primary/70" aria-hidden />}
              {formatDateTime(message.createdAt)}
            </span>
            {!isUser && !message.error && message.content && <AssistantActions text={message.content} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}
