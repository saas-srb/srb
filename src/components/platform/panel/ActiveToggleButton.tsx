"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePause, CirclePlay } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Activate / deactivate a catalogue item (coupon, add-on) via a server action. */
export default function ActiveToggleButton({ id, active, noun, action }: { id: string; active: boolean; noun: string; action: (id: string, active: boolean) => Promise<{ ok: boolean }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={active ? "destructive" : "default"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await action(id, !active);
            if (!res.ok) setError(`Couldn't update this ${noun}.`);
            router.refresh();
          })
        }
      >
        {active ? <CirclePause className="size-4" data-icon="inline-start" /> : <CirclePlay className="size-4" data-icon="inline-start" />}
        {pending ? "Saving…" : active ? `Deactivate ${noun}` : `Activate ${noun}`}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
