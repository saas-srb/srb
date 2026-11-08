"use client";

import { useState } from "react";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONNECTION_FEATURES, CONNECTION_INFO, type ConnectionProvider } from "@/lib/products/viralpulse-ai/accounts/types";

/**
 * Starts the OAuth flow for a provider. The person chooses which abilities to ask the platform for, so a company asks only for what it uses
 * (every extra permission can need the platform's approval). Navigates to the server route, which sets the state cookie and redirects.
 */
export default function ConnectButton({ oauth, connectionId, label, variant = "default", fix, className }: { oauth: ConnectionProvider; connectionId?: string; label?: string; variant?: "default" | "outline"; fix?: string[]; className?: string }) {
  const defs = CONNECTION_FEATURES[oauth];
  const [chosen, setChosen] = useState<string[]>(defs.filter((d) => d.default).map((d) => d.key));
  const [open, setOpen] = useState(false);
  const href = (features: string[]) => {
    const q = new URLSearchParams();
    if (features.length) q.set("features", features.join(","));
    if (connectionId) q.set("reconnect", connectionId);
    if (fix?.length) q.set("fix", fix.join(","));
    return `/api/viralpulse-ai/oauth/${oauth}?${q.toString()}`;
  };
  // Reconnect and fix buttons do not ask again: they keep what the login had and add what is missing.
  if (connectionId || defs.length === 1) {
    return (
      <Button size="sm" variant={variant} className={className} nativeButton={false} render={<a href={href(connectionId ? [] : chosen)} />}>
        <Plug className="size-3.5" /> {label ?? (connectionId ? "Reconnect" : "Connect")}
      </Button>
    );
  }
  return (
    <div className={className}>
      {!open ? (
        <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
          <Plug className="size-3.5" /> {label ?? "Connect"}
        </Button>
      ) : (
        <fieldset className="space-y-2 rounded-xl border border-border/50 bg-background/60 p-3">
          <legend className="px-1 text-xs font-semibold">What should ViralPulse be allowed to do?</legend>
          {defs.map((d) => (
            <label key={d.key} className="flex cursor-pointer items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={chosen.includes(d.key)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, d.key] : c.filter((k) => k !== d.key)))} />
              <span>
                <span className="font-medium">{d.label}</span>
                <span className="block text-muted-foreground">{d.approval}</span>
              </span>
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={chosen.length === 0} nativeButton={false} render={<a href={href(chosen)} />}>
              Continue to {CONNECTION_INFO[oauth].short}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
