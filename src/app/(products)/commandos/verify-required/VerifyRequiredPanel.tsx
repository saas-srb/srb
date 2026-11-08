"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, MailCheck, RefreshCw } from "lucide-react";
import { recheckLapseAction, sendLapseVerificationAction, type VerifyRequiredState } from "./actions";

const COOLDOWN_S = 30;

export default function VerifyRequiredPanel({ own }: { own: boolean }) {
  const [state, setState] = useState<VerifyRequiredState>({ status: "idle" });
  const [cooldown, setCooldown] = useState(0);
  const [sending, startSend] = useTransition();
  const [checking, startCheck] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = () =>
    startSend(async () => {
      const res = await sendLapseVerificationAction().catch((): VerifyRequiredState => ({ status: "error", error: "Something went wrong. Please try again." }));
      setState(res);
      if (res.status === "sent") setCooldown(COOLDOWN_S);
    });
  const check = () =>
    startCheck(async () => {
      const res = await recheckLapseAction().catch((): VerifyRequiredState => ({ status: "error", error: "Something went wrong. Please try again." }));
      setState(res); // on success the action redirects
    });

  return (
    <div className="mt-6 space-y-3">
      <button
        type="button"
        onClick={send}
        disabled={sending || cooldown > 0}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <MailCheck className="size-4" />}
        {cooldown > 0 ? `Send again in ${cooldown}s` : state.status === "sent" ? "Send the email again" : own ? "Send me the verification email" : "Send the Director the verification email"}
      </button>
      <button
        type="button"
        onClick={check}
        disabled={checking}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
      >
        {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}I&apos;ve verified — check again
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-center text-xs">
        {state.status === "sent" && <span className="text-emerald-600">Link sent to {state.email}. It works for 24 hours — check spam too.</span>}
        {state.status === "error" && <span className="text-destructive">{state.error}</span>}
      </p>
    </div>
  );
}
