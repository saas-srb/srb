"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Applies the maximum usable credits to a fee/invoice. The amount shown is only a preview — the server recomputes it from the wallet balance and the admin's usage rules. */
export default function PayWithCreditsButton({
  usable,
  action,
}: {
  usable: number;
  action: () => Promise<{ ok: boolean; message?: string; error?: string }>;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (usable <= 0) return null;

  function run() {
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(res.message ?? "Credits applied.");
        router.refresh();
      } else toast.error(res.error ?? "Could not apply credits.");
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Coins className="size-3.5" />}
      Use {usable.toLocaleString("en-IN")} credits
    </Button>
  );
}
