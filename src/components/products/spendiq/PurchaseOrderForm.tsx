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
import { PAYMENT_TERMS, SUPPORTED_CURRENCIES } from "@/lib/products/spendiq/constants";
import { savePurchaseOrderAction } from "@/app/(products)/spendiq/(protected)/(staff)/purchase-orders/actions";
import type { SerializedPurchaseOrder } from "@/lib/products/spendiq/purchase-orders";

interface Option {
  _id: string;
  name: string;
}

export interface PoPrefill {
  requisitionId?: string;
  departmentId?: string | null;
  departmentName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  vendorId?: string | null;
  currency?: string;
  lines?: EditableLine[];
}

export default function PurchaseOrderForm({
  po,
  prefill,
  vendors,
  departments,
  projects,
  trigger,
  onSaved,
}: {
  po?: SerializedPurchaseOrder;
  prefill?: PoPrefill;
  vendors: { _id: string; companyName: string }[];
  departments: Option[];
  projects: Option[];
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    vendorId: po?.vendorId ?? prefill?.vendorId ?? "",
    departmentId: po?.departmentId ?? prefill?.departmentId ?? "",
    projectId: po?.projectId ?? prefill?.projectId ?? "",
    currency: po?.currency ?? prefill?.currency ?? "INR",
    discount: po ? String(po.discount) : "0",
    deliveryAddress: po?.deliveryAddress ?? "",
    deliveryDate: po?.deliveryDate ?? "",
    paymentTerms: po?.paymentTerms ?? "net_30",
    notes: po?.notes ?? "",
    requisitionId: po?.requisitionId ?? prefill?.requisitionId ?? "",
  });

  const [form, setForm] = useState(seed);
  const [lines, setLines] = useState<EditableLine[]>(
    () =>
      po?.items.map((it) => ({
        description: it.description,
        hsn: it.hsn ?? "",
        quantity: String(it.quantity),
        uom: it.uom,
        unitPrice: String(it.unitPrice),
        gstRate: String(it.gstRate),
      })) ??
      prefill?.lines ?? [blankLine()]
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(seed());
      setLines(
        po?.items.map((it) => ({
          description: it.description,
          hsn: it.hsn ?? "",
          quantity: String(it.quantity),
          uom: it.uom,
          unitPrice: String(it.unitPrice),
          gstRate: String(it.gstRate),
        })) ??
          prefill?.lines ?? [blankLine()]
      );
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    const departmentName = departments.find((d) => d._id === form.departmentId)?.name ?? "";
    const projectName = projects.find((p) => p._id === form.projectId)?.name ?? "";
    startTransition(async () => {
      const result = await savePurchaseOrderAction(
        { ...form, departmentName, projectName, items: lines },
        po?._id
      );
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(po ? "Purchase order updated" : "Purchase order drafted");
      setOpen(false);
      if (result.id && onSaved) onSaved(result.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-xl">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{po ? "Edit Purchase Order" : "New Purchase Order"}</SheetTitle>
          <SheetDescription>Vendor, line items, GST and delivery terms. Saved as a draft until issued.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vendor *</Label>
              <Select value={form.vendorId} onValueChange={(v) => set("vendorId", v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v._id} value={v._id}>{v.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.vendorId && <p className="text-xs text-destructive">{errors.vendorId}</p>}
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
              <Label>Department</Label>
              <Select value={form.departmentId || "none"} onValueChange={(v) => set("departmentId", !v || v === "none" ? "" : v)}>
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
              <Select value={form.projectId || "none"} onValueChange={(v) => set("projectId", !v || v === "none" ? "" : v)}>
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

          {errors.items && <p className="text-xs text-destructive">{errors.items}</p>}
          <LineItemsEditor
            lines={lines}
            onChange={setLines}
            discount={form.discount}
            onDiscountChange={(v) => set("discount", v)}
            currency={form.currency}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment terms</Label>
              <Select value={form.paymentTerms || "net_30"} onValueChange={(v) => set("paymentTerms", v ?? "net_30")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Delivery date</Label>
              <Input type="date" value={form.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Delivery address</Label>
            <Textarea value={form.deliveryAddress} onChange={(e) => set("deliveryAddress", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : po ? "Save changes" : "Create draft PO"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
