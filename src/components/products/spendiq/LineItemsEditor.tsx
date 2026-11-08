"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { GST_RATES, UNITS_OF_MEASURE, computeTax, round2, formatMoney } from "@/lib/products/spendiq/constants";

export interface EditableLine {
  description: string;
  hsn: string;
  quantity: string;
  uom: string;
  unitPrice: string;
  gstRate: string;
}

export function blankLine(): EditableLine {
  return { description: "", hsn: "", quantity: "1", uom: "pcs", unitPrice: "0", gstRate: "18" };
}

export default function LineItemsEditor({
  lines,
  onChange,
  discount,
  onDiscountChange,
  currency = "INR",
  showPricing = true,
  showHsn = false,
}: {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  discount?: string;
  onDiscountChange?: (v: string) => void;
  currency?: string;
  showPricing?: boolean;
  /** Per-line HSN / SAC input (invoices; GST returns need it). */
  showHsn?: boolean;
}) {
  function set(i: number, key: keyof EditableLine, value: string) {
    onChange(lines.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  }
  function add() {
    onChange([...lines, blankLine()]);
  }
  function remove(i: number) {
    onChange(lines.filter((_, idx) => idx !== i));
  }

  const subtotal = round2(
    lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0)
  );
  const disc = Number(discount) || 0;
  const avgGst = lines.length
    ? lines.reduce((s, l) => s + (Number(l.gstRate) || 0), 0) / lines.length
    : 0;
  const tax = computeTax(subtotal, disc, avgGst);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Line items</Label>
        <Button type="button" size="xs" variant="outline" onClick={add}>
          <Plus className="size-3" data-icon="inline-start" />
          Add line
        </Button>
      </div>

      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={i} className="rounded-lg border border-border/60 p-2.5 space-y-2">
            <div className="flex gap-2">
              <Input
                value={l.description}
                onChange={(e) => set(i, "description", e.target.value)}
                placeholder="Item description"
                className="flex-1"
              />
              <Button type="button" size="icon-xs" variant="ghost" onClick={() => remove(i)} aria-label="Remove line">
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
            {showHsn && (
              <Input
                value={l.hsn}
                onChange={(e) => set(i, "hsn", e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
                placeholder="HSN / SAC code (4, 6 or 8 digits, optional)"
                aria-label="HSN or SAC code"
              />
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input type="number" min={0} value={l.quantity} onChange={(e) => set(i, "quantity", e.target.value)} placeholder="Qty" />
              <Select value={l.uom || "pcs"} onValueChange={(v) => set(i, "uom", v ?? "pcs")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS_OF_MEASURE.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showPricing && (
                <>
                  <Input type="number" min={0} value={l.unitPrice} onChange={(e) => set(i, "unitPrice", e.target.value)} placeholder="Unit price" />
                  <Select value={l.gstRate || "18"} onValueChange={(v) => set(i, "gstRate", v ?? "18")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GST_RATES.map((r) => (
                        <SelectItem key={r} value={String(r)}>{r}% GST</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            {showPricing && (
              <p className="text-right text-xs text-muted-foreground">
                Line: {formatMoney(round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)), currency)}
              </p>
            )}
          </div>
        ))}
        {lines.length === 0 && <p className="text-sm text-muted-foreground">No lines yet.</p>}
      </div>

      {showPricing && (
        <div className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(subtotal, currency)}</span></div>
          {onDiscountChange && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Discount</span>
              <Input type="number" min={0} value={discount ?? "0"} onChange={(e) => onDiscountChange(e.target.value)} className="h-7 w-32 text-right" />
            </div>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">GST (~{avgGst.toFixed(0)}%)</span><span className="tabular-nums">{formatMoney(tax.gstAmount, currency)}</span></div>
          <div className="flex justify-between border-t border-border/60 pt-1.5 font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(tax.total, currency)}</span></div>
        </div>
      )}
    </div>
  );
}
