"use client";

import { useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  EXPENSE_CATEGORY_TREE,
  PRIORITIES,
  UNITS_OF_MEASURE,
  SUPPORTED_CURRENCIES,
  subcategoriesFor,
} from "@/lib/products/spendiq/constants";
import { saveRequisitionAction } from "@/app/(products)/spendiq/(protected)/(staff)/requisitions/actions";
import type { SerializedRequisition } from "@/lib/products/spendiq/requisitions";

type FormState = Record<string, string>;

interface Option {
  _id: string;
  name: string;
}

function fromRequisition(r: SerializedRequisition | undefined): FormState {
  if (!r) {
    return { category: "office_operations", priority: "medium", uom: "pcs", currency: "INR", quantity: "1" };
  }
  return {
    departmentId: r.departmentId,
    projectId: r.projectId ?? "",
    category: r.category,
    subcategory: r.subcategory ?? "",
    itemName: r.itemName,
    quantity: String(r.quantity),
    uom: r.uom,
    estimatedCost: String(r.estimatedCost),
    currency: r.currency,
    requiredDate: r.requiredDate ?? "",
    priority: r.priority,
    justification: r.justification ?? "",
    preferredVendorId: r.preferredVendorId ?? "",
  };
}

export default function RequisitionForm({
  requisition,
  departments,
  projects,
  vendors,
  itemSuggestions,
  trigger,
  onSaved,
}: {
  requisition?: SerializedRequisition;
  departments: Option[];
  projects: Option[];
  vendors: { _id: string; companyName: string }[];
  itemSuggestions: string[];
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromRequisition(requisition));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;
  const s = (k: string) => form[k] ?? "";

  const subOptions = useMemo(() => subcategoriesFor(form.category), [form.category]);

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(fromRequisition(requisition));
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    const departmentName = departments.find((d) => d._id === form.departmentId)?.name ?? "";
    const projectName = projects.find((p) => p._id === form.projectId)?.name ?? "";
    startTransition(async () => {
      const result = await saveRequisitionAction(
        { ...form, departmentName, projectName } as Record<string, unknown>,
        requisition?._id
      );
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(requisition ? "Requisition updated" : "Requisition drafted");
      setOpen(false);
      if (result.id && onSaved) onSaved(result.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{requisition ? "Edit Requisition" : "New Requisition"}</SheetTitle>
          <SheetDescription>Raise a request for goods or services. Saved as a draft until you submit it.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Department *</Label>
              <Select value={s("departmentId")} onValueChange={(v) => set("departmentId", v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("departmentId")}
            </div>
            <div className="space-y-1.5">
              <Label>Project (optional)</Label>
              <Select value={s("projectId") || "none"} onValueChange={(v) => set("projectId", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={s("category")} onValueChange={(v) => { set("category", v ?? ""); set("subcategory", ""); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORY_TREE.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("category")}
            </div>
            <div className="space-y-1.5">
              <Label>Subcategory</Label>
              <Input value={s("subcategory")} onChange={(e) => set("subcategory", e.target.value)} list="prms-subcat" placeholder="e.g. Stationery" />
              <datalist id="prms-subcat">
                {subOptions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Item / service name *</Label>
            <Input value={s("itemName")} onChange={(e) => set("itemName", e.target.value)} list="prms-items" placeholder="e.g. Dell Latitude 5440 laptop" />
            <datalist id="prms-items">
              {itemSuggestions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            {err("itemName")}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input type="number" min={1} value={s("quantity")} onChange={(e) => set("quantity", e.target.value)} />
              {err("quantity")}
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={s("uom") || "pcs"} onValueChange={(v) => set("uom", v ?? "pcs")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS_OF_MEASURE.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={s("priority") || "medium"} onValueChange={(v) => set("priority", v ?? "medium")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Estimated cost *</Label>
              <Input type="number" min={0} value={s("estimatedCost")} onChange={(e) => set("estimatedCost", e.target.value)} />
              {err("estimatedCost")}
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={s("currency") || "INR"} onValueChange={(v) => set("currency", v ?? "INR")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Required by</Label>
              <Input type="date" value={s("requiredDate")} onChange={(e) => set("requiredDate", e.target.value)} />
              {err("requiredDate")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Preferred vendor (optional)</Label>
            <Select value={s("preferredVendorId") || "none"} onValueChange={(v) => set("preferredVendorId", !v || v === "none" ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v._id} value={v._id}>{v.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Justification</Label>
            <Textarea value={s("justification")} onChange={(e) => set("justification", e.target.value)} rows={3} placeholder="Why is this needed?" />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : requisition ? "Save changes" : "Create draft"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
