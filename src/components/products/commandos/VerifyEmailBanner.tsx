"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { verifyStripHiddenOn } from "@/lib/platform/email-verification-rule";
import { sendVerificationEmailAction, type VerifyEmailSendState } from "@/app/(products)/commandos/(protected)/actions";
import { useStripDismiss, StripDismissButton } from "@/lib/platform/use-strip-dismiss";

const RESEND_COOLDOWN_S = 30;

/**
 * The "Verify your email" strip: shown to a signed-in user whose address isn't
 * verified yet, on every Workspace page (the dashboard included). Nothing is
 * blocked while it shows (until the 30 days run out: `daysLeft` counts them down). "Verify email" sends the link and the strip changes
 * in place; Resend appears after a short cooldown.
 */
export default function VerifyEmailBanner({
  email,
  daysLeft,
  initiallyDismissed = false,
}: {
  email: string;
  daysLeft?: number;
  initiallyDismissed?: boolean;
}) {
  const path = usePathname();
  const [state, setState] = useState<VerifyEmailSendState>({ status: "idle" });
  const [pending, start] = useTransition();
  const [cooldown, setCooldown] = useState(0);
  const { isDismissed, dismiss } = useStripDismiss("verify-email", "Verify email", undefined, initiallyDismissed);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (isDismissed || verifyStripHiddenOn(path)) return null;

  const send = () =>
    start(async () => {
      const res = await sendVerificationEmailAction().catch((): VerifyEmailSendState => ({ status: "error", error: "Something went wrong. Please try again." }));
      setState(res);
      if (res.status === "sent") setCooldown(RESEND_COOLDOWN_S);
    });

  const sent = state.status === "sent";
  const button = "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60";
  return (
    <motion.div
      id="verify-banner"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      title={sent ? "The link stays valid for 24 hours. Check spam too." : "One click keeps your account secure."}
      className={`inline-flex max-w-full shrink-0 items-center gap-2 rounded-full border py-1 pl-3 pr-1.5 text-xs transition-colors ${sent ? "border-emerald-500/30 bg-emerald-500/10 dark:border-border dark:bg-card" : "border-amber-500/30 bg-amber-500/10 dark:border-border dark:bg-card"}`}
    >
      {sent ? <MailCheck className="size-3.5 shrink-0 text-emerald-600" /> : <Mail className="size-3.5 shrink-0 text-amber-600" />}
      <span role="status" aria-live="polite" className="flex min-w-0 items-center gap-1.5">
        {sent ? (
          <>
            <span className="font-semibold text-foreground">Link sent</span>
            <span className="max-w-[180px] truncate text-muted-foreground">{state.email}</span>
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">Verify email</span>
            <span className="max-w-[180px] truncate text-muted-foreground">{email}</span>
            {daysLeft !== undefined && <span className={daysLeft <= 7 ? "font-semibold text-destructive" : "text-muted-foreground"}>· {daysLeft} {daysLeft === 1 ? "day" : "days"} left</span>}
          </>
        )}
        {state.status === "error" && (
          <span id="verify-banner-error" className="text-destructive">
            {state.error}
          </span>
        )}
      </span>
      {sent ? (
        <button type="button" id="verify-banner-resend" onClick={send} disabled={pending || cooldown > 0} className={button}>
          {pending && <Loader2 className="size-3 animate-spin" />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
        </button>
      ) : (
        <button type="button" onClick={send} disabled={pending} className={button}>
          {pending && <Loader2 className="size-3 animate-spin" />}
          Verify
        </button>
      )}
      <StripDismissButton onDismiss={dismiss} label="Verify email" />
    </motion.div>
  );
}

/** One-off success toast after the verification page redirects here with `?emailVerified=1`. */
export function VerifiedNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("emailVerified") !== "1") return;
    toast.success("Email verified", { description: "Thank you — your account is now more secure." });
    url.searchParams.delete("emailVerified");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);
  return null;
}
