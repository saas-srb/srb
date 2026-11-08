"use client";

import { usePanels } from "@/components/platform/PanelsProvider";
import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, MessageCircle, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/SocialIcons";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";
import { loadAndToggleTawk } from "@/lib/tawk";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function FloatingContactButtons() {
  const [open, setOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const pathname = usePathname();
  const panels = usePanels();
  const { contact, floating, display, liveChatId } = useSiteInfo();
  const fd = display.floating;
  const showAssistant = fd.assistant && !!floating.assistantLabel;
  const showWhatsApp = fd.whatsapp && !!contact.whatsappHref && !!floating.whatsappLabel;
  const showLiveChat = fd.liveChat && !!floating.liveChatLabel && !!liveChatId;

  const openLiveChat = () => {
    loadAndToggleTawk(liveChatId);
    setOpen(false);
  };

  const openAiChat = () => {
    setChatOpen(true);
    setOpen(false);
  };

  // Hide on the LMS product, the AI Bots product (its own chat composer and save
  // buttons sit in this corner) and on the dedicated chat page (which has the
  // full experience inline — no need for the floating duplicate there).
  // Never on an exam page: tests are distraction-free and a chat widget would be an aid.
  if (!fd.enabled || !(showAssistant || showWhatsApp || showLiveChat)) return null;
  if (pathname?.startsWith("/evaliq/take") || pathname?.startsWith("/clientos/exam")) return null;
  // SaaS administration screens (Platform Console, company settings, setup, sign-up) aren't the public
  // site — the visitor chat/WhatsApp buttons don't belong there and sat on top of their controls.
  if (/^\/(platform|console|signup|workspace\/(settings|onboarding))(\/|$)/.test(pathname ?? "") || pathname?.startsWith("/commandos/invite")) return null;
  // The CMS is an admin product too (its draft preview, /sitecraft-ai/preview, shows the site exactly as visitors see it).
  const inCms = pathname?.startsWith("/sitecraft-ai") && !pathname.startsWith("/sitecraft-ai/preview");
  // Every signed-in product the Product Registry lists is an app screen, not the public site.
  const inPanel = Object.values(panels).some((p) => p.key !== "website" && p.key !== "portal" && p.route.length > 1 && (pathname === p.route || pathname?.startsWith(`${p.route}/`)));
  if (inPanel || inCms || pathname === "/ask") {
    return chatOpen ? <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} /> : null;
  }

  return (
    <>
      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} />

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {open && !chatOpen && (
            <motion.div
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
              className="flex flex-col items-end gap-3"
            >
              {showAssistant && (
              <motion.button
                type="button"
                variants={{
                  hidden: { opacity: 0, y: 12, scale: 0.85 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={openAiChat}
                className="group flex items-center gap-3 rounded-full bg-gradient-to-br from-primary to-brand-accent pl-4 pr-1.5 py-1.5 text-sm font-bold text-white shadow-xl shadow-black/15 hover:scale-105 active:scale-95 transition-transform"
              >
                {floating.assistantLabel}
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/20">
                  <Bot className="h-4 w-4" />
                </span>
              </motion.button>
              )}

              {showWhatsApp && (
              <motion.a
                variants={{
                  hidden: { opacity: 0, y: 12, scale: 0.85 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                href={contact.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="group flex items-center gap-3 rounded-full bg-primary pl-4 pr-1.5 py-1.5 text-sm font-bold text-primary-foreground shadow-xl shadow-black/15 hover:scale-105 active:scale-95 transition-transform"
              >
                {floating.whatsappLabel}
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary-foreground/15">
                  <WhatsAppIcon className="h-4 w-4" />
                </span>
              </motion.a>
              )}

              {showLiveChat && (
              <motion.button
                type="button"
                variants={{
                  hidden: { opacity: 0, y: 12, scale: 0.85 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={openLiveChat}
                className="group flex items-center gap-3 rounded-full bg-foreground pl-4 pr-1.5 py-1.5 text-sm font-bold text-background shadow-xl shadow-black/15 hover:scale-105 active:scale-95 transition-transform"
              >
                {floating.liveChatLabel}
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-background/15">
                  <MessageCircle className="h-4 w-4" />
                </span>
              </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Close contact options" : "Contact us"}
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
    </>
  );
}
