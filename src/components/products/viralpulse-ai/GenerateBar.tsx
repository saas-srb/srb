"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: boolean; error?: string };

/**
 * "Generate with AI" / "Regenerate" plus an optional refinement instruction
 * ("shorter", "more playful", "focus on the offer"…). Each run is saved as a
 * new version, so nothing generated earlier is lost.
 */
export default function GenerateBar({ hasContent, generate, disabled, disabledReason, label }: { hasContent: boolean; generate: (instruction?: string) => Promise<Result>; disabled?: boolean; disabledReason?: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [instruction, setInstruction] = useState("");

  function go(withInstruction: boolean) {
    start(async () => {
      const res = await generate(withInstruction ? instruction.trim() : undefined);
      if (!res.ok) toast.error(res.error ?? "Generation failed.");
      else {
        toast.success(hasContent ? "Regenerated — saved as a new version." : "Generated — saved as version 1.");
        setInstruction("");
        router.refresh();
      }
    });
  }

  if (disabled) return <p className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">{disabledReason}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2">
      <Button type="button" size="sm" onClick={() => go(false)} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {pending ? "Generating…" : hasContent ? "Regenerate" : (label ?? "Generate with AI")}
      </Button>
      {hasContent && (
        <>
          <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Refine: e.g. shorter, more playful, lead with the offer" className="h-8 min-w-48 flex-1" maxLength={1000} disabled={pending} onKeyDown={(e) => { if (e.key === "Enter" && instruction.trim()) { e.preventDefault(); go(true); } }} />
          <Button type="button" size="sm" variant="outline" onClick={() => go(true)} disabled={pending || !instruction.trim()}>
            <Wand2 className="size-4" /> Refine
          </Button>
        </>
      )}
      {pending && <span className="w-full text-[11px] text-muted-foreground">OpenAI is writing — this usually takes 10–40 seconds.</span>}
    </div>
  );
}
