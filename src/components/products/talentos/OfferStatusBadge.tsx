import { Badge } from "@/components/ui/badge";
import { offerStatusMeta } from "@/lib/products/talentos/offers-status";

export default function OfferStatusBadge({ status }: { status?: string }) {
  const meta = offerStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}
