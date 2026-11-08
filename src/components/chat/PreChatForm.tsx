"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "@/components/chat/ChatProvider";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

export function PreChatForm({ wide = false }: { wide?: boolean }) {
  const tx = useText();
  const { config, identify } = useChat();
  const preChat = config?.preChat;
  const [values, setValues] = React.useState({ name: "", email: "", phone: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  if (!preChat) return null;

  function set(key: "name" | "email" | "phone", value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const localErrors: Record<string, string> = {};
    if (!values.name.trim()) {
      localErrors.name = "Name is required.";
    }
    if (!values.email.trim()) {
      localErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      localErrors.email = "Enter a valid email address.";
    }
    if (!values.phone.trim()) {
      localErrors.phone = "Phone number is required.";
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    const res = await identify({
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      service: "",
    });
    setSubmitting(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? { email: "Something went wrong. Please try again." });
    }
  }

  const nameLabel = tx("chat.preChatForm.name") || "Name";
  const namePlaceholder = tx("chat.preChatForm.jane-doe") || "Your name";
  const emailLabel = tx("chat.preChatForm.email") || "Email";
  const emailPlaceholder = tx("chat.preChatForm.jane-company-com") || "you@company.com";
  const phoneLabel = tx("chat.preChatForm.phone") || "Phone Number";
  const startChatLabel = tx("chat.preChatForm.start-chat") || "Start chat";

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "w-full rounded-2xl border-2 border-border bg-background p-6 shadow-xl shadow-black/5 sm:p-8",
          wide ? "max-w-md" : "max-w-full"
        )}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-accent text-white shadow-sm">
            <Bot className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              {preChat.title || "Before we start"}
            </h3>
            <p className="text-xs leading-snug text-muted-foreground">
              {preChat.description || "Tell us who you are so our team can follow up on anything the assistant can't fully answer."}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* 1. Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="prechat-name" className="text-xs font-semibold text-foreground">
              {nameLabel} <span className="text-primary">*</span>
            </label>
            <input
              id="prechat-name"
              type="text"
              autoComplete="name"
              value={values.name}
              placeholder={namePlaceholder}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={Boolean(errors.name)}
              className={cn(
                "h-11 rounded-xl border bg-background px-3.5 text-base sm:text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-primary/15",
                errors.name ? "border-destructive focus-visible:border-destructive" : "border-border focus-visible:border-primary/50"
              )}
            />
            {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
          </div>

          {/* 2. Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="prechat-email" className="text-xs font-semibold text-foreground">
              {emailLabel} <span className="text-primary">*</span>
            </label>
            <input
              id="prechat-email"
              type="email"
              autoComplete="email"
              value={values.email}
              placeholder={emailPlaceholder}
              onChange={(e) => set("email", e.target.value)}
              aria-invalid={Boolean(errors.email)}
              className={cn(
                "h-11 rounded-xl border bg-background px-3.5 text-base sm:text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-primary/15",
                errors.email ? "border-destructive focus-visible:border-destructive" : "border-border focus-visible:border-primary/50"
              )}
            />
            {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
          </div>

          {/* 3. Phone Number */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="prechat-phone" className="text-xs font-semibold text-foreground">
              {phoneLabel} <span className="text-primary">*</span>
            </label>
            <input
              id="prechat-phone"
              type="tel"
              autoComplete="tel"
              value={values.phone}
              placeholder="+91 98765 43210"
              onChange={(e) => set("phone", e.target.value)}
              aria-invalid={Boolean(errors.phone)}
              className={cn(
                "h-11 rounded-xl border bg-background px-3.5 text-base sm:text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-primary/15",
                errors.phone ? "border-destructive focus-visible:border-destructive" : "border-border focus-visible:border-primary/50"
              )}
            />
            {errors.phone && <p className="text-[11px] text-destructive">{errors.phone}</p>}
          </div>

          {errors.general && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              {errors.general}
            </p>
          )}

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-brand-accent px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-all hover:shadow-md hover:shadow-primary/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
            {startChatLabel}
          </button>

          {preChat.consentText ? (
            <p className="flex items-start gap-1.5 pt-1 text-[10px] leading-tight text-muted-foreground/70">
              <ShieldCheck className="mt-px size-3 flex-none" />
              {preChat.consentText}
            </p>
          ) : (
            <p className="flex items-start gap-1.5 pt-1 text-[10px] leading-tight text-muted-foreground/70">
              <ShieldCheck className="mt-px size-3 flex-none" />
              By continuing you agree that we may contact you about your enquiry. We never share your details.
            </p>
          )}
        </form>
      </motion.div>
    </div>
  );
}
