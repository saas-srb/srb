"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import LeaveStatusBadge from "@/components/products/talentos/LeaveStatusBadge";
import { formatDate } from "@/lib/utils";
import { cancelMyLeaveAction } from "@/app/(products)/talentos/(protected)/me/leave/actions";

interface Row {
  _id: string;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  decisionNote: string | null;
}

export default function MyLeaveHistory({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function withdraw(id: string) {
    startTransition(async () => {
      const result = await cancelMyLeaveAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not withdraw the request.");
        return;
      }
      toast.success("Request withdrawn");
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No leave requests yet.</p>}
        {rows.map((r) => (
          <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {r.leaveTypeLabel} · {r.days} day{r.days === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(r.startDate)}
                {r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ""}
                {r.reason ? ` · ${r.reason}` : ""}
                {r.decisionNote ? ` · Note: ${r.decisionNote}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <LeaveStatusBadge status={r.status} />
              {r.status === "pending" && (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label="Withdraw">
                        <Ban className="size-3.5" />
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Withdraw this request?</AlertDialogTitle>
                      <AlertDialogDescription>The reserved leave balance is released.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep</AlertDialogCancel>
                      <AlertDialogAction onClick={() => withdraw(r._id)}>Withdraw</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </GlassCard>
  );
}
