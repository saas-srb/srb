"use client";

import { useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  EXPENSE_CATEGORY_TREE,
  PAYMENT_METHODS,
  GST_RATES,
  RECURRENCE_INTERVALS,
  SUPPORTED_CURRENCIES,
  subcategoriesFor,
  computeTax,
  formatMoney,
} from "@/lib/products/spendiq/constants";
import { saveExpenseAction } from "@/app/(products)/spendiq/(protected)/(staff)/expenses/actions";
import type { SerializedExpense } from "@/lib/products/spendiq/expenses";

interface Option {
  _id: string;
  name: string;
}

export default function ExpenseForm({
  expense,
  vendors,
  departments,
  projects,
  canApprove = false,
  trigger,
  onSaved,
}: {
  expense?: SerializedExpense;
  vendors: { _id: string; companyName: string }[];
  departments: Option[];
  projects: Option[];
  canApprove?: boolean;
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    category: expense?.category ?? "office_operations",
    subcategory: expense?.subcategory ?? "",
    vendorId: expense?.vendorId ?? "",
    departmentId: expense?.departmentId ?? "",
    projectId: expense?.projectId ?? "",
    amount: expense ? String(expense.amount) : "",
    gstRate: expense ? String(expense.gstRate) : "18",
    currency: expense?.currency ?? "INR",
    paymentMethod: expense?.paymentMethod ?? "bank_transfer",
    invoiceNumber: expense?.invoiceNumber ?? "",
    expenseDate: expense?.expenseDate ?? new Date().toISOString().slice(0, 10),
    description: expense?.description ?? "",
    expenseType: expense?.expenseType ?? "one_time",
    recurrenceInterval: expense?.recurrence?.interval ?? "monthly",
    autoApprove: false as boolean,
  });

  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const sv = (k: string) => (typeof form[k as keyof typeof form] === "string" ? (form[k as keyof typeof form] as string) : "");

  const subs = useMemo(() => subcategoriesFor(form.category), [form.category]);
  const tax = computeTax(Number(form.amount) || 0, 0, Number(form.gstRate) || 0);

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(seed());
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    const departmentName = departments.find((d) => d._id === form.departmentId)?.name ?? "";
    const projectName = projects.find((p) => p._id === form.projectId)?.name ?? "";
    startTransition(async () => {
      const res = await saveExpenseAction({ ...form, departmentName, projectName }, expense?._id);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(expense ? "Expense updated" : "Expense recorded");
      setOpen(false);
      if (res.id && onSaved) onSaved(res.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{expense ? "Edit Expense" : "New Expense"}</SheetTitle>
          <SheetDescription>Operational expense with GST, invoice and optional recurrence.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={sv("category")} onValueChange={(v) => { set("category", v ?? ""); set("subcategory", ""); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORY_TREE.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Subcategory</Label>
              <Input value={sv("subcategory")} onChange={(e) => set("subcategory", e.target.value)} list="exp-subs" />
              <datalist id="exp-subs">
                {subs.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Select value={sv("vendorId") || "none"} onValueChange={(v) => set("vendorId", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v._id} value={v._id}>{v.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={sv("paymentMethod")} onValueChange={(v) => set("paymentMethod", v ?? "bank_transfer")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={sv("departmentId") || "none"} onValueChange={(v) => set("departmentId", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={sv("projectId") || "none"} onValueChange={(v) => set("projectId", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (pre-tax) *</Label>
              <Input type="number" min={0} value={sv("amount")} onChange={(e) => set("amount", e.target.value)} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>GST</Label>
              <Select value={sv("gstRate")} onValueChange={(v) => set("gstRate", v ?? "18")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={sv("currency")} onValueChange={(v) => set("currency", v ?? "INR")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-right text-xs text-muted-foreground">Total incl. GST: {formatMoney(tax.total, form.currency)}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice number</Label>
              <Input value={sv("invoiceNumber")} onChange={(e) => set("invoiceNumber", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expense date *</Label>
              <Input type="date" value={sv("expenseDate")} onChange={(e) => set("expenseDate", e.target.value)} />
              {errors.expenseDate && <p className="text-xs text-destructive">{errors.expenseDate}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={sv("description")} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.expenseType === "recurring"} onCheckedChange={(v) => set("expenseType", v === true ? "recurring" : "one_time")} />
              Recurring expense
            </label>
            {form.expenseType === "recurring" && (
              <div className="space-y-1.5">
                <Label>Recurs every</Label>
                <Select value={sv("recurrenceInterval")} onValueChange={(v) => set("recurrenceInterval", v ?? "monthly")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_INTERVALS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.recurrenceInterval && <p className="text-xs text-destructive">{errors.recurrenceInterval}</p>}
              </div>
            )}
            {canApprove && !expense && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.autoApprove} onCheckedChange={(v) => set("autoApprove", v === true)} />
                Approve immediately (direct entry)
              </label>
            )}
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : expense ? "Save changes" : "Record expense"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
