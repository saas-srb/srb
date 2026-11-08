"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startTestAction } from "@/app/(products)/evaliq/take/actions";
import type { Channel } from "@/lib/products/evaliq/taker";

/** The attempt's window token lives in sessionStorage, so a reload in the SAME tab continues silently while a new tab must explicitly take over. */
export function sessionKey(attemptId: string) {
  return `ots-attempt-session:${attemptId}`;
}

export default function StartTestButton({
  channel,
  assignmentId,
  examBase,
  mode,
  needsAck = false,
  size = "default",
  className,
}: {
  channel: Channel;
  assignmentId: string;
  examBase: string;
  mode: "start" | "continue" | "retake";
  needsAck?: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ack, setAck] = useState(!needsAck);

  function go() {
    start(async () => {
      const res = await startTestAction(channel, assignmentId);
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
        return;
      }
      try {
        sessionStorage.setItem(sessionKey(res.attemptId), res.sessionId);
      } catch {
        /* private mode — the exam page will offer to continue here */
      }
      router.push(`${examBase}/${res.attemptId}`);
    });
  }

  return (
    <div className={className}>
      {needsAck && (
        <label className="mb-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>I have read the instructions. I understand the timer starts immediately and cannot be paused.</span>
        </label>
      )}
      <Button type="button" size={size} onClick={go} disabled={pending || !ack}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : mode === "retake" ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
        {mode === "continue" ? "Continue Test" : mode === "retake" ? "Retake Test" : "Start Test"}
      </Button>
    </div>
  );
}
