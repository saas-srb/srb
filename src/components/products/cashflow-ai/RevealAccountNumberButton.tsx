"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revealBankAccountNumberAction } from "@/app/(products)/cashflow-ai/(protected)/bank-accounts/actions";

export default function RevealAccountNumberButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);

  function reveal() {
    startTransition(async () => {
      const res = await revealBankAccountNumberAction(id);
      if (!res.ok || !res.number) {
        toast.error(res.error ?? "Could not reveal the account number.");
        return;
      }
      setRevealed(res.number);
    });
  }

  if (revealed) {
    return <span className="font-mono text-sm">{revealed}</span>;
  }

  return (
    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={reveal}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" data-icon="inline-start" />}
      Reveal
    </Button>
  );
}
