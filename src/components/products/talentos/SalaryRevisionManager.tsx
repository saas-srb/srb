"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatCurrency, formatDate } from "@/lib/utils";
import { createSalaryRevisionAction } from "@/app/(products)/talentos/(protected)/(staff)/employees/[id]/actions";

interface Line {
  name: string;
  amount: number;
  taxable?: boolean;
  pf?: boolean;
  esi?: boolean;
  prorate?: boolean;
}
type Row = { name: string; amount: string; taxable: boolean; pf: boolean; esi: boolean; prorate: boolean };
interface Revision {
  _id: string;
  effectiveFrom: string;
  basic: number;
  da?: number;
  hra: number;
  allowances: Line[];
  deductions: Line[];
  employerNps?: number;
  reason: string | null;
  createdAt: string;
}

export default function SalaryRevisionManager({
  employeeId,
  revisions,
  current,
}: {
  employeeId: string;
  revisions: Revision[];
  current: { basic: number; da?: number; hra: number; allowances: Line[]; deductions: Line[]; employerNps?: number } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    effectiveFrom: new Date().toISOString().slice(0, 10),
    basic: String(current?.basic ?? ""),
    da: String(current?.da ?? 0),
    hra: String(current?.hra ?? ""),
    employerNps: String(current?.employerNps ?? 0),
    reason: "",
  });
  const [allowances, setAllowances] = useState<Row[]>(
    current?.allowances.map((a) => ({ name: a.name, amount: String(a.amount), taxable: a.taxable ?? true, pf: a.pf ?? false, esi: a.esi ?? true, prorate: a.prorate ?? true })) ?? []
  );
  const [deductions, setDeductions] = useState<{ name: string; amount: string }[]>(
    current?.deductions.map((d) => ({ name: d.name, amount: String(d.amount) })) ?? []
  );

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await createSalaryRevisionAction(employeeId, {
        effectiveFrom: form.effectiveFrom,
        basic: Number(form.basic) || 0,
        da: Number(form.da) || 0,
        hra: Number(form.hra) || 0,
        employerNps: Number(form.employerNps) || 0,
        reason: form.reason,
        allowances: allowances.map((a) => ({ name: a.name, amount: Number(a.amount) || 0, taxable: a.taxable, pf: a.pf, esi: a.esi, prorate: a.prorate })),
        deductions: deductions.map((d) => ({ name: d.name, amount: Number(d.amount) || 0 })),
      });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Salary revision saved");
      setOpen(false);
      router.refresh();
    });
  }

  const allowanceRows = (
    <div className="space-y-2">
      <Label>Allowances</Label>
      {allowances.map((c, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <Input placeholder="Name" value={c.name} onChange={(e) => setAllowances((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input placeholder="Amount" inputMode="numeric" value={c.amount} onChange={(e) => setAllowances((l) => l.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            <Button type="button" variant="ghost" size="icon" onClick={() => setAllowances((l) => l.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="size-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(["taxable", "pf", "esi", "prorate"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" className="size-3.5 accent-primary" checked={c[k]} onChange={(e) => setAllowances((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.checked } : x)))} />
                {{ taxable: "Taxable", pf: "PF wages", esi: "ESI wages", prorate: "Pro-rata" }[k]}
              </label>
            ))}
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setAllowances((l) => [...l, { name: "", amount: "", taxable: true, pf: false, esi: true, prorate: true }])}><Plus className="size-3.5" data-icon="inline-start" />Add</Button>
    </div>
  );

  const rows = (
    list: { name: string; amount: string }[],
    setList: (fn: (l: { name: string; amount: string }[]) => { name: string; amount: string }[]) => void,
    label: string
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      {list.map((c, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
          <Input placeholder="Name" value={c.name} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <Input placeholder="Amount" inputMode="numeric" value={c.amount} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon" onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label="Remove">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setList((l) => [...l, { name: "", amount: "" }])}>
        <Plus className="size-3.5" data-icon="inline-start" />
        Add
      </Button>
    </div>
  );

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Salary Revisions</CardTitle>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" data-icon="inline-start" />
          New Revision
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {revisions.length === 0 && <p className="text-sm text-muted-foreground">No revisions — payroll uses the current structure above.</p>}
        {revisions.map((r) => {
          const gross = r.basic + (r.da ?? 0) + r.hra + r.allowances.reduce((s, a) => s + a.amount, 0);
          return (
            <div key={r._id} className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">Effective {formatDate(r.effectiveFrom)}</span>
                <span className="tabular-nums text-muted-foreground">{formatCurrency(gross)} / month</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Basic {formatCurrency(r.basic)} · HRA {formatCurrency(r.hra)}
                {r.reason ? ` · ${r.reason}` : ""}
              </p>
            </div>
          );
        })}
      </CardContent>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>New Salary Revision</SheetTitle>
            <SheetDescription>Effective-dated. Payroll runs on or after this date use this structure.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Effective from *</Label>
              <Input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} aria-invalid={!!errors.effectiveFrom || undefined} />
              {errors.effectiveFrom && <p className="text-xs text-destructive">{errors.effectiveFrom}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dearness allowance</Label>
                <Input inputMode="numeric" value={form.da} onChange={(e) => setForm((f) => ({ ...f, da: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Employer NPS</Label>
                <Input inputMode="numeric" value={form.employerNps} onChange={(e) => setForm((f) => ({ ...f, employerNps: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Basic</Label>
                <Input inputMode="numeric" value={form.basic} onChange={(e) => setForm((f) => ({ ...f, basic: e.target.value }))} aria-invalid={!!errors.basic || undefined} />
                {errors.basic && <p className="text-xs text-destructive">{errors.basic}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>HRA</Label>
                <Input inputMode="numeric" value={form.hra} onChange={(e) => setForm((f) => ({ ...f, hra: e.target.value }))} aria-invalid={!!errors.hra || undefined} />
                {errors.hra && <p className="text-xs text-destructive">{errors.hra}</p>}
              </div>
            </div>
            {allowanceRows}
            {rows(deductions, setDeductions, "Deductions")}
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Annual increment, promotion…" />
            </div>
            <Button type="button" onClick={submit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save Revision"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </GlassCard>
  );
}
