"use client";

import CrashScreen from "@/components/errors/CrashScreen";

/** The error screen of a product's pages: drawn inside the product so its sidebar and top bar stay. Each product's `error.tsx` re-exports this. */
export default function PanelCrash({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CrashScreen error={error} reset={reset} scope="panel" />;
}
