"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { paymentCodeInfoAction, sendPaymentCodeAction } from "@/lib/security/payment-code-actions";

/**
 * The confirmation code asked before money leaves the company. Shows nothing when the company has switched the code off. The person types
 * the code from their authenticator app, or presses "Send code" to get one by email; the form sends it with the payment.
 */
export default function PaymentCodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [info, setInfo] = useState<{ required: boolean; method: "app" | "email" } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    paymentCodeInfoAction().then((r) => live && setInfo(r)).catch(() => live && setInfo({ required: true, method: "email" }));
    return () => {
      live = false;
    };
  }, []);

  if (info && !info.required) return null;

  function send() {
    setError(null);
    start(async () => {
      const r = await sendPaymentCodeAction();
      if (r.ok) setHint(r.hint ?? "Code sent.");
      else setError(r.error ?? "Could not send the code.");
    });
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <Label className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" />Confirmation code</Label>
      <div className="flex gap-2">
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={value} onChange={(e) => onChange(e.target.value)} placeholder="6-digit code" />
        {info?.method !== "app" && <Button type="button" variant="outline" disabled={pending} onClick={send}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Send code"}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{hint ?? (info?.method === "app" ? "Enter the current code from your authenticator app." : "Money only leaves after you confirm with a code sent to your email.")}</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
