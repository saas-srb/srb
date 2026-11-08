"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, FileDown, Wallet, Receipt, Banknote, Building2, TriangleAlert, RefreshCw, PauseCircle, PlayCircle, Download, Info } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
import PayslipView, { type PayslipViewData } from "@/components/products/talentos/PayslipView";
import RunPayoutsPanel from "@/components/products/talentos/RunPayoutsPanel";
import { payrollRunStatusMeta, monthLabelLong } from "@/lib/products/talentos/payroll-status";
import { formatCurrency } from "@/lib/utils";
import { approveRunAction, recomputeRunAction, savePayslipOverridesAction, setPayslipHoldAction } from "@/app/(products)/talentos/(protected)/(staff)/payroll/actions";

interface Line {
  name: string;
  amount: number;
  fixedAmount?: number;
}
interface Warning {
  level: "info" | "review" | "blocking";
  code: string;
  message: string;
}
interface Slip {
  _id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  workingDays: number;
  lopDays: number;
  earnings: Line[];
  grossPay: number;
  deductions: Line[];
  totalDeductions: number;
  employerContributions: Line[];
  employerCost: number;
  netPay: number;
  overrides: { arrears: number; manualTds: number | null; otherDeductions: number };
  bankAccountLast4: string | null;
  bankName: string | null;
  ifsc: string | null;
  paidDays?: number;
  monthDays?: number;
  daysNotes?: string[];
  warnings?: Warning[];
  held?: boolean;
  holdReason?: string | null;
  tds?: number;
  tax?: { regime: "new" | "old"; fy: string; taxableIncome: number; yearTax: number; thisMonth: number; deductedSoFar: number } | null;
  statutory?: { pfWages: number; esiWages: number; esiCovered: boolean; ptNote: string };
}
interface Run {
  _id: string;
  month: string;
  status: string;
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
  totalEmployerCost: number;
  checks?: { level: "info" | "review" | "blocking"; code: string; message: string }[];
  totals?: { employeePf: number; employerPf: number; esiEmployee: number; esiEmployer: number; professionalTax: number; tds: number; lwf: number };
  generatedBy?: string;
  requireSeparateApprover?: boolean;
}
interface Payout {
  _id: string;
  employeeName: string;
  employeeCode: string;
  netPayable: number;
  paymentAmount: number;
  bankAccountMasked: string;
  bankName: string | null;
  status: string;
  paymentProvider: "manual" | "razorpay";
  utr: string | null;
  failureReason: string | null;
}

export default function PayrollRunDetail({ run, slips, payouts, razorpayConnected }: { run: Run; slips: Slip[]; payouts: Payout[]; razorpayConnected: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [viewSlip, setViewSlip] = useState<Slip | null>(null);
  const [editSlip, setEditSlip] = useState<Slip | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ arrears: "0", manualTds: "", otherDeductions: "0" });
  const [ack, setAck] = useState(false);
  const [holdFor, setHoldFor] = useState<Slip | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const meta = payrollRunStatusMeta(run.status);
  const isDraft = run.status === "draft";

  function openEdit(s: Slip) {
    setEditSlip(s);
    setErrors({});
    setForm({
      arrears: String(s.overrides.arrears),
      manualTds: s.overrides.manualTds == null ? "" : String(s.overrides.manualTds),
      otherDeductions: String(s.overrides.otherDeductions),
    });
  }

  function saveOverrides() {
    if (!editSlip) return;
    setErrors({});
    startTransition(async () => {
      const result = await savePayslipOverridesAction(editSlip._id, {
        arrears: form.arrears,
        manualTds: form.manualTds,
        otherDeductions: form.otherDeductions,
      });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Payslip updated");
      setEditSlip(null);
      router.refresh();
    });
  }

  const reviewPoints = slips.reduce((n, s) => n + (s.warnings ?? []).filter((w) => w.level === "review").length, 0) + (run.checks ?? []).filter((c) => c.level === "review").length;
  const blockingPoints = slips.filter((s) => (s.warnings ?? []).some((w) => w.level === "blocking")).length + (run.checks ?? []).filter((c) => c.level === "blocking").length;

  function recompute() {
    startTransition(async () => {
      const result = await recomputeRunAction(run._id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not recompute.");
        return;
      }
      toast.success("Run recomputed from the latest attendance, leave, adjustments and declarations");
      router.refresh();
    });
  }

  function saveHold() {
    if (!holdFor) return;
    startTransition(async () => {
      const result = await setPayslipHoldAction(holdFor._id, true, holdReason);
      if (!result.ok) {
        toast.error(result.error ?? "Could not hold the salary.");
        return;
      }
      toast.success("Salary put on hold");
      setHoldFor(null);
      setHoldReason("");
      router.refresh();
    });
  }

  function release(s: Slip) {
    startTransition(async () => {
      const result = await setPayslipHoldAction(s._id, false, "");
      if (!result.ok) {
        toast.error(result.error ?? "Could not release the hold.");
        return;
      }
      toast.success("Hold released");
      router.refresh();
    });
  }

  function approve() {
    startTransition(async () => {
      const result = await approveRunAction(run._id, ack);
      if (!result.ok) {
        toast.error(result.error ?? "Could not approve.");
        return;
      }
      toast.success("Run approved — payslips are visible and payouts are ready");
      router.refresh();
    });
  }

  const toView = (s: Slip): PayslipViewData => ({
    payslipId: s._id,
    month: run.month,
    employeeName: s.employeeName,
    employeeCode: s.employeeCode,
    workingDays: s.workingDays,
    lopDays: s.lopDays,
    earnings: s.earnings.map((e) => ({ name: e.name, amount: e.amount, fixed: e.fixedAmount !== undefined && e.fixedAmount !== e.amount ? e.fixedAmount : undefined })),
    grossPay: s.grossPay,
    deductions: s.deductions,
    totalDeductions: s.totalDeductions,
    employerContributions: s.employerContributions,
    employerCost: s.employerCost,
    netPay: s.netPay,
    bankAccountLast4: s.bankAccountLast4,
    bankName: s.bankName,
    ifsc: s.ifsc,
    runStatus: run.status,
    monthDays: s.monthDays ?? null,
    daysPaid: s.paidDays,
    notes: s.daysNotes,
    tax: s.tax ?? null,
  });

  return (
    <div className="space-y-4">
      <GlassCard interactive={false}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-foreground">{monthLabelLong(run.month)}</span>
            <Badge className={meta.badgeClass}>{meta.label}</Badge>
            {run.status === "paid" && <span className="text-xs text-muted-foreground">Month locked</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu runId={run._id} status={run.status} />
            {isDraft && (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={recompute}>
                <RefreshCw className="size-3.5" data-icon="inline-start" />
                Recompute
              </Button>
            )}
            {isDraft && (
              <AlertDialog>
                <AlertDialogTrigger render={<Button type="button" size="sm" disabled={pending || blockingPoints > 0}><Check className="size-3.5" data-icon="inline-start" />Approve Run</Button>} />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve the {monthLabelLong(run.month)} run?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Payslips become visible to employees, one salary payout is created for each employee whose salary is not on hold, and the one-off items,
                      loan instalments and settlements in this run are booked. Corrections are still possible until a payout is initiated.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {run.requireSeparateApprover && <p className="text-xs text-muted-foreground">Your company needs someone other than the person who created this run to approve it.</p>}
                  {reviewPoints > 0 && (
                    <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                      <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                      <span>I have looked at the {reviewPoints} point(s) marked for review on this run and want to approve it.</span>
                    </label>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={approve} disabled={reviewPoints > 0 && !ack}>Approve</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </GlassCard>

      <KpiGrid>
        <KpiCard label="Gross" value={run.totalGross} format="currency" icon={<Wallet className="size-4" />} />
        <KpiCard label="Deductions" value={run.totalDeductions} format="currency" icon={<Receipt className="size-4" />} />
        <KpiCard label="Net Payout" value={run.totalNet} format="currency" accent icon={<Banknote className="size-4" />} />
        <KpiCard label="Cost to Company" value={run.totalEmployerCost} format="currency" icon={<Building2 className="size-4" />} />
      </KpiGrid>

      {(run.checks?.length ?? 0) > 0 && (
        <GlassCard interactive={false}>
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Before you approve</p>
            {run.checks!.map((c) => (
              <div key={c.code} className={`flex items-start gap-2 rounded-md px-3 py-2 ${c.level === "blocking" ? "bg-destructive/10 text-destructive" : c.level === "review" ? "bg-amber-500/10" : "bg-muted/40 text-muted-foreground"}`}>
                {c.level === "info" ? <Info className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
                <span>{c.message}</span>
              </div>
            ))}
          </CardContent>
        </GlassCard>
      )}

      {run.totals && (
        <GlassCard interactive={false}>
          <CardContent className="grid gap-3 py-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["PF (employee)", run.totals.employeePf],
              ["PF (employer)", run.totals.employerPf],
              ["ESI (employee + employer)", run.totals.esiEmployee + run.totals.esiEmployer],
              ["Professional tax", run.totals.professionalTax],
              ["Income tax (TDS)", run.totals.tds],
              ["Labour welfare fund", run.totals.lwf],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold tabular-nums">{formatCurrency(value as number)}</p>
              </div>
            ))}
          </CardContent>
        </GlassCard>
      )}

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" className="size-3.5 accent-primary" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
        Show only payslips with points to look at or on hold
      </label>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[55vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Days paid</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Income tax</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {slips.filter((s) => !onlyFlagged || s.held || (s.warnings ?? []).some((w) => w.level !== "info")).map((s) => (
                <TableRow key={s._id}>
                  <TableCell>
                    <button type="button" onClick={() => setViewSlip(s)} className="font-medium hover:underline">{s.employeeName}</button>
                    <div className="font-mono text-xs text-muted-foreground">{s.employeeCode}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.paidDays !== undefined ? `${s.paidDays}${s.monthDays ? ` / ${s.monthDays}` : ""}` : s.lopDays ? `LOP ${s.lopDays}` : "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatCurrency(s.grossPay)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatCurrency(s.totalDeductions)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{s.tds ? formatCurrency(s.tds) : "—"}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatCurrency(s.netPay)}</TableCell>
                  <TableCell className="max-w-56 text-xs">
                    {s.held && <Badge className="mr-1 bg-amber-500/15 text-amber-700 dark:text-amber-400">On hold</Badge>}
                    {(s.warnings ?? []).filter((w) => w.level !== "info").slice(0, 2).map((w) => (
                      <span key={w.code} className={`block truncate ${w.level === "blocking" ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`} title={w.message}>{w.message}</span>
                    ))}
                    {(s.warnings ?? []).filter((w) => w.level !== "info").length > 2 && <span className="text-muted-foreground">+{(s.warnings ?? []).filter((w) => w.level !== "info").length - 2} more</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <a
                        href={`/api/talentos/payslips/${s._id}/pdf`}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        aria-label="Download payslip PDF"
                        title="Download PDF"
                      >
                        <FileDown className="size-3.5" />
                      </a>
                      {isDraft && (
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(s)} aria-label="Adjust">
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {run.status !== "paid" && (s.held ? (
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => release(s)} aria-label="Release the hold" title="Release the hold">
                          <PlayCircle className="size-3.5" />
                        </Button>
                      ) : (
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => { setHoldFor(s); setHoldReason(""); }} aria-label="Hold salary" title="Hold salary">
                          <PauseCircle className="size-3.5" />
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <RunPayoutsPanel runId={run._id} payouts={payouts} connected={razorpayConnected} />

      <Sheet open={!!viewSlip} onOpenChange={(o) => !o && setViewSlip(null)}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Payslip preview</SheetTitle>
            <SheetDescription>{viewSlip?.employeeName}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {viewSlip && (viewSlip.warnings ?? []).length > 0 && (
              <div className="space-y-1.5">
                {viewSlip.warnings!.map((w) => (
                  <p key={w.code} className={`rounded-md px-3 py-2 text-xs ${w.level === "blocking" ? "bg-destructive/10 text-destructive" : w.level === "review" ? "bg-amber-500/10" : "bg-muted/40 text-muted-foreground"}`}>{w.message}</p>
                ))}
              </div>
            )}
            {viewSlip && <PayslipView data={toView(viewSlip)} showPrint={false} />}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!holdFor} onOpenChange={(o) => !o && setHoldFor(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Hold {holdFor?.employeeName}&apos;s salary</SheetTitle>
            <SheetDescription>The payslip stays in the run but no payout is made until you release the hold. The employee is told the salary is on hold.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Reason (kept in the audit log)</Label>
              <Input value={holdReason} maxLength={200} onChange={(e) => setHoldReason(e.target.value)} placeholder="For example: documents pending, dispute under review" />
            </div>
            <Button type="button" onClick={saveHold} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Hold salary"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!editSlip} onOpenChange={(o) => !o && setEditSlip(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Adjust {editSlip?.employeeName}</SheetTitle>
            <SheetDescription>Overrides recompute the payslip immediately.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Arrears (added to earnings)</Label>
              <Input inputMode="numeric" value={form.arrears} onChange={(e) => setForm((f) => ({ ...f, arrears: e.target.value }))} aria-invalid={!!errors.arrears || undefined} />
              {errors.arrears && <p className="text-xs text-destructive">{errors.arrears}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Manual TDS (blank = auto)</Label>
              <Input inputMode="numeric" value={form.manualTds} onChange={(e) => setForm((f) => ({ ...f, manualTds: e.target.value }))} placeholder="auto" aria-invalid={!!errors.manualTds || undefined} />
              {errors.manualTds && <p className="text-xs text-destructive">{errors.manualTds}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Other deductions</Label>
              <Input inputMode="numeric" value={form.otherDeductions} onChange={(e) => setForm((f) => ({ ...f, otherDeductions: e.target.value }))} aria-invalid={!!errors.otherDeductions || undefined} />
              {errors.otherDeductions && <p className="text-xs text-destructive">{errors.otherDeductions}</p>}
            </div>
            <Button type="button" onClick={saveOverrides} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save & Recompute"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const EXPORTS: { type: string; label: string; needsApproval?: boolean }[] = [
  { type: "register", label: "Payroll register (CSV)" },
  { type: "pf-ecr", label: "PF return: ECR file", needsApproval: true },
  { type: "esi", label: "ESI contribution file", needsApproval: true },
  { type: "pt", label: "Professional tax report" },
  { type: "tds", label: "TDS register" },
  { type: "journal", label: "Accounting journal" },
];

function ExportMenu({ runId, status }: { runId: string; status: string }) {
  return (
    <details className="relative">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted">
        <Download className="size-3.5" /> Downloads
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-64 rounded-md border bg-popover p-1 shadow-md">
        {EXPORTS.map((x) => {
          const blocked = x.needsApproval && status === "draft";
          return blocked ? (
            <span key={x.type} className="block cursor-not-allowed rounded px-3 py-1.5 text-sm text-muted-foreground" title="Approve the run first: a draft can still change">{x.label}</span>
          ) : (
            <a key={x.type} href={`/api/talentos/payroll/runs/${runId}/export/${x.type}`} className="block rounded px-3 py-1.5 text-sm hover:bg-muted">{x.label}</a>
          );
        })}
      </div>
    </details>
  );
}
