"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RegimeSummary, TaxPreview } from "@/lib/products/talentos/tax-preview";
import { formatCurrency } from "@/lib/utils";
import { previewMyTaxAction, saveMyDeclarationAction } from "@/app/(products)/talentos/(protected)/me/tax/actions";

type D = Record<string, number | boolean | string>;

const AMOUNTS: [string, string, string][] = [
  ["section80C", "Section 80C investments", "Life insurance, ELSS, PPF, tuition fees, home-loan principal, tax-saving FD. Your PF is added automatically. Limit ₹1,50,000 across 80C."],
  ["section80CCD1B", "NPS: additional self contribution (80CCD(1B))", "Limit ₹50,000."],
  ["section80DSelf", "Health insurance: self, spouse, children (80D)", ""],
  ["section80DParents", "Health insurance: parents (80D)", ""],
  ["section80DPreventive", "Preventive health check-up (inside the premiums above)", "Limit ₹5,000."],
  ["section80E", "Education loan interest (80E)", "No upper limit, for up to 8 years."],
  ["section80G", "Donations that qualify (80G)", "Enter the amount after applying 50% or 100%."],
  ["interestSavings", "Savings or deposit interest (80TTA / 80TTB)", ""],
  ["section80DDB", "Treatment of specified diseases (80DDB)", ""],
  ["homeLoanInterest", "Home-loan interest, self-occupied house (24(b))", "Limit ₹2,00,000."],
  ["ltaExemption", "Leave travel allowance, supported by bills", ""],
  ["rentPaidAnnual", "Rent you pay in a year (for HRA)", "Above ₹1,00,000 a year needs the landlord's PAN."],
  ["otherIncome", "Income from other sources (interest, rent received…)", "Use a minus sign for a loss from house property."],
];
const LEVELS = [["none", "None"], ["normal", "40% or more"], ["severe", "80% or more"]];
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function TaxDeclarationForm({
  fy,
  status,
  hrNote,
  initial,
  verified,
}: {
  fy: string;
  status: "none" | "draft" | "submitted" | "verified";
  hrNote: string | null;
  initial: { regime: "old" | "new"; declared: D; previousEmployer: { employerName: string; taxableSalary: number; employeePf: number; professionalTax: number; tds: number }; landlordPan: string | null };
  verified: D | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [regime, setRegime] = useState(initial.regime);
  const [d, setD] = useState<Record<string, string | boolean>>(() => Object.fromEntries(Object.entries(initial.declared).map(([k, v]) => [k, typeof v === "boolean" || typeof v === "string" ? v : v ? String(v) : ""])));
  const [prev, setPrev] = useState({ employerName: initial.previousEmployer.employerName, taxableSalary: String(initial.previousEmployer.taxableSalary || ""), employeePf: String(initial.previousEmployer.employeePf || ""), professionalTax: String(initial.previousEmployer.professionalTax || ""), tds: String(initial.previousEmployer.tds || "") });
  const [pan, setPan] = useState(initial.landlordPan ?? "");
  const locked = status === "verified";
  const [preview, setPreview] = useState<TaxPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [calculating, startCalc] = useTransition();

  // Work out the tax under both regimes from what has been typed, a moment after typing stops.
  useEffect(() => {
    const id = setTimeout(() => {
      startCalc(async () => {
        const r = await previewMyTaxAction({ declared: d, previousEmployer: prev, landlordPan: pan });
        if (r.ok) {
          setPreview(r.preview);
          setPreviewError(null);
        } else {
          setPreviewError(r.error);
        }
      });
    }, 700);
    return () => clearTimeout(id);
  }, [d, prev, pan]);

  function save(submit: boolean) {
    startTransition(async () => {
      const r = await saveMyDeclarationAction(fy, { regime, declared: d, previousEmployer: prev, landlordPan: pan, submit });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error ?? Object.values(r.fieldErrors ?? {})[0] ?? "Could not save.");
        return;
      }
      setErrors({});
      toast.success(submit ? "Declaration submitted to HR" : "Draft saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <GlassCard interactive={false}>
        <CardContent className="space-y-2 py-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Financial year {fy}</span>
            <Badge variant="outline" className="capitalize">{status === "none" ? "Not started" : status}</Badge>
          </div>
          <p className="text-muted-foreground">Your employer deducts income tax (TDS) every month from your estimated yearly tax. Tell payroll your regime and investments so the tax is worked out correctly. In the new regime only your PF, NPS from the employer and the standard deduction apply; the other deductions below count in the old regime.</p>
          {hrNote && <p className="rounded-md bg-amber-500/10 px-3 py-2">HR note: {hrNote}</p>}
          {locked && <p className="text-muted-foreground">HR has verified this declaration. Ask HR to reopen it if something has to change.</p>}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardContent className="space-y-4 py-4">
          <div className="max-w-xs space-y-1.5">
            <Label>Tax regime</Label>
            <select className={selectCls} disabled={locked} value={regime} onChange={(e) => setRegime(e.target.value as "old" | "new")}>
              <option value="new">New regime (default)</option>
              <option value="old">Old regime (with deductions)</option>
            </select>
            {errors.regime && <p className="text-xs text-destructive">{errors.regime}</p>}
          </div>
          <p className="text-sm font-medium">Investments and deductions <span className="font-normal text-muted-foreground">(they reduce tax only in the old regime; fill them in to see which regime is better for you)</span></p>
          {(
            <div className="grid gap-4 sm:grid-cols-2">
              {AMOUNTS.map(([k, label, hint]) => (
                <div key={k} className="space-y-1">
                  <Label>{label}</Label>
                  <Input disabled={locked} inputMode="numeric" value={String(d[k] ?? "")} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
                  {verified && <p className="text-xs text-muted-foreground">HR accepted: ₹{Number(verified[k] ?? 0).toLocaleString("en-IN")}</p>}
                  {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} className="size-4 accent-primary" checked={!!d.section80DSelfSenior} onChange={(e) => setD({ ...d, section80DSelfSenior: e.target.checked })} />Self or spouse is a senior citizen (80D)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} className="size-4 accent-primary" checked={!!d.section80DParentsSenior} onChange={(e) => setD({ ...d, section80DParentsSenior: e.target.checked })} />Parents are senior citizens (80D)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} className="size-4 accent-primary" checked={!!d.section80DDBSenior} onChange={(e) => setD({ ...d, section80DDBSenior: e.target.checked })} />Patient is a senior citizen (80DDB)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} className="size-4 accent-primary" checked={!!d.rentInMetro} onChange={(e) => setD({ ...d, rentInMetro: e.target.checked })} />I live in Delhi, Mumbai, Kolkata or Chennai</label>
              {(["disability80DD", "disability80U"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label>{k === "disability80DD" ? "Dependant with disability (80DD)" : "Disability of your own (80U)"}</Label>
                  <select className={selectCls} disabled={locked} value={String(d[k] ?? "none")} onChange={(e) => setD({ ...d, [k]: e.target.value })}>
                    {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
              <div className="space-y-1">
                <Label>Landlord&apos;s PAN</Label>
                <Input disabled={locked} value={pan} maxLength={10} onChange={(e) => setPan(e.target.value.toUpperCase())} />
                {errors.landlordPan && <p className="text-xs text-destructive">{errors.landlordPan}</p>}
              </div>
            </div>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardContent className="space-y-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Your estimated tax{preview ? ` for ${preview.fy}` : ""}</p>
            {calculating && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {previewError && <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{previewError}</p>}
          {preview && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {([["new", preview.new], ["old", preview.old]] as const).map(([k, r]) => (
                  <div key={k} className={`rounded-lg border p-3 ${preview.better === k ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{k === "new" ? "New regime" : "Old regime"}</p>
                      {preview.better === k && preview.saving > 0 && <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Saves {formatCurrency(preview.saving)} a year</Badge>}
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(r.yearTax)}</p>
                    <p className="text-xs text-muted-foreground">tax for the year · taxable income {formatCurrency(r.taxableIncome)}</p>
                    <p className="mt-1 text-xs">About {formatCurrency(r.thisMonth)} is deducted this month; {r.monthsRemaining} month(s) left in the year.</p>
                    {!locked && regime !== k && <Button size="sm" variant="outline" className="mt-2" onClick={() => setRegime(k)}>Choose {k} regime</Button>}
                    {regime === k && <p className="mt-2 text-xs font-medium">Your current choice</p>}
                  </div>
                ))}
              </div>
              <Breakdown r={regime === "old" ? preview.old : preview.new} />
              {preview.headroom.section80C > 0 && <p className="text-xs text-muted-foreground">You can still invest {formatCurrency(preview.headroom.section80C)} under section 80C{preview.headroom.section80CCD1B > 0 ? ` and ${formatCurrency(preview.headroom.section80CCD1B)} in NPS (80CCD(1B))` : ""} to reduce tax in the old regime.</p>}
              <p className="text-xs text-muted-foreground">This is calculated by the same payroll engine that works out your payslip, from your salary structure, payslips so far this year and the months still to come. It changes if your salary or attendance changes. {preview.confirmed ? "" : `Note: the slabs for ${preview.fy} are not yet confirmed by the platform, so treat this as indicative.`}</p>
            </>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-semibold">Joined this year from another employer?</p>
          <p className="text-xs text-muted-foreground">Enter the figures from your Form 16 or relieving payslip for the months you worked there this financial year, so tax is not deducted twice on the same slab.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Employer name</Label><Input disabled={locked} value={prev.employerName} onChange={(e) => setPrev({ ...prev, employerName: e.target.value })} /></div>
            <div className="space-y-1"><Label>Taxable salary paid there (₹)</Label><Input disabled={locked} inputMode="numeric" value={prev.taxableSalary} onChange={(e) => setPrev({ ...prev, taxableSalary: e.target.value })} /></div>
            <div className="space-y-1"><Label>PF you paid there (₹)</Label><Input disabled={locked} inputMode="numeric" value={prev.employeePf} onChange={(e) => setPrev({ ...prev, employeePf: e.target.value })} /></div>
            <div className="space-y-1"><Label>Professional tax paid there (₹)</Label><Input disabled={locked} inputMode="numeric" value={prev.professionalTax} onChange={(e) => setPrev({ ...prev, professionalTax: e.target.value })} /></div>
            <div className="space-y-1"><Label>Tax deducted there (₹)</Label><Input disabled={locked} inputMode="numeric" value={prev.tds} onChange={(e) => setPrev({ ...prev, tds: e.target.value })} /></div>
          </div>
          {errors.previousEmployer && <p className="text-xs text-destructive">{errors.previousEmployer}</p>}
        </CardContent>
      </GlassCard>

      {!locked && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => save(false)}>Save draft</Button>
          <Button disabled={pending} onClick={() => save(true)}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Submit to HR"}</Button>
        </div>
      )}
    </div>
  );
}

function Breakdown({ r }: { r: RegimeSummary }) {
  const row = (label: string, value: number, minus = false) =>
    value === 0 ? null : (
      <tr key={label}>
        <td className="py-0.5 pr-4">{label}</td>
        <td className="py-0.5 text-right tabular-nums">{minus ? "− " : ""}{formatCurrency(Math.abs(value))}</td>
      </tr>
    );
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-medium">How the {r.regime} regime figure is worked out</summary>
      <table className="mt-2 w-full max-w-md text-xs">
        <tbody>
          {row("Salary for the year", r.grossSalary)}
          {row("HRA and LTA exemption", r.hraExemption, true)}
          {row("Standard deduction", r.standardDeduction, true)}
          {row("Professional tax", r.professionalTax, true)}
          {row("Other income", r.otherIncome)}
          {r.deductions.map((x) => row(`${x.label} (${x.section})`, x.amount, true))}
          {row("Taxable income", r.taxableIncome)}
          {row("Tax on that income", r.taxOnIncome)}
          {row("Rebate under section 87A", r.rebate, true)}
          {row("Surcharge", r.surcharge)}
          {row("Health and education cess", r.cess)}
          {row("Tax for the year", r.yearTax)}
          {row("Already deducted this year", r.deductedSoFar)}
        </tbody>
      </table>
    </details>
  );
}
