import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Button } from "@/components/ui/button";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { PaymentStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import PaymentPlanForm from "@/components/products/cohort-ai/PaymentPlanForm";
import PaymentDetailPanel from "@/components/products/cohort-ai/PaymentDetailPanel";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManagePayments } from "@/lib/tms-roles";
import { paymentWithMeta } from "@/lib/products/cohort-ai/payments";
import { listStudentOptions } from "@/lib/products/cohort-ai/students";
import { listProgramFeeOptions } from "@/lib/products/cohort-ai/programs";
import { listBatchPickerOptions } from "@/lib/products/cohort-ai/batches";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentTmsUser();
  if (!user || !canManagePayments(user)) redirect("/cohort-ai");

  const plan = await paymentWithMeta(id);
  if (!plan) notFound();

  const [students, programs, batches, settings] = await Promise.all([
    listStudentOptions(),
    listProgramFeeOptions(),
    listBatchPickerOptions(),
    getTmsSettings(),
  ]);

  const net = Math.max(plan.totalFees - plan.discount, 0);
  const pct = net > 0 ? Math.round((plan.paidAmount / net) * 100) : 100;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Payments", href: "/cohort-ai/payments" }, { label: plan.studentName }]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{plan.studentName}<PaymentStatusBadge status={plan.status} /></span></>}
        description={<><Link href={`/cohort-ai/students/${plan.studentId}`} className="text-primary hover:underline">Student profile</Link>
            {" · "}{plan.programName}{plan.batchName ? ` · ${plan.batchName}` : ""}</>}
        actions={<><PaymentPlanForm
          plan={plan}
          students={students}
          programs={programs}
          batches={batches.map((b) => ({ _id: b._id, name: b.name, programId: b.programId }))}
          defaultCurrency={settings.defaultCurrency}
          trigger={
            <Button type="button" variant="outline" size="sm">
              <Pencil className="size-3.5" data-icon="inline-start" />
              Edit plan
            </Button>
          }
        /></>}
      />

      <KpiGrid>
        <KpiCard label="Net Fees" value={net} format="currency" accent icon={undefined} />
        <KpiCard label="Paid" value={plan.paidAmount} format="currency" />
        <KpiCard label="Pending" value={plan.pendingAmount} format="currency" tone={plan.pendingAmount > 0 ? "down" : undefined} />
        <KpiCard label="Discount" value={plan.discount} format="currency" />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <ProgressBar value={pct} />
          <p className="text-xs text-muted-foreground">
            {formatCurrency(plan.paidAmount, plan.currency)} of {formatCurrency(net, plan.currency)} collected.
            {plan.notes ? ` · ${plan.notes}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">Last updated {formatDateTime(plan.updatedAt)}</p>
        </CardContent>
      </GlassCard>

      <PaymentDetailPanel plan={plan} canManage />
    </div>
  );
}
