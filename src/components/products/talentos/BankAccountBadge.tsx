import { Badge } from "@/components/ui/badge";
import { bankVerificationMeta } from "@/lib/products/talentos/payout-status";

export default function BankAccountBadge({ status }: { status?: string }) {
  const meta = bankVerificationMeta(status);
  return <Badge className={meta.badgeClass}>{meta.label}</Badge>;
}
