"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import PayoutStatusBadge from "@/components/products/talentos/PayoutStatusBadge";
import PayoutRowActions from "@/components/products/talentos/PayoutRowActions";
import { formatCurrency } from "@/lib/utils";
import { bulkInitiatePayoutsAction } from "@/app/(products)/talentos/(protected)/(staff)/payroll/actions";

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

export default function RunPayoutsPanel({ runId, payouts, connected }: { runId: string; payouts: Payout[]; connected: boolean }) {
  void runId;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [code, setCode] = useState("");

  // Salaries RazorpayX can pay: waiting, with the employee's bank account on file.
  const payable = payouts.filter((p) => p.status === "pending" && p.bankName !== null);
  const toPay = payable.filter((p) => selected.has(p._id));
  const amount = toPay.reduce((n, p) => n + p.paymentAmount, 0);

  function pay() {
    if (toPay.length === 0) return;
    startTransition(async () => {
      const r = await bulkInitiatePayoutsAction(toPay.map((p) => p._id), code);
      toast[r.error ? "warning" : "success"](`${r.initiated ?? 0} salary payment(s) sent to RazorpayX${r.error ? ` · ${r.error}` : ""}`);
      setSelected(new Set());
      setCode("");
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Salary Payouts</CardTitle>
        <div className="flex items-center gap-2">
          {toPay.length > 0 && (
            <Button type="button" size="sm" disabled={pending || !connected} onClick={pay}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" data-icon="inline-start" />}
              Pay {toPay.length} with Razorpay · {formatCurrency(amount)}
            </Button>
          )}
        </div>
      </CardHeader>
      {!connected && payouts.length > 0 && (
        <CardContent className="pt-0">
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm">Salaries are paid through Razorpay. Connect your account, turn on RazorpayX payouts and add the RazorpayX account number first. <Link className="font-medium underline" href="/commandos/settings/payments">Connect Razorpay</Link></p>
        </CardContent>
      )}
      {payable.length > 0 && connected && <CardContent className="max-w-md pt-0"><PaymentCodeField value={code} onChange={setCode} /></CardContent>}
      <CardContent className="max-h-[55vh] overflow-auto">
        {payouts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Payouts are created when the run is approved.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  {payable.length > 0 && (
                    <Checkbox
                      checked={payable.every((p) => selected.has(p._id))}
                      onCheckedChange={() => setSelected(payable.every((p) => selected.has(p._id)) ? new Set() : new Set(payable.map((p) => p._id)))}
                      aria-label="Select all"
                    />
                  )}
                </TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>UTR</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((p) => (
                <TableRow key={p._id}>
                  <TableCell>
                    {payable.some((x) => x._id === p._id) && (
                      <Checkbox
                        checked={selected.has(p._id)}
                        onCheckedChange={() =>
                          setSelected((prev) => {
                            const n = new Set(prev);
                            if (n.has(p._id)) n.delete(p._id);
                            else n.add(p._id);
                            return n;
                          })
                        }
                        aria-label={`Select ${p.employeeName}`}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{p.employeeName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{p.employeeCode}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="font-mono text-xs">{p.bankAccountMasked}</div>
                    <div className="text-[11px]">{p.bankName ?? "no bank account"}</div>
                  </TableCell>
                  <TableCell className="tabular-nums font-medium">{formatCurrency(p.paymentAmount)}</TableCell>
                  <TableCell>
                    <PayoutStatusBadge status={p.status} />
                    {p.status === "failed" && p.failureReason && <div className="mt-0.5 max-w-40 truncate text-[11px] text-destructive">{p.failureReason}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.utr ?? "—"}</TableCell>
                  <TableCell>
                    <PayoutRowActions payout={{ _id: p._id, status: p.status, employeeName: p.employeeName, provider: p.paymentProvider }} code={code} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </GlassCard>
  );
}
