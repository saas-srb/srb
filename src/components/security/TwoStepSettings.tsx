"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, Loader2, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TwoFactorCard from "@/app/(products)/commandos/(protected)/settings/security/TwoFactorCard";
import { disableEmailTwoFactorAction, enableEmailTwoFactorAction, sendTwoStepEmailCodeAction } from "@/app/(products)/commandos/(protected)/settings/security/actions";

/** The one explanation shown wherever two-step sign-in can be set: the profile panel, Security & sessions and the setup page. */
export const TWO_STEP_DESCRIPTION = "Your choice: an extra check when you sign in, with an authenticator app or a code sent to your email. Turn it on or off any time.";

export interface TwoStepState {
  method: "app" | "email" | null;
  enabledAt: string | null;
  recoveryLeft: number;
  /** The authenticator app needs the server's encryption key. */
  available: boolean;
  /** The person's own address, masked (`j***@acme.com`): where email codes go. */
  email: string;
}

/** Email codes: ask for a code, type it, done. The same steps turn it off again (a code sent to the address proves it is still the owner). */
function EmailCodeCard({ enabled, email, enabledAt, onChange, onBack }: { enabled: boolean; email: string; enabledAt: string | null; onChange: (on: boolean) => void; onBack?: () => void }) {
  const [hint, setHint] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [pending, start] = useTransition();
  const purpose = enabled ? "disable" : "enable";

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = () =>
    start(async () => {
      setError(null);
      const r = await sendTwoStepEmailCodeAction(purpose);
      if (r.ok) { setHint(r.hint); setAsking(true); setWait(30); } else setError(r.error);
    });
  const confirm = () =>
    start(async () => {
      setError(null);
      const r = await (enabled ? disableEmailTwoFactorAction(code) : enableEmailTwoFactorAction(code));
      if (r.ok) { setAsking(false); setHint(null); setCode(""); onChange(!enabled); } else setError(r.error);
    });

  return (
    <div className="space-y-3">
      {enabled ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600"><ShieldCheck className="size-4" />Email codes are on{enabledAt ? ` since ${new Date(enabledAt).toLocaleDateString("en-IN")}` : ""}.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Each time you sign in with your password, we email a 6-digit code to <b className="text-foreground">{email}</b>. Enter it to finish signing in.</p>
      )}
      {!asking ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={enabled ? "outline" : "default"} disabled={pending} onClick={send}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" data-icon="inline-start" />}
            {enabled ? "Turn off" : "Send me a code to turn on"}
          </Button>
          {onBack && !enabled && <Button type="button" size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="size-4" data-icon="inline-start" />Back</Button>}
        </div>
      ) : (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); confirm(); }}>
          <p className="text-xs text-muted-foreground">We sent a code to {hint ?? email}. It works for 10 minutes. {enabled ? "Enter it to turn email codes off." : "Enter it to turn email codes on."}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={7} className="w-40" aria-label="6-digit code from your email" autoFocus />
            <Button type="submit" size="sm" disabled={pending || code.replace(/\D/g, "").length < 6}>{enabled ? "Confirm turn off" : "Turn on"}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending || wait > 0} onClick={send}>{wait > 0 ? `New code in ${wait}s` : "Send a new code"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAsking(false); setCode(""); setError(null); }}>Cancel</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Option({ icon: Icon, title, text, onClick, disabled, note }: { icon: typeof Mail; title: string; text: string; onClick: () => void; disabled?: boolean; note?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex w-full items-start gap-3 rounded-xl border bg-background/60 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04] disabled:cursor-not-allowed disabled:opacity-60">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{note ?? text}</span>
      </span>
    </button>
  );
}

/**
 * The signed-in person's own two-step sign-in: off, an authenticator app, or a code sent by email, one at a time. Theirs to turn on or off;
 * no company or platform setting decides it. Used in the profile panel, on Security & sessions and on the setup page.
 */
export default function TwoStepSettings({ initial = null, onMethodChange }: { initial?: TwoStepState | null; onMethodChange?: (method: TwoStepState["method"]) => void }) {
  const [state, setState] = useState<TwoStepState | "unavailable" | null>(initial);
  const [choice, setChoice] = useState<"app" | "email" | null>(null);
  const method = typeof state === "object" && state ? state.method : undefined;
  useEffect(() => {
    if (method !== undefined) onMethodChange?.(method);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reports when the method changes, not when the callback does
  }, [method]);

  useEffect(() => {
    if (initial) return;
    let live = true;
    fetch("/api/account/two-factor", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: TwoStepState) => live && setState(j))
      .catch(() => live && setState("unavailable"));
    return () => { live = false; };
  }, [initial]);

  if (state === null) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (state === "unavailable") return <p className="text-xs text-muted-foreground">Two-step sign-in isn&apos;t available for this account.</p>;

  const set = (patch: Partial<TwoStepState>) => setState({ ...state, ...patch });
  const showApp = state.method === "app" || choice === "app";
  const showEmail = state.method === "email" || choice === "email";

  if (showApp) {
    return (
      <div className="space-y-3">
        <TwoFactorCard
          status={{ enabled: state.method === "app", enabledAt: state.method === "app" ? state.enabledAt : null, recoveryLeft: state.recoveryLeft, available: state.available }}
          onChange={(on) => { set({ method: on ? "app" : null, enabledAt: on ? new Date().toISOString() : null }); if (!on) setChoice(null); }}
        />
        {state.method !== "app" && <Button type="button" size="sm" variant="ghost" onClick={() => setChoice(null)}><ArrowLeft className="size-4" data-icon="inline-start" />Back</Button>}
      </div>
    );
  }
  if (showEmail) {
    return <EmailCodeCard enabled={state.method === "email"} email={state.email} enabledAt={state.enabledAt} onChange={(on) => { set({ method: on ? "email" : null, enabledAt: on ? new Date().toISOString() : null }); if (!on) setChoice(null); }} onBack={() => setChoice(null)} />;
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><ShieldCheck className="size-4" />Two-step sign-in is off. Your password alone signs you in.</p>
      <p className="text-sm text-muted-foreground">Turn it on to ask for a second check as well, so a stolen password alone can&apos;t open your account. It&apos;s your choice, and you can turn it off any time.</p>
      <div className="grid gap-2">
        <Option icon={Smartphone} title="Authenticator app" text="A 6-digit code from Google Authenticator, Microsoft Authenticator, Authy or 1Password. Works without internet." note={state.available ? undefined : "Not available on this server yet. Ask your platform administrator."} disabled={!state.available} onClick={() => setChoice("app")} />
        <Option icon={Mail} title="Email code" text={`A 6-digit code sent to ${state.email} each time you sign in.`} onClick={() => setChoice("email")} />
      </div>
    </div>
  );
}
