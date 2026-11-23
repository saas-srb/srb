"use client";

import { useState, useTransition } from "react";
import IdentitySummary from "@/components/products/commandos/IdentitySummary";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SUPPORTED_CURRENCIES } from "@/lib/products/spendiq/constants";
import { savePrmsSettingsAction } from "@/app/(products)/spendiq/(protected)/settings/actions";
import type { PrmsSettings } from "@/lib/products/spendiq/settings";

export default function PrmsSettingsForm({ settings }: { settings: PrmsSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [reviewThreshold, setReviewThreshold] = useState(String(settings.procurementReviewThreshold));
  const [financeThreshold, setFinanceThreshold] = useState(String(settings.financeNotifyThreshold));
  const [items, setItems] = useState(settings.itemSuggestions.join("\n"));
  const [co, setCo] = useState(settings.company);

  const setC = (k: keyof typeof co, v: string) => setCo((s) => ({ ...s, [k]: v }));

  function save() {
    startTransition(async () => {
      const result = await savePrmsSettingsAction({
        defaultCurrency: currency,
        procurementReviewThreshold: reviewThreshold,
        financeNotifyThreshold: financeThreshold,
        itemSuggestions: items,
        companyName: co.name,
        companyAddress: co.addressLine ?? "",
        companyCity: co.city ?? "",
        companyGstin: co.gstin ?? "",
        companyPan: co.pan ?? "",
        companyEmail: co.email ?? "",
        companyPhone: co.phone ?? "",
        companyWebsite: co.website ?? "",
        signatoryName: co.signatoryName ?? "",
        signatoryTitle: co.signatoryTitle ?? "",
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save settings.");
        return;
      }
      toast.success("Settings saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <GlassCard interactive={false}>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Default currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v ?? currency)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Procurement review threshold</Label>
              <Input type="number" min={0} value={reviewThreshold} onChange={(e) => setReviewThreshold(e.target.value)} />
              <p className="text-xs text-muted-foreground">Requisitions at or above this need a 2nd approval.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Finance notify threshold</Label>
              <Input type="number" min={0} value={financeThreshold} onChange={(e) => setFinanceThreshold(e.target.value)} />
              <p className="text-xs text-muted-foreground">Approved requisitions above this notify finance.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Item / description suggestions</Label>
            <p className="text-xs text-muted-foreground">One per line. Offered in the requisition form.</p>
            <Textarea value={items} onChange={(e) => setItems(e.target.value)} rows={6} />
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardContent className="space-y-4 py-5">
          <IdentitySummary
            note="Printed on purchase orders and invoices. Set once for the whole company."
            rows={[
              { label: "Company name", value: co.name }, { label: "Address", value: co.addressLine }, { label: "City", value: co.city }, { label: "GSTIN", value: co.gstin },
              { label: "PAN", value: co.pan }, { label: "Email", value: co.email }, { label: "Phone", value: co.phone }, { label: "Website", value: co.website },
            ]}
          />
          <p className="text-sm font-semibold text-foreground">Signatory</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Signatory name</Label>
              <Input value={co.signatoryName ?? ""} onChange={(e) => setC("signatoryName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Signatory title</Label>
              <Input value={co.signatoryTitle ?? ""} onChange={(e) => setC("signatoryTitle", e.target.value)} />
            </div>
          </div>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Save settings"}
          </Button>
        </CardContent>
      </GlassCard>
    </div>
  );
}
