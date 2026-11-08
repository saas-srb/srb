"use client";

import { useEffect, useState } from "react";
import { useBrand } from "@/components/platform/BrandProvider";

/** `{brand}` becomes the company's own name. */
const STEPS = ["Securing your session", "Opening {brand}", "Syncing the latest data", "Almost there"];

/** The line under the brand on the app-opening screen: a message that moves on every ~1.6 s and a slim progress line. Client-only, no data. */
export default function LoadingStatus({ steps = STEPS }: { steps?: string[] }) {
  const brand = useBrand();
  const name = brand.name || brand.namePrimary || "your workspace";
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 1600);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="h-[3px] w-44 overflow-hidden rounded-full bg-primary/10">
        <div className="h-full w-2/5 animate-[app-loading_1.3s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
      </div>
      <p key={i} className="app-fade text-xs font-medium tracking-wide text-muted-foreground">{steps[i].replace("{brand}", name)}…</p>
    </div>
  );
}
