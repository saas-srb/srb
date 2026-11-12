"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, Loader2, Mail, MessageSquare, Printer, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReAuth } from "@/components/security/ReAuthGate";
import {
  confirmAuthenticatorAction,
  confirmSmsAction,
  removeSmsAction,
  startSmsAction,
  disableEmailMethodAction,
  enableEmailMethodAction,
  regenerateRecoveryAction,
  removeAuthenticatorAction,
  revokeTrustedDeviceAction,
  secondStepStateAction,
  sendEmailMethodCodeAction,
  setPreferredAction,
  startAuthenticatorAction,
  type SecondStepState,
} from "@/lib/security/second-step-actions";

/** The one explanation shown wherever the second step can be set: the profile panel, Security & sessions and the setup page. */
export const TWO_STEP_DESCRIPTION = "Your choice: extra checks when you sign in. Use an authenticator app, a code sent to your email, or both, and keep recovery codes as a back-up. If one doesn't work you can always try another way.";

export interface TwoStepState {
  method: "app" | "email" | "sms" | null;
  enabledAt: string | null;
  recoveryLeft: number;
  available: boolean;
  email: string;
}

function downloadCodes(codes: string[]) {
  const text = ["Sign-in recovery codes", `Created: ${new Date().toLocaleString("en-IN")}`, "", "Each code works once if you can't use your other sign-in checks.", "Keep this file somewhere safe and private.", "", ...codes, ""].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "recovery-codes.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Row({ icon: Icon, title, status, children }: { icon: typeof Mail; title: string; status: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-background/60 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{status}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The signed-in person's second-step methods: authenticator app, email code and recovery codes, any combination, with a preferred method.
 * Every change asks to confirm it's you first (password plus a method they already have). Used in the profile panel, on Security & sessions
 * and on the setup page.
 */
export default function TwoStepSettings({ onMethodChange }: { initial?: TwoStepState | null; onMethodChange?: (method: TwoStepState["method"]) => void }) {
  const [s, setS] = useState<SecondStepState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { guard, panel } = useReAuth();
  const [app, setApp] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [emailStep, setEmailStep] = useState<null | { purpose: "enable" | "disable"; hint: string }>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [smsStep, setSmsStep] = useState<null | { stage: "number" | "code"; hint?: string }>(null);
  const [phone, setPhone] = useState("");

  const reload = () => secondStepStateAction().then(setS).catch(() => setError("Couldn't load your sign-in settings."));
  useEffect(() => { void reload(); }, []);
  const method = s ? (s.preferred ?? (s.authenticator.on ? "app" : s.email.on ? "email" : null)) : undefined;
  useEffect(() => { if (method !== undefined) onMethodChange?.(method); // eslint-disable-next-line react-hooks/exhaustive-deps -- reports changes of the method only
  }, [method]);

  if (!s) return <p className="text-xs text-muted-foreground">{error ?? "Loading…"}</p>;
  const run = <T extends { ok: boolean; error?: string; reauth?: boolean }>(fn: () => Promise<T>, after?: (r: T) => void) =>
    start(async () => {
      setError(null);
      const r = await guard(fn);
      if (r.ok) { after?.(r); await reload(); } else if (!r.reauth) setError(r.error ?? "That didn't work.");
    });

  const effective = s.preferred ?? (s.authenticator.on ? "app" : s.email.on ? "email" : s.sms.on ? "sms" : null);
  const onCount = [s.authenticator.on, s.email.on, s.sms.on].filter(Boolean).length;
  const Preferred = ({ id }: { id: "app" | "email" | "sms" }) =>
    onCount > 1 ? (
      effective === id ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">Preferred</span> : <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setPreferredAction(id))}>Make preferred</Button>
    ) : null;

  return (
    <div className="space-y-3">
      {s.required && <p className="rounded-lg bg-primary/[0.07] px-3 py-2 text-xs text-muted-foreground">A second step is required for your account, so the last method can&apos;t be turned off.</p>}
      {panel}

      <Row icon={Smartphone} title="Authenticator app" status={s.authenticator.on ? `On${s.authenticator.since ? ` since ${new Date(s.authenticator.since).toLocaleDateString("en-IN")}` : ""}.` : s.authenticator.available ? "Off. A 6-digit code from Google Authenticator, Microsoft Authenticator, Authy or 1Password." : "Not available right now."}>
        {app ? (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => confirmAuthenticatorAction(code), (r) => { setApp(null); setCode(""); if ("recovery" in r && r.recovery.length) setCodes(r.recovery); }); }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL QR code */}
            <img src={app.qr} alt="QR code for your authenticator app" width={192} height={192} className="rounded-lg border bg-white" />
            <p className="text-xs text-muted-foreground">Scan it, or type this key: <span className="break-all font-mono text-foreground">{app.secret}</span></p>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={7} className="w-40" aria-label="6-digit code from your app" />
              <Button type="submit" size="sm" disabled={pending || code.replace(/\D/g, "").length < 6}>Confirm</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setApp(null); setCode(""); }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {s.authenticator.available && <Button type="button" size="sm" variant={s.authenticator.on ? "outline" : "default"} disabled={pending} onClick={() => run(() => startAuthenticatorAction(), (r) => { if ("secret" in r) setApp({ secret: r.secret, qr: r.qr }); })}>{s.authenticator.on ? "Replace" : "Set up"}</Button>}
            {s.authenticator.on && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeAuthenticatorAction())}>Turn off</Button>}
            {s.authenticator.on && <Preferred id="app" />}
          </div>
        )}
      </Row>

      {s.email.allowed || s.email.on ? (
        <Row icon={Mail} title="Email code" status={s.email.on ? `On. A 6-digit code is sent to ${s.email.masked}.` : `Off. A 6-digit code sent to ${s.email.masked} each time you sign in.`}>
          {emailStep ? (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => (emailStep.purpose === "enable" ? enableEmailMethodAction(code) : disableEmailMethodAction(code)), () => { setEmailStep(null); setCode(""); }); }}>
              <p className="text-xs text-muted-foreground">We sent a code to {emailStep.hint}. It works for 10 minutes.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={7} className="w-40" aria-label="6-digit code from your email" />
                <Button type="submit" size="sm" disabled={pending || code.replace(/\D/g, "").length < 6}>{emailStep.purpose === "enable" ? "Turn on" : "Confirm turn off"}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setEmailStep(null); setCode(""); }}>Cancel</Button>
              </div>
            </form>
          ) : (
            <Button type="button" size="sm" variant={s.email.on ? "outline" : "default"} disabled={pending} onClick={() => run(() => sendEmailMethodCodeAction(s.email.on ? "disable" : "enable"), (r) => { if ("hint" in r) setEmailStep({ purpose: s.email.on ? "disable" : "enable", hint: r.hint }); })}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : s.email.on ? "Turn off" : "Send me a code to turn on"}
            </Button>
          )}
          {s.email.on && !emailStep && <Preferred id="email" />}
        </Row>
      ) : null}

      {s.sms.allowed || s.sms.on ? (
        <Row icon={MessageSquare} title="SMS code" status={s.sms.on ? `On. A 6-digit code is texted to ${s.sms.masked}.` : s.sms.configured ? "Off. A 6-digit code texted to your mobile number each time you sign in." : "Not available right now."}>
          {smsStep ? (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (smsStep.stage === "number") run(() => startSmsAction(phone), (r) => { if ("hint" in r) setSmsStep({ stage: "code", hint: r.hint }); }); else run(() => confirmSmsAction(code), () => { setSmsStep(null); setCode(""); setPhone(""); }); }}>
              {smsStep.stage === "number" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" className="w-48" aria-label="Mobile number" />
                  <Button type="submit" size="sm" disabled={pending || phone.replace(/\D/g, "").length < 10}>Send code</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setSmsStep(null); setPhone(""); }}>Cancel</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">We texted a code to {smsStep.hint}. It works for 10 minutes.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={7} className="w-40" aria-label="6-digit code from your text message" />
                    <Button type="submit" size="sm" disabled={pending || code.replace(/\D/g, "").length < 6}>Confirm</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setSmsStep(null); setCode(""); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {s.sms.configured && <Button type="button" size="sm" variant={s.sms.on ? "outline" : "default"} disabled={pending} onClick={() => setSmsStep({ stage: "number" })}>{s.sms.on ? "Change number" : "Add phone number"}</Button>}
              {s.sms.on && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeSmsAction())}>Turn off</Button>}
              {s.sms.on && <Preferred id="sms" />}
            </div>
          )}
        </Row>
      ) : null}

      <Row icon={ShieldCheck} title="Recovery codes" status={s.recoveryLeft > 0 ? `${s.recoveryLeft} unused code(s). Each works once if you can't use your other checks.` : "None yet. Make a set and keep it somewhere safe."}>
        {codes ? (
          <div className="space-y-2" role="status">
            <p className="text-xs text-muted-foreground">Save these now. They are shown only this once. Older codes no longer work.</p>
            <ul className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-3 font-mono text-sm sm:grid-cols-5">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}>Copy</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => downloadCodes(codes)}><Download className="size-4" data-icon="inline-start" />Download</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4" data-icon="inline-start" />Print</Button>
              <Button type="button" size="sm" onClick={() => setCodes(null)}>I&apos;ve saved them</Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => regenerateRecoveryAction(), (r) => { if ("codes" in r) setCodes(r.codes); })}>{s.recoveryLeft > 0 ? "Make new codes" : "Make recovery codes"}</Button>
        )}
      </Row>

      {s.trustAllowed && (
        <div className="space-y-1 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Trusted devices (skip the second step for {s.trustDays} days)</p>
          {s.trusted.length === 0 ? <p className="text-xs text-muted-foreground">None. Tick &quot;Trust this device&quot; when you sign in to add one.</p> : (
            <ul className="space-y-1">{s.trusted.map((d) => <li key={d.hash} className="flex items-center justify-between gap-2 text-xs"><span>{d.label} · until {new Date(d.expiresAt).toLocaleDateString("en-IN")}</span><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeTrustedDeviceAction(d.hash))}>Remove</Button></li>)}</ul>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
