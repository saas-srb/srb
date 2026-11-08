"use client";

import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Something failed: says what, in plain words, and offers a retry. `detail` is for the real reason, never a stack trace. */
export default function ErrorState({ title = "Something went wrong", children, onRetry, retryLabel = "Try again", action, className }: { title?: string; children?: ReactNode; onRetry?: () => void; retryLabel?: string; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/5 px-6 py-10 text-center", className)}>
      <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300"><AlertTriangle className="size-5" aria-hidden /></div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {onRetry && <Button type="button" size="sm" variant="outline" onClick={onRetry}><RotateCw className="size-3.5" /> {retryLabel}</Button>}
        {action}
      </div>
    </div>
  );
}
