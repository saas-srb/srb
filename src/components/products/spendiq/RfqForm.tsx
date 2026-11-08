"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { UNITS_OF_MEASURE } from "@/lib/products/spendiq/constants";
import { saveRfqAction } from "@/app/(products)/spendiq/(protected)/(staff)/rfq/actions";
import type { SerializedRfq } from "@/lib/products/spendiq/rfqs";

interface Line {
  description: string;
  quantity: string;
  uom: string;
}

export interface RfqPrefill {
  requisitionId: string;
  title: string;
  description: string | null;
  departmentId: string | null;
  lines: Line[];
}

export default function RfqForm({
  rfq,
  prefill,
  vendors,
  departments,
  trigger,
  onSaved,
}: {
  rfq?: SerializedRfq;
  prefill?: RfqPrefill;
  vendors: { _id: string; companyName: string }[];
  departments: { _id: string; name: string }[];
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const initLines = (): Line[] =>
    rfq?.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), uom: l.uom })) ??
    prefill?.lines ?? [{ description: "", quantity: "1", uom: "pcs" }];

  const [title, setTitle] = useState(rfq?.title ?? prefill?.title ?? "");
  const [description, setDescription] = useState(rfq?.description ?? prefill?.description ?? "");
  const [departmentId, setDepartmentId] = useState(rfq?.departmentId ?? prefill?.departmentId ?? "");
  const [lines, setLines] = useState<Line[]>(initLines);
  const [vendorIds, setVendorIds] = useState<string[]>(rfq?.vendorIds ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setTitle(rfq?.title ?? prefill?.title ?? "");
    setDescription(rfq?.description ?? prefill?.description ?? "");
    setDepartmentId(rfq?.departmentId ?? prefill?.departmentId ?? "");
    setLines(initLines());
    setVendorIds(rfq?.vendorIds ?? []);
    setErrors({});
  }

  function submit() {
    setErrors({});
    const departmentName = departments.find((d) => d._id === departmentId)?.name ?? "";
    startTransition(async () => {
      const res = await saveRfqAction(
        { title, description, departmentId, departmentName, lines, vendorIds, requisitionId: rfq?.requisitionId ?? prefill?.requisitionId ?? "" },
        rfq?._id
      );
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(rfq ? "RFQ updated" : "RFQ created");
      setOpen(false);
      if (res.id && onSaved) onSaved(res.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(n) => { if (n) reset(); setOpen(n); }}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{rfq ? "Edit RFQ" : "New RFQ"}</SheetTitle>
          <SheetDescription>Request quotes from multiple vendors and compare.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Laptop procurement Q3" />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={departmentId || "none"} onValueChange={(v) => setDepartmentId(!v || v === "none" ? "" : v)}>
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
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button type="button" size="xs" variant="outline" onClick={() => setLines([...lines, { description: "", quantity: "1", uom: "pcs" }])}>
                <Plus className="size-3" data-icon="inline-start" />
                Add
              </Button>
            </div>
            {errors.lines && <p className="text-xs text-destructive">{errors.lines}</p>}
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input value={l.description} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)))} placeholder="Item" className="flex-1" />
                <Input type="number" min={0} value={l.quantity} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))} className="w-20" />
                <Select value={l.uom} onValueChange={(v) => setLines(lines.map((x, idx) => (idx === i ? { ...x, uom: v ?? "pcs" } : x)))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS_OF_MEASURE.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" size="icon-xs" variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} aria-label="Remove">
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Invite vendors</Label>
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border/60 p-2">
              {vendors.map((v) => (
                <label key={v._id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={vendorIds.includes(v._id)}
                    onCheckedChange={(c) => setVendorIds(c === true ? [...vendorIds, v._id] : vendorIds.filter((x) => x !== v._id))}
                  />
                  {v.companyName}
                </label>
              ))}
            </div>
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : rfq ? "Save changes" : "Create RFQ"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
