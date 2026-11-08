"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, Video, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MessageScope } from "@/components/products/huddle-ai/types";

export default function StartCallButtons({ scope }: { scope: MessageScope }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"audio" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function start(mode: "audio" | "video") {
    setError(null);
    setBusy(mode);
    startTransition(async () => {
      try {
        const res = await fetch("/api/huddle-ai/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, mode }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not start the call.");
        router.push(`/huddle-ai/call/${json.callId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the call.");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Start audio call"
        title="Start audio call"
        disabled={pending}
        onClick={() => start("audio")}
        className="text-muted-foreground hover:text-primary"
      >
        {busy === "audio" ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Start video call"
        title="Start video call"
        disabled={pending}
        onClick={() => start("video")}
        className="text-muted-foreground hover:text-primary"
      >
        {busy === "video" ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
      </Button>
      {error && <span className="ml-1 max-w-40 truncate text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
