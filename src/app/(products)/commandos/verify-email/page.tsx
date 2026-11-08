import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, ShieldCheck, Timer } from "lucide-react";
import { describeVerification } from "@/lib/platform/email-verification";
import VerifyButton from "./VerifyButton";

export const metadata: Metadata = { title: "Verify your email", robots: { index: false, follow: false } };

/**
 * Landing page of the verification email. Deliberately does NOT verify on load
 * (mail scanners pre-fetch links): the button does.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const verification = token ? await describeVerification(token) : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-b from-primary/20 via-primary/5 to-transparent blur-3xl" />
      <main className="relative w-full max-w-md">
        <div className="rounded-3xl border border-border/60 bg-card/80 p-7 text-center shadow-xl shadow-primary/5 backdrop-blur sm:p-9">
          {verification ? (
            <>
              <div className="relative mx-auto mb-6 flex size-20 items-center justify-center">
                <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-primary/15 [animation-duration:2.4s]" />
                <span aria-hidden className="absolute inset-2 rounded-full bg-primary/10" />
                <span className="relative flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/30">
                  <Mail className="size-7" />
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tight">Verify your email</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">One click and your address is confirmed for your workspace.</p>
              <p className="mx-auto mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm font-medium">
                <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{verification.email}</span>
              </p>

              <form method="post" action="/commandos/verify-email/confirm" className="mt-6 space-y-3">
                <input type="hidden" name="token" value={token} />
                <VerifyButton />
              </form>

              <ul className="mt-6 space-y-2 text-left text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> Keeps your account secure and lets us reach you about your workspace.
                </li>
                <li className="flex items-start gap-2">
                  <Timer className="mt-0.5 size-3.5 shrink-0 text-primary" /> This link works once and expires 24 hours after it was sent.
                </li>
              </ul>
              <p className="mt-6 text-xs text-muted-foreground">
                Didn&apos;t ask for this? You can safely ignore the email — nothing changes until you press the button.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
                <Clock className="size-8" />
              </div>
              <h1 className="text-2xl font-black tracking-tight">This link has expired</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Verification links work once, for 24 hours. It may already have been used, or a newer link was sent.
              </p>
              <div className="mt-6 rounded-2xl border border-border/60 bg-muted/40 p-4 text-left text-sm">
                <p className="font-semibold">Get a new link in two steps</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>Sign in to your workspace.</li>
                  <li>
                    Press <span className="font-medium text-foreground">Verify email</span> in the bar at the top.
                  </li>
                </ol>
              </div>
              <Link href="/commandos/login" className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                Sign in
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
