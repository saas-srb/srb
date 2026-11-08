"use client";

import { useEffect, useState } from "react";
import { KeyRound, X, Copy, Check } from "lucide-react";
import Link from "next/link";

/**
 * Shown once, right after an auto-provisioned sign-in from a website form. The
 * temp password is stashed in `sessionStorage` by the submit hook; we surface it
 * here so the person can note it, then nudge them to set their own in Profile.
 */
export default function TempPasswordBanner() {
  const [pw, setPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const v = sessionStorage.getItem("portalTempPassword");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a client-only handoff value
      if (v) setPw(v);
    } catch {}
  }, []);

  if (!pw) return null;

  function dismiss() {
    try {
      sessionStorage.removeItem("portalTempPassword");
    } catch {}
    setPw(null);
  }

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4 sm:mx-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Your account is ready — here&apos;s your temporary password</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Save it now. Then set your own from{" "}
            <Link href="/clientos/profile" className="font-medium text-primary hover:underline">
              Profile &amp; Settings
            </Link>
            .
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded-lg border border-border/60 bg-card px-2.5 py-1 font-mono text-sm text-foreground">{pw}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(pw).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
