import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getPayrollRunDetail } from "@/lib/products/cashflow-ai/payroll";
import { payrollRunStatusMeta, monthLabelLong } from "@/lib/products/talentos/payroll-status";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDateTime } from "@/lib/utils";

export default async function PayrollRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getPayrollRunDetail(id);
  if (!detail) notFound();
  const { run, payslips } = detail;
  const meta = payrollRunStatusMeta(run.status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Payroll Runs", href: "/cashflow-ai/payroll-runs" }, { label: monthLabelLong(run.month) }]}
        title={<>{monthLabelLong(run.month)}</>}
        description={<>{run.payslipCount} payslip{run.payslipCount === 1 ? "" : "s"}</>}
        actions={<><Badge className={meta.badgeClass}>{meta.label}</Badge></>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Total Gross" value={formatMoney(run.totalGross)} />
            <Row label="Total Deductions" value={formatMoney(run.totalDeductions)} />
            <Row label="Total Net Pay" value={formatMoney(run.totalNet)} />
            <Row label="Total Employer Cost" value={formatMoney(run.totalEmployerCost)} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Lifecycle</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Generated" value={formatDateTime(run.generatedAt)} />
            <Row label="Approved" value={run.approvedAt ? formatDateTime(run.approvedAt) : "—"} />
            <Row label="Paid" value={run.paidAt ? formatDateTime(run.paidAt) : "—"} />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Payslips</CardTitle></CardHeader>
        <CardContent className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips.map((p) => (
                <TableRow key={p._id}>
                  <TableCell>{p.employeeName} <span className="text-muted-foreground">({p.employeeCode})</span></TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(p.grossPay)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(p.totalDeductions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(p.netPay)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
