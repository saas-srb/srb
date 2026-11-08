"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Globe, LayoutDashboard } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One of the company's two addresses, shown large and copyable: the public WEBSITE (what visitors see) or the APP (where the team signs in
 * to the Workspace and every product).
 */
export default function AddressCard({
  kind,
  title,
  caption,
  url,
  hint,
  highlighted = false,
}: {
  kind: "website" | "app";
  title: string;
  caption: string;
  url: string;
  hint: string;
  highlighted?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const host = url.replace(/^https?:\/\//, "");
  const Icon = kind === "website" ? Globe : LayoutDashboard;
  return (
    <GlassCard className={cn("h-full", highlighted && "border-primary/50 ring-2 ring-primary/20")} data-address={kind}>
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{caption}</p>
            <h2 className="text-lg font-black leading-tight text-foreground">{title}</h2>
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
          <p className="break-all text-xl font-black tracking-tight text-foreground sm:text-2xl" data-address-host>{host}</p>
          <p className="mt-0.5 break-all text-xs text-muted-foreground">{url}</p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p>
        <div className="flex flex-wrap gap-2">
          <Button render={<a href={url} target="_blank" rel="noopener noreferrer" />} nativeButton={false} size="sm">
            <ExternalLink className="size-3.5" />Open {kind === "website" ? "website" : "app"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                // Clipboard blocked: the address above is still selectable.
              }
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy address"}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
