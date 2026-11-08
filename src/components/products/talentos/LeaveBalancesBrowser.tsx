"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import LeaveBalances, { type BalanceRow } from "@/components/products/talentos/LeaveBalances";

export default function LeaveBalancesBrowser({
  employees,
  selectedEmployeeId,
  year,
  balances,
  canEditAllocation,
}: {
  employees: { _id: string; name: string; employeeCode: string }[];
  selectedEmployeeId: string | null;
  year: number;
  balances: BalanceRow[];
  canEditAllocation: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pick(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "balances");
    params.set("employee", id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Employee</label>
        <Select value={selectedEmployeeId || undefined} onValueChange={(v) => v && pick(v)}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Select an employee" /></SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e._id} value={e._id}>{e.name} · {e.employeeCode}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedEmployeeId ? (
        <LeaveBalances employeeId={selectedEmployeeId} year={year} balances={balances} canEditAllocation={canEditAllocation} />
      ) : (
        <p className="text-sm text-muted-foreground">Pick an employee to view their {year} leave balances.</p>
      )}
    </div>
  );
}
