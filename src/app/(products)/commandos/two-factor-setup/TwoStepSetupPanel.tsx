"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import TwoStepSettings, { TWO_STEP_DESCRIPTION, type TwoStepState } from "@/components/security/TwoStepSettings";
import { skipTwoFactorSetupAction } from "./actions";

/**
 * The screen shown at sign-in while two-step is off. "Continue" only works once it is on; until then it says so. "Skip for now" is the
 * way past it for a while (not offered where two-step is required): the screen comes back at a sign-in after the snooze ends.
 */
export default function TwoStepSetupPanel({ initial, mode, skipHours, continueHref, director }: { initial: TwoStepState; mode: "due" | "required"; skipHours: number; continueHref: string; director: boolean }) {
  const [method, setMethod] = useState<TwoStepState["method"]>(initial.method);
  const [nudge, setNudge] = useState(false);
  const [skipping, startSkip] = useTransition();
  const on = method !== null;
  const when = skipHours % 24 === 0 ? `${skipHours / 24} day${skipHours === 24 ? "" : "s"}` : `${skipHours} hours`;

  return (
    <>
      <div>
        <h1 className="text-lg font-semibold">Turn on two-step sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {director ? "Your account can change settings, people and billing for the whole company, so a second check is " : "A second check keeps your account safe even if your password is stolen, so it is "}{mode === "required" ? "required" : "recommended"}. {TWO_STEP_DESCRIPTION}
        </p>
      </div>
      <TwoStepSettings initial={initial} onMethodChange={(m) => { setMethod(m); if (m) setNudge(false); }} />

      {nudge && !on && (
        <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          Two-step sign-in is needed to continue. Turn it on above{mode === "due" ? `, or choose Skip for now and we will ask again in ${when}` : ""}.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
        {on ? (
          <a href={continueHref} className="font-medium text-primary hover:underline">Continue</a>
        ) : (
          <button type="button" onClick={() => setNudge(true)} aria-disabled className="font-medium text-primary/70 hover:underline">Continue</button>
        )}
        <div className="flex items-center gap-4">
          {mode === "due" && !on && (
            <button
              type="button"
              disabled={skipping}
              onClick={() =>
                startSkip(async () => {
                  const res = await skipTwoFactorSetupAction().catch(() => null);
                  // A full page load, not a soft redirect: the workspace starts clean with the new snooze in place.
                  window.location.assign(res?.redirectTo ?? "/commandos");
                })
              }
              className="font-medium text-foreground hover:underline disabled:opacity-60"
            >
              {skipping ? "Skipping…" : "Skip for now"}
            </button>
          )}
          <Link href="/commandos/login" className="text-muted-foreground hover:underline">Sign out</Link>
        </div>
      </div>
      {mode === "due" && !on && <p className="text-xs text-muted-foreground">If you skip, this comes back the next time you sign in after {when}. You can turn it on any time from your profile.</p>}
    </>
  );
}
