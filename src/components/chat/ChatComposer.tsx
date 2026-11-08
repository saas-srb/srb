"use client";

import * as React from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useText } from "@/components/products/sitecraft-ai/TextContext";
import { useBrand } from "@/components/platform/BrandProvider";

export function ChatComposer({
  disabled,
  streaming,
  maxChars,
  onSend,
  wide = false,
  modeToggle,
}: {
  disabled?: boolean;
  streaming?: boolean;
  maxChars: number;
  onSend: (text: string) => void;
  wide?: boolean;
  /** Optional Text / Voice switch rendered inside the input, below the text row. */
  modeToggle?: React.ReactNode;
}) {
  const brand = useBrand();
  const tx = useText();
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const grow = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  React.useEffect(grow, [value, grow]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming || disabled) return;
    onSend(text.slice(0, maxChars));
    setValue("");
  };

  const remaining = maxChars - value.length;
  const nearLimit = remaining < 120;
  const counter = nearLimit ? (
    <span
      aria-live="polite"
      className={cn("text-xs tabular-nums", remaining < 0 ? "text-destructive" : "text-muted-foreground/70")}
    >
      {remaining}
    </span>
  ) : null;

  return (
    <div className={cn("bg-background/70 backdrop-blur-xl", wide ? "px-0 pb-4 pt-2" : "border-t border-border/50 p-3")}>
      <div
        className={cn(
          "rounded-2xl border-2 border-border bg-background shadow-sm transition-colors focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-primary/20",
          wide && "shadow-lg shadow-black/5",
          disabled && "opacity-60"
        )}
      >
        <div className="flex items-end gap-2 px-3 py-2">
          <textarea
            ref={ref}
            data-chat-input
            rows={1}
            value={value}
            disabled={disabled}
            maxLength={maxChars}
            aria-label={`Type your message to ${brand.name}`}
            placeholder={tx("chat.chatComposer.ask-about-brand") || `Ask ${brand.name || "your team"} anything…`}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-52 flex-1 resize-none bg-transparent py-1.5 text-base leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || streaming || disabled}
            aria-label="Send message"
            className="flex size-10 flex-none items-center justify-center self-end rounded-full bg-primary text-primary-foreground transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {streaming ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-5" aria-hidden />}
          </button>
        </div>

        {modeToggle && (
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2.5 py-1.5">
            {modeToggle}
            {counter}
          </div>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground/70">
          {tx("chat.chatComposer.ai-generated-verify-important-details-wi") || "AI-generated answers. Please verify important details with our team."}
        </p>
        {!modeToggle && counter}
      </div>
    </div>
  );
}
