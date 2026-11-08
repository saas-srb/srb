"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDangerAction, startDangerAction } from "./actions";

export type DangerAction = "restore" | "wipe" | "delete";

const STEPS = ["Understand", "Company name", "Confirm phrase", "Your password"] as const;

/**
 * The multi-step confirmation for a destructive action: read what will happen, type the company's name, type the phrase, then prove it is
 * you with your password (and two-step code). The server checks every step again; nothing happens before the last one.
 */
export default function DangerDialog({ action, title, consequences, confirmLabel, refId, onClose, onDone }: { action: DangerAction; title: string; consequences: string[]; confirmLabel: string; refId?: string; onClose: () => void; onDone: (message: string) => void }) {
  const [step, setStep] = useState(0);
  const [ack, setAck] = useState(false);
  const [ch, setCh] = useState<{ token: string; phrase: string; companyName: string } | null>(null);
  const [name, setName] = useState("");
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const next = () => {
    setError(null);
    if (step === 0) {
      start(async () => {
        const r = await startDangerAction(action, refId);
        if (r.ok) { setCh(r); setStep(1); } else setError(r.error);
      });
    } else if (step === 1) {
      if (name.trim() !== ch?.companyName.trim()) return setError("That isn't the company's exact name.");
      setStep(2);
    } else if (step === 2) {
      if (phrase.trim() !== ch?.phrase) return setError(`Type ${ch?.phrase} exactly.`);
      setStep(3);
    } else {
      start(async () => {
        const r = await confirmDangerAction(action, { token: ch!.token, typedName: name, phrase, password, code });
        if (r.ok) onDone(r.message); else setError(r.error);
      });
    }
  };
  const canNext = step === 0 ? ack : step === 1 ? name.trim().length > 0 : step === 2 ? phrase.trim().length > 0 : password.length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg rounded-2xl border bg-background p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><AlertTriangle className="size-5 text-destructive" />{title}</h2>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>
        <ol className="mt-3 flex gap-1.5 text-[11px] font-semibold" aria-label="Steps">
          {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={`flex-1 rounded-full px-2 py-1 text-center ${i === step ? "bg-destructive text-destructive-foreground" : i < step ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>{i + 1}. {s}</li>)}
        </ol>

        <div className="mt-4 space-y-3 text-sm">
          {step === 0 && (
            <>
              <ul className="list-disc space-y-1.5 pl-5">{consequences.map((c) => <li key={c}>{c}</li>)}</ul>
              <label className="flex items-start gap-2 rounded-lg border p-3"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>I understand what will happen and that I am the one asking for it.</span></label>
            </>
          )}
          {step === 1 && (
            <>
              <p>Type the company&apos;s name exactly as it is written here:</p>
              <p className="select-all rounded bg-muted px-2 py-1 font-semibold">{ch?.companyName}</p>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Company name" autoComplete="off" />
            </>
          )}
          {step === 2 && (
            <>
              <p>Now type this phrase exactly:</p>
              <p className="select-all rounded bg-muted px-2 py-1 font-mono font-semibold">{ch?.phrase}</p>
              <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus aria-label="Confirmation phrase" autoComplete="off" />
            </>
          )}
          {step === 3 && (
            <>
              <p>Last step: confirm it is you.</p>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus placeholder="Your password" aria-label="Your password" autoComplete="current-password" />
              <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="Two-step code (only if you use it)" aria-label="Two-step code" autoComplete="one-time-code" />
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => (step === 0 ? onClose() : (setError(null), setStep(step - 1)))} disabled={pending}>{step === 0 ? "Cancel" : "Back"}</Button>
          <Button type="button" size="sm" variant={step === 3 ? "destructive" : "default"} onClick={next} disabled={!canNext || pending}>{pending ? "Working…" : step === 3 ? confirmLabel : "Continue"}</Button>
        </div>
      </div>
    </div>
  );
}
