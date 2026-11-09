"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { wordDiff } from "@/lib/products/playbook-ai/diff";
import { TEXT_ACTION_LABEL, type AiTextTools, type TextAction } from "@/lib/products/playbook-ai/ai/edit-types";

export interface AiTextRequest { action: TextAction; selected: string }

/**
 * The preview step of the selection toolbar and "Help me write": the AI result is shown (as a word diff against the selection when there is
 * one) and nothing touches the document until the person presses Accept. Reject closes it; Try again asks once more.
 */
export default function AiTextDialog({ request, tools, onAccept, onClose }: { request: AiTextRequest | null; tools: AiTextTools; onAccept: (text: string, action: TextAction) => void; onClose: () => void }) {
  const needsInstruction = request?.action === "custom" || request?.action === "write";
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<{ phase: "idle" | "working" | "done" | "error"; text?: string; error?: string }>({ phase: "idle" });
  const run = useRef(0);

  function go(r: AiTextRequest, ins: string) {
    const my = ++run.current;
    setState({ phase: "working" });
    void tools.transform({ action: r.action, instruction: ins || undefined, selected: r.selected }).then((res) => {
      if (my !== run.current) return;
      setState(res.ok ? { phase: "done", text: res.text } : { phase: "error", error: res.message });
    }).catch(() => { if (my === run.current) setState({ phase: "error", error: "The AI request failed. Try again." }); });
  }
  useEffect(() => {
    run.current++;
    setInstruction("");
    setState({ phase: "idle" });
    if (request && request.action !== "custom" && request.action !== "write") go(request, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const segs = state.phase === "done" && request && request.selected ? wordDiff(request.selected, state.text ?? "") : null;
  return (
    <Dialog open={request !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> {request ? TEXT_ACTION_LABEL[request.action] : ""}</DialogTitle>
          <DialogDescription>{request?.action === "write" ? "Describe what to write. You see a preview before anything is added." : "You see a preview before anything changes."}</DialogDescription>
        </DialogHeader>
        {needsInstruction && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (request && instruction.trim().length >= 3) go(request, instruction.trim()); }}>
            <input autoFocus autoComplete="off" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm" value={instruction} maxLength={800} onChange={(e) => setInstruction(e.target.value)} placeholder={request?.action === "write" ? "For example: a checklist of onboarding documents" : "For example: make it sound less strict"} aria-label="Instruction" />
            <Button type="submit" disabled={instruction.trim().length < 3 || state.phase === "working"}>Go</Button>
          </form>
        )}
        <div className="min-h-24 rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
          {state.phase === "working" && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Writing…</p>}
          {state.phase === "error" && <p className="text-destructive" role="alert">{state.error}</p>}
          {state.phase === "idle" && <p className="text-muted-foreground">{request?.selected ? `Selected: “${request.selected.slice(0, 200)}${request.selected.length > 200 ? "…" : ""}”` : "Nothing is selected."}</p>}
          {state.phase === "done" && (segs ? <p className="whitespace-pre-wrap">{segs.map((s, i) => <span key={i} className={s.op === "add" ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300" : s.op === "remove" ? "bg-red-500/20 text-red-800 line-through dark:text-red-300" : ""}>{s.text}</span>)}</p> : <p className="whitespace-pre-wrap">{state.text}</p>)}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Reject</Button>
          <Button variant="outline" disabled={state.phase === "working" || (needsInstruction && instruction.trim().length < 3)} onClick={() => request && go(request, instruction.trim())}>Try again</Button>
          <Button disabled={state.phase !== "done"} onClick={() => request && state.text && onAccept(state.text, request.action)}>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
