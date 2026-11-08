"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { adjustWalletAction, setWalletFrozenAction } from "@/app/(products)/sitecraft-ai/(protected)/wallet/actions";

export default function AdjustWalletForm({ userId, frozen }: { userId: string; frozen: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await adjustWalletAction({ userId, direction, amount: Number(amount), reason });
      if (res.error) return void toast.error(res.error);
      toast.success("Adjustment recorded.");
      setAmount("");
      setReason("");
      router.refresh();
    });
  }

  function toggleFreeze() {
    start(async () => {
      await setWalletFrozenAction(userId, !frozen);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" checked={direction === "credit"} onChange={() => setDirection("credit")} /> Add credits</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={direction === "debit"} onChange={() => setDirection("debit")} /> Remove credits</label>
        </div>
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <div className="space-y-1.5"><Label>Amount</Label><Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label>Reason (required, audited)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} /></div>
        </div>
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Record adjustment"}</Button>
      </form>
      <Button type="button" variant="outline" size="sm" onClick={toggleFreeze} disabled={pending}>
        {frozen ? "Unfreeze wallet" : "Freeze wallet"}
      </Button>
    </div>
  );
}
