"use client";

import { useId, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { useAiField, type AiFieldController, type AiFieldOptions } from "@/components/products/viralpulse-ai/shared/useAiField";
import { modesFor } from "@/lib/products/viralpulse-ai/ai-field/registry";
import { MODE_LABEL, type FieldMode, type FieldValue } from "@/lib/products/viralpulse-ai/ai-field/types";
import { LANGUAGES, TONES } from "@/lib/products/viralpulse-ai/constants";
import { cn } from "@/lib/utils";

const show = (v: FieldValue) => (Array.isArray(v) ? v.join(", ") : String(v));

export interface AiFieldButtonProps extends AiFieldOptions {
  /** Shared controller (AiField owns one so it can show notes and undo). Omit to let the button run on its own. */
  controller?: AiFieldController;
  disabled?: boolean;
  /** Why it is unavailable (no permission, no OpenAI key...). Shown as the tooltip. */
  disabledReason?: string;
  className?: string;
  /** Visible name of the field, used in the accessible label. */
  label?: string;
}

/**
 * The sparkle button on a form field. One click runs the usual action (write when empty, improve when filled); the arrow opens
 * the other actions (shorten, expand, translate, options), an optional direction, and a tone. Results are put into the field
 * with an undo; alternatives are listed to pick from. See `AiField` for the label + input + status wrapper.
 */
export default function AiFieldButton(props: AiFieldButtonProps) {
  const own = useAiField(props);
  const ai = props.controller ?? own;
  const { def } = ai;
  const modes = modesFor(def);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [tone, setTone] = useState("");
  const [language, setLanguage] = useState("Hindi");
  const uid = useId();
  const running = ai.status === "running";
  const blocked = props.disabled || Boolean(props.disabledReason);
  const quick = ai.defaultMode;
  const quickLabel = MODE_LABEL[quick].label;
  const aria = `${quickLabel}: ${props.label ?? def.label}`;
  const multi = modes.length > 1 || def.usesTone;

  async function go(mode: FieldMode) {
    setOpen(false);
    await ai.run(mode, { instruction: instruction.trim() || undefined, tone: tone || undefined, targetLanguage: mode === "translate" ? language : undefined });
  }

  const sparkle = (
    <Button type="button" variant="ghost" size="icon-xs" disabled={blocked || running} aria-label={aria} aria-busy={running} onClick={() => void go(quick)} className={cn("text-primary hover:bg-primary/10", multi && "rounded-r-none")}>
      {running ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
    </Button>
  );

  return (
    <span className={cn("inline-flex items-center", props.className)}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>{sparkle}</TooltipTrigger>
        <TooltipContent>{props.disabledReason ?? (running ? "Working…" : `${quickLabel}${def.factField ? " (uses only your text)" : ""}`)}</TooltipContent>
      </Tooltip>
      {multi && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-xs" disabled={blocked || running} aria-label={`More AI actions for ${props.label ?? def.label}`} className="w-4 rounded-l-none px-0 text-muted-foreground" />}>
            <ChevronDown className="size-3" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="space-y-1" role="group" aria-label="AI actions">
              {modes.map((m) => {
                const needsValue = m !== "generate" && m !== "options";
                const dis = needsValue && !ai.hasValue;
                return (
                  <button key={m} type="button" disabled={dis} onClick={() => void go(m)} className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-primary/8 focus-visible:bg-primary/10 focus-visible:outline-none disabled:opacity-40">
                    <span className="font-medium">{MODE_LABEL[m].label}</span>
                    <span className="text-[11px] text-muted-foreground">{dis ? "Write something first" : MODE_LABEL[m].hint}</span>
                  </button>
                );
              })}
            </div>
            {modes.includes("translate") && (
              <div className="space-y-1">
                <label htmlFor={`${uid}-lang`} className="text-[11px] font-medium text-muted-foreground">Translate into</label>
                <OptionSelect id={`${uid}-lang`} value={language} onChange={setLanguage} options={LANGUAGES.map((l) => ({ value: l, label: l }))} aria-label="Translate into" />
              </div>
            )}
            {def.usesTone && (
              <div className="space-y-1">
                <label htmlFor={`${uid}-tone`} className="text-[11px] font-medium text-muted-foreground">Tone</label>
                <OptionSelect id={`${uid}-tone`} value={tone} onChange={setTone} options={TONES.map((t) => ({ value: t, label: t }))} noneLabel="Brand default" aria-label="Tone" />
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor={`${uid}-ins`} className="text-[11px] font-medium text-muted-foreground">Direction (optional)</label>
              <Input id={`${uid}-ins`} value={instruction} maxLength={300} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void go(quick); } }} placeholder="e.g. friendlier, mention the weekend" className="h-8" />
            </div>
          </PopoverContent>
        </Popover>
      )}
      {!props.controller && <AiFieldStatus ai={ai} />}
    </span>
  );
}

/** Result area under a field: status for screen readers, errors, notes, warnings, alternatives and undo/redo. */
export function AiFieldStatus({ ai, className }: { ai: AiFieldController; className?: string }) {
  const { status, error, notes, choices } = ai;
  return (
    <div className={cn("text-[11px]", className)} role="status" aria-live="polite">
      {status === "running" && <span className="sr-only">AI is working on this field</span>}
      {error && (
        <p className="mt-1 flex items-start justify-between gap-2 rounded-md bg-rose-500/10 px-2 py-1 text-rose-700 dark:text-rose-300" role="alert">
          <span>{error.message}</span>
          <button type="button" onClick={ai.dismiss} className="shrink-0 font-semibold underline">Dismiss</button>
        </p>
      )}
      {choices && (
        <div className="mt-1 space-y-1 rounded-lg border border-primary/25 bg-primary/5 p-1.5">
          <p className="font-semibold text-foreground">Pick one</p>
          <ul className="space-y-1">
            {choices.options.map((o, i) => (
              <li key={i}>
                <button type="button" onClick={() => ai.choose(o)} className="w-full rounded-md border border-border/50 bg-background/70 px-2 py-1 text-left text-xs whitespace-pre-wrap transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                  {show(o)}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={ai.dismiss} className="font-semibold text-muted-foreground underline">None of these</button>
        </div>
      )}
      {!error && !choices && notes && (notes.notes.length > 0 || notes.warnings.length > 0 || ai.canUndo) && (
        <div className="mt-1 space-y-0.5 text-muted-foreground">
          {notes.warnings.map((w, i) => <p key={`w${i}`} className="text-amber-700 dark:text-amber-300">{w}</p>)}
          {notes.notes.map((n, i) => <p key={`n${i}`}>{n}</p>)}
          {notes.sources.length > 0 && <p className="text-muted-foreground/80">{`Based on: ${notes.sources.map((s) => s.ref).join(", ")}`}</p>}
        </div>
      )}
      {(ai.canUndo || ai.canRedo) && !choices && (
        <div className="mt-0.5 flex gap-3">
          {ai.canUndo && <button type="button" onClick={ai.undo} className="font-semibold text-primary underline">Undo AI change</button>}
          {ai.canRedo && <button type="button" onClick={ai.redo} className="font-semibold text-primary underline">Redo</button>}
        </div>
      )}
    </div>
  );
}
