import { Badge } from "@/components/ui/badge";
import {
  getPriorityMeta,
  getRequisitionStatusMeta,
  getVendorStatusMeta,
  getVendorCategoryLabel,
  getExpenseCategoryLabel,
  getRfqStatusMeta,
  getPoStatusMeta,
  getGrnStatusMeta,
  getExpenseStatusMeta,
  getAssetStatusMeta,
  getResourceStatusMeta,
  getInvoiceStatusMeta,
  getPaymentStatusMeta,
} from "@/lib/products/spendiq/constants";

function Dot({ className }: { className: string }) {
  return <span className={`size-1.5 rounded-full ${className}`} />;
}

function MetaBadge({ meta }: { meta: { label: string; badgeClass: string; dotClass: string } }) {
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export const PriorityBadge = ({ priority }: { priority?: string }) => <MetaBadge meta={getPriorityMeta(priority)} />;
export const RequisitionStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getRequisitionStatusMeta(status)} />;
export const VendorStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getVendorStatusMeta(status)} />;
export const RfqStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getRfqStatusMeta(status)} />;
export const PoStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getPoStatusMeta(status)} />;
export const GrnStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getGrnStatusMeta(status)} />;
export const ExpenseStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getExpenseStatusMeta(status)} />;
export const AssetStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getAssetStatusMeta(status)} />;
export const ResourceStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getResourceStatusMeta(status)} />;
export const InvoiceStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getInvoiceStatusMeta(status)} />;
export const PaymentStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getPaymentStatusMeta(status)} />;

export function VendorCategoryBadge({ category }: { category?: string }) {
  return <Badge className="bg-secondary/60 text-secondary-foreground">{getVendorCategoryLabel(category)}</Badge>;
}

export function ExpenseCategoryBadge({ category }: { category?: string }) {
  return <Badge className="bg-secondary/60 text-secondary-foreground">{getExpenseCategoryLabel(category)}</Badge>;
}
