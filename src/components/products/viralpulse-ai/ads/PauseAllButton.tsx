"use client";

import { Pause } from "lucide-react";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import { pauseAllRunningAction } from "@/app/(products)/viralpulse-ai/(protected)/campaigns/ads-actions";

/** Pauses every launch that is spending (the company kill-switch action). Confirms first and says how many were paused and how many could not be. */
export default function PauseAllButton({ running }: { running: number }) {
  return (
    <ActionButton
      variant="outline"
      success="Paused"
      action={async () => {
        const r = await pauseAllRunningAction();
        if (!r.ok) return r;
        return r.failed > 0 ? { ok: false, error: `${r.paused} paused, ${r.failed} could not be paused in Meta. Try again or pause them in Ads Manager.` } : { ok: true };
      }}
      confirm={{ title: `Pause all ${running} running campaign${running === 1 ? "" : "s"}?`, description: "Every campaign that is spending is paused in Meta right now. Each one can be resumed later; resuming checks approval and the spending limits again.", confirmLabel: "Pause all" }}
    >
      <Pause className="size-3.5" /> Pause all running ({running})
    </ActionButton>
  );
}
