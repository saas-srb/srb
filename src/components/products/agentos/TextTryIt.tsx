"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/products/agentos/AibotsUi";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/products/agentos/constants";
import type { PreviewTurn } from "@/lib/products/agentos/preview-shared";
import { previewTextAgentAction } from "@/app/(products)/agentos/(protected)/preview-actions";

/**
 * Talk to a text agent exactly as the form is configured right now - unsaved instructions, model and temperature included.
 * Nothing is stored: the conversation lives in this component and Reset throws it away.
 */
export default function TextTryIt({
  botId,
  draft,
  name,
  icon,
  color,
  avatarUrl,
  starters,
}: {
  botId: string | null;
  draft: { instructions: string; model: string; temperature: string };
  name: string;
  icon: string;
  color: string;
  avatarUrl: string | null;
  starters: string[];
}) {
  const [turns, setTurns] = useState<(PreviewTurn & { knowledge?: boolean })[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), [turns, busy]);

  async function send(message: string) {
    const msg = message.trim();
    if (!msg || busy) return;
    const next = [...turns, { role: "user" as const, text: msg }];
    setTurns(next);
    setText("");
    setError(null);
    setBusy(true);
    const r = await previewTextAgentAction(botId, { instructions: draft.instructions, model: draft.model, temperature: draft.temperature.trim() === "" ? null : draft.temperature }, next.map(({ role, text }) => ({ role, text }))).catch(() => null);
    setBusy(false);
    if (!r) return setError("Couldn't reach the server. Try again.");
    if (!r.ok) return setError(r.error);
    setTurns([...next, { role: "assistant", text: r.reply, knowledge: r.usedKnowledge }]);
  }

  const ready = draft.instructions.trim().length > 0;
  return (
    <SectionCard
      title="Try it"
      description="Talk to the agent with the settings above, before you save. Nothing here is saved as a chat."
      action={
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Preview</span>
          <Button type="button" size="sm" variant="outline" disabled={turns.length === 0 && !error} onClick={() => { setTurns([]); setError(null); }}>
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        </div>
      }
    >
      <div className="max-h-96 min-h-32 space-y-3 overflow-y-auto rounded-xl border border-border/50 bg-background/50 p-3" aria-live="polite">
        {turns.length === 0 && !busy && (
          <div className="space-y-2 py-2 text-center text-xs text-muted-foreground">
            <p>{ready ? "Say something to the agent." : "Write the instructions above first, then try the agent here."}</p>
            {ready && starters.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {starters.slice(0, LIMITS.starterPromptsMax).map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] hover:border-primary/40 hover:text-primary">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("flex gap-2", t.role === "user" && "flex-row-reverse")}>
            {t.role === "assistant" && <BotAvatar icon={icon} color={color} imageUrl={avatarUrl} className="size-7 rounded-full" />}
            <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", t.role === "user" ? "bg-primary/12" : "bg-muted/60")}>
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t.role === "user" ? "You" : name || "Agent"}</span>
              {t.text}
              {t.knowledge && <span className="mt-1 block text-[10px] text-muted-foreground">Answered using this agent&apos;s saved knowledge files.</span>}
            </div>
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" /> Thinking…</p>}
        <div ref={endRef} />
      </div>
      {error && <p role="alert" className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-900 dark:text-rose-200">{error}</p>}
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.messageMax} disabled={!ready || busy} placeholder="Type a message" aria-label="Message to try the agent" />
        <Button type="submit" disabled={!ready || busy || !text.trim()}>
          <Send className="size-4" /> Send
        </Button>
      </form>
      <p className="mt-2 text-[11px] text-muted-foreground">Uses the model and temperature chosen above. Knowledge files you have already saved are searched; changes to files apply on the Knowledge Base tab.</p>
    </SectionCard>
  );
}
