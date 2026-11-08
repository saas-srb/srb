"use client";

import type { ReactNode } from "react";
import AiFieldButton, { AiFieldStatus } from "@/components/products/viralpulse-ai/shared/AiFieldButton";
import { useAiField, type AiFieldOptions } from "@/components/products/viralpulse-ai/shared/useAiField";
import { CharCount } from "@/components/products/viralpulse-ai/SmmsBits";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { REGISTRY } from "@/lib/products/viralpulse-ai/ai-field/registry";
import { valueToText } from "@/lib/products/viralpulse-ai/ai-field/validate";
import type { FieldValue } from "@/lib/products/viralpulse-ai/ai-field/types";
import { cn } from "@/lib/utils";

export interface AiFieldProps extends Omit<AiFieldOptions, "value" | "onApply"> {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
  /** The field's value. Lists are arrays (shown one per line). */
  value: FieldValue | null;
  /** Called with the AI's value (and on undo/redo). Also call it for the person's own typing when using the built-in control. */
  onChange: (next: FieldValue) => void;
  /**
   * `input` / `textarea` render the control for you; `list` is a textarea with one item per line; `custom` renders your own
   * control as `children` (a select, a datalist input...).
   */
  as?: "input" | "textarea" | "list" | "custom";
  rows?: number;
  placeholder?: string;
  inputType?: string;
  required?: boolean;
  maxLength?: number;
  /** Shows the character counter against this limit (defaults to nothing). */
  limit?: number | null;
  disabled?: boolean;
  /** Hides the AI button (no permission, read-only). */
  aiDisabled?: boolean;
  aiDisabledReason?: string;
  id?: string;
  children?: ReactNode;
}

/**
 * Label + control + sparkle button + result area, in one. Use it for every field in a flow:
 *
 *   <AiField fieldKey="campaign.targetAudience" label="Target audience" as="textarea" value={v.targetAudience}
 *            onChange={(x) => set("targetAudience", String(x))} getContext={() => ({ objective: v.objective, industry: v.industry })} />
 */
export default function AiField(p: AiFieldProps) {
  const ai = useAiField({ fieldKey: p.fieldKey, value: p.value, getContext: p.getContext, enumOptions: p.enumOptions, tone: p.tone, defaultMode: p.defaultMode, onApply: (next) => p.onChange(next) });
  const def = REGISTRY[p.fieldKey];
  const as = p.as ?? (def.kind === "longtext" ? "textarea" : def.kind === "list" ? "list" : "input");
  const id = p.id ?? p.htmlFor;
  const text = valueToText(p.value);
  const unavailable = p.aiDisabled ? (p.aiDisabledReason ?? "AI isn't available for you here.") : undefined;

  const control =
    as === "custom" ? p.children : as === "textarea" || as === "list" ? (
      <Textarea
        id={id}
        rows={p.rows ?? (as === "list" ? 4 : 3)}
        value={text}
        required={p.required}
        maxLength={p.maxLength}
        disabled={p.disabled}
        placeholder={p.placeholder}
        onChange={(e) => p.onChange(as === "list" ? e.target.value.split("\n") : e.target.value)}
        onBlur={as === "list" ? (e) => p.onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)) : undefined}
      />
    ) : (
      <Input id={id} type={p.inputType} value={text} required={p.required} maxLength={p.maxLength} disabled={p.disabled} placeholder={p.placeholder} onChange={(e) => p.onChange(e.target.value)} />
    );

  return (
    <div className={cn("space-y-1.5", p.className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-foreground">{p.label}</label>
        <span className="flex items-center gap-1.5">
          {p.limit ? <CharCount value={text} limit={p.limit} /> : null}
          {!p.disabled && <AiFieldButton fieldKey={p.fieldKey} value={p.value} getContext={p.getContext} onApply={(n) => p.onChange(n)} controller={ai} disabled={p.aiDisabled} disabledReason={unavailable} label={p.label} />}
        </span>
      </div>
      {control}
      {p.hint && <p className="text-[11px] text-muted-foreground">{p.hint}</p>}
      <AiFieldStatus ai={ai} />
    </div>
  );
}
