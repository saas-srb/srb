"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/components/chat/ChatMessage";
import type { ChatMessage as ChatMessageType } from "@/components/chat/ChatProvider";

export function ChatThread({
  messages,
  wide = false,
  className,
}: {
  messages: ChatMessageType[];
  wide?: boolean;
  className?: string;
}) {
  const endRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);
  const [atBottom, setAtBottom] = React.useState(true);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinnedRef.current = near;
    setAtBottom(near);
  };

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const lastContent = messages[messages.length - 1]?.content;
  React.useEffect(() => {
    if (pinnedRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, lastContent]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className={cn("space-y-6 py-6", wide ? "px-0" : "px-4", className)}>
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} wide={wide} />
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <AnimatePresence>
        {!atBottom && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            onClick={scrollToBottom}
            aria-label="Scroll to latest message"
            className="absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40"
          >
            <ArrowDown className="size-4" aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
