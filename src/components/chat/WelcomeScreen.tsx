"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Bot, Mic, Quote, Sparkles } from "lucide-react";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

const CAPABILITIES = (tx: (key: string) => string) => ([
  { icon: Sparkles, label: tx("chat.welcomeScreen.grounded-in-our-knowledge-base") || "Grounded in our knowledge base" },
  { icon: Quote, label: tx("chat.welcomeScreen.answers-cite-their-sources") || "Answers cite their sources" },
  { icon: Mic, label: tx("chat.welcomeScreen.switch-to-voice-mode-anytime") || "Switch to voice mode anytime" },
]);

export function WelcomeScreen({
  welcomeMessage,
  suggestedQuestions,
  onPick,
  demo = false,
}: {
  welcomeMessage: string;
  suggestedQuestions: string[];
  onPick: (q: string) => void;
  demo?: boolean;
}) {
  const tx = useText();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-10 text-center sm:py-14"
    >
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-primary/30 to-brand-accent/20 blur-2xl motion-safe:animate-pulse" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-white shadow-xl shadow-primary/25">
          <Bot className="size-8" aria-hidden />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{tx("chat.welcomeScreen.brand-ai-assistant") || "AI Assistant"}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{welcomeMessage}</p>
      </div>

      {demo && (
        <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3" aria-hidden />
          {tx("chat.welcomeScreen.demo-mode-every-feature-is-live-answers-") || "Demo mode: every feature is live."}
        </p>
      )}

      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {CAPABILITIES(tx).map((c) => (
          <li key={c.label} className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
            <c.icon className="size-3.5 text-primary/70" aria-hidden />
            {c.label}
          </li>
        ))}
      </ul>

      {suggestedQuestions.length > 0 && (
        <div className="w-full space-y-2 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {tx("chat.welcomeScreen.try-asking") || "Try asking"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestedQuestions.map((q, i) => (
              <motion.button
                key={q}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.05 }}
                onClick={() => onPick(q)}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left text-sm font-medium text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40"
              >
                <span className="min-w-0">{q}</span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" aria-hidden />
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
