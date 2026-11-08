"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { recordInventoryTransactionAction } from "@/app/(products)/spendiq/(protected)/(staff)/inventory/actions";

export default function InventoryTxnForm({ itemId, uom }: { itemId: string; uom: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"stock_in" | "stock_out" | "adjustment">("stock_in");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await recordInventoryTransactionAction(itemId, { type, quantity, unitCost, reference, note });
      if (!res.ok) {
        toast.error(res.error ?? "Could not record transaction.");
        return;
      }
      toast.success("Transaction recorded");
      setQuantity("");
      setUnitCost("");
      setReference("");
      setNote("");
      router.refresh();
    });
  }

  const tabs = [
    { value: "stock_in" as const, label: "Stock In", icon: ArrowDownToLine },
    { value: "stock_out" as const, label: "Stock Out", icon: ArrowUpFromLine },
    { value: "adjustment" as const, label: "Adjust", icon: SlidersHorizontal },
  ];

  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>Record Transaction</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1.5">
          {tabs.map((t) => (
            <Button key={t.value} type="button" size="sm" variant={type === t.value ? "default" : "outline"} onClick={() => setType(t.value)}>
              <t.icon className="size-3.5" data-icon="inline-start" />
              {t.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Quantity ({uom}){type === "adjustment" ? " — signed" : ""}</Label>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          {type === "stock_in" && (
            <div className="space-y-1.5">
              <Label>Unit cost (optional)</Label>
              <Input type="number" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Reference (PO #, GRN #…)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button type="button" size="sm" disabled={pending || !quantity} onClick={submit}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Record"}
        </Button>
      </CardContent>
    </GlassCard>
  );
}
