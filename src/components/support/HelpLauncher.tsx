"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, LifeBuoy, X } from "lucide-react";
import { usePanelMeta } from "@/components/platform/PanelsProvider";
import HelpChat from "@/components/support/HelpChat";
import { captureContext, rememberContext } from "@/lib/support/client-context";

/**
 * The topbar Help button, present in every product. It opens the AI Help chatbot as a side drawer that never blocks the page
 * (no backdrop), and remembers where the user was so answers and requests carry that context.
 */
export default function HelpLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const supportName = usePanelMeta("support")?.name ?? "Help & Support";
  useEffect(() => setMounted(true), []);

  function toggle() {
    if (!open) rememberContext(captureContext());
    setOpen(!open);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title={supportName}
        aria-label={supportName}
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
      >
        <LifeBuoy className="size-4" />
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.aside
                key="help-drawer"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className="fixed inset-y-0 right-0 z-[1001] flex h-full w-full flex-col border-l border-border/80 bg-background shadow-2xl sm:w-[420px]"
                aria-label={supportName}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-indigo-600 to-brand-accent text-white shadow-md shadow-primary/20">
                      <LifeBuoy className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">Help Assistant · {supportName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">Workspace help and guidance</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link href="/resolveiq/assistant" onClick={() => setOpen(false)} title="Open the Help Center" aria-label="Open the Help Center" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <ExternalLink className="size-4" />
                    </Link>
                    <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 p-4">
                  <HelpChat compact />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
