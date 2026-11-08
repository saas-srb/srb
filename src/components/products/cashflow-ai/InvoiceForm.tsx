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
import LineItemsEditor, { blankLine, type EditableLine } from "@/components/products/spendiq/LineItemsEditor";
import { SUPPORTED_CURRENCIES } from "@/lib/products/cashflow-ai/constants";
import { saveInvoiceAction } from "@/app/(products)/cashflow-ai/(protected)/invoices/actions";
import type { SerializedInvoice } from "@/lib/products/cashflow-ai/invoices";

interface Option {
  _id: string;
  label: string;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function InvoiceForm({
  invoice,
  customers,
  projects,
  trigger,
  onSaved,
}: {
  invoice?: SerializedInvoice;
  customers: Option[];
  projects: Option[];
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    customerId: invoice?.customerId ?? "",
    projectId: invoice?.projectId ?? "",
    invoiceDate: invoice?.invoiceDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    dueDate: invoice?.dueDate.slice(0, 10) ?? addDays(new Date().toISOString().slice(0, 10), 30),
    currency: invoice?.currency ?? "INR",
    paymentTerms: invoice?.paymentTerms ?? "Net 30",
    poNumber: invoice?.poNumber ?? "",
    notes: invoice?.notes ?? "",
    discount: invoice ? String(invoice.discount) : "0",
    lines: invoice
      ? invoice.items.map<EditableLine>((it) => ({
          description: it.description,
          hsn: it.hsnSac ?? "",
          quantity: String(it.quantity),
          uom: "pcs",
          unitPrice: String(it.unitPrice),
          gstRate: String(it.taxRate),
        }))
      : [blankLine()],
  });

  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(seed());
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    const items = form.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRate: l.gstRate,
      hsnSac: l.hsn,
    }));
    startTransition(async () => {
      const res = await saveInvoiceAction({ ...form, items }, invoice?._id);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(invoice ? "Invoice updated" : "Invoice created");
      setOpen(false);
      if (res.id && onSaved) onSaved(res.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-xl">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{invoice ? "Edit Invoice" : "New Invoice"}</SheetTitle>
          <SheetDescription>Bill a customer for project work, consulting or training.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <Select value={form.customerId} onValueChange={(v) => set("customerId", v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.customerId && <p className="text-xs text-destructive">{errors.customerId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={form.projectId || "none"} onValueChange={(v) => set("projectId", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p._id} value={p._id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice Date *</Label>
              <Input type="date" value={form.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} />
              {errors.invoiceDate && <p className="text-xs text-destructive">{errors.invoiceDate}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Due Date *</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
              {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
              <Label>Payment Terms</Label>
              <Input value={form.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="Net 30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Customer PO Number</Label>
            <Input value={form.poNumber} onChange={(e) => set("poNumber", e.target.value)} />
          </div>

          <LineItemsEditor
            lines={form.lines}
            onChange={(lines) => setForm((f) => ({ ...f, lines }))}
            discount={form.discount}
            onDiscountChange={(v) => set("discount", v)}
            currency={form.currency}
            showHsn
          />
          {errors.items && <p className="text-xs text-destructive">{errors.items}</p>}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : invoice ? "Save Changes" : "Create Invoice"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
