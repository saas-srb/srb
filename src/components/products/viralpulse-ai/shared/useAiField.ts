"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { aiFieldAction, aiFieldOutcomeAction } from "@/app/(products)/viralpulse-ai/(protected)/ai-field-actions";
import { REGISTRY, modesFor, type FieldDef, type FieldKey } from "@/lib/products/viralpulse-ai/ai-field/registry";
import { valueToText } from "@/lib/products/viralpulse-ai/ai-field/validate";
import type { AiFieldErrorCode, AiFieldResult, AiFieldSource, FieldMode, FieldValue } from "@/lib/products/viralpulse-ai/ai-field/types";

/** Minimum gap between two requests from the same field (a double click must not spend two requests). */
export const AI_FIELD_DEBOUNCE_MS = 500;

export interface AiFieldOptions {
  fieldKey: FieldKey;
  /** The field's current value, as the form holds it. */
  value: FieldValue | null;
  /** Reads the sibling form values at the moment of the click. */
  getContext: () => Record<string, unknown>;
  /** Puts a value into the form. */
  onApply: (next: FieldValue, meta: { runId: string; mode: FieldMode }) => void;
  /** Choices that live in the form (a select's options), for enum fields whose registry entry says `"client"`. */
  enumOptions?: string[];
  tone?: string;
  /** Overrides the mode a plain click runs. */
  defaultMode?: FieldMode;
}

export interface AiRunExtras {
  instruction?: string;
  tone?: string;
  targetLanguage?: string;
}

export interface AiFieldNotes {
  notes: string[];
  warnings: string[];
  sources: AiFieldSource[];
  estimate: boolean;
  mode: FieldMode;
}

export type AiFieldStatus = "idle" | "running" | "error";

/** The mode a plain click on the sparkle runs: write when empty, otherwise improve; fields with a single action just run it. */
export function defaultModeFor(def: FieldDef, hasValue: boolean): FieldMode {
  const modes = modesFor(def);
  if (!hasValue && modes.includes("generate")) return "generate";
  if (hasValue && modes.includes("improve")) return "improve";
  return modes[0] ?? "generate";
}

export function useAiField(o: AiFieldOptions) {
  const def: FieldDef = REGISTRY[o.fieldKey];
  const [status, setStatus] = useState<AiFieldStatus>("idle");
  const [error, setError] = useState<{ message: string; code: AiFieldErrorCode } | null>(null);
  const [notes, setNotes] = useState<AiFieldNotes | null>(null);
  const [choices, setChoices] = useState<{ options: FieldValue[]; runId: string } | null>(null);
  // Undo / redo of AI results for this field: each entry is the value that was in the field before (undo) or after (redo) a result.
  const [undoStack, setUndoStack] = useState<{ value: FieldValue | null; runId: string }[]>([]);
  const [redoStack, setRedoStack] = useState<{ value: FieldValue; runId: string }[]>([]);
  const last = useRef(0);
  const token = useRef(0);
  const live = useRef(true);
  const latest = useRef(o);

  useEffect(() => {
    latest.current = o;
  });

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: FieldMode, extra: AiRunExtras = {}): Promise<AiFieldResult | null> => {
      const now = Date.now();
      if (status === "running" || now - last.current < AI_FIELD_DEBOUNCE_MS) return null;
      last.current = now;
      const mine = ++token.current;
      const cur = latest.current;
      setStatus("running");
      setError(null);
      setChoices(null);
      let res: AiFieldResult;
      try {
        res = await aiFieldAction({ fieldKey: cur.fieldKey, mode, context: cur.getContext(), current: cur.value, instruction: extra.instruction, tone: extra.tone ?? cur.tone, targetLanguage: extra.targetLanguage, enumOptions: cur.enumOptions });
      } catch {
        res = { ok: false, code: "PROVIDER", error: "Couldn't reach the server. Check your connection and try again." };
      }
      if (!live.current || mine !== token.current) return res;
      if (!res.ok) {
        setStatus("error");
        setError({ message: res.error, code: res.code });
        return res;
      }
      setStatus("idle");
      setNotes({ notes: res.notes, warnings: res.warnings, sources: res.sources, estimate: res.estimate, mode });
      if (res.options?.length) {
        setChoices({ options: res.options, runId: res.runId });
      } else if (res.value !== undefined) {
        const before = latest.current.value;
        setUndoStack((s) => [...s.slice(-9), { value: before, runId: res.runId }]);
        setRedoStack([]);
        latest.current.onApply(res.value, { runId: res.runId, mode });
        void aiFieldOutcomeAction(res.runId, "applied");
      }
      return res;
    },
    [status]
  );

  /** Use one of the alternatives returned by the "options" mode. */
  const choose = useCallback((value: FieldValue) => {
    const c = choices;
    if (!c) return;
    setUndoStack((s) => [...s.slice(-9), { value: latest.current.value, runId: c.runId }]);
    setRedoStack([]);
    setChoices(null);
    latest.current.onApply(value, { runId: c.runId, mode: "options" });
    void aiFieldOutcomeAction(c.runId, "applied");
  }, [choices]);

  const undo = useCallback(() => {
    const top = undoStack[undoStack.length - 1];
    if (!top) return;
    const now = latest.current.value;
    setUndoStack((s) => s.slice(0, -1));
    if (now !== null) setRedoStack((s) => [...s.slice(-9), { value: now, runId: top.runId }]);
    latest.current.onApply(top.value ?? (def.kind === "list" || def.kind === "multienum" ? [] : ""), { runId: top.runId, mode: "generate" });
    void aiFieldOutcomeAction(top.runId, "reverted");
  }, [undoStack, def.kind]);

  const redo = useCallback(() => {
    const top = redoStack[redoStack.length - 1];
    if (!top) return;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s.slice(-9), { value: latest.current.value, runId: top.runId }]);
    latest.current.onApply(top.value, { runId: top.runId, mode: "generate" });
  }, [redoStack]);

  const dismiss = useCallback(() => {
    setError(null);
    setNotes(null);
    setChoices(null);
  }, []);

  const hasValue = valueToText(o.value).trim() !== "";
  return { def, status, error, notes, choices, run, choose, undo, redo, dismiss, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, hasValue, defaultMode: o.defaultMode ?? defaultModeFor(def, hasValue) };
}

export type AiFieldController = ReturnType<typeof useAiField>;
