"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  Sparkles,
  X,
  RotateCcw,
  CheckCircle2,
  Palette,
  PlusCircle,
  Edit3,
  Layers,
  ChevronRight,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { aiChatAssistantAction } from "@/app/(products)/viralpulse-ai/(protected)/brochures/actions";
import type {
  BrochureDetail,
  BrochureSection,
  BrochureTheme,
} from "@/lib/products/viralpulse-ai/brochure/types";
import type { AiChatMessage } from "@/lib/products/viralpulse-ai/brochure/ai";

interface BrochureChatSidebarProps {
  brochure: BrochureDetail;
  selectedSectionId: string | null;
  onSectionSelect: (sectionId: string) => void;
  onUpdateSection: (section: BrochureSection) => void;
  onAddSection: (section: BrochureSection) => void;
  onUpdateTheme: (theme: BrochureTheme) => void;
  onClose?: () => void;
}

export default function BrochureChatSidebar({
  brochure,
  selectedSectionId,
  onSectionSelect,
  onUpdateSection,
  onAddSection,
  onUpdateTheme,
  onClose,
}: BrochureChatSidebarProps) {
  const selectedSection = brochure.sections.find((s) => s.id === selectedSectionId) || null;

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Initial greeting
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: "msg_welcome",
      role: "assistant",
      content: `Hello! I'm your AI Brochure Copilot for **${brochure.meta.brandName || brochure.title}**. 

Chat with me to build, edit, or restyle your brochure completely without manual tweaking. What would you like to do?`,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([
    "Make Hero headline bolder & add metrics",
    "Add an enterprise 3-tier pricing table",
    "Switch theme to luxury dark gold",
    "Add 4 client testimonials with ratings",
    "Add 5-question FAQ section",
    "Add 4-step implementation roadmap",
  ]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMessage: AiChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const res = await aiChatAssistantAction({
        message: text,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        brochure: {
          title: brochure.title,
          category: brochure.category,
          brandName: brochure.meta.brandName,
          theme: brochure.theme,
          sections: brochure.sections.map((s) => ({
            id: s.id,
            type: s.data.type,
            title: (s.data as { title?: string }).title,
            headline: (s.data as { headline?: string }).headline,
          })),
        },
        selectedSectionId,
        selectedSectionData: selectedSection,
      });

      if (res.ok) {
        const result = res;

        // Apply action to live brochure state
        if (result.actionTaken === "update_section" && result.updatedSection) {
          onUpdateSection(result.updatedSection);
          onSectionSelect(result.updatedSection.id);
          toast.success("Section updated via AI Chat!");
        } else if (result.actionTaken === "add_section" && result.addedSection) {
          onAddSection(result.addedSection);
          onSectionSelect(result.addedSection.id);
          toast.success("New section added via AI Chat!");
        } else if (result.actionTaken === "restyle_theme" && result.updatedTheme) {
          onUpdateTheme(result.updatedTheme);
          toast.success("Theme restyled via AI Chat!");
        }

        const botMessage: AiChatMessage = {
          id: `msg_a_${Date.now()}`,
          role: "assistant",
          content: result.reply,
          actionTaken: result.actionTaken,
          targetSectionTitle:
            result.updatedSection?.data.type || result.addedSection?.data.type || undefined,
          createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        setMessages((prev) => [...prev, botMessage]);

        if (result.suggestedPrompts && result.suggestedPrompts.length > 0) {
          setSuggestedPrompts(result.suggestedPrompts);
        }
      } else {
        const errMsg = (res as { error?: string })?.error || "Unable to complete request.";
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_err_${Date.now()}`,
            role: "assistant",
            content: `I encountered an issue: ${errMsg}. Please try again or rephrase your prompt.`,
            createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_err_${Date.now()}`,
          role: "assistant",
          content: `Connection error: ${(err as Error)?.message || "Failed to contact AI"}.`,
          createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: "msg_welcome",
        role: "assistant",
        content: `Chat history cleared. What would you like to build or refine next in your brochure?`,
        createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  return (
    <aside className="w-80 sm:w-96 shrink-0 border-l border-border/50 bg-background flex flex-col min-h-0 shadow-lg z-10">
      {/* ── Chat Header ── */}
      <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-3 bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <Sparkles className="size-4" />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-foreground">AI Brochure Copilot</span>
              <Badge variant="outline" className="text-[9px] py-0 px-1 text-primary border-primary/30">
                Live
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground truncate max-w-[190px]">
              Prompt to edit, add sections & restyle
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleClearHistory}
            title="Clear Chat History"
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              title="Close Chat Sidebar"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Active Target Indicator ── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border/40 text-[10px]">
        <div className="flex items-center gap-1.5 text-muted-foreground truncate">
          <Layers className="size-3 text-primary shrink-0" />
          <span>Active focus:</span>
          <strong className="text-foreground capitalize truncate">
            {selectedSection?.data.type || "Whole Brochure"}
          </strong>
        </div>
        {selectedSection && (
          <span className="text-primary font-medium shrink-0">
            ID: {selectedSection.id.slice(0, 6)}
          </span>
        )}
      </div>

      {/* ── Message Conversation Stream ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "rounded-2xl px-3.5 py-2.5 text-xs shadow-xs max-w-[90%] whitespace-pre-wrap leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-xs"
                  : "bg-muted/60 border border-border/50 text-foreground rounded-tl-xs space-y-2"
              )}
            >
              {/* Message text */}
              <div>{msg.content}</div>

              {/* Action badge if AI executed an edit or addition */}
              {msg.actionTaken && msg.actionTaken !== "none" && (
                <div className="pt-1.5 border-t border-border/40 flex items-center justify-between gap-2 text-[10px]">
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    {msg.actionTaken === "update_section" && `Updated ${msg.targetSectionTitle || "section"}`}
                    {msg.actionTaken === "add_section" && `Added new ${msg.targetSectionTitle || "section"}`}
                    {msg.actionTaken === "restyle_theme" && `Applied new theme palette`}
                  </span>
                </div>
              )}
            </div>

            <span className="text-[9px] text-muted-foreground px-1">{msg.createdAt}</span>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="rounded-2xl rounded-tl-xs bg-muted/60 border border-border/50 px-3.5 py-2.5 text-xs text-muted-foreground flex items-center gap-2 shadow-xs">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>AI is updating your brochure...</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Quick Suggestion Chips ── */}
      <div className="border-t border-border/40 px-3 py-2 bg-muted/10 space-y-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Suggested Prompts
        </span>
        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
          {suggestedPrompts.slice(0, 4).map((promptText) => (
            <button
              key={promptText}
              type="button"
              disabled={isLoading}
              onClick={() => handleSendMessage(promptText)}
              className="text-[10px] px-2 py-1 rounded-full bg-background border border-border/60 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 text-left truncate max-w-full"
            >
              ✨ {promptText}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chat Composer ── */}
      <div className="p-3 border-t border-border/50 bg-background space-y-2">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            rows={2}
            placeholder="Type anything... e.g. 'Add a pricing table with 3 plans' or 'Make hero punchier'"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="text-xs resize-none pr-10 pb-2 bg-muted/30 focus-visible:bg-background"
          />

          <Button
            size="icon-xs"
            disabled={isLoading || !inputMessage.trim()}
            onClick={() => handleSendMessage()}
            className="absolute bottom-2 right-2 rounded-lg size-7"
            title="Send Message"
          >
            {isLoading ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          </Button>
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
          <span>Enter to send • Shift+Enter for newline</span>
          <span className="text-primary font-medium">100% AI Powered</span>
        </div>
      </div>
    </aside>
  );
}
