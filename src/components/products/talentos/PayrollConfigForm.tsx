"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PayrollConfigInput } from "@/lib/products/talentos/payroll-config";
import { savePayrollConfigAction } from "@/app/(products)/talentos/(protected)/(staff)/settings/actions";

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Form = Record<keyof PayrollConfigInput, string | boolean>;

export default function PayrollConfigForm({ config }: { config: PayrollConfigInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Form>(() => Object.fromEntries(Object.entries(config).map(([k, v]) => [k, typeof v === "boolean" ? v : String(v)])) as Form);
  const set = (k: keyof PayrollConfigInput, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof PayrollConfigInput) => String(form[k]);
  const on = (k: keyof PayrollConfigInput) => form[k] === true;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await savePayrollConfigAction(form);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Payroll policy saved");
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;
  const check = (k: keyof PayrollConfigInput, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={on(k)} onChange={(e) => set(k, e.target.checked)} />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
  const field = (k: keyof PayrollConfigInput, label: string, hint?: string, mode: "decimal" | "numeric" = "numeric") => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input inputMode={mode} value={text(k)} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k] || undefined} />
      {err(k)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  const pick = (k: keyof PayrollConfigInput, label: string, options: [string, string][], hint?: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select className={selectClass} value={text(k)} onChange={(e) => set(k, e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {err(k)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        This is how your company pays. The figures the law sets (PF and ESI rates, income-tax slabs, professional-tax slabs) are published by the platform for every company and are used automatically; you do not enter them here.
      </p>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Registrations</CardTitle><CardDescription>Deduct only what your company is registered for.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {check("pfRegistered", "Registered with EPFO (provident fund)")}
          {check("esiRegistered", "Registered with ESIC (state insurance)")}
          {check("ptRegistered", "Registered for professional tax")}
          {check("lwfRegistered", "Labour welfare fund applies")}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>How pay is counted</CardTitle><CardDescription>Weekly offs, holidays and leave come from your work schedule, holiday list and leave types.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {pick("paidDaysBasis", "A day's pay is the month's pay over", [["calendar", "Calendar days of the month"], ["working", "Working days of the month"], ["fixed", "A fixed number of days"]], "Calendar days is the most common. A person who joins or leaves mid-month is paid from or up to that date on every basis.")}
          {text("paidDaysBasis") === "fixed" && field("fixedDays", "Fixed days", "26 or 30 are usual.")}
          {pick("sandwichRule", "Weekly offs / holidays between days of loss of pay", [["none", "Paid"], ["unpaid_leave", "Unpaid when between days of unpaid leave"], ["all_lop", "Unpaid when between any days of loss of pay"]], "The sandwich rule.")}
          {pick("unmarkedDay", "A working day with no attendance recorded", [["lop", "Loss of pay"], ["present", "Paid (assumed present)"]], "Choose 'Loss of pay' if attendance is recorded for everyone every day.")}
          {field("lateMarksPerHalfDay", "Late marks that cost half a day", "0 turns it off. For example 3: every third late mark is half a day.")}
          <div className="space-y-3 sm:col-span-2">
            {check("overtimeEnabled", "Pay overtime", "Hours worked beyond a full day, and work on weekly offs and holidays, at the multipliers below. Overtime is not ESI wages.")}
            {on("overtimeEnabled") && (
              <div className="grid gap-4 sm:grid-cols-3">
                {field("overtimeMultiplier", "Overtime rate (times the hourly wage)", "The Factories Act and the Code on Wages require twice the ordinary rate.", "decimal")}
                {field("holidayWorkMultiplier", "Weekly off / holiday work rate", undefined, "decimal")}
                {field("hoursPerDay", "Hours in a working day", undefined, "decimal")}
                <div className="sm:col-span-3">{check("overtimeRequiresApproval", "Pay only approved overtime", "Employees request overtime in the portal and a manager approves it. Hours on the attendance record alone are not paid.")}</div>
                {field("overtimeMaxMinutesPerDay", "Most overtime in one day (minutes)", "Requests above this are refused.", "numeric")}
                {field("overtimeMaxMinutesPerMonth", "Most overtime in a month (minutes)", "Check the limit your state's Factories Act or Shops and Establishments Act sets.", "numeric")}
              </div>
            )}
          </div>
          {field("shortLeavesPerMonth", "Partial leaves an employee may take in a month", "A partial leave is a few hours off in a day. It is paid, uses no leave balance and does not count as a late mark. 0 turns it off.", "numeric")}
          {field("shortLeaveMaxMinutes", "Longest partial leave (minutes)", undefined, "numeric")}
          {field("expenseMaxAgeDays", "Expense claims must be filed within (days of the bill)", "For money employees spend on work and claim back.", "numeric")}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Provident fund, bonus, gratuity</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {pick("pfDefaultMode", "PF contribution", [["ceiling", "On wages up to the ceiling (₹15,000)"], ["actual", "On all PF wages (higher contribution)"]], "Each employee can be set differently on their payroll profile.")}
          {pick("wageDefinition", "PF wages are", [["flags", "The components marked as PF wages"], ["fifty_percent_rule", "At least 50% of total pay (Code on Wages)"]], "The Code on Wages, 2019 defines wages so that basic + DA + retaining allowance is at least half of total pay.")}
          {check("includeGratuityProvision", "Add the monthly gratuity provision to the cost to company")}
          {check("gratuityCovered", "The Payment of Gratuity Act covers us (10 or more employees)", "Decides how much of a gratuity is tax-exempt.")}
          {pick("leaveEncashmentDaysInMonth", "Days in a month for leave encashment", [["30", "30"], ["26", "26"]])}
          <div className="space-y-3 sm:col-span-2">
            {check("statutoryBonusEnabled", "Pay statutory bonus every month", "For employees whose basic + DA is up to ₹21,000, as a % of up to ₹7,000 (or the minimum wage).")}
            {on("statutoryBonusEnabled") && (
              <div className="grid gap-4 sm:grid-cols-2">
                {field("statutoryBonusPercent", "Bonus %", "8.33 to 20.", "decimal")}
                {field("minimumWage", "Minimum wage for your state and work (₹ per month)", "0 to use ₹7,000.")}
              </div>
            )}
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Income tax (TDS)</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {check("tdsEnabled", "Deduct income tax at source", "Worked out from each employee's declaration and the whole year's pay. Switch off only if you deduct tax some other way.")}
          {pick("defaultTaxRegime", "Regime for employees who have not chosen", [["new", "New regime (default in law)"], ["old", "Old regime"]])}
          {pick("noPanRule", "An employee with no PAN", [["warn", "Warn on the payslip"], ["apply_20_percent", "Deduct at not less than 20% (section 206AA)"]])}
          {pick("proofCutoffMonth", "Count only verified proofs from", [["1", "January"], ["2", "February"], ["3", "March"]], "Declarations are accepted as declared until then, and only as proved after.")}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Controls</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("deductionCapPercent", "Most that recoveries may take (% of wages)", "Loan instalments and other recoveries are held back so total deductions stay within this. 50 is what the law allows.")}
          {check("requireSeparateApprover", "A different person must approve each payroll run", "The person who creates a run cannot also approve it.")}
        </CardContent>
      </GlassCard>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Save payroll policy"}
      </Button>
    </form>
  );
}
