"use client";

import CrashScreen from "@/components/errors/CrashScreen";

/** Any page that fails and has no closer error screen (the public website, sign-in pages …). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CrashScreen error={error} reset={reset} scope="page" />;
}
