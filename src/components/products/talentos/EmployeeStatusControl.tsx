"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EMPLOYEE_STATUSES, EXITED_EMPLOYEE_STATUSES } from "@/lib/products/talentos/employee-status";
import { changeEmployeeStatusAction } from "@/app/(products)/talentos/(protected)/(staff)/employees/actions";

export default function EmployeeStatusControl({
  employeeId,
  current,
  currentRelievingDate,
}: {
  employeeId: string;
  current: string;
  currentRelievingDate: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(current);
  const [relievingDate, setRelievingDate] = useState(currentRelievingDate ?? "");

  const isExit = EXITED_EMPLOYEE_STATUSES.includes(status as (typeof EXITED_EMPLOYEE_STATUSES)[number]);
  const dirty = status !== current || (isExit && relievingDate !== (currentRelievingDate ?? ""));

  function apply() {
    startTransition(async () => {
      const result = await changeEmployeeStatusAction(employeeId, status, isExit ? relievingDate || undefined : undefined);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update status.");
        return;
      }
      toast.success("Status updated");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Employment status</Label>
        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EMPLOYEE_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isExit && (
        <div className="space-y-1.5">
          <Label>Relieving date</Label>
          <Input type="date" value={relievingDate} onChange={(e) => setRelievingDate(e.target.value)} />
        </div>
      )}
      <Button type="button" size="sm" onClick={apply} disabled={!dirty || pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Update Status"}
      </Button>
    </div>
  );
}
