"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyDemoValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" onClick={copy} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary" aria-label={`Copy demo ${copied ? "value copied" : "value"}`}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}
    </button>
  );
}
