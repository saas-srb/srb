import { Badge } from "@/components/ui/badge";
import {
  getStatusMeta,
  getInvoiceStatusMeta,
  getRefundStatusMeta,
  getNoteStatusMeta,
  getAdvanceStatusMeta,
  getFundAccountStatusMeta,
  getStatementLineStatusMeta,
} from "@/lib/products/cashflow-ai/constants";

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

export const TransactionStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getStatusMeta(status)} />;
export const InvoiceStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getInvoiceStatusMeta(status)} />;
export const RefundStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getRefundStatusMeta(status)} />;
export const NoteStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getNoteStatusMeta(status)} />;
export const AdvanceStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getAdvanceStatusMeta(status)} />;
export const FundAccountStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getFundAccountStatusMeta(status)} />;
export const StatementLineStatusBadge = ({ status }: { status?: string }) => <MetaBadge meta={getStatementLineStatusMeta(status)} />;

export function TransactionTypeBadge({ type }: { type?: string }) {
  return <Badge className="bg-secondary/60 text-secondary-foreground capitalize">{type ?? "—"}</Badge>;
}
