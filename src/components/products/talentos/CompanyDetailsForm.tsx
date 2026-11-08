"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveCompanyDetailsAction } from "@/app/(products)/talentos/(protected)/(staff)/settings/actions";

export interface CompanyDetailsValues {
  name: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  pan: string;
  gstin: string;
  cin: string;
  pfEstablishmentCode: string;
  esiEstablishmentCode: string;
  tan: string;
  ptRegistration: string;
  lin: string;
  signatoryName: string;
  signatoryDesignation: string;
  payslipNote: string;
}

export default function CompanyDetailsForm({ details }: { details: CompanyDetailsValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<CompanyDetailsValues>(details);

  function set<K extends keyof CompanyDetailsValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await saveCompanyDetailsAction(form as unknown as Record<string, unknown>);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Company details saved — payslips will use them");
      router.refresh();
    });
  }

  const field = (key: keyof CompanyDetailsValues, label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={!!errors[key] || undefined}
      />
      {hint && !errors[key] && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("name", "Display name", "Shown large on the payslip header")}
          {field("legalName", "Registered legal name")}
          {field("email", "Email")}
          {field("phone", "Phone")}
          {field("website", "Website")}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Registered address</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("addressLine1", "Address line 1")}
          {field("addressLine2", "Address line 2")}
          {field("city", "City")}
          {field("state", "State")}
          {field("postalCode", "PIN code")}
          {field("country", "Country")}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Statutory registrations</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("pan", "Company PAN", "e.g. AAACY1234F — left blank, it's hidden on the payslip")}
          {field("gstin", "GSTIN")}
          {field("cin", "CIN")}
          {field("pfEstablishmentCode", "PF establishment code")}
          {field("esiEstablishmentCode", "ESI establishment code")}
          {field("lin", "Labour Identification No. (LIN)")}
          {field("tan", "TAN (tax deduction account number)", "e.g. MUMA12345B. Needed on Form 16 and for TDS returns")}
          {field("ptRegistration", "Professional tax registration number")}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Payslip signatory & note</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("signatoryName", "Authorised signatory name")}
          {field("signatoryDesignation", "Signatory designation")}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Payslip footer note</Label>
            <Textarea
              rows={2}
              value={form.payslipNote}
              onChange={(e) => set("payslipNote", e.target.value)}
              aria-invalid={!!errors.payslipNote || undefined}
            />
            {errors.payslipNote && <p className="text-xs text-destructive">{errors.payslipNote}</p>}
          </div>
        </CardContent>
      </GlassCard>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Save Company Details"}
      </Button>
    </form>
  );
}
