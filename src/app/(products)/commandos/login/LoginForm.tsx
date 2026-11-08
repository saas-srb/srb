"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, LayoutDashboard, LogOut, MonitorSmartphone } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import BrandMark from "@/components/BrandMark";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hubLoginAction, hubTakeoverAction, type HubLoginState } from "./actions";
import { BrandName } from "@/components/platform/BrandProvider";
import { DEMO_ACCESS } from "@/components/platform/saas/demo-access";

const initialState: HubLoginState = {};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginForm({ next = null, demo = false }: { next?: string | null; demo?: boolean }) {
  const [state, formAction, pending] = useActionState(hubLoginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [email, setEmail] = useState(demo ? DEMO_ACCESS.email : "");
  const [password, setPassword] = useState(demo ? DEMO_ACCESS.password : "");
  const formRef = useRef<HTMLFormElement>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [takeoverError, setTakeoverError] = useState<string | null>(null);
  const [taking, startTaking] = useTransition();
  const [goingTo, setGoingTo] = useState<string | null>(null);
  const conflict = state?.conflict && state.conflict.ticket !== dismissed ? state.conflict : null;
  const confirmTakeover = () => {
    if (!conflict) return;
    setTakeoverError(null);
    startTaking(async () => {
      const r = await hubTakeoverAction(conflict.ticket, next);
      if (r?.error) setTakeoverError(r.error);
      else if (r?.redirectTo) setGoingTo(r.redirectTo);
    });
  };
  const codeId = useId();
  const emailId = useId();
  const passwordId = useId();

  const target = goingTo ?? state?.redirectTo ?? null;
  useEffect(() => {
    if (target) window.location.assign(target);
  }, [target]);

  // Auto-submit once fields are filled for demo mode
  useEffect(() => {
    if (demo) formRef.current?.requestSubmit();
  }, [demo]);

  const emailInvalid = emailTouched && email.length > 0 && !EMAIL_RE.test(email);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
      <GlassCard>
        <CardHeader>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary lg:hidden">
            <BrandMark className="size-4 shrink-0" />
            <BrandName /> <span className="text-foreground">Workspace</span>
          </div>
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Sign in once to reach every product you have access to.</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="space-y-4" noValidate>
            {next && <input type="hidden" name="next" value={next} />}
            <div className="space-y-1.5">
              <Label htmlFor={emailId}>Email</Label>
              <Input
                id={emailId}
                name="email"
                type="email"
                required
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                aria-invalid={emailInvalid || undefined}
                className={cn(emailInvalid && "border-destructive focus-visible:border-destructive")}
              />
              {emailInvalid && <p className="text-xs text-destructive">Enter a valid email address.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={passwordId}>Password</Label>
              <div className="relative">
                <Input id={passwordId} name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" className="pr-9" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
            {state?.needsCode && (
              <div className="space-y-1.5">
                <Label htmlFor={codeId}>{state.method === "email" ? "Code from your email" : "Authentication code"}</Label>
                <Input id={codeId} name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder={state.method === "email" ? "6-digit code" : "6-digit code or recovery code"} maxLength={20} required />
                {state.method === "email" ? (
                  <p className="text-xs text-muted-foreground">
                    Enter the code we emailed{state.hint ? ` to ${state.hint}` : ""}. Nothing there?{" "}
                    <button type="submit" name="resend" value="1" formNoValidate className="font-medium text-primary hover:underline">Send a new code</button>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Open your authenticator app and enter the current code. Lost your phone? Use one of your recovery codes.</p>
                )}
              </div>
            )}
            {state?.info && (
              <p role="status" className="rounded-lg bg-primary/[0.07] px-3 py-2 text-sm text-foreground">
                {state.info}
              </p>
            )}
            {state?.error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            <p className="text-right text-sm"><Link href="/commandos/forgot-password" className="text-muted-foreground hover:text-primary hover:underline">Forgot your password?</Link></p>
            <Button type="submit" className="w-full" disabled={pending || !!target}>
              {pending || target ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </GlassCard>
      {conflict && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onKeyDown={(e) => { if (e.key === "Escape" && !taking) setDismissed(conflict.ticket); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="one-device-title" aria-describedby="one-device-desc" className="w-full max-w-md overflow-hidden rounded-3xl border border-border/60 bg-background text-foreground shadow-2xl">
            <div className="flex items-start gap-4 border-b border-border/50 bg-gradient-to-br from-amber-500/[0.12] via-background to-primary/[0.08] p-6">
              <span className="flex size-12 flex-none items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600"><MonitorSmartphone className="size-6" /></span>
              <div>
                <h2 id="one-device-title" className="text-lg font-black leading-snug">You are already signed in on another device</h2>
                <p id="one-device-desc" className="mt-1 text-sm leading-relaxed text-muted-foreground">Your plan (Free) lets you stay signed in on one device at a time. To sign in here, we will sign you out of the {conflict.devices.length === 1 ? "device" : "devices"} below.</p>
              </div>
            </div>
            <div className="space-y-3 p-6">
              <ul className="space-y-2.5">
                {conflict.devices.map((d, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3.5">
                    <span className="mt-0.5 flex size-9 flex-none items-center justify-center rounded-xl bg-background text-primary shadow-sm"><MonitorSmartphone className="size-4" /></span>
                    <span className="min-w-0 text-sm">
                      <span className="block font-bold leading-snug">{d.detail}</span>
                      <span className="block text-muted-foreground">{d.place}</span>
                      <span className="block text-xs text-muted-foreground">Last active {new Date(d.lastActiveAt).toLocaleString()}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="rounded-xl bg-primary/[0.06] p-3 text-xs leading-relaxed text-muted-foreground">Any unsaved work on the other device may be lost. Paid plans allow unlimited devices at the same time.</p>
              {takeoverError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{takeoverError}</p>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border/50 bg-muted/30 p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={taking} onClick={() => setDismissed(conflict.ticket)}>Cancel</Button>
              <Button type="button" autoFocus disabled={taking} onClick={confirmTakeover}>
                {taking ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}Sign out there and continue here
              </Button>
            </div>
          </div>
        </div>
      )}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <LayoutDashboard className="size-3.5" />
        One login for every product you&apos;re authorized to use.
      </p>
    </motion.div>
  );
}
