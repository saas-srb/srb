"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { BUDGET_LEVELS, BUDGET_PERIODS, EXPENSE_CATEGORIES, SUPPORTED_CURRENCIES } from "@/lib/products/spendiq/constants";
import { saveBudgetAction } from "@/app/(products)/spendiq/(protected)/(staff)/budgets/actions";
import type { SerializedBudget } from "@/lib/products/spendiq/budgets";

export default function BudgetForm({
  budget,
  departments,
  projects,
  trigger,
}: {
  budget?: SerializedBudget;
  departments: { _id: string; name: string }[];
  projects: { _id: string; name: string }[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    name: budget?.name ?? "",
    level: budget?.level ?? "company",
    scopeId: budget?.scopeId ?? "",
    period: budget?.period ?? "yearly",
    periodStart: budget?.periodStart ?? `${new Date().getFullYear()}-04-01`,
    periodEnd: budget?.periodEnd ?? `${new Date().getFullYear() + 1}-03-31`,
    allocatedAmount: budget ? String(budget.allocatedAmount) : "",
    currency: budget?.currency ?? "INR",
    notes: budget?.notes ?? "",
  });

  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const scopeOptions =
    form.level === "department"
      ? departments.map((d) => ({ value: d._id, label: d.name }))
      : form.level === "project"
        ? projects.map((p) => ({ value: p._id, label: p.name }))
        : form.level === "category"
          ? [...EXPENSE_CATEGORIES]
          : [];

  function scopeName() {
    return scopeOptions.find((o) => o.value === form.scopeId)?.label ?? "";
  }

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(seed());
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const res = await saveBudgetAction({ ...form, scopeName: scopeName() }, budget?._id);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(budget ? "Budget updated" : "Budget created");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{budget ? "Edit Budget" : "New Budget"}</SheetTitle>
          <SheetDescription>Allocate a budget by company, department, project or category. Consumption is computed automatically.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Budget name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. FY25 Engineering Capex" />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={form.level} onValueChange={(v) => { set("level", v ?? "company"); set("scopeId", ""); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUDGET_LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.level !== "company" && (
              <div className="space-y-1.5">
                <Label>Scope</Label>
                <Select value={form.scopeId} onValueChange={(v) => set("scopeId", v ?? "")}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={form.period} onValueChange={(v) => set("period", v ?? "yearly")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUDGET_PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency", v ?? "INR")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period start *</Label>
              <Input type="date" value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
              {errors.periodStart && <p className="text-xs text-destructive">{errors.periodStart}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Period end *</Label>
              <Input type="date" value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
              {errors.periodEnd && <p className="text-xs text-destructive">{errors.periodEnd}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Allocated amount *</Label>
            <Input type="number" min={0} value={form.allocatedAmount} onChange={(e) => set("allocatedAmount", e.target.value)} />
            {errors.allocatedAmount && <p className="text-xs text-destructive">{errors.allocatedAmount}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : budget ? "Save changes" : "Create budget"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
