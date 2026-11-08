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
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  PAYMENT_TERMS,
  SUPPORTED_CURRENCIES,
} from "@/lib/products/spendiq/constants";
import { saveVendorAction } from "@/app/(products)/spendiq/(protected)/(staff)/vendors/actions";
import type { SerializedVendor } from "@/lib/products/spendiq/vendors";

type FormState = Record<string, string>;

function fromVendor(v: SerializedVendor | undefined): FormState {
  if (!v) {
    return { category: "other", status: "active", paymentTerms: "net_30", currency: "INR" };
  }
  return {
    companyName: v.companyName,
    gstin: v.gstin ?? "",
    pan: v.pan ?? "",
    contactPerson: v.contactPerson ?? "",
    email: v.email ?? "",
    phone: v.phone ?? "",
    addressLine: v.addressLine ?? "",
    city: v.city ?? "",
    state: v.state ?? "",
    pincode: v.pincode ?? "",
    bankAccountName: v.bankDetails?.accountName ?? "",
    bankAccountNumber: v.bankDetails?.accountNumber ?? "",
    bankIfsc: v.bankDetails?.ifsc ?? "",
    bankName: v.bankDetails?.bankName ?? "",
    bankBranch: v.bankDetails?.branch ?? "",
    paymentTerms: v.paymentTerms ?? "net_30",
    currency: v.currency ?? "INR",
    category: v.category ?? "other",
    rating: v.rating != null ? String(v.rating) : "",
    status: v.status ?? "active",
    notes: v.notes ?? "",
  };
}

export default function VendorForm({
  vendor,
  trigger,
  onSaved,
}: {
  vendor?: SerializedVendor;
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromVendor(vendor));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;
  const s = (k: string) => form[k] ?? "";

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(fromVendor(vendor));
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveVendorAction(form as Record<string, unknown>, vendor?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(vendor ? "Vendor updated" : "Vendor created");
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
          <SheetTitle>{vendor ? "Edit Vendor" : "New Vendor"}</SheetTitle>
          <SheetDescription>Company, tax, contact, bank and commercial terms.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Company name *</Label>
            <Input value={s("companyName")} onChange={(e) => set("companyName", e.target.value)} placeholder="e.g. Dell Technologies Pvt Ltd" />
            {err("companyName")}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={s("category") || "other"} onValueChange={(v) => set("category", v ?? "other")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENDOR_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={s("status") || "active"} onValueChange={(v) => set("status", v ?? "active")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENDOR_STATUSES.map((st) => (
                    <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>GSTIN</Label>
              <Input value={s("gstin")} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
              {err("gstin")}
            </div>
            <div className="space-y-1.5">
              <Label>PAN</Label>
              <Input value={s("pan")} onChange={(e) => set("pan", e.target.value.toUpperCase())} placeholder="AAAAA0000A" />
              {err("pan")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contact person</Label>
              <Input value={s("contactPerson")} onChange={(e) => set("contactPerson", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={s("phone")} onChange={(e) => set("phone", e.target.value)} />
              {err("phone")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={s("email")} onChange={(e) => set("email", e.target.value)} />
            {err("email")}
          </div>

          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={s("addressLine")} onChange={(e) => set("addressLine", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={s("city")} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={s("state")} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Pincode</Label>
              <Input value={s("pincode")} onChange={(e) => set("pincode", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-sm font-medium text-foreground">Bank details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Account name</Label>
                <Input value={s("bankAccountName")} onChange={(e) => set("bankAccountName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Account number</Label>
                <Input value={s("bankAccountNumber")} onChange={(e) => set("bankAccountNumber", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>IFSC</Label>
                <Input value={s("bankIfsc")} onChange={(e) => set("bankIfsc", e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>Bank name</Label>
                <Input value={s("bankName")} onChange={(e) => set("bankName", e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Branch</Label>
                <Input value={s("bankBranch")} onChange={(e) => set("bankBranch", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-border/60 pt-3">
            <div className="space-y-1.5">
              <Label>Payment terms</Label>
              <Select value={s("paymentTerms") || "net_30"} onValueChange={(v) => set("paymentTerms", v ?? "net_30")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>Rating (0–5)</Label>
              <Input type="number" min={0} max={5} step={0.1} value={s("rating")} onChange={(e) => set("rating", e.target.value)} />
              {err("rating")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={s("notes")} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : vendor ? "Save changes" : "Create vendor"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
