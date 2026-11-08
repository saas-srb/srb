"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, MessageCircle, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/SocialIcons";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { TextProvider } from "@/components/products/sitecraft-ai/TextContext";
import { usePathname } from "next/navigation";
import { defaultUiText } from "@/lib/products/sitecraft-ai/default-ui-text";

const SAAS_TEXT = defaultUiText("SelfRun AI");

/**
 * SaaS-site floating action button (bottom-right).
 * Expands into two CTAs: Ask AI (opens ChatWidget) + WhatsApp.
 * The ChatWidget is wrapped in TextProvider so all form labels and
 * placeholders (Name, Email, Phone, etc.) render correctly.
 */
export default function SaasFloatingContact() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);

  // Hide on the dedicated /ask page since the full chat is already on the page
  if (pathname === "/ask" || pathname?.startsWith("/ask/")) return null;

  const whatsappHref = "https://wa.me/?text=Hello%20SelfRun%20AI";

  return (
    <TextProvider text={SAAS_TEXT}>
      {/* ChatWidget renders at z-[60], the launcher sits at z-50 — no overlap */}
      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} />

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {open && !chatOpen && (
            <motion.div
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
              className="flex flex-col items-end gap-3"
            >
              {/* Ask AI */}
              <motion.button
                type="button"
                variants={{
                  hidden: { opacity: 0, y: 12, scale: 0.85 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={() => { setChatOpen(true); setOpen(false); }}
                className="flex items-center gap-3 rounded-full bg-gradient-to-br from-primary to-brand-accent pl-4 pr-1.5 py-1.5 text-sm font-bold text-white shadow-xl shadow-black/15 hover:scale-105 active:scale-95 transition-transform"
              >
                Ask AI
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/20">
                  <Bot className="h-4 w-4" />
                </span>
              </motion.button>

              {/* WhatsApp */}
              <motion.a
                variants={{
                  hidden: { opacity: 0, y: 12, scale: 0.85 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-full bg-[#25D366] pl-4 pr-1.5 py-1.5 text-sm font-bold text-white shadow-xl shadow-black/15 hover:scale-105 active:scale-95 transition-transform"
              >
                WhatsApp
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/20">
                  <WhatsAppIcon className="h-4 w-4" />
                </span>
              </motion.a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main trigger button */}
        <button
          type="button"
          aria-expanded={open}
          aria-label={open || chatOpen ? "Close" : "Contact us"}
          onClick={() => (chatOpen ? setChatOpen(false) : setOpen((prev) => !prev))}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-black/20 transition-transform hover:scale-110 active:scale-95"
        >
          <AnimatePresence mode="wait" initial={false}>
            {open || chatOpen ? (
              <motion.span
                key="close"
                initial={{ opacity: 0, rotate: -45 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 45 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <X className="h-6 w-6" />
              </motion.span>
            ) : (
              <motion.span
                key="open"
                initial={{ opacity: 0, rotate: 45 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -45 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <MessageCircle className="h-6 w-6" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </TextProvider>
  );
}
