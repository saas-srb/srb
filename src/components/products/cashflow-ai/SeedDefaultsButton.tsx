"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { seedDefaultAccountsAction } from "@/app/(products)/cashflow-ai/(protected)/settings/accounts/actions";

export default function SeedDefaultsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await seedDefaultAccountsAction();
      if (!res.ok) {
        toast.error(res.error ?? "Could not seed default accounts.");
        return;
      }
      toast.success("Default accounts added");
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" data-icon="inline-start" />}
      Seed Defaults
    </Button>
  );
}
