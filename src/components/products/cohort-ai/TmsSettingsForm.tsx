"use client";

import { useState, useTransition } from "react";
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
import { SUPPORTED_CURRENCIES } from "@/lib/products/cohort-ai/constants";
import { saveTmsSettingsAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/settings/actions";
import type { TmsSettings } from "@/lib/products/cohort-ai/settings";

export default function TmsSettingsForm({ settings }: { settings: TmsSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [techs, setTechs] = useState(settings.technologySuggestions.join("\n"));
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [certFormat, setCertFormat] = useState(settings.certificateNumberFormat);
  const [classDuration, setClassDuration] = useState(String(settings.defaultClassDurationMinutes));
  const [inst, setInst] = useState(settings.institute);

  const setI = (k: keyof typeof inst, v: string) => setInst((s) => ({ ...s, [k]: v }));

  function save() {
    startTransition(async () => {
      const result = await saveTmsSettingsAction({
        technologySuggestions: techs,
        defaultCurrency: currency,
        certificateNumberFormat: certFormat,
        defaultClassDurationMinutes: classDuration,
        instituteName: inst.name,
        instituteAddress: inst.addressLine ?? "",
        instituteCity: inst.city ?? "",
        instituteEmail: inst.email ?? "",
        institutePhone: inst.phone ?? "",
        instituteWebsite: inst.website ?? "",
        signatoryName: inst.signatoryName ?? "",
        signatoryTitle: inst.signatoryTitle ?? "",
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
          <div className="space-y-1.5">
            <Label>Technology / track suggestions</Label>
            <p className="text-xs text-muted-foreground">One per line. Offered in the program form.</p>
            <Textarea value={techs} onChange={(e) => setTechs(e.target.value)} rows={7} />
          </div>
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
              <Label>Certificate number format</Label>
              <Input value={certFormat} onChange={(e) => setCertFormat(e.target.value)} placeholder="YO-Cohort AI-{yyyy}-{n}" />
              <p className="text-xs text-muted-foreground">{"{n}"} sequence · {"{yyyy}"} year</p>
            </div>
            <div className="space-y-1.5">
              <Label>Default class duration (min)</Label>
              <Input type="number" min={15} max={600} value={classDuration} onChange={(e) => setClassDuration(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardContent className="space-y-4 py-5">
          <p className="text-sm font-semibold text-foreground">Institute identity</p>
          <p className="text-xs text-muted-foreground">Printed on certificates and invoices in later phases.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Institute name</Label>
              <Input value={inst.name} onChange={(e) => setI("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={inst.city ?? ""} onChange={(e) => setI("city", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input value={inst.addressLine ?? ""} onChange={(e) => setI("addressLine", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={inst.email ?? ""} onChange={(e) => setI("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={inst.phone ?? ""} onChange={(e) => setI("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input value={inst.website ?? ""} onChange={(e) => setI("website", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Signatory name</Label>
              <Input value={inst.signatoryName ?? ""} onChange={(e) => setI("signatoryName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Signatory title</Label>
              <Input value={inst.signatoryTitle ?? ""} onChange={(e) => setI("signatoryTitle", e.target.value)} />
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
