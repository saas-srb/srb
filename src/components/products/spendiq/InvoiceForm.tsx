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
import { SUPPORTED_CURRENCIES, round2, formatMoney } from "@/lib/products/spendiq/constants";
import { saveInvoiceAction } from "@/app/(products)/spendiq/(protected)/(staff)/invoices/actions";
import type { SerializedInvoice } from "@/lib/products/spendiq/invoices";

export default function InvoiceForm({
  invoice,
  vendors,
  tdsSections = [],
  trigger,
}: {
  invoice?: SerializedInvoice;
  vendors: { _id: string; companyName: string; hasPan?: boolean }[];
  /** The TDS sections offered this year: the platform's rulebook less what the company switched off. */
  tdsSections?: { code: string; label: string; rate: number | null; noPanRate?: number | null; confirmed: boolean }[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    vendorId: invoice?.vendorId ?? "",
    vendorInvoiceNumber: invoice?.vendorInvoiceNumber ?? "",
    poNumber: invoice?.poNumber ?? "",
    invoiceDate: invoice?.invoiceDate ?? new Date().toISOString().slice(0, 10),
    dueDate: invoice?.dueDate ?? "",
    subtotal: invoice ? String(invoice.subtotal) : "",
    gstAmount: invoice ? String(invoice.gstAmount) : "",
    tdsRate: invoice ? String(invoice.tdsRate) : "0",
    tdsSection: invoice?.tdsSection ?? "",
    currency: invoice?.currency ?? "INR",
    notes: invoice?.notes ?? "",
  });

  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // The rate the law gives for a section; the higher no-PAN rate when the chosen vendor has no valid PAN on file.
  function lawRate(sectionCode: string, vendorId: string): number | null {
    const sec = tdsSections.find((s) => s.code === sectionCode);
    if (!sec) return null;
    const vendor = vendors.find((v) => v._id === vendorId);
    return vendor && vendor.hasPan === false && sec.noPanRate != null ? sec.noPanRate : sec.rate;
  }
  // Choosing a section or vendor refreshes the TDS % only while it still holds the suggested value (or nothing), so a figure typed by hand is kept.
  function change(k: "tdsSection" | "vendorId", v: string) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      const before = lawRate(f.tdsSection, f.vendorId);
      const after = next.tdsSection ? lawRate(next.tdsSection, next.vendorId) : null;
      const untouched = (Number(f.tdsRate) || 0) === 0 || (before !== null && Number(f.tdsRate) === before);
      if (after !== null && untouched) next.tdsRate = String(after);
      return next;
    });
  }

  const subtotal = Number(form.subtotal) || 0;
  const gst = Number(form.gstAmount) || 0;
  const tds = round2(subtotal * (Number(form.tdsRate) || 0) / 100);
  // A bill keeps its section even if it has since been switched off, so it is listed too.
  const chosen = tdsSections.find((s) => s.code === form.tdsSection);
  const chosenVendor = vendors.find((v) => v._id === form.vendorId);
  const noPan = !!chosen && chosenVendor?.hasPan === false && chosen.noPanRate != null;
  const total = round2(subtotal + gst);
  const net = round2(total - tds);

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
      const res = await saveInvoiceAction(form, invoice?._id);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(invoice ? "Invoice updated" : "Invoice recorded");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{invoice ? "Edit Invoice" : "New Invoice"}</SheetTitle>
          <SheetDescription>Vendor invoice with GST and TDS. Link a PO number for 3-way matching.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Vendor *</Label>
            <Select value={form.vendorId} onValueChange={(v) => change("vendorId", v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v._id} value={v._id}>{v.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.vendorId && <p className="text-xs text-destructive">{errors.vendorId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vendor invoice #</Label>
              <Input value={form.vendorInvoiceNumber} onChange={(e) => set("vendorInvoiceNumber", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>PO number (optional)</Label>
              <Input value={form.poNumber} onChange={(e) => set("poNumber", e.target.value)} placeholder="PO-0001" />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice date *</Label>
              <Input type="date" value={form.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} />
              {errors.invoiceDate && <p className="text-xs text-destructive">{errors.invoiceDate}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Taxable amount *</Label>
              <Input type="number" min={0} value={form.subtotal} onChange={(e) => set("subtotal", e.target.value)} />
              {errors.subtotal && <p className="text-xs text-destructive">{errors.subtotal}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>GST amount</Label>
              <Input type="number" min={0} value={form.gstAmount} onChange={(e) => set("gstAmount", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>TDS %</Label>
              <Input type="number" min={0} value={form.tdsRate} onChange={(e) => set("tdsRate", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>TDS section (optional)</Label>
            <Select value={form.tdsSection || "none"} onValueChange={(v) => change("tdsSection", !v || v === "none" ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="No TDS section" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No TDS section</SelectItem>
                {form.tdsSection && !chosen && <SelectItem value={form.tdsSection}>{form.tdsSection} (switched off)</SelectItem>}
                {tdsSections.map((s) => (
                  <SelectItem key={s.code} value={s.code}>{s.code}: {s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tdsSection && <p className="text-xs text-destructive">{errors.tdsSection}</p>}
            {chosen && chosen.rate !== null && (
              <p className="text-xs text-muted-foreground">
                {noPan ? `No PAN on file: higher rate may apply. ${chosen.noPanRate}% is used instead of ${chosen.rate}%.` : `The law gives ${chosen.rate}% for this section.`} You can change the TDS %.
                {!chosen.confirmed && " These figures have not been checked by the platform yet."}
              </p>
            )}
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

          <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Invoice total</span><span className="tabular-nums">{formatMoney(total, form.currency)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Less TDS</span><span className="tabular-nums">-{formatMoney(tds, form.currency)}</span></div>
            <div className="flex justify-between border-t border-border/60 pt-1 font-semibold"><span>Net payable</span><span className="tabular-nums">{formatMoney(net, form.currency)}</span></div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : invoice ? "Save changes" : "Record invoice"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
