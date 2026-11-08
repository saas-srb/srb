"use client";

import { useState, useTransition } from "react";
import { Download, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmTwoFactorAction, disableTwoFactorAction, startTwoFactorAction } from "./actions";

type Status = { enabled: boolean; enabledAt: string | null; recoveryLeft: number; available: boolean };

/** Saves the recovery codes as a plain text file on this device (made in the browser; nothing is sent anywhere). */
function downloadCodes(codes: string[]) {
  const text = ["Two-step sign-in recovery codes", `Created: ${new Date().toLocaleString("en-IN")}`, "", "Each code works once if you lose access to your authenticator app.", "Keep this file somewhere safe and private.", "", ...codes, ""].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "recovery-codes.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Turn two-step sign-in on or off: scan the QR code, confirm one code, keep the recovery codes. */
export default function TwoFactorCard({ status, onChange }: { status: Status; onChange?: (enabled: boolean) => void }) {
  const [enabled, setEnabled] = useState(status.enabled);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!status.available && !enabled) return <p className="text-sm text-muted-foreground">Two-step sign-in isn&apos;t available on this server yet. Ask your platform administrator to set the encryption key.</p>;

  if (recovery) {
    return (
      <div className="space-y-3" role="status">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600"><ShieldCheck className="size-4" />Two-step sign-in is on.</p>
        <p className="text-sm text-muted-foreground">Save these recovery codes somewhere safe. Each works once if you lose your phone. They are shown only now.</p>
        <ul className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-3 font-mono text-sm sm:grid-cols-5">{recovery.map((c) => <li key={c}>{c}</li>)}</ul>
        <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(recovery.join("\n"))}>Copy codes</Button>
        <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => downloadCodes(recovery)}><Download className="size-4" data-icon="inline-start" />Download codes</Button>
        <Button type="button" size="sm" className="ml-2" onClick={() => setRecovery(null)}>I&apos;ve saved them</Button>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600"><ShieldCheck className="size-4" />Two-step sign-in is on{status.enabledAt ? ` since ${new Date(status.enabledAt).toLocaleDateString("en-IN")}` : ""}.</p>
        {!asking ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setAsking(true)}>Turn off</Button>
        ) : (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => { const r = await disableTwoFactorAction(code); if (r.ok) { setEnabled(false); setAsking(false); setCode(""); onChange?.(false); } else setError(r.error); }); }}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="Code or recovery code" className="w-56" aria-label="Authentication code" />
            <Button type="submit" size="sm" disabled={pending || !code.trim()}>Confirm turn off</Button>
          </form>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (setup) {
    return (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => { const r = await confirmTwoFactorAction(code); if (r.ok) { setRecovery(r.recovery); setEnabled(true); setSetup(null); setCode(""); onChange?.(true); } else setError(r.error); }); }}>
        <p className="text-sm text-muted-foreground">1. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…). 2. Enter the 6-digit code it shows.</p>
        <div className="flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={160} height={160} className="rounded-lg border bg-white p-1" />
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Can&apos;t scan? Enter this key in the app:</p>
            <p className="select-all break-all rounded bg-muted px-2 py-1 font-mono text-xs">{setup.secret}</p>
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={7} className="w-40" aria-label="6-digit code" />
            <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending || code.replace(/\s/g, "").length < 6}>Turn on</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setSetup(null); setCode(""); setError(null); }}>Cancel</Button></div>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Ask for a code from your phone as well as your password, so a stolen password alone can&apos;t open your account.</p>
      <Button type="button" size="sm" disabled={pending} onClick={() => { setError(null); start(async () => { const r = await startTwoFactorAction(); if (r.ok) setSetup(r); else setError(r.error); }); }}><KeyRound className="size-4" data-icon="inline-start" />Set up two-step sign-in</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
