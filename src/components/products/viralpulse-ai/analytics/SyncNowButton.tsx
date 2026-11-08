"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncMetricsNowAction } from "@/app/(products)/viralpulse-ai/(protected)/analytics/actions";

/** Reads the platform right now. The server refuses within 10 minutes of the last manual read and while a platform asks us to wait. */
export default function SyncNowButton({ accountId, size = "sm", label = "Sync now" }: { accountId?: string; size?: "sm" | "xs"; label?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await syncMetricsNowAction(accountId);
          if (!r.ok) toast.error(r.error);
          else toast.success(r.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} {label}
    </Button>
  );
}
