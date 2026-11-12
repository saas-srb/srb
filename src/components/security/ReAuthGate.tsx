"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reauthAction, reauthSendEmailAction, reauthStatusAction, type ReAuthState } from "@/lib/security/second-step-actions";

type Method = ReAuthState["methods"][number];

/** The re-authentication form: password plus one second-step method of the person's choice, with "Try another way". */
export function ReAuthPanel({ onDone, title = "Confirm it's you" }: { onDone: () => void; title?: string }) {
  const [state, setState] = useState<ReAuthState | null>(null);
  const [method, setMethod] = useState<Method["id"] | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    reauthStatusAction().then((s) => {
      if (!live) return;
      setState(s);
      setMethod(s.methods[0]?.id ?? null);
      if (s.fresh) onDone();
    });
    return () => { live = false; };
  }, [onDone]);

  const send = () => start(async () => { setError(null); const r = await reauthSendEmailAction(); if (r.ok) setInfo(`We sent a 6-digit code to ${r.hint}. It works for 10 minutes.`); else setError(r.error); });
  const submit = () => start(async () => {
    setError(null);
    const r = await reauthAction({ password, method: method ?? undefined, code });
    if (r.ok) { setPassword(""); setCode(""); onDone(); return; }
    setError(r.error);
    if ("alternatives" in r && r.alternatives && r.alternatives.length && !r.alternatives.some((m) => m.id === method)) setMethod(r.alternatives[0].id);
  });

  if (!state) return <p className="text-xs text-muted-foreground">Loading…</p>;
  const others = state.methods.filter((m) => m.id !== method);
  return (
    <form className="space-y-3 rounded-xl border bg-background/60 p-4" onSubmit={(e) => { e.preventDefault(); submit(); }} aria-label={title}>
      <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" />{title}</p>
      <p className="text-xs text-muted-foreground">For your security, please confirm again{state.needsSecondStep ? " with your password and a second check" : " with your password"}. It stays confirmed for {state.minutes} minutes.</p>
      <div className="space-y-1.5">
        <Label htmlFor="reauth-password">Password</Label>
        <Input id="reauth-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {state.needsSecondStep && method && (
        <div className="space-y-1.5">
          <Label htmlFor="reauth-code">{method === "email" ? "Code from your email" : method === "recovery" ? "Recovery code" : "Authentication code"}</Label>
          <Input id="reauth-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode={method === "recovery" ? "text" : "numeric"} autoComplete="one-time-code" maxLength={20} placeholder={method === "recovery" ? "xxxxx-xxxxx" : "6-digit code"} />
          {method === "email" && <button type="button" onClick={send} disabled={pending} className="text-xs font-medium text-primary hover:underline">Email me a code</button>}
          {others.length > 0 && (
            <div role="group" aria-label="Try another way" className="pt-1">
              <p className="text-xs font-medium text-muted-foreground">Try another way</p>
              <ul className="mt-1 space-y-1">{others.map((m) => <li key={m.id}><button type="button" className="text-left text-sm font-medium text-primary hover:underline" onClick={() => { setMethod(m.id); setCode(""); setError(null); if (m.id === "email") send(); }}>{m.label}</button></li>)}</ul>
            </div>
          )}
        </div>
      )}
      {state.needsSecondStep && !method && <p className="text-sm text-muted-foreground">We can&apos;t verify you with the methods available on this account right now. Try again in a few minutes.</p>}
      {info && <p role="status" className="text-xs text-muted-foreground">{info}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending || !password}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Confirm"}</Button>
    </form>
  );
}

/** Shows `children` once the person has re-authenticated recently; until then the confirmation form. One mechanism for every sensitive area. */
export default function ReAuthGate({ children, title }: { children: ReactNode; title?: string }) {
  const [fresh, setFresh] = useState<boolean | null>(null);
  useEffect(() => { reauthStatusAction().then((s) => setFresh(s.fresh)); }, []);
  const ok = useCallback(() => setFresh(true), []);
  if (fresh === null) return <p className="text-xs text-muted-foreground">Loading…</p>;
  return fresh ? <>{children}</> : <ReAuthPanel onDone={ok} title={title} />;
}

/**
 * For actions: `guard(run)` runs `run()`; if it answers "please confirm it's you first" the form opens and `run` is retried once confirmed.
 * Render `panel` somewhere near the controls.
 */
export function useReAuth() {
  const [retry, setRetry] = useState<null | (() => void)>(null);
  const guard = useCallback(async <T extends { ok: boolean; reauth?: boolean }>(run: () => Promise<T>): Promise<T> => {
    const r = await run();
    if (!r.ok && r.reauth) setRetry(() => () => void run());
    return r;
  }, []);
  const done = useCallback(() => { const r = retry; setRetry(null); r?.(); }, [retry]);
  return { guard, panel: retry ? <ReAuthPanel onDone={done} /> : null };
}
