import { AppWindow, CheckCircle2, Laptop, LogOut, ShieldAlert, Smartphone, Tablet, XCircle } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { cn, formatDateTime } from "@/lib/utils";
import { listActiveSessions, listLoginHistory } from "@/lib/security/sessions";
import type { ObjectId } from "mongodb";
import SessionsList from "./SessionsList";
import TwoStepSettings, { TWO_STEP_DESCRIPTION } from "@/components/security/TwoStepSettings";
import { maskEmail } from "@/lib/security/email-otp";
import { twoFactorStatus } from "@/lib/security/two-factor";
import { oneDeviceLimitApplies } from "@/lib/security/device-limit";

const ICONS = { desktop: Laptop, mobile: Smartphone, tablet: Tablet, app: AppWindow } as const;

/** "Where you're signed in" and "Sign-in history" for one account: the same two cards on the company Security page and on the personal one. */
export default async function SecuritySections({ adminId, email }: { adminId: ObjectId; email: string }) {
  const [sessions, history, tf, oneDevice] = await Promise.all([listActiveSessions(adminId), listLoginHistory(adminId, email), twoFactorStatus(adminId), oneDeviceLimitApplies().catch(() => false)]);
  return (
    <>
      <GlassCard interactive={false} containerClassName="h-auto">
        <CardHeader>
          <CardTitle className="text-base">Two-step sign-in</CardTitle>
          <CardDescription>{TWO_STEP_DESCRIPTION}</CardDescription>
        </CardHeader>
        <CardContent>
          <TwoStepSettings initial={{ method: tf.method, enabledAt: tf.enabledAt ? tf.enabledAt.toISOString() : null, recoveryLeft: tf.recoveryLeft, available: tf.available, email: maskEmail(email) }} />
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false} containerClassName="h-auto">
        <CardHeader>
          <CardTitle className="text-base">Where you&apos;re signed in</CardTitle>
          <CardDescription>
            Every device that is signed in to your account right now, with where it signed in from. Log out any you don&apos;t recognise; if something looks wrong, log out everywhere and change your password.
          </CardDescription>
          {oneDevice && <p className="mt-3 rounded-lg bg-primary/[0.07] px-3 py-2 text-sm text-muted-foreground">Your plan (Free) lets you stay signed in on <b className="text-foreground">one device at a time</b>. When you sign in on a new device, you are asked first, and the other device is signed out. Paid plans allow unlimited devices.</p>}
        </CardHeader>
        <CardContent>
          <SessionsList sessions={sessions} />
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false} containerClassName="h-auto">
        <CardHeader>
          <CardTitle className="text-base">Sign-in history</CardTitle>
          <CardDescription>The last sign-ins, failed attempts and sign-outs on your account, kept for 180 days. Places are approximate (from the network address).</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet. Your next sign-in will appear here.</p>
          ) : (
            <ol className="divide-y divide-border/50" aria-label="Sign-in history">
              {history.map((e) => {
                const Icon = ICONS[e.deviceType];
                const ToneIcon = e.tone === "good" ? CheckCircle2 : e.tone === "bad" ? XCircle : e.type === "logout" ? LogOut : ShieldAlert;
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", e.tone === "good" ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : e.tone === "bad" ? "bg-destructive/12 text-destructive" : e.tone === "warn" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
                      <ToneIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {e.title}
                        {e.newCountry && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">New country</span>}
                        {e.via === "support" && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Platform support</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Icon className="size-3" /> {e.deviceLabel}</span>
                        <span><span aria-hidden>{e.flag}</span> {e.place}</span>
                        {e.ip ? <span className="font-mono">{e.ip}</span> : null}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={e.at} suppressHydrationWarning>{formatDateTime(e.at)}</time>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </GlassCard>
    </>
  );
}
