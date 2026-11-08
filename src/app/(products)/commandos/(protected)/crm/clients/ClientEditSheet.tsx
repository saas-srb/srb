"use client";

import { SELECTABLE_GST_STATES } from "@/lib/platform/billing/gst";
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
import { CLIENT_STATUSES, SUPPORTED_CURRENCIES } from "@/lib/products/sprintos/constants";
import { saveClientAction } from "./actions";
import type { SerializedClient } from "@/lib/products/sprintos/clients";

/**
 * Mirrors `src/components/sprintos/ClientForm.tsx` field-for-field (same
 * `validateClient` shape on the other end) — the admin surface needs its own
 * copy because it calls the admin-scoped `saveClientAction`
 * (`requireWorkspaceAction("manage.crm.clients")`), not PMS's session-gated one.
 */

type FormState = Record<string, string>;

function fromClient(c: SerializedClient | undefined): FormState {
  if (!c) return { status: "prospect", billingCurrency: "INR" };
  return {
    companyName: c.companyName,
    industry: c.industry ?? "",
    website: c.website ?? "",
    status: c.status,
    contactName: c.primaryContact.name ?? "",
    contactEmail: c.primaryContact.email ?? "",
    contactPhone: c.primaryContact.phone ?? "",
    contactDesignation: c.primaryContact.designation ?? "",
    billingAddress: c.billing.addressLine ?? "",
    billingCity: c.billing.city ?? "",
    billingCountry: c.billing.country ?? "",
    billingState: c.billing.state ?? "",
    billingGstin: c.billing.gstin ?? "",
    billingCurrency: c.billing.currency ?? "INR",
    paymentTermsDays: c.billing.paymentTermsDays != null ? String(c.billing.paymentTermsDays) : "",
    notes: c.notes ?? "",
    tags: c.tags.join(", "),
  };
}

export default function ClientEditSheet({
  client,
  trigger,
  onSaved,
}: {
  client?: SerializedClient;
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromClient(client));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(fromClient(client));
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveClientAction(form, client?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(client ? "Client updated" : "Client created");
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
          <SheetTitle>{client ? "Edit Client" : "New Client"}</SheetTitle>
          <SheetDescription>Company profile, primary contact and billing details.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Company name *</Label>
            <Input value={form.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} />
            {err("companyName")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input value={form.industry ?? ""} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Fintech" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || "prospect"} onValueChange={(v) => set("status", v ?? "prospect")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" />
            {err("website")}
          </div>

          <div className="border-t border-border/60 pt-3 text-sm font-semibold text-foreground">Primary contact</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} />
              {err("contactName")}
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input value={form.contactDesignation ?? ""} onChange={(e) => set("contactDesignation", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
              {err("contactEmail")}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value)} />
              {err("contactPhone")}
            </div>
          </div>

          <div className="border-t border-border/60 pt-3 text-sm font-semibold text-foreground">Billing</div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.billingAddress ?? ""} onChange={(e) => set("billingAddress", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.billingCity ?? ""} onChange={(e) => set("billingCity", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Input value={form.billingCountry ?? ""} onChange={(e) => set("billingCountry", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>State (India)</Label>
              <Input list="gst-states" value={form.billingState ?? ""} onChange={(e) => set("billingState", e.target.value)} placeholder="e.g. Karnataka" />
              <datalist id="gst-states">{Object.values(SELECTABLE_GST_STATES).map((n) => <option key={n} value={n} />)}</datalist>
            </div>
            <div className="space-y-1.5">
              <Label>GSTIN / Tax ID</Label>
              <Input value={form.billingGstin ?? ""} onChange={(e) => set("billingGstin", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.billingCurrency || "INR"} onValueChange={(v) => set("billingCurrency", v ?? "INR")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment terms (days)</Label>
              <Input type="number" min={0} value={form.paymentTermsDays ?? ""} onChange={(e) => set("paymentTermsDays", e.target.value)} />
              {err("paymentTermsDays")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <Input value={form.tags ?? ""} onChange={(e) => set("tags", e.target.value)} placeholder="comma, separated" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : client ? "Save changes" : "Create client"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
