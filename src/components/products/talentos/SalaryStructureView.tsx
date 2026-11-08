import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { formatCurrency } from "@/lib/utils";

interface Line {
  name: string;
  amount: number;
}

export default function SalaryStructureView({
  basic,
  da = 0,
  hra,
  allowances,
  deductions,
}: {
  basic: number;
  da?: number;
  hra: number;
  allowances: Line[];
  deductions: Line[];
}) {
  const earnings: Line[] = [{ name: "Basic", amount: basic }, ...(da > 0 ? [{ name: "Dearness allowance", amount: da }] : []), { name: "HRA", amount: hra }, ...allowances];
  const gross = earnings.reduce((s, e) => s + e.amount, 0);
  const annual = gross * 12;

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle>Salary Structure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monthly Earnings</p>
            {earnings.map((e, i) => (
              <div key={i} className="flex justify-between border-b border-border/40 py-1.5 text-sm last:border-0">
                <span>{e.name}</span>
                <span className="tabular-nums">{formatCurrency(e.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 text-sm font-semibold text-foreground">
              <span>Gross / month</span>
              <span className="tabular-nums">{formatCurrency(gross)}</span>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recurring Deductions</p>
            {deductions.length === 0 && <p className="text-sm text-muted-foreground">None configured.</p>}
            {deductions.map((d, i) => (
              <div key={i} className="flex justify-between border-b border-border/40 py-1.5 text-sm last:border-0">
                <span>{d.name}</span>
                <span className="tabular-nums">{formatCurrency(d.amount)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-primary/10 px-4 py-3 text-sm">
          <div className="flex justify-between font-semibold text-foreground">
            <span>Annual gross</span>
            <span className="tabular-nums">{formatCurrency(annual)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Statutory deductions (PF, ESI, professional tax, income tax) and loss of pay are worked out each month on the payslip.
          </p>
        </div>
      </CardContent>
    </GlassCard>
  );
}
