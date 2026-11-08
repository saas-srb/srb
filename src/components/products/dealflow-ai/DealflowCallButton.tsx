"use client";

import { PhoneOff } from "lucide-react";
import CallWithAI from "@/components/products/agentos/calls/CallWithAI";
import type { DealflowCallSpec } from "@/lib/dealflow-ai/call-targets";
import { cn } from "@/lib/utils";

/** "Call with AI" for a DealFlow record. When the record can't be called (no number, do-not-contact) it shows why instead of a button. */
export function DealflowCallUnavailable({ reason, compact = false, className }: { reason: string; compact?: boolean; className?: string }) {
  return (
    <span
      title={reason}
      aria-label={`Call with AI unavailable. ${reason}`}
      className={cn("inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-xs text-muted-foreground", className)}
    >
      <PhoneOff className="size-3.5" />
      {!compact && "Can't call"}
    </span>
  );
}

export default function DealflowCallButton({ spec, variant = "outline", size = "sm", compact = false, className }: { spec: DealflowCallSpec; variant?: "default" | "outline" | "secondary" | "ghost" | "icon"; size?: "default" | "sm" | "lg"; compact?: boolean; className?: string }) {
  if (spec.unavailable) {
    return <DealflowCallUnavailable reason={spec.unavailable} compact={compact} className={className} />;
  }
  return <CallWithAI target={spec.target} phone={spec.phone} context={spec.context} defaultPurpose={spec.defaultPurpose} variant={compact ? "icon" : variant} size={size} className={className} />;
}
