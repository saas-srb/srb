"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { VoiceProvider } from "@/components/chat/VoiceProvider";
import { ChatPanel } from "@/components/chat/ChatPanel";

/**
 * Floating docked chat product (bottom-right). Rendered by
 * FloatingContactButtons, which owns the open/close state and the launcher.
 */
export function ChatWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Lock body scroll on small screens when the full-height product is open.
  React.useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 640px)");
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="chat-widget"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed inset-x-3 bottom-24 top-3 z-[60] flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-background/80 shadow-2xl shadow-black/25 backdrop-blur-2xl sm:inset-x-auto sm:right-6 sm:top-auto sm:h-[min(640px,calc(100vh-7rem))] sm:w-[400px]"
        >
          {/* Brand gradient wash */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-secondary/15" />
          <ChatProvider>
            <VoiceProvider>
              <ChatPanel onClose={onClose} />
            </VoiceProvider>
          </ChatProvider>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
