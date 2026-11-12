"use client";

import { useEffect, useState } from "react";
import { KeyRound, LifeBuoy, Mail, MessageSquare, Smartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ScreenMethod = "app" | "email" | "sms" | "recovery";
export interface ScreenRow {
  id: ScreenMethod;
  title: string;
  description: string;
  status: "available" | "unavailable" | "not_set_up";
}
export interface SecondStepView {
  method: ScreenMethod;
  methods: ScreenRow[];
  hint?: string;
  info?: string;
  error?: string;
  resendIn?: number;
  nothingUsable?: boolean;
  supportEmail?: string;
  trustAllowed?: boolean;
}

const ICON = { app: Smartphone, email: Mail, sms: MessageSquare, recovery: KeyRound } as const;
const LABEL: Record<ScreenMethod, string> = { app: "Authentication code", email: "Code from your email", sms: "Code from your text message", recovery: "Recovery code" };

/**
 * The second step of sign-in, shown inside the sign-in form after a correct password: the chosen method's input, then ALWAYS the list of every
 * way to continue ("Try another way"). Each row is a submit button (`name="method"`), so switching is one click and the password and email stay in
 * the form. A method the account hasn't set up is greyed with a neutral hint. Presentational: the form owns submitting.
 */
export default function SecondStepScreen({ view, inputId }: { view: SecondStepView; inputId: string }) {
  const [left, setLeft] = useState(view.resendIn ?? 0);
  useEffect(() => { setLeft(view.resendIn ?? 0); }, [view.resendIn, view.method]);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  /** Submits the surrounding form with an extra field (so "Sign in" stays the Enter key's default and the typed email/password stay as they are). */
  const go = (btn: HTMLButtonElement, name: string, value: string) => {
    const form = btn.form;
    if (!form) return;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
    form.requestSubmit();
    setTimeout(() => input.remove(), 0);
  };

  const sends = view.method === "email" || view.method === "sms";
  const listId = `${inputId}-methods`;

  return (
    <div className="space-y-4">
      <input type="hidden" name="current" value={view.method} />

      {view.info && <p role="status" className="rounded-lg bg-primary/[0.07] px-3 py-2 text-sm text-foreground">{view.info}</p>}

      {!view.nothingUsable && (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>{LABEL[view.method]}</Label>
          <Input id={inputId} name="code" inputMode={view.method === "recovery" ? "text" : "numeric"} autoComplete="one-time-code" autoFocus placeholder={view.method === "recovery" ? "xxxxx-xxxxx" : "6-digit code"} maxLength={20} aria-describedby={view.error ? `${inputId}-error` : undefined} aria-invalid={view.error ? true : undefined} />
          {view.error && <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{view.error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
            {sends ? (
              <button type="button" onClick={(e) => go(e.currentTarget, "resend", "1")} disabled={left > 0} className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">
                {left > 0 ? `Resend code in ${left}s` : "Resend code"}
              </button>
            ) : <span />}
            <a href={`#${listId}`} className="font-medium text-primary hover:underline">Use a different method</a>
          </div>
          {view.trustAllowed && (
            <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground"><input type="checkbox" name="trust" value="1" className="size-4" /> Trust this device for 30 days</label>
          )}
        </div>
      )}

      <div id={listId} role="group" aria-labelledby={`${listId}-title`} className="space-y-2" tabIndex={-1}>
        <p id={`${listId}-title`} className="text-sm font-semibold text-foreground">Try another way</p>
        <ul className="space-y-2">
          {view.methods.map((m) => {
            const Icon = ICON[m.id];
            const current = m.id === view.method && !view.nothingUsable;
            const usable = m.status === "available";
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={(e) => go(e.currentTarget, "method", m.id)}
                  disabled={!usable || current}
                  aria-current={current ? "true" : undefined}
                  className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors", current ? "border-primary bg-primary/[0.06]" : usable ? "bg-background hover:border-primary/50 hover:bg-primary/[0.04]" : "cursor-not-allowed bg-muted/40 opacity-60")}
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", usable ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><Icon className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">{m.title}{current && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">In use</span>}</span>
                    <span className="block text-xs text-muted-foreground">{m.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {view.nothingUsable && view.supportEmail && (
        <a href={`mailto:${view.supportEmail}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><LifeBuoy className="size-4" />Contact support</a>
      )}
    </div>
  );
}
