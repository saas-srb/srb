"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Play, Trash2, CalendarPlus } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
import { payrollRunStatusMeta, monthLabelLong } from "@/lib/products/talentos/payroll-status";
import { formatCurrency, formatDate } from "@/lib/utils";
import { createRunAction, deleteRunAction } from "@/app/(products)/talentos/(protected)/(staff)/payroll/actions";

interface Run {
  _id: string;
  month: string;
  status: string;
  payslipCount: number;
  totalGross: number;
  totalNet: number;
  totalEmployerCost: number;
  generatedAt: string;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function PayrollRunManager({ runs }: { runs: Run[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [month, setMonth] = useState(currentMonth());

  function generate() {
    startTransition(async () => {
      const result = await createRunAction(month);
      if (!result.ok) {
        toast.error(result.error ?? "Could not generate the run.");
        return;
      }
      toast.success("Payroll run generated");
      router.push(`/talentos/payroll/${month}`);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteRunAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete.");
        return;
      }
      toast.success("Run deleted");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <CalendarPlus className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Generate Payroll Run</h3>
              <p className="text-xs text-muted-foreground">Pick a month to generate payslips for all active employees</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Month</label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-auto rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
          </div>
          <Button type="button" onClick={generate} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" data-icon="inline-start" />}
            Generate Run
          </Button>
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payslips</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Net Payout</TableHead>
                <TableHead>Cost to Company</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">No payroll runs yet.</TableCell>
                </TableRow>
              )}
              {runs.map((r) => {
                const meta = payrollRunStatusMeta(r.status);
                return (
                  <TableRow key={r._id}>
                    <TableCell>
                      <Link href={`/talentos/payroll/${r.month}`} className="font-medium hover:underline">{monthLabelLong(r.month)}</Link>
                    </TableCell>
                    <TableCell><Badge className={meta.badgeClass}>{meta.label}</Badge></TableCell>
                    <TableCell>{r.payslipCount}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatCurrency(r.totalGross)}</TableCell>
                    <TableCell className="tabular-nums font-medium">{formatCurrency(r.totalNet)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatCurrency(r.totalEmployerCost)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.generatedAt)}</TableCell>
                    <TableCell>
                      {r.status !== "paid" && (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label="Delete run">
                                <Trash2 className="size-3.5" />
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete the {monthLabelLong(r.month)} run?</AlertDialogTitle>
                              <AlertDialogDescription>All payslips in this run are removed. You can regenerate it afterwards.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(r._id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
