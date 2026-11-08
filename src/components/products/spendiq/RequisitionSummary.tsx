import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { RequisitionStatusBadge, PriorityBadge, ExpenseCategoryBadge } from "@/components/products/spendiq/StatusBadges";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { SerializedRequisition } from "@/lib/products/spendiq/requisitions";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default function RequisitionSummary({
  requisition,
  vendorName,
}: {
  requisition: SerializedRequisition;
  vendorName: string | null;
}) {
  const r = requisition;
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{r.prCode}</span>
          {r.itemName}
        </CardTitle>
        <div className="flex flex-wrap gap-2 pt-1">
          <RequisitionStatusBadge status={r.status} />
          <PriorityBadge priority={r.priority} />
          <ExpenseCategoryBadge category={r.category} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Quantity" value={`${r.quantity} ${r.uom}`} />
        <Field label="Estimated cost" value={formatMoney(r.estimatedCost, r.currency)} />
        <Field label="Subcategory" value={r.subcategory} />
        <Field label="Department" value={r.departmentName} />
        <Field label="Project" value={r.projectName} />
        <Field label="Preferred vendor" value={vendorName} />
        <Field label="Required by" value={r.requiredDate ? formatDate(r.requiredDate) : null} />
        <Field label="Requested by" value={r.requestedBy?.name} />
        <Field label="Raised" value={formatDateTime(r.createdAt)} />
        {r.submittedAt && <Field label="Submitted" value={formatDateTime(r.submittedAt)} />}
        {r.approvedAt && <Field label="Approved" value={formatDateTime(r.approvedAt)} />}
      </CardContent>
      {r.justification && (
        <CardContent>
          <p className="text-xs text-muted-foreground">Justification</p>
          <p className="text-sm whitespace-pre-wrap text-foreground">{r.justification}</p>
        </CardContent>
      )}
    </GlassCard>
  );
}
