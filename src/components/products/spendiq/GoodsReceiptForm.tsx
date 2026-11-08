"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
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
import { createGrnAction } from "@/app/(products)/spendiq/(protected)/(staff)/grn/actions";

export interface GrnPoItem {
  itemIndex: number;
  description: string;
  outstanding: number;
  uom: string;
}

export default function GoodsReceiptForm({
  pos,
  selectedPoId,
  itemsByPo,
  trigger,
}: {
  pos: { _id: string; poNumber: string; vendorName: string }[];
  selectedPoId?: string;
  /** poId -> outstanding line items. */
  itemsByPo: Record<string, GrnPoItem[]>;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [poId, setPoId] = useState(selectedPoId ?? "");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState("");
  const [qc, setQc] = useState(true);
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<Record<number, { received: string; accepted: string; remarks: string }>>({});
  const [error, setError] = useState("");

  const items = itemsByPo[poId] ?? [];

  function reset() {
    setPoId(selectedPoId ?? "");
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setWarehouse("");
    setQc(true);
    setRemarks("");
    setLines({});
    setError("");
  }

  function submit() {
    setError("");
    const payloadLines = items
      .map((it) => {
        const l = lines[it.itemIndex];
        return l
          ? { itemIndex: it.itemIndex, receivedQty: Number(l.received) || 0, acceptedQty: Number(l.accepted) || 0, remarks: l.remarks }
          : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null && l.receivedQty > 0);

    if (payloadLines.length === 0) {
      setError("Enter received quantities for at least one line.");
      return;
    }

    startTransition(async () => {
      const res = await createGrnAction({ poId, receivedDate, warehouseLocation: warehouse, qualityChecked: qc, remarks, lines: payloadLines });
      if (!res.ok) {
        setError(res.error ?? "Could not record receipt.");
        return;
      }
      toast.success("Goods receipt recorded");
      setOpen(false);
      router.push(`/spendiq/grn/${res.id}`);
    });
  }

  return (
    <Sheet open={open} onOpenChange={(n) => { if (n) reset(); setOpen(n); }}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Record Goods Receipt</SheetTitle>
          <SheetDescription>Enter received and accepted quantities against a purchase order.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Purchase order *</Label>
            <Select value={poId} onValueChange={(v) => { setPoId(v ?? ""); setLines({}); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {pos.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.poNumber} · {p.vendorName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Received date</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Warehouse / location</Label>
              <Input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="e.g. HO Store" />
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <Label>Line items (outstanding)</Label>
              {items.map((it) => {
                const l = lines[it.itemIndex] ?? { received: "", accepted: "", remarks: "" };
                return (
                  <div key={it.itemIndex} className="rounded-lg border border-border/60 p-2.5 space-y-2">
                    <p className="text-sm font-medium">{it.description} <span className="text-xs text-muted-foreground">· {it.outstanding} {it.uom} outstanding</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" min={0} placeholder="Received" value={l.received} onChange={(e) => setLines({ ...lines, [it.itemIndex]: { ...l, received: e.target.value } })} />
                      <Input type="number" min={0} placeholder="Accepted" value={l.accepted} onChange={(e) => setLines({ ...lines, [it.itemIndex]: { ...l, accepted: e.target.value } })} />
                    </div>
                    <Input placeholder="Remarks (optional)" value={l.remarks} onChange={(e) => setLines({ ...lines, [it.itemIndex]: { ...l, remarks: e.target.value } })} />
                  </div>
                );
              })}
            </div>
          )}
          {poId && items.length === 0 && <p className="text-sm text-muted-foreground">This PO has no outstanding quantity.</p>}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={qc} onCheckedChange={(v) => setQc(v === true)} />
            Quality checked
          </label>
          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>

          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="button" onClick={submit} disabled={pending || !poId} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Record receipt"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
