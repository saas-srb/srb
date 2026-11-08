"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface ReportRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  present: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  lateCount: number;
  workingDays: number;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function MonthlyAttendanceReport({
  month,
  rows,
  departments,
}: {
  month: string;
  rows: ReportRow[];
  departments: { _id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "report");
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <GlassCard interactive={false}>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setParam("month", shiftMonth(month, -1))} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-40 text-center text-sm font-medium">{monthLabel(month)}</span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setParam("month", shiftMonth(month, 1))} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Select
            value={searchParams.get("department") || "all"}
            onValueChange={(v) => setParam("department", !v || v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Half Day</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>On Leave</TableHead>
                <TableHead>Late</TableHead>
                <TableHead>Working Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">No employees in scope.</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.employeeId}>
                  <TableCell>
                    <div className="font-medium">{r.employeeName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.employeeCode}</div>
                  </TableCell>
                  <TableCell className="text-green-600 dark:text-green-400">{r.present}</TableCell>
                  <TableCell className="text-amber-600 dark:text-amber-400">{r.halfDay}</TableCell>
                  <TableCell className="text-destructive">{r.absent}</TableCell>
                  <TableCell className="text-primary">{r.onLeave}</TableCell>
                  <TableCell className="text-muted-foreground">{r.lateCount}</TableCell>
                  <TableCell className="text-muted-foreground">{r.workingDays}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
