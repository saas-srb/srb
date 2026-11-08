"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ProfileStep } from "@/app/(products)/commandos/(protected)/onboarding/OnboardingWizard";
import type { ProfileInput } from "@/lib/platform/onboarding/state";

/** The onboarding profile form on its own: same fields, same save action. */
export default function ProfileSettings({ initial, timezones }: { initial: ProfileInput; timezones: string[] }) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <ProfileStep initial={initial} timezones={timezones} onIndustry={() => {}} onDone={() => setSavedAt(Date.now())} saveLabel="Save profile" />
      {savedAt !== null && (
        <p id="profile-saved" key={savedAt} role="status" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> Profile saved.
        </p>
      )}
    </div>
  );
}
