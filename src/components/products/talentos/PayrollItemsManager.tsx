"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { monthLabelLong } from "@/lib/products/talentos/payroll-status";
import {
  cancelAdjustmentAction,
  closeLoanAction,
  createAdjustmentAction,
  createLoanAction,
  deleteSettlementAction,
  saveSettlementAction,
  type ItemResult,
} from "@/app/(products)/talentos/(protected)/(staff)/payroll/items/actions";

interface Emp {
  _id: string;
  name: string;
  employeeCode: string;
}
interface AdjRow {
  _id: string;
  employeeId: string;
  month: string;
  kind: "earning" | "deduction";
  category: string;
  name: string;
  amount: number;
  status: "pending" | "applied" | "cancelled";
}
interface LoanRow {
  _id: string;
  employeeId: string;
  name: string;
  principal: number;
  emi: number;
  startMonth: string;
  balance: number;
  status: "active" | "closed" | "cancelled";
}
interface SettleRow {
  _id: string;
  employeeId: string;
  reason: string;
  exitDate: string;
  month: string;
  leaveDaysToEncash: number;
  noticeShortfallDays: number;
  payGratuity: boolean;
  fixedTerm: boolean;
  otherEarnings: { name: string; amount: number; taxable: boolean }[];
  otherRecoveries: { name: string; amount: number }[];
  note: string | null;
  status: "draft" | "applied";
}

const CATEGORIES = [
  { value: "arrears", label: "Arrears (earning)" },
  { value: "bonus", label: "Bonus (earning)" },
  { value: "incentive", label: "Incentive / commission (earning)" },
  { value: "reimbursement", label: "Reimbursement against bills (earning)" },
  { value: "other_earning", label: "Other earning" },
  { value: "recovery", label: "Recovery (deduction)" },
  { value: "other_deduction", label: "Other deduction" },
];
const REASONS = [
  ["resignation", "Resignation"],
  ["retirement", "Retirement"],
  ["termination", "Termination"],
  ["end_of_contract", "End of contract"],
  ["disability", "Disability"],
  ["death", "Death"],
];

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function PayrollItemsManager({
  employees,
  adjustments,
  loans,
  settlements,
  defaultMonth,
}: {
  employees: Emp[];
  adjustments: AdjRow[];
  loans: LoanRow[];
  settlements: SettleRow[];
  defaultMonth: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sheet, setSheet] = useState<"adj" | "loan" | "settle" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const name = (id: string) => employees.find((e) => e._id === id)?.name ?? "—";

  const [adj, setAdj] = useState({ employeeId: "", month: defaultMonth, category: "bonus", name: "", amount: "", taxable: true, pf: false, esi: false, note: "" });
  const [loan, setLoan] = useState({ employeeId: "", name: "Salary advance", principal: "", emi: "", startMonth: defaultMonth, note: "" });
  const [st, setSt] = useState({ employeeId: "", reason: "resignation", exitDate: "", leaveDaysToEncash: "0", noticeShortfallDays: "0", payGratuity: true, fixedTerm: false, note: "" });
  const [earn, setEarn] = useState<{ name: string; amount: string; taxable: boolean }[]>([]);
  const [rec, setRec] = useState<{ name: string; amount: string }[]>([]);

  function run(fn: () => Promise<ItemResult>, done: string, close = true) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error ?? Object.values(r.fieldErrors ?? {})[0] ?? "Could not save.");
        return;
      }
      setErrors({});
      toast.success(done);
      if (close) setSheet(null);
      router.refresh();
    });
  }

  const err = (k: string) => (errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null);
  const empSelect = (value: string, onChange: (v: string) => void, k: string) => (
    <div className="space-y-1.5">
      <Label>Employee</Label>
      <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {employees.map((e) => (
          <option key={e._id} value={e._id}>
            {e.name} ({e.employeeCode})
          </option>
        ))}
      </select>
      {err(k)}
    </div>
  );
  const field = (label: string, k: string, value: string, onChange: (v: string) => void, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} {...props} />
      {err(k)}
    </div>
  );

  return (
    <>
      <Tabs defaultValue="adjustments" className="gap-4">
        <TabsList>
          <TabsTrigger value="adjustments">One-off items</TabsTrigger>
          <TabsTrigger value="loans">Loans and advances</TabsTrigger>
          <TabsTrigger value="settlements">Full and final settlement</TabsTrigger>
        </TabsList>

        <TabsContent value="adjustments">
          <GlassCard interactive={false}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Bonus, arrears, incentives, reimbursements or recoveries for one month. They go into that month&apos;s run when it is created or recomputed.</p>
                <Button size="sm" onClick={() => { setErrors({}); setSheet("adj"); }}><Plus className="size-3.5" data-icon="inline-start" />Add item</Button>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Month</TableHead><TableHead>Item</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {adjustments.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nothing added yet.</TableCell></TableRow>}
                  {adjustments.map((a) => (
                    <TableRow key={a._id}>
                      <TableCell>{name(a.employeeId)}</TableCell>
                      <TableCell>{monthLabelLong(a.month)}</TableCell>
                      <TableCell>{a.name} <span className="text-xs text-muted-foreground">({a.kind})</span></TableCell>
                      <TableCell className="tabular-nums">{a.kind === "deduction" ? "−" : ""}{formatCurrency(a.amount)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{a.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {a.status === "pending" && <Button size="icon-sm" variant="ghost" aria-label="Cancel item" disabled={pending} onClick={() => run(() => cancelAdjustmentAction(a._id), "Item cancelled", false)}><Trash2 className="size-3.5" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </GlassCard>
        </TabsContent>

        <TabsContent value="loans">
          <GlassCard interactive={false}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">An advance is recovered in monthly instalments from the first month you choose, within the deduction cap. Whatever is left is recovered in the final settlement.</p>
                <Button size="sm" onClick={() => { setErrors({}); setSheet("loan"); }}><Plus className="size-3.5" data-icon="inline-start" />Add loan</Button>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Loan</TableHead><TableHead>Lent</TableHead><TableHead>Instalment</TableHead><TableHead>From</TableHead><TableHead>Balance</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {loans.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No loans or advances.</TableCell></TableRow>}
                  {loans.map((l) => (
                    <TableRow key={l._id}>
                      <TableCell>{name(l.employeeId)}</TableCell>
                      <TableCell>{l.name}</TableCell>
                      <TableCell className="tabular-nums">{formatCurrency(l.principal)}</TableCell>
                      <TableCell className="tabular-nums">{formatCurrency(l.emi)}</TableCell>
                      <TableCell>{monthLabelLong(String(l.startMonth))}</TableCell>
                      <TableCell className="tabular-nums">{formatCurrency(l.balance)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{l.status}</Badge></TableCell>
                      <TableCell className="space-x-1 text-right">
                        {l.status === "active" && l.balance === l.principal && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => closeLoanAction(l._id, "cancel"), "Loan cancelled", false)}>Cancel</Button>}
                        {l.status === "active" && l.balance < l.principal && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => closeLoanAction(l._id, "write_off"), "Balance written off", false)}>Write off</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </GlassCard>
        </TabsContent>

        <TabsContent value="settlements">
          <GlassCard interactive={false}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Enter the facts of an exit. The run for the month of the last working day adds leave encashment, gratuity, notice recovery and the loan balance to that person&apos;s final payslip, with the tax treatment worked out.</p>
                <Button size="sm" onClick={() => { setErrors({}); setSheet("settle"); }}><Plus className="size-3.5" data-icon="inline-start" />Add settlement</Button>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Reason</TableHead><TableHead>Last day</TableHead><TableHead>Leave days paid</TableHead><TableHead>Gratuity</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {settlements.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No settlements.</TableCell></TableRow>}
                  {settlements.map((s) => (
                    <TableRow key={s._id}>
                      <TableCell>{name(s.employeeId)}</TableCell>
                      <TableCell className="capitalize">{s.reason.replace("_", " ")}</TableCell>
                      <TableCell>{s.exitDate}</TableCell>
                      <TableCell>{s.leaveDaysToEncash}</TableCell>
                      <TableCell>{s.payGratuity ? "Paid if eligible" : "Not paid"}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{s.status === "draft" ? "Waiting for run" : "Paid in run"}</Badge></TableCell>
                      <TableCell className="space-x-1 text-right">
                        {s.status === "draft" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => {
                              setErrors({});
                              setSt({ employeeId: s.employeeId, reason: s.reason, exitDate: s.exitDate, leaveDaysToEncash: String(s.leaveDaysToEncash), noticeShortfallDays: String(s.noticeShortfallDays), payGratuity: s.payGratuity, fixedTerm: s.fixedTerm, note: s.note ?? "" });
                              setEarn(s.otherEarnings.map((e) => ({ ...e, amount: String(e.amount) })));
                              setRec(s.otherRecoveries.map((e) => ({ ...e, amount: String(e.amount) })));
                              setSheet("settle");
                            }}>Edit</Button>
                            <Button size="icon-sm" variant="ghost" aria-label="Delete settlement" disabled={pending} onClick={() => run(() => deleteSettlementAction(s.employeeId), "Settlement removed", false)}><Trash2 className="size-3.5" /></Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </GlassCard>
        </TabsContent>
      </Tabs>

      <Sheet open={sheet === "adj"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60"><SheetTitle>Add a one-off item</SheetTitle><SheetDescription>It appears on the payslip under the name you give it.</SheetDescription></SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {empSelect(adj.employeeId, (v) => setAdj({ ...adj, employeeId: v }), "employeeId")}
            {field("Payroll month", "month", adj.month, (v) => setAdj({ ...adj, month: v }), { type: "month" })}
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <select className={selectCls} value={adj.category} onChange={(e) => setAdj({ ...adj, category: e.target.value, taxable: e.target.value !== "reimbursement", esi: !["reimbursement", "bonus"].includes(e.target.value) })}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {err("category")}
            </div>
            {field("Name on payslip", "name", adj.name, (v) => setAdj({ ...adj, name: v }), { maxLength: 80 })}
            {field("Amount (₹)", "amount", adj.amount, (v) => setAdj({ ...adj, amount: v }), { inputMode: "numeric" })}
            {["arrears", "bonus", "incentive", "reimbursement", "other_earning"].includes(adj.category) && (
              <div className="space-y-1.5 text-sm">
                {([["taxable", "Taxable income"], ["pf", "Counts as PF wages"], ["esi", "Counts as ESI wages"]] as const).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={adj[k]} onChange={(e) => setAdj({ ...adj, [k]: e.target.checked })} />{l}</label>
                ))}
              </div>
            )}
            {field("Note (optional)", "note", adj.note, (v) => setAdj({ ...adj, note: v }), { maxLength: 300 })}
            <Button className="w-full" disabled={pending} onClick={() => run(() => createAdjustmentAction(adj), "Item added")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Add item"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "loan"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60"><SheetTitle>Add a loan or advance</SheetTitle><SheetDescription>Recovered every month until the balance is nil.</SheetDescription></SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {empSelect(loan.employeeId, (v) => setLoan({ ...loan, employeeId: v }), "employeeId")}
            {field("Name", "name", loan.name, (v) => setLoan({ ...loan, name: v }), { maxLength: 80 })}
            {field("Amount lent (₹)", "principal", loan.principal, (v) => setLoan({ ...loan, principal: v }), { inputMode: "numeric" })}
            {field("Monthly instalment (₹)", "emi", loan.emi, (v) => setLoan({ ...loan, emi: v }), { inputMode: "numeric" })}
            {field("First recovery month", "startMonth", loan.startMonth, (v) => setLoan({ ...loan, startMonth: v }), { type: "month" })}
            {field("Note (optional)", "note", loan.note, (v) => setLoan({ ...loan, note: v }), { maxLength: 300 })}
            <Button className="w-full" disabled={pending} onClick={() => run(() => createLoanAction(loan), "Loan added")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Add loan"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "settle"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60"><SheetTitle>Full and final settlement</SheetTitle><SheetDescription>Gratuity is paid only if the person has completed the qualifying service (or the exit is by death or disability).</SheetDescription></SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {empSelect(st.employeeId, (v) => setSt({ ...st, employeeId: v }), "employeeId")}
            <div className="space-y-1.5">
              <Label>Reason for leaving</Label>
              <select className={selectCls} value={st.reason} onChange={(e) => setSt({ ...st, reason: e.target.value })}>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              {err("reason")}
            </div>
            {field("Last working day", "exitDate", st.exitDate, (v) => setSt({ ...st, exitDate: v }), { type: "date" })}
            {field("Leave days to pay out", "leaveDaysToEncash", st.leaveDaysToEncash, (v) => setSt({ ...st, leaveDaysToEncash: v }), { inputMode: "decimal" })}
            {field("Notice days not served (recovered)", "noticeShortfallDays", st.noticeShortfallDays, (v) => setSt({ ...st, noticeShortfallDays: v }), { inputMode: "numeric" })}
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={st.payGratuity} onChange={(e) => setSt({ ...st, payGratuity: e.target.checked })} />Pay gratuity with this settlement</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={st.fixedTerm} onChange={(e) => setSt({ ...st, fixedTerm: e.target.checked })} />Fixed-term contract</label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Other dues to pay</Label><Button size="sm" variant="ghost" onClick={() => setEarn([...earn, { name: "", amount: "", taxable: true }])}><Plus className="size-3.5" /></Button></div>
              {earn.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Name" value={e.name} onChange={(ev) => setEarn(earn.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} />
                  <Input className="w-28" placeholder="₹" value={e.amount} onChange={(ev) => setEarn(earn.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={e.taxable} onChange={(ev) => setEarn(earn.map((x, j) => (j === i ? { ...x, taxable: ev.target.checked } : x)))} />Taxable</label>
                  <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setEarn(earn.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Other recoveries</Label><Button size="sm" variant="ghost" onClick={() => setRec([...rec, { name: "", amount: "" }])}><Plus className="size-3.5" /></Button></div>
              {rec.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Name" value={e.name} onChange={(ev) => setRec(rec.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} />
                  <Input className="w-28" placeholder="₹" value={e.amount} onChange={(ev) => setRec(rec.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} />
                  <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setRec(rec.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
                </div>
              ))}
            </div>
            {field("Note (optional)", "note", st.note, (v) => setSt({ ...st, note: v }), { maxLength: 300 })}
            <Button className="w-full" disabled={pending} onClick={() => run(() => saveSettlementAction({ ...st, otherEarnings: earn, otherRecoveries: rec }), "Settlement saved")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Save settlement"}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
