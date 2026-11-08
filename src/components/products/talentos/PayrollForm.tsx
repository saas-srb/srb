"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { savePayrollProfileAction } from "@/app/(products)/talentos/(protected)/(staff)/employees/[id]/actions";
import { DEFAULT_STATUTORY } from "@/lib/products/talentos/payroll/statutory";
import { type SerializedPayrollProfile, type StatutoryFlags } from "@/lib/products/talentos/payroll";
import { BUILTIN_STATUTORY, INDIAN_STATES } from "@/lib/products/talentos/payroll/rates";
import { computeEsi, computePf, gratuityMonthlyProvision } from "@/lib/products/talentos/payroll/statutory";
import { buildFromCtc } from "@/lib/products/talentos/payroll/structure";

interface Props {
  employeeId: string;
  profile: SerializedPayrollProfile | null;
  canEdit: boolean;
  /** The company's default for PF contributions. */
  companyPfMode: "ceiling" | "actual";
}

type Row = { name: string; amount: string; taxable: boolean; pf: boolean; esi: boolean; prorate: boolean };
type Ded = { name: string; amount: string };

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default function PayrollForm({ employeeId, profile, canEdit, companyPfMode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [basic, setBasic] = useState(String(profile?.basic ?? ""));
  const [da, setDa] = useState(String(profile?.da ?? 0));
  const [hra, setHra] = useState(String(profile?.hra ?? ""));
  const [employerNps, setEmployerNps] = useState(String(profile?.employerNps ?? 0));
  const [allowances, setAllowances] = useState<Row[]>(
    profile?.allowances.map((a) => ({ name: a.name, amount: String(a.amount), taxable: a.taxable ?? true, pf: a.pf ?? false, esi: a.esi ?? true, prorate: a.prorate ?? true })) ?? [],
  );
  const [deductions, setDeductions] = useState<Ded[]>(profile?.deductions.map((d) => ({ name: d.name, amount: String(d.amount) })) ?? []);
  const [pfNumber, setPfNumber] = useState(profile?.pfNumber ?? "");
  const [esiNumber, setEsiNumber] = useState(profile?.esiNumber ?? "");
  const [uan, setUan] = useState(profile?.uan ?? "");
  const [panNumber, setPanNumber] = useState(profile?.panNumber ?? "");
  const [flags, setFlags] = useState<StatutoryFlags>({ ...DEFAULT_STATUTORY, ...(profile?.statutory ?? {}) });
  const [ctc, setCtc] = useState({ annual: "", basicPct: "40", hraPct: "50", npsPct: "0" });

  const n = (v: string) => Number(v) || 0;
  const gross = useMemo(() => n(basic) + n(da) + n(hra) + allowances.reduce((s, x) => s + n(x.amount), 0), [basic, da, hra, allowances]);
  const totalDeductions = useMemo(() => deductions.reduce((s, x) => s + n(x.amount), 0), [deductions]);

  // What the employer adds on top of gross, worked out with the same functions payroll uses.
  const employer = useMemo(() => {
    const pfWages = n(basic) + n(da) + allowances.filter((a) => a.pf).reduce((s, x) => s + n(x.amount), 0);
    const mode = flags.pfMode ?? companyPfMode;
    const pf = flags.pfApplicable ? computePf({ pfWages, mode, epsEligible: flags.epsEligible, rates: BUILTIN_STATUTORY.providentFund }) : null;
    const esiWages = n(basic) + n(da) + n(hra) + allowances.filter((a) => a.esi).reduce((s, x) => s + n(x.amount), 0);
    const esi = flags.esiApplicable && esiWages > 0 && esiWages <= (flags.esiDisabled ? BUILTIN_STATUTORY.esi.wageThresholdDisabled : BUILTIN_STATUTORY.esi.wageThreshold) ? computeEsi({ covered: true, esiWages, paidDays: 30, rates: BUILTIN_STATUTORY.esi }) : null;
    const gratuity = gratuityMonthlyProvision(n(basic) + n(da), BUILTIN_STATUTORY.gratuity);
    const parts = { pf: pf ? pf.employerTotal + pf.edli + pf.admin : 0, esi: esi?.employer ?? 0, gratuity, nps: n(employerNps) };
    return { ...parts, total: parts.pf + parts.esi + parts.gratuity + parts.nps };
  }, [basic, da, hra, allowances, flags, employerNps, companyPfMode]);

  function applyCtc() {
    const annual = n(ctc.annual);
    if (annual <= 0) return toast.error("Enter the annual CTC first.");
    const b = buildFromCtc({
      annualCtc: annual,
      basicPercentOfCtc: n(ctc.basicPct),
      hraPercentOfBasic: n(ctc.hraPct),
      otherAllowances: [],
      pfMode: flags.pfMode ?? companyPfMode,
      employerNpsPercent: n(ctc.npsPct),
      includeGratuity: true,
      includeEdliAndAdmin: true,
      employerOtherCostMonthly: 0,
      rates: BUILTIN_STATUTORY,
    });
    if (!b.feasible) return toast.error("This CTC is too low for those percentages: nothing is left for the special allowance. Lower the basic %.");
    setBasic(String(b.basic));
    setHra(String(b.hra));
    setEmployerNps(String(b.employerNps));
    setAllowances([{ name: "Special allowance", amount: String(b.specialAllowance), taxable: true, pf: false, esi: true, prorate: true }]);
    toast.success(`Filled in: gross ${formatCurrency(b.gross)} a month, plus employer contributions to make ${formatCurrency(b.monthlyCtc)}.`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await savePayrollProfileAction(employeeId, {
        basic: n(basic),
        da: n(da),
        hra: n(hra),
        employerNps: n(employerNps),
        allowances: allowances.map((a) => ({ name: a.name, amount: n(a.amount), taxable: a.taxable, pf: a.pf, esi: a.esi, prorate: a.prorate })),
        deductions: deductions.map((d) => ({ name: d.name, amount: n(d.amount) })),
        pfNumber,
        esiNumber,
        uan,
        panNumber,
        statutory: flags,
      });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Payroll profile saved");
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;
  const setFlag = <K extends keyof StatutoryFlags>(k: K, v: StatutoryFlags[K]) => setFlags((f) => ({ ...f, [k]: v }));
  const flagBox = (k: Exclude<keyof StatutoryFlags, "pfMode" | "workState">, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-primary" disabled={!canEdit} checked={flags[k] as boolean} onChange={(e) => setFlag(k, e.target.checked)} />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
  const money = (label: string, value: string, set: (v: string) => void, key: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input inputMode="numeric" value={value} disabled={!canEdit} onChange={(e) => set(e.target.value)} aria-invalid={!!errors[key] || undefined} />
      {err(key)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {!canEdit && <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">You have read-only access to payroll. Contact an HR admin to make changes.</div>}

      {canEdit && (
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calculator className="size-4" /> Start from the annual CTC</CardTitle>
            <CardDescription>Splits a cost to company into basic, HRA and a special allowance, with the employer&apos;s PF, EDLI and gratuity inside it. You can change every figure afterwards.</CardDescription>
          </CardHeader>
          <CardContent className="grid items-end gap-3 sm:grid-cols-5">
            <div className="space-y-1.5 sm:col-span-2"><Label>Annual CTC (₹)</Label><Input inputMode="numeric" value={ctc.annual} onChange={(e) => setCtc((c) => ({ ...c, annual: e.target.value }))} placeholder="1200000" /></div>
            <div className="space-y-1.5"><Label>Basic % of CTC</Label><Input inputMode="decimal" value={ctc.basicPct} onChange={(e) => setCtc((c) => ({ ...c, basicPct: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>HRA % of basic</Label><Input inputMode="decimal" value={ctc.hraPct} onChange={(e) => setCtc((c) => ({ ...c, hraPct: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Employer NPS % of basic</Label><Input inputMode="decimal" value={ctc.npsPct} onChange={(e) => setCtc((c) => ({ ...c, npsPct: e.target.value }))} /></div>
            <div className="sm:col-span-5"><Button type="button" variant="outline" size="sm" onClick={applyCtc}>Fill in the structure</Button></div>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Salary structure</CardTitle><CardDescription>Monthly amounts at full pay. Pay is cut for days of loss of pay according to the company&apos;s payroll policy.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {money("Basic (per month)", basic, setBasic, "basic")}
            {money("Dearness allowance", da, setDa, "da", "Counts as PF wages like basic.")}
            {money("HRA (per month)", hra, setHra, "hra")}
            {money("Employer NPS (per month)", employerNps, setEmployerNps, "employerNps", "The employer's own contribution; part of the CTC.")}
          </div>

          <div className="space-y-2">
            <Label>Allowances</Label>
            {allowances.length > 0 && (
              <p className="text-xs text-muted-foreground">For each allowance, tick how it counts. <b>Taxable</b>: part of taxable salary. <b>PF wages</b>: PF is also worked out on it. <b>ESI wages</b>: counts for ESI. <b>Pro-rata</b>: reduced for days of loss of pay (untick for a fixed reimbursement).</p>
            )}
            {allowances.map((a, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
                  <Input placeholder="Name" value={a.name} disabled={!canEdit} onChange={(e) => setAllowances((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input placeholder="Amount / month" inputMode="numeric" value={a.amount} disabled={!canEdit} onChange={(e) => setAllowances((l) => l.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  {canEdit && <Button type="button" variant="ghost" size="icon" onClick={() => setAllowances((l) => l.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="size-4" /></Button>}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  {(["taxable", "pf", "esi", "prorate"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input type="checkbox" className="size-3.5 accent-primary" disabled={!canEdit} checked={a[k]} onChange={(e) => setAllowances((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.checked } : x)))} />
                      {{ taxable: "Taxable", pf: "PF wages", esi: "ESI wages", prorate: "Pro-rata" }[k]}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {err("allowances")}
            {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setAllowances((l) => [...l, { name: "", amount: "", taxable: true, pf: false, esi: true, prorate: true }])}><Plus className="size-3.5" data-icon="inline-start" />Add allowance</Button>}
          </div>

          <div className="space-y-2">
            <Label>Fixed monthly deductions</Label>
            {deductions.map((d, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
                <Input placeholder="Name (for example Canteen)" value={d.name} disabled={!canEdit} onChange={(e) => setDeductions((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input placeholder="Amount / month" inputMode="numeric" value={d.amount} disabled={!canEdit} onChange={(e) => setDeductions((l) => l.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                {canEdit && <Button type="button" variant="ghost" size="icon" onClick={() => setDeductions((l) => l.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="size-4" /></Button>}
              </div>
            ))}
            {err("deductions")}
            {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setDeductions((l) => [...l, { name: "", amount: "" }])}><Plus className="size-3.5" data-icon="inline-start" />Add deduction</Button>}
            <p className="text-xs text-muted-foreground">PF, ESI, professional tax and income tax are worked out automatically and are not entered here. Loans and one-off items go under Payroll → Adjustments and Loans.</p>
          </div>

          <div className="grid gap-3 rounded-lg border border-border/60 p-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Gross / month</p><p className="font-semibold text-foreground">{formatCurrency(gross)}</p></div>
            <div><p className="text-xs text-muted-foreground">Fixed deductions / month</p><p className="font-semibold text-foreground">{formatCurrency(totalDeductions)}</p></div>
            <div><p className="text-xs text-muted-foreground">Employer adds / month (estimate)</p><p className="font-semibold text-foreground">{formatCurrency(employer.total)}</p><p className="text-[11px] text-muted-foreground">PF/EDLI/admin {formatCurrency(employer.pf)} · ESI {formatCurrency(employer.esi)} · gratuity {formatCurrency(employer.gratuity)}{employer.nps ? ` · NPS ${formatCurrency(employer.nps)}` : ""}</p></div>
            <div><p className="text-xs text-muted-foreground">Annual cost to company</p><p className="font-semibold text-foreground">{formatCurrency((gross + employer.total) * 12)}</p></div>
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Statutory</CardTitle><CardDescription>Which deductions apply to this employee, and the numbers that identify them.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5"><Label>PAN</Label><Input value={panNumber} disabled={!canEdit} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} placeholder="ABCDE1234F" aria-invalid={!!errors.panNumber || undefined} />{err("panNumber")}</div>
            <div className="space-y-1.5"><Label>UAN (12 digits)</Label><Input value={uan} disabled={!canEdit} onChange={(e) => setUan(e.target.value)} aria-invalid={!!errors.uan || undefined} />{err("uan")}</div>
            <div className="space-y-1.5"><Label>PF member number</Label><Input value={pfNumber} disabled={!canEdit} onChange={(e) => setPfNumber(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ESI (IP) number</Label><Input value={esiNumber} disabled={!canEdit} onChange={(e) => setEsiNumber(e.target.value)} aria-invalid={!!errors.esiNumber || undefined} />{err("esiNumber")}</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>State the employee works in</Label>
              <select className={selectClass} disabled={!canEdit} value={flags.workState ?? ""} onChange={(e) => setFlag("workState", e.target.value || null)}>
                <option value="">The office&apos;s state</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {err("workState")}
              <p className="text-xs text-muted-foreground">Professional tax, labour welfare fund and state holidays follow this.</p>
            </div>
            <div className="space-y-1.5">
              <Label>PF contribution</Label>
              <select className={selectClass} disabled={!canEdit} value={flags.pfMode ?? ""} onChange={(e) => setFlag("pfMode", (e.target.value || null) as StatutoryFlags["pfMode"])}>
                <option value="">Company default ({companyPfMode === "ceiling" ? "up to the ceiling" : "on all PF wages"})</option>
                <option value="ceiling">On wages up to the ceiling (₹15,000)</option>
                <option value="actual">On all PF wages (higher contribution)</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {flagBox("pfApplicable", "Provident fund applies")}
            {flagBox("epsEligible", "Member of the pension scheme (EPS)", "Untick for someone who first joined PF on or after 1 September 2014 with wages above ₹15,000.")}
            {flagBox("esiApplicable", "ESI applies when wages are within the limit")}
            {flagBox("esiDisabled", "Person with disability", "Higher ESI wage limit.")}
            {flagBox("ptApplicable", "Professional tax applies")}
            {flagBox("lwfApplicable", "Labour welfare fund applies")}
            {flagBox("tdsApplicable", "Deduct income tax at source")}
          </div>
        </CardContent>
      </GlassCard>

      {canEdit && (
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Save Payroll Profile"}
        </Button>
      )}
    </form>
  );
}
