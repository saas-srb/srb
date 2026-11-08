"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setLeaveAllocationAction } from "@/app/(products)/talentos/(protected)/(staff)/leave/actions";

export interface BalanceRow {
  leaveTypeCode: string;
  label: string;
  colorClass: string;
  paid: boolean;
  allocated: number;
  used: number;
  pending: number;
  available: number;
}

export default function LeaveBalances({
  employeeId,
  year,
  balances,
  canEditAllocation,
}: {
  employeeId: string;
  year: number;
  balances: BalanceRow[];
  canEditAllocation: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");

  function save(code: string) {
    startTransition(async () => {
      const result = await setLeaveAllocationAction(employeeId, code, year, Number(value));
      if (!result.ok) {
        toast.error(result.error ?? "Could not update allocation.");
        return;
      }
      toast.success("Allocation updated");
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {balances.map((b) => (
        <div key={b.leaveTypeCode} className="rounded-xl border border-border/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <Badge className={b.colorClass}>{b.label}</Badge>
            {!b.paid && <span className="text-[11px] text-muted-foreground">Unpaid</span>}
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{b.available}</p>
          <p className="text-xs text-muted-foreground">available of {b.allocated} allocated</p>
          <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
            <span>Used {b.used}</span>
            <span>Pending {b.pending}</span>
          </div>
          {canEditAllocation && (
            <div className="mt-3">
              {editing === b.leaveTypeCode ? (
                <div className="flex items-center gap-1">
                  <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="h-7 w-20" />
                  <Button type="button" variant="outline" size="icon-sm" disabled={pending} onClick={() => save(b.leaveTypeCode)} aria-label="Save">
                    <Check className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditing(null)} aria-label="Cancel">
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(b.leaveTypeCode);
                    setValue(String(b.allocated));
                  }}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Pencil className="size-3" />
                  Adjust allocation
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
