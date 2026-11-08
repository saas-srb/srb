import { Badge } from "@/components/ui/badge";
import { payoutStatusMeta } from "@/lib/products/talentos/payout-status";

export default function PayoutStatusBadge({ status }: { status?: string }) {
  const meta = payoutStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}
