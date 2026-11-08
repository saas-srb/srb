"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncTransactionsAction } from "../actions";

/** "Missing a payment?": asks Razorpay for this subscription's paid charges and adds any that are not in the list yet. */
export default function SyncTransactionsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setNote(null);
            const res = await syncTransactionsAction().catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
            setNote(res.ok ? { tone: "ok", text: res.message } : { tone: "error", text: res.error });
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Missing a payment? Sync with Razorpay
      </Button>
      <p role="status" aria-live="polite" className={`text-xs ${note?.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>{note?.text}</p>
    </div>
  );
}
