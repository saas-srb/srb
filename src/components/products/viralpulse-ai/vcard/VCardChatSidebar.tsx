"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles, Send, X, RotateCcw, Loader2, CheckCircle2, CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { aiChatVCardAction } from "@/app/(products)/viralpulse-ai/(protected)/vcards/actions";
import type { VCardDetail } from "@/lib/products/viralpulse-ai/vcard/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionTaken?: string;
  createdAt: string;
}

interface VCardChatSidebarProps {
  vcard: VCardDetail;
  onPatch: (patch: Partial<VCardDetail>) => void;
  onClose?: () => void;
}

export default function VCardChatSidebar({ vcard, onPatch, onClose }: VCardChatSidebarProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hello! I'm your AI Visiting Card Copilot for **${vcard.name}**'s card.\n\nTell me what to update — bio, tagline, layout, colors, or contact info — and I'll apply it instantly!`,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [suggestions, setSuggestions] = useState([
    "Make my bio more confident and punchy",
    "Switch to executive layout",
    "Change colors to midnight black",
    "Make tagline shorter and catchier",
    "Add a professional tone to my bio",
    "Change to modern layout",
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: msg,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await aiChatVCardAction({
        message: msg,
        vcard,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      if (res.ok) {
        const result = res;
        if (result.patch && Object.keys(result.patch).length > 0) {
          onPatch(result.patch as Partial<VCardDetail>);
          toast.success("Card updated via AI Chat!");
        }
        const botMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: result.reply,
          actionTaken: result.patch && Object.keys(result.patch).length > 0 ? "updated" : undefined,
          createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, botMsg]);
        if (result.suggestedPrompts?.length) setSuggestions(result.suggestedPrompts);
      } else {
        const errMsg = (res as { error?: string }).error || "Unable to process request.";
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: "assistant",
            content: `I encountered an issue: ${errMsg}. Please try again.`,
            createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: `Error: ${(err as Error)?.message || "Failed."}`,
          createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  return (
    <aside className="w-80 sm:w-96 shrink-0 border-l border-border/50 bg-background flex flex-col min-h-0 shadow-lg z-10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-3 bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="size-4" />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-foreground">AI Card Copilot</span>
              <Badge variant="outline" className="text-[9px] py-0 px-1 text-primary border-primary/30">Live</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">Prompt to edit any field or layout</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={() => setMessages([{ id: "welcome", role: "assistant", content: "Chat cleared. What would you like to update?", createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }])} title="Clear chat">
            <RotateCcw className="size-3.5" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon-xs" onClick={onClose}>
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Context */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 border-b border-border/40 text-[10px] text-muted-foreground">
        <CreditCard className="size-3 text-primary shrink-0" />
        <span>Editing:</span>
        <strong className="text-foreground truncate">{vcard.name} · {vcard.layout}</strong>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "rounded-2xl px-3.5 py-2.5 text-xs shadow-xs max-w-[90%] whitespace-pre-wrap leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-xs"
                  : "bg-muted/60 border border-border/50 text-foreground rounded-tl-xs"
              )}
            >
              <div>{msg.content}</div>
              {msg.actionTaken && (
                <div className="pt-1.5 border-t border-border/40 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                  <CheckCircle2 className="size-3" /> Card updated!
                </div>
              )}
            </div>
            <span className="text-[9px] text-muted-foreground px-1">{msg.createdAt}</span>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start">
            <div className="rounded-2xl rounded-tl-xs bg-muted/60 border border-border/50 px-3.5 py-2.5 text-xs flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span className="text-muted-foreground">Updating your card...</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="border-t border-border/40 px-3 py-2 bg-muted/10 space-y-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Prompts</span>
        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
          {suggestions.slice(0, 4).map((s) => (
            <button key={s} type="button" disabled={isLoading} onClick={() => send(s)}
              className="text-[10px] px-2 py-1 rounded-full bg-background border border-border/60 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 truncate max-w-full">
              ✨ {s}
            </button>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-border/50 bg-background space-y-2">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            rows={2}
            placeholder="e.g. 'Make bio more executive' or 'Switch to dark theme'"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            className="text-xs resize-none pr-10 pb-2 bg-muted/30 focus-visible:bg-background"
          />
          <Button size="icon-xs" disabled={isLoading || !input.trim()} onClick={() => send()} className="absolute bottom-2 right-2 rounded-lg size-7">
            {isLoading ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          </Button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
          <span>Enter to send · Shift+Enter newline</span>
          <span className="text-primary font-medium">AI Powered</span>
        </div>
      </div>
    </aside>
  );
}
